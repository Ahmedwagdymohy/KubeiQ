"""One-command cluster connections (ADR 0014).

An admin gets a one-time code in Settings. ``connect.sh --code`` creates the read-only access
on the cluster and hands its kubeconfig to KubeiQ, which saves it only once it can reach and
read the cluster, then adds the cluster to the project the code was made for.
"""

import asyncio
import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from kubernetes.client import VersionApi
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import plan
from kubeiq.auth import repository as auth_repository
from kubeiq.clusters.base import ClusterStatus
from kubeiq.clusters.errors import UNREACHABLE, describe_error
from kubeiq.clusters.registry import PROBE_TIMEOUT_SECONDS, get_uploaded_source, probe_read
from kubeiq.db.models import DEFAULT_ORG, ConnectCode, Project, StoredKubeconfig
from kubeiq.settings import kubeconfigs, repository
from kubeiq.settings.crypto import decrypt, encrypt
from kubeiq.settings.service import sync_uploaded_clusters

CODE_TTL = timedelta(minutes=15)
CODE_PREFIX = "kqc_"
ASSETS = Path(__file__).parent / "assets"
RBAC_FILES = ("kubeiq-readonly.yaml", "kubeiq-changes.yaml")
MAX_KUBECONFIG_BYTES = 64_000
INVALID_CODE = (
    "This connect code is not valid or has expired. Copy a new command from KubeiQ under "
    "Settings, Clusters"
)


class ConnectError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class Connected:
    name: str
    cluster_id: str
    version: str | None
    project: str | None
    note: str | None

    @property
    def message(self) -> str:
        where = f" and is in project {self.project}" if self.project else ""
        text = f"Done. {self.name} is connected to KubeiQ{where}"
        return f"{text}. {self.note}" if self.note else text


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def expired(row: ConnectCode) -> bool:
    return _as_utc(row.expires_at) <= datetime.now(UTC)


async def create_code(
    session: AsyncSession, created_by: str, project_id: str | None
) -> tuple[ConnectCode, str]:
    code = CODE_PREFIX + secrets.token_urlsafe(24)
    row = ConnectCode(
        code_hash=_hash(code),
        created_by=created_by,
        project_id=project_id,
        expires_at=datetime.now(UTC) + CODE_TTL,
    )
    session.add(row)
    await session.commit()
    return row, code


async def get_code(session: AsyncSession, code_id: str) -> ConnectCode | None:
    row = await session.get(ConnectCode, code_id)
    return row if row and row.org_id == DEFAULT_ORG else None


async def usable_code(session: AsyncSession, code: str) -> ConnectCode:
    """The code's row, if it can still connect a cluster. Raises ConnectError otherwise."""
    if not code.startswith(CODE_PREFIX):
        raise ConnectError(401, INVALID_CODE)
    query = select(ConnectCode).where(ConnectCode.code_hash == _hash(code))
    row = (await session.execute(query)).scalar_one_or_none()
    if row is None or row.used_at is not None or expired(row):
        raise ConnectError(401, INVALID_CODE)
    return row


def clean_name(value: str) -> str:
    name = re.sub(r"-+", "-", re.sub(r"[^a-z0-9-]", "-", value.lower())).strip("-")[:40]
    return name.strip("-") or "cluster"


async def connect(
    session: AsyncSession, row: ConnectCode, content: str, name: str | None
) -> Connected:
    """Test the kubeconfig, then save it and put its cluster in the code's project."""
    try:
        config, contexts, _ = kubeconfigs.inspect(content)
    except kubeconfigs.InvalidKubeconfigError as exc:
        raise ConnectError(422, f"KubeiQ cannot use this kubeconfig: {exc}") from exc
    context = _main_context(config, contexts)
    server = _server(config, context)

    status = await _test(config, context, server)
    if not status.reachable or status.can_read is False:
        await _fail(session, row, status.error or "KubeiQ cannot reach this cluster")
        code = 409 if not status.reachable else 422
        raise ConnectError(code, status.error or "KubeiQ cannot reach this cluster")

    file = await _save(session, clean_name(name or context), content, server)
    await sync_uploaded_clusters(session)
    cluster_id = get_uploaded_source().make_id(f"{file}/{context}")
    project, note = await _add_to_project(session, row.project_id, cluster_id)

    row.used_at = datetime.now(UTC)
    row.state = "connected"
    row.cluster_id = cluster_id
    row.detail = status.version
    row.note = note
    await session.commit()
    await auth_repository.record(
        session,
        row.created_by,
        "settings.kubeconfig.connect",
        target=file,
        cluster_id=cluster_id,
        detail=f"connect code, server {server}",
    )
    return Connected(file, cluster_id, status.version, project, note)


def _main_context(config: dict[str, object], contexts: list[str]) -> str:
    current = config.get("current-context")
    return current if isinstance(current, str) and current in contexts else contexts[0]


def _main_server(content: str) -> str | None:
    config, contexts, _ = kubeconfigs.inspect(content)
    return _server(config, _main_context(config, contexts))


def _server(config: dict[str, object], context: str) -> str | None:
    def items(key: str) -> list[dict[str, object]]:
        value = config.get(key)
        return [i for i in value if isinstance(i, dict)] if isinstance(value, list) else []

    spec = next((c.get("context") for c in items("contexts") if c.get("name") == context), None)
    cluster_name = spec.get("cluster") if isinstance(spec, dict) else None
    for cluster in items("clusters"):
        details = cluster.get("cluster")
        if cluster.get("name") == cluster_name and isinstance(details, dict):
            server = details.get("server")
            return server if isinstance(server, str) else None
    return None


async def _test(config: dict[str, object], context: str, server: str | None) -> ClusterStatus:
    try:
        client = get_uploaded_source().client_for(dict(config), context)
        info = await asyncio.to_thread(
            VersionApi(client).get_code, _request_timeout=PROBE_TIMEOUT_SECONDS + 2
        )
    except Exception as exc:
        error = describe_error(exc, server)
        if error == UNREACHABLE:
            error = f"KubeiQ cannot reach {server}. Check the address, VPN or network access"
        return ClusterStatus(reachable=False, error=error)
    status = await probe_read(client, ClusterStatus(reachable=True, version=info.git_version))
    if status.can_read is False:
        status.error = (
            f"KubeiQ reached {server}, but the cluster refused its access. Run the command again"
        )
    return status


async def _fail(session: AsyncSession, row: ConnectCode, error: str) -> None:
    """Shown live in Settings. The code stays usable, so the command can be run again."""
    row.state = "failed"
    row.detail = error
    await session.commit()


async def _save(session: AsyncSession, name: str, content: str, server: str | None) -> str:
    """Save under ``name``. Connecting the same cluster again replaces its file."""
    rows = {row.name: row for row in await repository.list_kubeconfigs(session)}
    candidate, n = name, 1
    while candidate in rows:
        existing = rows[candidate]
        try:
            same = _main_server(decrypt(existing.content)) == server
        except Exception:
            same = False
        if same:
            existing.content = encrypt(content)
            await session.commit()
            return candidate
        n += 1
        candidate = f"{name[: 40 - len(str(n)) - 1]}-{n}"
    session.add(StoredKubeconfig(name=candidate, content=encrypt(content)))
    await session.commit()
    return candidate


async def _add_to_project(
    session: AsyncSession, project_id: str | None, cluster_id: str
) -> tuple[str | None, str | None]:
    """(project name, note). Over the plan's cluster limit it stays out of the project."""
    project = await session.get(Project, project_id) if project_id else None
    if project is None:
        return None, None
    scopes = auth_repository.scopes_of(project)
    if any(s.get("cluster_id") == cluster_id for s in scopes):
        return project.name, None
    clusters = await auth_repository.project_clusters(session)
    if len(clusters | {cluster_id}) > plan.max_clusters():
        return None, (
            f"The {plan.plan_name()} plan includes {plan.max_clusters()} clusters, so it is not "
            f"in project {project.name} yet"
        )
    project.scopes = [*scopes, {"cluster_id": cluster_id, "namespaces": []}]
    await session.commit()
    return project.name, None


def script(base_url: str) -> str:
    """connect.sh with KubeiQ's own address filled in, so it reports back here."""
    text = (ASSETS / "connect.sh").read_text()
    return text.replace(
        'KUBEIQ_URL="${KUBEIQ_URL:-}"', f'KUBEIQ_URL="${{KUBEIQ_URL:-{base_url}}}"', 1
    )
