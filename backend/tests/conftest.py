"""Shared test setup: every API call signs in with a fixed master key."""

import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from kubeiq.auth import master
from kubeiq.clusters import registry as registry_module
from kubeiq.core import config
from kubeiq.db import session as db_session
from kubeiq.db.migrate import upgrade_database
from kubeiq.main import create_app
from kubeiq.settings import crypto

MASTER_KEY = "kiq-test-master-key"
AUTH = {"Authorization": f"Bearer {MASTER_KEY}"}

os.environ["KUBEIQ_MASTER_KEY"] = MASTER_KEY


@pytest.fixture(scope="session", autouse=True)
def _scratch_database() -> None:
    """The shared scratch database (tests/__init__.py) gets the schema once per run."""
    asyncio.run(upgrade_database())


@pytest.fixture(autouse=True)
def _fresh_master_key() -> Iterator[None]:
    master.master_key.cache_clear()
    yield
    master.master_key.cache_clear()


@pytest.fixture
def client(  # an app with a real registry and a temporary database
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    monkeypatch.setenv("KUBEIQ_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("KUBEIQ_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("KUBEIQ_LLM_MODEL", "openai/env-model")
    monkeypatch.setenv("KUBEIQ_KUBECONFIG", str(tmp_path / "missing-kubeconfig"))
    caches = (
        config.get_settings,
        db_session.get_engine,
        db_session.get_sessionmaker,
        registry_module.get_registry,
        registry_module.get_local_source,
        registry_module.get_uploaded_source,
        crypto._fernet,
    )
    for fn in caches:
        fn.cache_clear()
    with TestClient(create_app(), headers=AUTH) as test_client:
        yield test_client
    for fn in caches:
        fn.cache_clear()
