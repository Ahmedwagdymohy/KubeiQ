"""Runs before conftest and every test module: tests never touch the dev database or keys."""

import os
import tempfile

_scratch = tempfile.mkdtemp(prefix="kubeiq-tests-")
os.environ["KUBEIQ_DATABASE_URL"] = f"sqlite+aiosqlite:///{_scratch}/kubeiq.db"
os.environ["KUBEIQ_DATA_DIR"] = _scratch
# Set before any test imports the app, which reads its settings once.
os.environ["KUBEIQ_MASTER_KEY"] = "kiq-test-master-key"
os.environ["KUBEIQ_USAGE_SAMPLE_SECONDS"] = "0"  # no background sampling in tests
