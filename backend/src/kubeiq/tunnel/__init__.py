"""The KubeiQ Agent tunnel (ADR 0017).

An agent inside a cluster dials KubeiQ over one WebSocket. KubeiQ opens byte streams through it,
one per HTTP connection of the Kubernetes client, and the agent serves each one with a reverse
proxy to its API server that adds its own ServiceAccount token.
"""
