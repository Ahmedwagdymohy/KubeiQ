"""Plan limits. The free plan allows 3 users, 1 project and 3 clusters (ADR 0012).

A Pro/Enterprise license (ee/) will raise them through this module; core never imports ee/.
"""

FREE_MAX_USERS = 3
FREE_MAX_PROJECTS = 1
FREE_MAX_CLUSTERS = 3  # distinct clusters across all projects


def max_users() -> int:
    return FREE_MAX_USERS


def max_projects() -> int:
    return FREE_MAX_PROJECTS


def max_clusters() -> int:
    return FREE_MAX_CLUSTERS


def plan_name() -> str:
    return "Free"
