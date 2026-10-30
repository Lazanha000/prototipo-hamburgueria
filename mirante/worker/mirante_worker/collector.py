"""O ciclo de coleta. Cada volta: atende pedidos do app, verifica perfis novos, busca posts dos perfis
que estão na hora, stories, comentários, e limpa o que já passou do prazo."""
import random
import time
import traceback
from collections import defaultdict

from . import analytics
from .media import thumbnail
from .pacing import Gate, Paused
from .source import Blocked, NeedsCode, NotFound, Private, RateLimited, SessionInvalid, SourceError
from .store import now_ms
from .vault import Vault

H = 3_600_000


class Collector:
    def __init__(self, store, source, gate: Gate, vault: Vault, cfg, clock=time.time, log=print):
        self.store, self.source, self.gate, self.vault, self.cfg = store, source, gate, vault, cfg
        self.clock, self.log = clock, log
        self.session_ok = False
        self.pending_login = None  # (command_id, username) esperando o código de 2 etapas
        self.message = "Começando"

    def now(self):
        return int(self.clock() * 1000)

    # ---------- estado para o app ----------
    def status(self, state, message=None):
        self.message = message or self.message
        self.store.upsert("worker_status", [{
            "id": 1, "state": state, "message": self.message, "last_run_at": self.now(),
            "paused_until": int(self.gate.paused_until * 1000) or None,
            "ig_user": self.source.username, "session_ok": self.session_ok,
        }])

    # ---------- sessão ----------
    def restore_session(self):
        saved = self.vault.load()
        if not saved:
            self.session_ok = False
            return False
        self.source.restore(*saved)
        self.session_ok = True
        return True

    def _save_session(self):
        self.vault.save(self.source.username, self.source.session())
        self.session_ok = True

    # ---------- pedidos do app ----------
    def handle_commands(self):
        for cmd in self.store.select("commands", {"status": "in.(pending)"}, order="id.asc", limit=20):
            kind, payload, cid = cmd["kind"], cmd.get("payload") or {}, cmd["id"]
            # a senha não fica no banco: some antes de qualquer outra coisa
            self.store.update("commands", {"id": f"eq.{cid}"}, {"status": "running", "payload": {k: v for k, v in payload.items() if k != "password"}})
            try:
                if kind == "ig_login":
                    self._login(cid, payload.get("username", ""), payload.get("password", ""))
                elif kind == "ig_code":
                    self._code(cid, payload.get("code", ""))
                elif kind == "refresh":
                    self.store.update("profiles", {"status": "eq.ok"}, {"next_check_at": 0, "stories_checked_at": 0})
                    self._done(cid, "done", {"message": "Atualização pedida."})
                else:
                    self._done(cid, "error", {"message": "Pedido desconhecido."})
            except Exception as e:  # nunca deixar um pedido preso em "running"
                self._done(cid, "error", {"message": str(e) or e.__class__.__name__})

    def _done(self, cid, status, result):
        self.store.update("commands", {"id": f"eq.{cid}"}, {"status": status, "result": result})

    def _login(self, cid, username, password):
        if not username or not password:
            return self._done(cid, "error", {"message": "Informe usuário e senha."})
        try:
            self.gate.wait()
            self.source.login(username, password)
            self._save_session()
            self.pending_login = None
            self._done(cid, "done", {"message": f"Conectado como @{username}."})
            self.status("ok", f"Conta @{username} conectada.")
        except NeedsCode:
            self.pending_login = (cid, username)
            self._done(cid, "needs_code", {"message": "Código de verificação necessário."})
        except SourceError as e:
            self._done(cid, "error", {"message": str(e)})

    def _code(self, cid, code):
        if not self.pending_login:
            return self._done(cid, "error", {"message": "Nenhum login esperando código. Comece de novo."})
        try:
            self.source.submit_code(code)
            self._save_session()
            self.pending_login = None
            self._done(cid, "done", {"message": "Conectado."})
        except SourceError as e:
            self._done(cid, "error", {"message": str(e)})

    # ---------- perfis novos ----------
    def resolve_pending(self, limit=8):
        for p in self.store.select("profiles", {"status": "eq.pending"}, order="added_at.asc", limit=limit):
            try:
                handle = p["handle"]
                if handle.startswith("~p/"):  # link de post: descobre o dono
                    handle = self.source.owner_of(handle[3:])
                    dup = self.store.select("profiles", {"handle": f"eq.{handle}"})
                    if dup:
                        self.store.delete("profiles", {"id": f"eq.{p['id']}"})
                        continue
                info = self.source.profile(handle)
                self._save_profile(p["id"], info, first=True)
            except Private as e:
                self.store.update("profiles", {"id": f"eq.{p['id']}"}, {"status": "private", "error": str(e)})
            except NotFound as e:
                self.store.update("profiles", {"id": f"eq.{p['id']}"}, {"status": "error", "error": str(e)})

    def _save_profile(self, pid, info, first=False):
        patch = {k: info[k] for k in ("ig_id", "handle", "name", "bio", "followers", "following", "posts_count", "is_business", "is_private")}
        if info.get("avatar_src"):
            try:
                patch["avatar_url"] = self.store.upload(f"avatars/{info['ig_id']}.webp", thumbnail(self.source.download(info["avatar_src"]), 160, 75), "image/webp") + f"?v={self.now() // 86_400_000}"
            except Exception:
                pass
        private_blocked = info["is_private"] and not info.get("followed")
        patch["status"] = "private" if private_blocked else "ok"
        patch["error"] = "Perfil privado: a conta secundária precisa seguir ele." if private_blocked else None
        if first:
            patch["next_check_at"] = 0
        # dois links para o mesmo perfil (ex.: @nome e link) viram um só
        other = [o for o in self.store.select("profiles", {"ig_id": f"eq.{info['ig_id']}"}) if o["id"] != pid]
        if other:
            self.store.delete("profiles", {"id": f"eq.{pid}"})
            return
        self.store.update("profiles", {"id": f"eq.{pid}"}, patch)

    # ---------- posts ----------
    def due_profiles(self):
        now = self.now()
        ps = self.store.select("profiles", {"status": "eq.ok", "on_feed": "eq.true"})
        due = [p for p in ps if (p.get("next_check_at") or 0) <= now]
        due.sort(key=lambda p: (-(p.get("priority") or 1), p.get("next_check_at") or 0))
        return due[: self.cfg.profiles_per_cycle]

    def check_profile(self, p):
        now = self.now()
        info = self.source.profile(p["handle"])
        self._save_profile(p["id"], info)
        if info["is_private"] and not info.get("followed"):
            return
        mine = self.store.select("posts", {"profile_id": f"eq.{p['id']}"}, columns="id,taken_at,likes,comments,views,kind,thumb_url")
        known = {x["id"]: x for x in mine}
        fresh = self.source.recent_posts(info, set(known), first_run=not known)
        rows = []
        for post in fresh:
            row = {k: post[k] for k in ("id", "kind", "taken_at", "caption", "hashtags", "mentions", "duration", "likes", "comments", "views", "is_pinned", "media")}
            row["profile_id"] = p["id"]
            row["engagement"] = analytics.engagement(post, info["followers"])
            if post["id"] not in known or not known[post["id"]].get("thumb_url"):
                try:
                    row["thumb_url"] = self.store.upload(f"thumbs/{post['id']}.webp", thumbnail(self.source.download(post["thumb_src"])), "image/webp")
                except Exception:
                    row["thumb_url"] = None
            rows.append(row)
        self.store.upsert("posts", rows)
        self._snapshots(fresh, now)
        # "acima do normal" de todos os posts do perfil, com os números novos
        allp = {x["id"]: x for x in mine}
        for r in rows:
            allp[r["id"]] = {**allp.get(r["id"], {}), **r}
        out = analytics.outliers(list(allp.values()))
        changed = [{"id": i, "outlier": v} for i, v in out.items() if v != (allp[i].get("outlier") if i in allp else None)]
        for c in changed:
            self.store.update("posts", {"id": f"eq.{c['id']}"}, {"outlier": c["outlier"]})
        last = max([x["taken_at"] for x in allp.values()], default=None)
        every = self.cfg.priority_every_min if (p.get("priority") or 1) > 1 else self.cfg.check_every_min
        jitter = random.uniform(-0.15, 0.15) * every
        self.store.update("profiles", {"id": f"eq.{p['id']}"}, {"last_post_at": last, "last_checked_at": now, "next_check_at": now + int((every + jitter) * 60_000)})
        self.log(f"@{p['handle']}: {len([r for r in rows if r['id'] not in known])} novos, {len(rows)} atualizados")

    def _snapshots(self, posts, now):
        if not posts:
            return
        ids = ",".join(p["id"] for p in posts)
        have = defaultdict(list)
        for m in self.store.select("metrics", {"post_id": f"in.({ids})"}, columns="post_id,at"):
            have[m["post_id"]].append(m["at"])
        new = [{"post_id": p["id"], "at": now, "likes": p["likes"], "comments": p["comments"], "views": p["views"]}
               for p in posts if analytics.snapshot_due(p["taken_at"], now, have[p["id"]])]
        self.store.upsert("metrics", new, on_conflict="post_id,at")

    # ---------- stories ----------
    def check_stories(self):
        now = self.now()
        ps = [p for p in self.store.select("profiles", {"status": "eq.ok", "on_feed": "eq.true"}) if p.get("ig_id")]
        if not ps or min((p.get("stories_checked_at") or 0) for p in ps) > now - self.cfg.stories_every_min * 60_000:
            return
        by_ig = {p["ig_id"]: p for p in ps}
        known = {s["id"] for s in self.store.select("stories", {"taken_at": f"gt.{now - 30 * H}"}, columns="id")}
        items = self.source.stories(list(by_ig))
        rows = []
        for it in items:
            if it["id"] in known or it["ig_owner_id"] not in by_ig:
                continue
            ext, ctype = ("mp4", "video/mp4") if it["kind"] == "video" else ("webp", "image/webp")
            path = f"stories/{it['id']}.{ext}"
            try:
                data = self.source.download(it["src"])
                url = self.store.upload(path, data if ext == "mp4" else thumbnail(data, 720, 72), ctype)
                thumb = self.store.upload(f"stories/{it['id']}-t.webp", thumbnail(self.source.download(it["thumb_src"]), 240), "image/webp")
            except Exception:
                continue
            rows.append({"id": it["id"], "profile_id": by_ig[it["ig_owner_id"]]["id"], "taken_at": it["taken_at"], "expires_at": it["expires_at"],
                         "kind": it["kind"], "url": url, "thumb_url": thumb, "duration": 15 if it["kind"] == "video" else 5, "storage_path": path})
        self.store.upsert("stories", rows)
        self.store.update("profiles", {"status": "eq.ok"}, {"stories_checked_at": now})
        if rows:
            self.log(f"stories: {len(rows)} novos")

    # ---------- comentários ----------
    def due_comments(self):
        """Posts que pedem comentários: 6 h depois de publicados e de novo com 48 h."""
        now = self.now()
        posts = self.store.select("posts", {"taken_at": f"gt.{now - 4 * 24 * H}", "comments": "gt.0"},
                                  columns="id,profile_id,taken_at,comments,comments_checked_at", order="taken_at.desc", limit=300)
        due = []
        for p in posts:
            age, checked = now - p["taken_at"], p.get("comments_checked_at") or 0
            if (age >= 6 * H and checked < p["taken_at"] + 6 * H) or (age >= 48 * H and checked < p["taken_at"] + 48 * H):
                due.append(p)
        return due[: self.cfg.comments_per_cycle]

    def fetch_comments(self, p):
        prof = self.store.select("profiles", {"id": f"eq.{p['profile_id']}"}, columns="handle")
        handle = prof[0]["handle"] if prof else ""
        cs = self.source.comments(p["id"], handle, self.cfg.max_comments)
        for c in cs:
            c["post_id"] = p["id"]
        self.store.upsert("comments", cs)
        top = sorted([c for c in cs if not c["parent_id"]], key=lambda c: -c["likes"])[:30]
        self.store.update("posts", {"id": f"eq.{p['id']}"}, {"comments_checked_at": self.now(), "top_comments": " · ".join(c["text"] for c in top)[:6000] or None})

    # ---------- limpeza ----------
    def cleanup(self):
        now = self.now()
        old = self.store.select("stories", {"taken_at": f"lt.{now - self.cfg.story_video_hours * H}", "kind": "eq.video", "storage_path": "not.is.null"},
                                columns="id,storage_path")
        if old:  # vídeo some, fica a miniatura
            self.store.remove([s["storage_path"] for s in old])
            for s in old:
                self.store.update("stories", {"id": f"eq.{s['id']}"}, {"url": None, "storage_path": None})
        gone = self.store.select("stories", {"taken_at": f"lt.{now - self.cfg.story_keep_hours * H}"}, columns="id,storage_path")
        if gone:
            self.store.remove([p for s in gone for p in (s.get("storage_path"), f"stories/{s['id']}-t.webp") if p])
            self.store.delete("stories", {"taken_at": f"lt.{now - self.cfg.story_keep_hours * H}"})
        self.store.delete("commands", {"created_at": f"lt.{now - 2 * 24 * H}"})

    # ---------- o ciclo ----------
    def run_once(self):
        self.handle_commands()
        if not self.session_ok and not self.restore_session():
            return self.status("waiting", "Esperando a conta secundária ser conectada nos Ajustes.")
        try:
            self.gate.check()
            self.resolve_pending()
            for p in self.due_profiles():
                try:
                    self.check_profile(p)
                except (Private, NotFound) as e:
                    self.store.update("profiles", {"id": f"eq.{p['id']}"}, {"status": "private" if isinstance(e, Private) else "error", "error": str(e)})
                self.handle_commands()  # o app não espera o ciclo inteiro
            self.check_stories()
            for p in self.due_comments():
                try:
                    self.fetch_comments(p)
                except NotFound:
                    self.store.update("posts", {"id": f"eq.{p['id']}"}, {"comments_checked_at": self.now()})
            self.cleanup()
            self.status("ok", "Tudo em dia.")
        except Paused as e:
            self.cleanup()
            self.status("paused", f"Em pausa: {e}." if str(e) else "Em pausa.")
        except RateLimited:
            self.gate.pause(random.uniform(60, 120) * 60, "o Instagram pediu calma")
            self.status("paused", "O Instagram pediu uma pausa. Volto sozinho mais tarde; o que já chegou continua no app.")
        except Blocked as e:
            self.gate.pause(6 * 3600, "verificação pendente na conta secundária")
            self.status("blocked", str(e))
        except SessionInvalid as e:
            self.session_ok = False
            self.vault.clear()
            self.status("waiting", str(e))

    def run_forever(self):
        self.log("Mirante: trabalhador ligado.")
        while True:
            t0 = time.time()
            try:
                self.run_once()
            except Exception:  # erro inesperado: registra e segue no próximo ciclo
                self.log(traceback.format_exc())
                try:
                    self.status("error", "Tive um erro inesperado; tento de novo em instantes.")
                except Exception:
                    pass
            time.sleep(max(5, self.cfg.cycle_seconds - (time.time() - t0)))
