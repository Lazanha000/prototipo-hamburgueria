"""Configuração por variáveis de ambiente (arquivo .env no servidor)."""
import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name, default=None, cast=str):
    v = os.environ.get(name)
    return default if v in (None, "") else cast(v)


@dataclass
class Config:
    supabase_url: str = field(default_factory=lambda: _env("SUPABASE_URL", ""))
    service_key: str = field(default_factory=lambda: _env("SUPABASE_SERVICE_KEY", ""))
    secret: str = field(default_factory=lambda: _env("MIRANTE_SECRET", ""))          # chave Fernet para a sessão
    proxy: str = field(default_factory=lambda: _env("IG_PROXY", ""))                 # http://usuario:senha@ip:porta
    data_dir: Path = field(default_factory=lambda: Path(_env("MIRANTE_DATA", "data")))
    # ritmo: um pedido ao Instagram a cada 4–8 s, nunca dois ao mesmo tempo
    pace_min: float = field(default_factory=lambda: _env("PACE_MIN", 4.0, float))
    pace_max: float = field(default_factory=lambda: _env("PACE_MAX", 8.0, float))
    # madrugada em silêncio, como uma pessoa (horário de Brasília)
    quiet_start: int = field(default_factory=lambda: _env("QUIET_START", 2, int))
    quiet_end: int = field(default_factory=lambda: _env("QUIET_END", 6, int))
    tz_offset_h: int = field(default_factory=lambda: _env("TZ_OFFSET_H", -3, int))
    # de quanto em quanto tempo olhar cada perfil (minutos) e os stories
    check_every_min: int = field(default_factory=lambda: _env("CHECK_EVERY_MIN", 120, int))
    priority_every_min: int = field(default_factory=lambda: _env("PRIORITY_EVERY_MIN", 60, int))
    stories_every_min: int = field(default_factory=lambda: _env("STORIES_EVERY_MIN", 150, int))
    profiles_per_cycle: int = field(default_factory=lambda: _env("PROFILES_PER_CYCLE", 12, int))
    comments_per_cycle: int = field(default_factory=lambda: _env("COMMENTS_PER_CYCLE", 4, int))
    max_comments: int = field(default_factory=lambda: _env("MAX_COMMENTS", 300, int))
    # quanto tempo guardar stories (horas): vídeos pesam, então ficam menos
    story_video_hours: int = field(default_factory=lambda: _env("STORY_VIDEO_HOURS", 48, int))
    story_keep_hours: int = field(default_factory=lambda: _env("STORY_KEEP_HOURS", 168, int))
    cycle_seconds: int = field(default_factory=lambda: _env("CYCLE_SECONDS", 60, int))

    def check(self):
        missing = [n for n, v in (("SUPABASE_URL", self.supabase_url), ("SUPABASE_SERVICE_KEY", self.service_key),
                                  ("MIRANTE_SECRET", self.secret)) if not v]
        if missing:
            raise SystemExit("Faltam variáveis de ambiente: " + ", ".join(missing) + ". Veja o arquivo .env.exemplo.")
        if not self.proxy:
            print("Aviso: IG_PROXY vazio. Coletar de um IP de servidor aumenta muito o risco de bloqueio.")
