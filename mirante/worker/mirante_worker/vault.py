"""Guarda a sessão da conta secundária criptografada em disco. A senha nunca é guardada."""
import json
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


class Vault:
    def __init__(self, path: Path, secret: str):
        self.path = Path(path)
        self.f = Fernet(secret.encode() if isinstance(secret, str) else secret)

    def save(self, username: str, session: dict):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_bytes(self.f.encrypt(json.dumps({"username": username, "session": session}).encode()))
        os.replace(tmp, self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def load(self):
        try:
            data = json.loads(self.f.decrypt(self.path.read_bytes()))
            return data["username"], data["session"]
        except (FileNotFoundError, InvalidToken, ValueError, KeyError):
            return None

    def clear(self):
        self.path.unlink(missing_ok=True)


def new_secret() -> str:
    return Fernet.generate_key().decode()
