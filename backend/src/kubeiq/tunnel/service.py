"""Agent clusters: install codes, registration, tokens, revocation and status (ADR 0017).

An admin adds a cluster under Settings and gets a one-time install code (like the connect codes
of ADR 0014). The agent trades it once for a long-lived agent token. Only SHA-256 hashes of codes
and tokens are stored; both are long random strings, so a plain hash is enough.
"""

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq import __version__
from kubeiq.clusters.registry import get_agent_source
from kubeiq.core.config import get_settings
from kubeiq.db.models import DEFAULT_ORG, AgentCluster

CODE_PREFIX = "kqi_"
TOKEN_PREFIX = "kqa_"  # noqa: S105 - a prefix, not a secret
CODE_TTL = timedelta(hours=1)
ASSETS = Path(__file__).parent / "assets"
RBAC = Path(__file__).resolve().parents[1] / "connect" / "assets" / "rbac"
IMAGE = "ghcr.io/ahmedwagdymohy/kubeiq-agent"
NAME_PATTERN = r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
INVALID_CODE = (
    "This install code is not valid, was already used or has expired. Copy a new command from "
    "KubeiQ under Settings, Clusters"
)
_URL = re.compile(r"^https?://[A-Za-z0-9.\-]+(:\d{1,5})?(/[A-Za-z0-9._~\-/]*)?$")


class AgentAuthError(Exception):
    pass


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def cluster_id(name: str) -> str:
    return get_agent_source().make_id(name)


async def list_rows(session: AsyncSession) -> list[AgentCluster]:
    query = select(AgentCluster).where(AgentCluster.org_id == DEFAULT_ORG)
    return list((await session.execute(query.order_by(AgentCluster.name))).scalars())


async def get_row(session: AsyncSession, name: str) -> AgentCluster | None:
    query = select(AgentCluster).where(
        AgentCluster.org_id == DEFAULT_ORG, AgentCluster.name == name
    )
    return (await session.execute(query)).scalar_one_or_none()


def _new_code(row: AgentCluster) -> str:
    code = CODE_PREFIX + secrets.token_urlsafe(24)
    row.code_hash = _hash(code)
    row.code_expires_at = datetime.now(UTC) + CODE_TTL
    return code


async def create(
    session: AsyncSession, name: str, project_id: str | None, created_by: str
) -> tuple[AgentCluster, str]:
    row = AgentCluster(name=name, project_id=project_id, created_by=created_by)
    code = _new_code(row)
    session.add(row)
    await session.commit()
    await sync(session)
    return row, code


async def new_code(session: AsyncSession, row: AgentCluster) -> str:
    """A fresh install code: to install again, after a revoke or when the old one expired."""
    code = _new_code(row)
    await session.commit()
    return code


def code_usable(row: AgentCluster) -> bool:
    return (
        row.code_hash is not None
        and row.code_expires_at is not None
        and _as_utc(row.code_expires_at) > datetime.now(UTC)
    )


async def row_for_code(session: AsyncSession, code: str) -> AgentCluster:
    if not code.startswith(CODE_PREFIX):
        raise AgentAuthError(INVALID_CODE)
    query = select(AgentCluster).where(AgentCluster.code_hash == _hash(code))
    row = (await session.execute(query)).scalar_one_or_none()
    if row is None or not code_usable(row):
        raise AgentAuthError(INVALID_CODE)
    return row


async def register(session: AsyncSession, code: str) -> tuple[AgentCluster, str]:
    """Trade a one-time install code for an agent token. The code stops working."""
    row = await row_for_code(session, code)
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    row.token_hash = _hash(token)
    row.code_hash = None
    row.code_expires_at = None
    row.registered_at = datetime.now(UTC)
    row.revoked_at = None
    await session.commit()
    return row, token


async def row_for_token(session: AsyncSession, token: str) -> AgentCluster | None:
    if not token.startswith(TOKEN_PREFIX):
        return None
    query = select(AgentCluster).where(AgentCluster.token_hash == _hash(token))
    row = (await session.execute(query)).scalar_one_or_none()
    return row if row is not None and row.revoked_at is None else None


async def revoke(session: AsyncSession, row: AgentCluster) -> None:
    """The token and any open install code stop working. The cluster stays listed."""
    row.token_hash = None
    row.code_hash = None
    row.code_expires_at = None
    row.revoked_at = datetime.now(UTC)
    await session.commit()


async def delete(session: AsyncSession, row: AgentCluster) -> None:
    await session.delete(row)
    await session.commit()
    await sync(session)


async def seen(
    session: AsyncSession, row: AgentCluster, version: str | None, kubernetes: str | None
) -> None:
    row.last_seen_at = datetime.now(UTC)
    if version is not None:
        row.agent_version = version[:64]
    if kubernetes is not None:
        row.kubernetes_version = kubernetes[:64]
    await session.commit()


async def sync(session: AsyncSession) -> None:
    """Load agent clusters into the cluster registry (startup and after changes)."""
    get_agent_source().set_entries([{"name": row.name} for row in await list_rows(session)])


def image() -> str:
    return get_settings().agent_image or f"{IMAGE}:{__version__}"


def valid_url(value: str) -> bool:
    return bool(_URL.match(value))


def _cluster_role(file: str) -> str:
    """Only the ClusterRole of a deploy/rbac file: the agent brings its own ServiceAccount."""
    docs = (RBAC / file).read_text().split("\n---\n")
    role = next(d for d in docs if "\nkind: ClusterRole\n" in f"\n{d}")
    return "\n".join(line for line in role.splitlines() if not line.startswith("#")).strip()


def manifest(url: str, code: str, changes: bool = False) -> str:
    """The install manifest with KubeiQ's address, the code and the image filled in."""
    values: dict[str, Any] = {
        "__KUBEIQ_URL__": url.rstrip("/"),
        "__CODE__": code,
        "__IMAGE__": image(),
        "__VERSION__": __version__,
    }
    text = (ASSETS / "install.yaml").read_text()
    for key, value in values.items():
        text = text.replace(key, str(value))
    parts = [text.rstrip(), _cluster_role("kubeiq-readonly.yaml")]
    if changes:
        parts += [_cluster_role("kubeiq-changes.yaml"), (ASSETS / "changes.yaml").read_text()]
    return "\n---\n".join(p.strip() for p in parts) + "\n"


def uninstall() -> str:
    """What the install created, except the shared ClusterRoles (connect.sh uses them too)."""
    return (ASSETS / "uninstall.yaml").read_text()
