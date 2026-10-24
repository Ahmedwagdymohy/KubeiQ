"""Runs before conftest and every test module: tests never touch the dev database or keys."""

import os
import tempfile

_scratch = tempfile.mkdtemp(prefix="kubeiq-tests-")
os.environ["KUBEIQ_DATABASE_URL"] = f"sqlite+aiosqlite:///{_scratch}/kubeiq.db"
os.environ["KUBEIQ_DATA_DIR"] = _scratch
