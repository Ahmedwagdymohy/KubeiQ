"""Projects (admins only): which clusters and namespaces each member can use."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.auth import plan, repository
from kubeiq.auth.deps import AdminUser
from kubeiq.auth.models import MemberOut, ProjectIn, ProjectOut, Scope
from kubeiq.db.models import Project, User
from kubeiq.db.session import get_session

router = APIRouter(prefix="/projects", tags=["projects"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _out(session: AsyncSession, project: Project) -> ProjectOut:
    members = [
        MemberOut(user_id=u.id, username=u.username, role=m.role)
        for m, u in await repository.project_members(session, project.id)
    ]
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        scopes=[Scope.model_validate(s) for s in repository.scopes_of(project)],
        members=members,
        created_at=project.created_at,
    )


def _limit(message: str) -> HTTPException:
    # 402 like the user limit: the fix is a license, not a permission.
    return HTTPException(
        status.HTTP_402_PAYMENT_REQUIRED,
        f"The {plan.plan_name()} plan allows {message}. A license raises it",
    )


async def _check_clusters(session: AsyncSession, project: Project, body: ProjectIn) -> None:
    """Over the limit, existing clusters keep working; only adding more is refused."""
    others = [p for p in await repository.list_projects(session) if p.id != project.id]
    before = repository.clusters_of([*others, project])
    after = repository.clusters_of(others) | {s.cluster_id for s in body.scopes}
    if len(after) > plan.max_clusters() and len(after) > len(before):
        raise _limit(f"up to {plan.max_clusters()} clusters across projects")


async def _save(session: AsyncSession, project: Project, body: ProjectIn) -> None:
    await _check_clusters(session, project, body)
    session.add(project)
    project.name = body.name.strip()
    project.description = body.description
    project.scopes = [
        {
            "cluster_id": s.cluster_id,
            "namespaces": sorted({n.strip() for n in s.namespaces if n.strip()}),
        }
        for s in body.scopes
    ]
    for member in body.members:
        if await session.get(User, member.user_id) is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown project member")
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Project {body.name} already exists"
        ) from exc
    await repository.set_members(session, project.id, [(m.user_id, m.role) for m in body.members])


@router.get("", response_model=list[ProjectOut])
async def list_projects(admin: AdminUser, session: SessionDep) -> list[ProjectOut]:
    return [await _out(session, p) for p in await repository.list_projects(session)]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectIn, admin: AdminUser, session: SessionDep) -> ProjectOut:
    if len(await repository.list_projects(session)) >= plan.max_projects():
        raise _limit(f"{plan.max_projects()} project" + ("s" if plan.max_projects() > 1 else ""))
    project = Project()
    await _save(session, project, body)
    await repository.record(session, admin.username, "project.create", target=project.name)
    return await _out(session, project)


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str, body: ProjectIn, admin: AdminUser, session: SessionDep
) -> ProjectOut:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    await _save(session, project, body)
    await repository.record(session, admin.username, "project.update", target=project.name)
    return await _out(session, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, admin: AdminUser, session: SessionDep) -> None:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    name = project.name
    await repository.set_members(session, project.id, [])
    await session.delete(project)
    await session.commit()
    await repository.record(session, admin.username, "project.delete", target=name)
