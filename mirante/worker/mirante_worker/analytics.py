"""Contas do "acima do normal" e do engajamento."""
from statistics import median


def is_video(p):
    return p.get("kind") in ("reel", "video")


def outliers(posts, window=30):
    """Para cada post: métrica ÷ mediana dos últimos `window` posts do mesmo perfil.
    Reels e vídeos comparam views; fotos e carrosséis comparam curtidas."""
    recent = sorted(posts, key=lambda p: p["taken_at"], reverse=True)[:window]
    views = [p["views"] for p in recent if is_video(p) and p.get("views")]
    likes = [p["likes"] for p in recent if p.get("likes")]
    mv, ml = (median(views) if views else None), (median(likes) if likes else None)
    out = {}
    for p in posts:
        if is_video(p) and p.get("views") is not None and mv:
            out[p["id"]] = round(p["views"] / mv, 2)
        elif p.get("likes") is not None and ml:
            out[p["id"]] = round(p["likes"] / ml, 2)
    return out


def engagement(post, followers):
    if not followers or post.get("likes") is None:
        return None
    return round(((post.get("likes") or 0) + (post.get("comments") or 0)) / followers, 5)


SNAPSHOT_HOURS = (1, 6, 24, 72, 168, 720)


def snapshot_due(taken_at_ms, now_ms, existing_ats):
    """A "fotografia" de métricas que falta agora, se alguma: uma por marco (1 h, 6 h, 24 h, 3 d, 7 d, 30 d)."""
    age_h = (now_ms - taken_at_ms) / 3_600_000
    if age_h > SNAPSHOT_HOURS[-1] * 1.5:
        return False
    passed = [h for h in SNAPSHOT_HOURS if h <= age_h]
    if not passed:
        return not existing_ats  # primeira anotação, logo que o post aparece
    mark = taken_at_ms + passed[-1] * 3_600_000
    return not any(a >= mark for a in existing_ats)
