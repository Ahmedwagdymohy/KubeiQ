"""Encryption at rest for secrets saved in Settings (Fernet: AES-128-CBC + HMAC-SHA256)."""

import base64
import hashlib
import os
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from loguru import logger

from kubeiq.core.config import get_settings

KEY_FILE = ".kubeiq-secret.key"


class SecretError(RuntimeError):
    pass


def _key_from_passphrase(passphrase: str) -> bytes:
    # Any KUBEIQ_SECRET_KEY string works; derive a proper 32-byte Fernet key from it.
    return base64.urlsafe_b64encode(hashlib.sha256(passphrase.encode()).digest())


def _load_or_create_key(data_dir: Path) -> bytes:
    path = data_dir / KEY_FILE
    if path.exists():
        return path.read_bytes().strip()
    data_dir.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(key)
    logger.info("Generated a new settings encryption key at {}", path)
    return key


@lru_cache
def _fernet() -> Fernet:
    settings = get_settings()
    if settings.secret_key:
        return Fernet(_key_from_passphrase(settings.secret_key.get_secret_value()))
    return Fernet(_load_or_create_key(Path(settings.data_dir)))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise SecretError(
            "A saved secret cannot be decrypted. The encryption key changed; "
            "set KUBEIQ_SECRET_KEY back or save the setting again"
        ) from exc
