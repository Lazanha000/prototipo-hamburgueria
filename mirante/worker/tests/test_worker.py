"""Testes do trabalhador com um Instagram falso: não usa internet nem conta real."""
import io
from types import SimpleNamespace

import pytest
from PIL import Image

from mirante_worker import analytics
from mirante_worker.collector import Collector
from mirante_worker.pacing import Gate, Paused
from mirante_worker.source import NeedsCode, Private, RateLimited, SessionInvalid, SourceError
from mirante_worker.store import MemoryStore
from mirante_worker.vault import Vault, new_secret

H = 3_600_000


class Clock:
    def __init__(self, t=1_790_000_000.0):  # meio da tarde em Brasília
        self.t = t

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += s


def png():
    b = io.BytesIO()
    Image.new("RGB", (900, 1100), (200, 120, 90)).save(b, "PNG")
    return b.getvalue()


class FakeIG:
    def __init__(self, clock):
        self.clock, self.username = clock, None
        self.calls, self.need_code, self.fail = [], False, None
        self.profiles = {
            "lia.cozinha": {"ig_id": "1", "handle": "lia.cozinha", "name": "Lia", "bio": "", "avatar_src": "x", "followers": 10000,
                            "following": 10, "posts_count": 3, "is_business": True, "is_private": False, "followed": False},
            "secreto": {"ig_id": "2", "handle": "secreto", "name": "S", "bio": "", "avatar_src": None, "followers": 50, "following": 1,
                        "posts_count": 1, "is_business": False, "is_private": True, "followed": False},
        }
        now = int(clock() * 1000)
        self.posts = [
            {"id": f"P{i}", "kind": "reel" if i % 2 else "image", "taken_at": now - i * 30 * H, "caption": f"post {i} #receita", "hashtags": "receita",
             "mentions": None, "duration": 30.0 if i % 2 else None, "likes": 100 * (5 if i == 1 else 1), "comments": 10,
             "views": 5000 * (5 if i == 1 else 1) if i % 2 else None, "is_pinned": False, "media": [{"kind": "image", "url": "u"}], "thumb_src": "t"}
            for i in range(0, 8)
        ]

    def _call(self, name):
        self.calls.append(name)
        if self.fail:
            raise self.fail

    def login(self, u, p):
        self._call("login")
        if p != "certa":
            raise SourceError("Usuário ou senha incorretos.")
        if self.need_code:
            self.username = u
            raise NeedsCode("code")
        self.username = u

    def submit_code(self, code):
        if code != "123456":
            raise SourceError("Código inválido.")

    def restore(self, u, s):
        self.username = u

    def session(self):
        return {"sessionid": "abc"}

    def profile(self, h):
        self._call("profile")
        if h not in self.profiles:
            from mirante_worker.source import NotFound
            raise NotFound("não existe")
        return dict(self.profiles[h])

    def owner_of(self, sc):
        self._call("owner")
        return "lia.cozinha"

    def recent_posts(self, prof, known, first_run=False):
        self._call("posts")
        if prof["is_private"] and not prof.get("followed"):
            raise Private("privado")
        return [dict(p) for p in self.posts]

    def stories(self, ids):
        self._call("stories")
        now = int(self.clock() * 1000)
        return [{"id": "S1", "ig_owner_id": "1", "taken_at": now - H, "expires_at": now + 23 * H, "kind": "image", "src": "s", "thumb_src": "s"},
                {"id": "S2", "ig_owner_id": "1", "taken_at": now - 2 * H, "expires_at": now + 22 * H, "kind": "video", "src": "v", "thumb_src": "s"}]

    def comments(self, sc, owner, limit):
        self._call("comments")
        now = int(self.clock() * 1000)
        return [{"id": "c1", "parent_id": None, "author": "ana", "text": "Que lindo!", "created_at": now, "likes": 9, "replies": 1, "by_owner": False},
                {"id": "c2", "parent_id": "c1", "author": owner, "text": "Obrigada", "created_at": now, "likes": 1, "replies": 0, "by_owner": True}]

    def download(self, url):
        return b"MP4" if url == "v" else png()


def setup(tmp_path):
    clock = Clock()
    store, ig = MemoryStore(), FakeIG(clock)
    gate = Gate(0, 0, (2, 6), -3, clock=clock, sleep=clock.sleep, rand=lambda: 0.5)
    cfg = SimpleNamespace(profiles_per_cycle=10, comments_per_cycle=5, max_comments=300, check_every_min=120, priority_every_min=60,
                          stories_every_min=150, story_video_hours=48, story_keep_hours=168, cycle_seconds=60)
    c = Collector(store, ig, gate, Vault(tmp_path / "s.enc", new_secret()), cfg, clock=clock, log=lambda *a: None)
    return c, store, ig, clock


def add(store, handle, pid=None):
    store.upsert("profiles", [{"id": pid or handle, "handle": handle, "status": "pending", "on_feed": True, "priority": 1, "added_at": 0}])


def test_ritmo_e_madrugada():
    clock = Clock()
    g = Gate(4, 8, (2, 6), -3, clock=clock, sleep=clock.sleep, rand=lambda: 0.5)
    g.wait(); t = clock(); g.wait()
    assert clock() - t >= 4
    clock.t = 1_790_000_000 - (1_790_000_000 % 86400) + 6 * 3600  # 03:00 em Brasília
    with pytest.raises(Paused):
        g.check()
    clock.t += 5 * 3600
    g.pause(600, "calma")
    with pytest.raises(Paused):
        g.check()


def test_cofre(tmp_path):
    v = Vault(tmp_path / "s.enc", new_secret())
    v.save("conta", {"sessionid": "x"})
    assert v.load() == ("conta", {"sessionid": "x"})
    assert b"sessionid" not in (tmp_path / "s.enc").read_bytes()
    assert Vault(tmp_path / "s.enc", new_secret()).load() is None  # chave errada não abre


def test_contas():
    ps = [{"id": "a", "kind": "image", "likes": 100, "taken_at": 3}, {"id": "b", "kind": "image", "likes": 300, "taken_at": 2},
          {"id": "c", "kind": "reel", "views": 1000, "likes": 5, "taken_at": 1}]
    o = analytics.outliers(ps)
    assert o["b"] == pytest.approx(300 / 100) and o["c"] == 1.0
    assert analytics.snapshot_due(0, 30 * 60_000, [])            # primeira anotação
    assert not analytics.snapshot_due(0, 50 * 60_000, [30 * 60_000])
    assert analytics.snapshot_due(0, 2 * H, [30 * 60_000])       # passou de 1 h
    assert not analytics.snapshot_due(0, 60 * 24 * H, [])        # velho demais


def test_login_com_codigo_e_senha_some(tmp_path):
    c, store, ig, _ = setup(tmp_path)
    ig.need_code = True
    store.insert("commands", [{"kind": "ig_login", "payload": {"username": "minha.secundaria", "password": "certa"}, "status": "pending", "created_at": int(c.clock() * 1000)}])
    c.run_once()
    cmd = store.select("commands")[0]
    assert cmd["status"] == "needs_code" and "password" not in cmd["payload"]
    store.insert("commands", [{"kind": "ig_code", "payload": {"code": "123456"}, "status": "pending", "created_at": int(c.clock() * 1000)}])
    c.run_once()
    assert store.select("commands")[1]["status"] == "done"
    assert c.session_ok and store.select("worker_status")[0]["session_ok"]


def test_ciclo_completo(tmp_path):
    c, store, ig, clock = setup(tmp_path)
    c.vault.save("sec", {"sessionid": "x"})
    add(store, "lia.cozinha", "p1")
    add(store, "~p/ABC", "p2")      # link de post do mesmo perfil: vira duplicado e some
    add(store, "secreto", "p3")
    add(store, "nao.existe", "p4")
    c.run_once()
    by = {p["id"]: p for p in store.select("profiles")}
    assert by["p1"]["status"] == "ok" and by["p1"]["avatar_url"].startswith("mem://avatars/1.webp")
    assert "p2" not in by
    assert by["p3"]["status"] == "private" and by["p4"]["status"] == "error"
    posts = store.select("posts")
    assert len(posts) == 8 and all(p["thumb_url"].startswith("mem://thumbs/") for p in posts)
    assert store.files["thumbs/P0.webp"][:4] == b"RIFF"  # WebP de verdade
    best = next(p for p in posts if p["id"] == "P1")
    assert best["outlier"] >= 4.5 and best["engagement"] == pytest.approx((500 + 10) / 10000)
    assert store.select("metrics", {"post_id": "eq.P0"})
    assert {s["id"] for s in store.select("stories")} == {"S1", "S2"}
    assert store.files["stories/S2.mp4"] == b"MP4"
    # comentários: posts com 6 h ou mais pedem comentários
    cs = store.select("comments")
    assert cs and any(x["by_owner"] for x in cs)
    assert "Que lindo" in next(p for p in store.select("posts") if p.get("comments_checked_at"))["top_comments"]
    assert store.select("worker_status")[0]["state"] == "ok"
    # segunda volta logo depois: perfil não está na hora, nada de pedido novo de posts
    n = ig.calls.count("posts")
    c.run_once()
    assert ig.calls.count("posts") == n
    # duas horas depois: volta a olhar e não duplica posts
    clock.t += 2.5 * 3600
    c.run_once()
    assert ig.calls.count("posts") == n + 1 and len(store.select("posts")) == 8


def test_limpeza_de_stories(tmp_path):
    c, store, ig, clock = setup(tmp_path)
    c.vault.save("sec", {"sessionid": "x"})
    add(store, "lia.cozinha", "p1")
    c.run_once()
    clock.t += 50 * 3600
    c.cleanup()
    s2 = next(s for s in store.select("stories") if s["id"] == "S2")
    assert s2["url"] is None and "stories/S2.mp4" not in store.files  # vídeo sai em 48 h
    clock.t += 8 * 24 * 3600
    c.cleanup()
    assert store.select("stories") == []


def test_pausa_no_429_e_sessao_caida(tmp_path):
    c, store, ig, clock = setup(tmp_path)
    c.vault.save("sec", {"sessionid": "x"})
    add(store, "lia.cozinha")
    ig.fail = RateLimited("429")
    c.run_once()
    st = store.select("worker_status")[0]
    assert st["state"] == "paused" and c.gate.paused_until > clock()
    ig.fail = SessionInvalid("caiu")
    c.gate.paused_until = 0
    c.run_once()
    assert not c.session_ok and store.select("worker_status")[0]["state"] == "waiting"
    assert c.vault.load() is None


def test_pedido_atualizar_agora(tmp_path):
    c, store, ig, clock = setup(tmp_path)
    c.vault.save("sec", {"sessionid": "x"})
    add(store, "lia.cozinha")
    c.run_once()
    n = ig.calls.count("posts")
    store.insert("commands", [{"kind": "refresh", "payload": {}, "status": "pending", "created_at": int(c.clock() * 1000)}])
    c.run_once()
    assert ig.calls.count("posts") == n + 1
