"""What a signed-in user may see and change, derived from project memberships."""

from dataclasses import dataclass, field
from typing import Literal

Action = Literal["read", "edit"]


@dataclass(frozen=True)
class Grant:
    cluster_id: str
    namespaces: frozenset[str] | None  # None = every namespace and cluster-wide resources
    role: Literal["viewer", "editor"]


@dataclass(frozen=True)
class Access:
    admin: bool = False
    grants: tuple[Grant, ...] = field(default_factory=tuple)

    def can(self, action: Action, cluster_id: str, namespace: str | None) -> bool:
        """``namespace=None`` means all namespaces or a cluster-wide resource."""
        if self.admin:
            return True
        for grant in self.grants:
            if grant.cluster_id != cluster_id or (action == "edit" and grant.role != "editor"):
                continue
            if grant.namespaces is None or (
                namespace is not None and namespace in grant.namespaces
            ):
                return True
        return False

    def clusters(self) -> set[str] | None:
        """Clusters the user can see at all; None means all."""
        return None if self.admin else {g.cluster_id for g in self.grants}

    def namespaces(self, cluster_id: str) -> set[str] | None:
        """Namespaces the user can see in a cluster; None means all."""
        if self.admin:
            return None
        names: set[str] = set()
        for grant in self.grants:
            if grant.cluster_id == cluster_id:
                if grant.namespaces is None:
                    return None
                names |= grant.namespaces
        return names
