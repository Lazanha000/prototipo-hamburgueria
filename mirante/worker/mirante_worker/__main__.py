"""Uso:
  python -m mirante_worker run       liga o trabalhador (fica rodando)
  python -m mirante_worker once      faz um ciclo só e sai
  python -m mirante_worker check     confere a configuração e a conexão com o Supabase
  python -m mirante_worker secret    gera uma chave nova para MIRANTE_SECRET
"""
import sys

from .config import Config
from .vault import new_secret


def build(cfg):
    from .collector import Collector
    from .pacing import Gate
    from .source import InstaloaderSource
    from .store import SupabaseStore
    from .vault import Vault

    gate = Gate(cfg.pace_min, cfg.pace_max, (cfg.quiet_start, cfg.quiet_end), cfg.tz_offset_h)
    return Collector(SupabaseStore(cfg.supabase_url, cfg.service_key), InstaloaderSource(gate, cfg.proxy), gate,
                     Vault(cfg.data_dir / "sessao.enc", cfg.secret), cfg)


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "run"
    if cmd == "secret":
        print(new_secret())
        return
    cfg = Config()
    cfg.check()
    if cmd == "check":
        from .store import SupabaseStore
        s = SupabaseStore(cfg.supabase_url, cfg.service_key)
        n = len(s.select("profiles", columns="id"))
        print(f"Supabase ok: {n} perfis cadastrados. Proxy: {'sim' if cfg.proxy else 'NÃO'}.")
        return
    c = build(cfg)
    if cmd == "once":
        c.run_once()
        print(c.message)
    elif cmd == "run":
        c.run_forever()
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv)
