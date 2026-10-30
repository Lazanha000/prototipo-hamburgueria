"""Miniaturas pequenas em WebP: o feed carrega rápido e o Supabase Free aguenta anos."""
import io

from PIL import Image


def thumbnail(data: bytes, width=480, quality=70) -> bytes:
    im = Image.open(io.BytesIO(data))
    im = im.convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=quality, method=4)
    return out.getvalue()
