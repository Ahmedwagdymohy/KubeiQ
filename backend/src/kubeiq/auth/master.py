"""The master key: generated once at install, used by the built-in admin to sign in.

Taken from ``KUBEIQ_MASTER_KEY`` when set (the installer writes it to ``backend/.env``).
Otherwise generated on first start into ``<data_dir>/.kubeiq-master-key`` and logged once.
"""

import hmac
import os
import secrets
from functools import lru_cache
from pathlib import Path

from loguru import logger

from kubeiq.core.config import get_settings

KEY_FILE = ".kubeiq-master-key"
PREFIX = "kiq-"


def generate_master_key() -> str:
    return PREFIX + secrets.token_urlsafe(24)


@lru_cache
def master_key() -> str:
    settings = get_settings()
    if settings.master_key:
        return settings.master_key.get_secret_value()
    path = Path(settings.data_dir) / KEY_FILE
    if path.exists():
        return path.read_text().strip()
    path.parent.mkdir(parents=True, exist_ok=True)
    key = generate_master_key()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(key + "\n")
    logger.warning(
        "Generated the KubeiQ master key. Sign in as '{}' with the key saved in {}",
        settings.admin_username,
        path,
    )
    return key


def is_master_key(value: str) -> bool:
    return hmac.compare_digest(value.encode(), master_key().encode())
