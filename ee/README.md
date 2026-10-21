# KubeiQ Enterprise (`ee/`)

Commercial features for KubeiQ Pro and Enterprise, licensed under [ee/LICENSE](LICENSE).

Planned: license key validation, RBAC with cluster-scoped roles, OIDC/LDAP SSO, audit logs and export.

Core code must never import from this directory. Enterprise modules register through core extension points.
