"""Fonte de dados do Instagram (instaloader com a sessão da conta secundária).

Tudo que sai daqui são dicionários simples, para o coletor não depender do instaloader
e para os testes poderem usar uma fonte falsa."""
import itertools

import httpx

from .pacing import Gate


class SourceError(Exception):
    """Erro com mensagem para mostrar no app."""


class RateLimited(SourceError):
    """O Instagram respondeu 429: pausa longa."""


class Blocked(SourceError):
    """Checkpoint / verificação: alguém precisa abrir a conta secundária no app do Instagram."""


class SessionInvalid(SourceError):
    """A sessão caiu: é preciso entrar de novo na conta secundária."""


class NeedsCode(SourceError):
    """Login pediu código de verificação em 2 etapas."""


class NotFound(SourceError):
    pass


class Private(SourceError):
    pass


def _kind(post):
    s = post._node.get("iphone_struct") or {}
    if post.typename == "GraphSidecar":
        return "carousel"
    if post.typename == "GraphVideo":
        return "reel" if s.get("product_type") == "clips" or post._node.get("product_type") == "clips" else "video"
    return "image"


def _ms(dt):
    from datetime import timezone
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


class InstaloaderSource:
    def __init__(self, gate: Gate, proxy: str = ""):
        import instaloader
        from instaloader.instaloadercontext import RateController

        self.il = instaloader
        self.gate = gate
        self.proxy = proxy

        source = self

        class Paced(RateController):
            # todo pedido ao Instagram passa pelo nosso ritmo; 429 vira pausa longa em vez de espera presa
            def wait_before_query(self, query_type):
                source.gate.wait()

            def handle_429(self, query_type):
                raise RateLimited("O Instagram pediu calma (429).")

        self.L = instaloader.Instaloader(
            quiet=True, download_pictures=False, download_videos=False, download_video_thumbnails=False,
            download_geotags=False, download_comments=False, save_metadata=False, compress_json=False,
            max_connection_attempts=1, request_timeout=30, rate_controller=lambda ctx: Paced(ctx),
        )
        self._apply_proxy()
        self.http = httpx.Client(timeout=60, proxy=proxy or None, follow_redirects=True,
                                 headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"})

    def _apply_proxy(self):
        # o instaloader cria uma sessão nova a cada login: o proxy precisa ser posto de novo
        if self.proxy:
            self.L.context._session.proxies.update({"http": self.proxy, "https": self.proxy})

    def _wrap(self, fn):
        ex = self.il.exceptions
        try:
            return fn()
        except (RateLimited, SourceError):
            raise
        except ex.TooManyRequestsException as e:
            raise RateLimited(str(e)) from e
        except ex.TwoFactorAuthRequiredException as e:
            raise NeedsCode("Código de verificação necessário.") from e
        except ex.BadCredentialsException as e:
            raise SourceError("Usuário ou senha incorretos.") from e
        except ex.LoginRequiredException as e:
            raise SessionInvalid("A sessão da conta secundária caiu. Entre de novo nos Ajustes.") from e
        except ex.ProfileNotExistsException as e:
            raise NotFound("Esse perfil não existe ou mudou de nome.") from e
        except ex.PrivateProfileNotFollowedException as e:
            raise Private("Perfil privado: a conta secundária precisa seguir ele.") from e
        except (ex.LoginException, ex.QueryReturnedBadRequestException, ex.ConnectionException) as e:
            msg = str(e).lower()
            if "checkpoint" in msg or "challenge" in msg or "feedback_required" in msg or "suspended" in msg:
                raise Blocked("O Instagram pediu uma verificação na conta secundária. Abra o app do Instagram com ela e confirme que foi você.") from e
            if "login" in msg and "required" in msg or "401" in msg:
                raise SessionInvalid("A sessão da conta secundária caiu. Entre de novo nos Ajustes.") from e
            if "429" in msg or "wait a few minutes" in msg:
                raise RateLimited(str(e)) from e
            if "404" in msg or "not found" in msg:
                raise NotFound("Não encontrei isso no Instagram.") from e
            raise SourceError(str(e)) from e

    # ---------- sessão ----------
    def login(self, username, password):
        self._wrap(lambda: self.L.login(username, password))
        self._apply_proxy()

    def submit_code(self, code):
        self._wrap(lambda: self.L.two_factor_login(code))
        self._apply_proxy()

    def restore(self, username, session):
        self.L.load_session(username, session)
        self._apply_proxy()

    def session(self):
        return self.L.save_session()

    @property
    def username(self):
        return self.L.context.username

    def test(self):
        return self._wrap(lambda: self.L.test_login())

    # ---------- dados ----------
    def profile(self, handle):
        def go():
            p = self.il.Profile.from_username(self.L.context, handle)
            return {
                "ig_id": str(p.userid), "handle": p.username.lower(), "name": p.full_name or None, "bio": p.biography or None,
                "avatar_src": p.profile_pic_url, "followers": p.followers, "following": p.followees, "posts_count": p.mediacount,
                "is_business": bool(p.is_business_account), "is_private": bool(p.is_private), "followed": bool(p.followed_by_viewer),
                "_obj": p,
            }
        return self._wrap(go)

    def owner_of(self, shortcode):
        return self._wrap(lambda: self.il.Post.from_shortcode(self.L.context, shortcode).owner_username.lower())

    def recent_posts(self, prof, known, first_run=False):
        """Posts mais recentes. Para quando já viu alguns conhecidos (os números deles também são atualizados)."""
        def go():
            p = prof.get("_obj") or self.il.Profile.from_username(self.L.context, prof["handle"])
            out, known_seen = [], 0
            limit = 24 if first_run else 48
            for i, post in enumerate(itertools.islice(p.get_posts(), limit)):
                out.append(self._post(post))
                if post.shortcode in known:
                    known_seen += 1
                if i >= 11 and (first_run and i >= 23 or known_seen >= 3):
                    break
            return out
        return self._wrap(go)

    def _post(self, post):
        s = post._node.get("iphone_struct") or {}
        kind = _kind(post)
        media = []
        if post.typename == "GraphSidecar":
            for n in post.get_sidecar_nodes():
                media.append({"kind": "video" if n.is_video else "image", "url": n.video_url if n.is_video else n.display_url})
        elif post.is_video:
            media.append({"kind": "video", "url": post.video_url})
        else:
            media.append({"kind": "image", "url": post.url})
        views = s.get("play_count") or s.get("ig_play_count") or s.get("view_count") or post._node.get("video_view_count")
        return {
            "id": post.shortcode, "kind": kind, "taken_at": _ms(post.date_utc),
            "caption": post.caption, "hashtags": " ".join(post.caption_hashtags) or None,
            "mentions": " ".join(post.caption_mentions) or None,
            "duration": post._node.get("video_duration"),
            "likes": post.likes if post.likes is not None and post.likes >= 0 else None,
            "comments": post.comments, "views": views if kind in ("reel", "video") else None,
            "is_pinned": bool(s.get("timeline_pinned_user_ids")),
            "media": media, "thumb_src": post.url,
        }

    def stories(self, userids):
        def go():
            out = []
            for story in self.L.get_stories(userids=[int(u) for u in userids]):
                for it in story.get_items():
                    out.append({
                        "id": str(it.mediaid), "ig_owner_id": str(it.owner_id), "taken_at": _ms(it.date_utc), "expires_at": _ms(it.expiring_utc),
                        "kind": "video" if it.is_video else "image", "src": it.video_url if it.is_video else it.url, "thumb_src": it.url,
                    })
            return out
        return self._wrap(go)

    def comments(self, shortcode, owner_handle, limit=300):
        def go():
            post = self.il.Post.from_shortcode(self.L.context, shortcode)
            out = []
            for c in itertools.islice(post.get_comments(), limit):
                node = getattr(c, "_node", {}) or {}
                replies = (node.get("edge_threaded_comments") or {}).get("count") or node.get("child_comment_count") or 0
                cid = str(c.id)
                out.append({"id": cid, "parent_id": None, "author": c.owner.username, "text": c.text, "created_at": _ms(c.created_at_utc),
                            "likes": c.likes_count or 0, "replies": replies, "by_owner": c.owner.username.lower() == owner_handle})
                # respostas só dos comentários com mais curtidas, para economizar pedidos
                if replies and len([o for o in out if o["parent_id"]]) < 150 and (c.likes_count or 0) >= 1:
                    for a in itertools.islice(c.answers, 10):
                        out.append({"id": str(a.id), "parent_id": cid, "author": a.owner.username, "text": a.text, "created_at": _ms(a.created_at_utc),
                                    "likes": a.likes_count or 0, "replies": 0, "by_owner": a.owner.username.lower() == owner_handle})
            return out
        return self._wrap(go)

    def download(self, url):
        """Baixa uma imagem ou vídeo do CDN do Instagram (também pelo proxy)."""
        r = self.http.get(url)
        r.raise_for_status()
        return r.content
