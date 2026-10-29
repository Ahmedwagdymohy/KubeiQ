"""Which connected clusters KubeiQ works with: project membership and hidden clusters.

Lists show the clusters in projects (ADR 0012). Newly connected clusters join the project they
were connected for, or the only project, as far as the plan allows. Contexts of the server's own
kubeconfig cannot be removed, so admins hide them instead.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import plan, repository
from kubeiq.db.models import Project
from kubeiq.settings import repository as settings_repository

HIDDEN_KEY = "hidden_clusters"


async def hidden(session: AsyncSession) -> set[str]:
    value = await settings_repository.get_value(session, HIDDEN_KEY) or {}
    return set(value.get("ids") or [])


async def set_hidden(session: AsyncSession, cluster_id: str, hide: bool) -> None:
    """Hiding also takes the cluster out of every project, which frees its place in the plan."""
    ids = await hidden(session)
    ids = ids | {cluster_id} if hide else ids - {cluster_id}
    await settings_repository.put_value(session, HIDDEN_KEY, {"ids": sorted(ids)})
    if hide:
        for project in await repository.list_projects(session):
            scopes = repository.scopes_of(project)
            kept = [s for s in scopes if s.get("cluster_id") != cluster_id]
            if len(kept) != len(scopes):
                project.scopes = kept
        await session.commit()


async def add_to_project(
    session: AsyncSession, project_id: str | None, cluster_ids: list[str]
) -> tuple[str | None, str | None]:
    """(project name, note). Uses the only project when none is given. Over the plan's cluster
    limit the rest stay connected but outside the project, and the note says so."""
    project = await session.get(Project, project_id) if project_id else None
    if project is None and not project_id:
        projects = await repository.list_projects(session)
        project = projects[0] if len(projects) == 1 else None
    if project is None or not cluster_ids:
        return (project.name if project else None), None
    scopes = repository.scopes_of(project)
    present = {s.get("cluster_id") for s in scopes}
    used = await repository.project_clusters(session)
    added, skipped = [], 0
    for cluster_id in cluster_ids:
        if cluster_id in present:
            continue
        if len(used | {cluster_id}) > plan.max_clusters():
            skipped += 1
            continue
        added.append({"cluster_id": cluster_id, "namespaces": []})
        used.add(cluster_id)
    if added:
        project.scopes = [*scopes, *added]
        await session.commit()
    if skipped and not added and len(cluster_ids) == 1:
        return None, (
            f"The {plan.plan_name()} plan includes {plan.max_clusters()} clusters, so it is not "
            f"in project {project.name} yet"
        )
    if skipped:
        return project.name, (
            f"The {plan.plan_name()} plan includes {plan.max_clusters()} clusters: {skipped} "
            f"more stay outside project {project.name}"
        )
    return project.name, None


async def replace(session: AsyncSession, old: str, new: str) -> str | None:
    """Put ``new`` where ``old`` was in every project, with the same namespaces, then hide
    ``old``. Returns the first project's name."""
    first = None
    for project in await repository.list_projects(session):
        scopes = repository.scopes_of(project)
        if not any(s.get("cluster_id") == old for s in scopes):
            continue
        merged: list[dict[str, object]] = []
        for scope in scopes:
            if scope.get("cluster_id") == old:
                scope = {**scope, "cluster_id": new}
            if not any(m.get("cluster_id") == scope["cluster_id"] for m in merged):
                merged.append(scope)
        project.scopes = merged
        first = first or project.name
    await session.commit()
    await set_hidden(session, old, True)
    return first
