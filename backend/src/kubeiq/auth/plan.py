"""Plan limits. The free plan allows 3 users; a Pro/Enterprise license (ee/) will raise it."""

FREE_MAX_USERS = 3


def max_users() -> int:
    # Extension point for ee/ license validation (ADR 0001): core never imports ee/.
    return FREE_MAX_USERS


def plan_name() -> str:
    return "Free"
