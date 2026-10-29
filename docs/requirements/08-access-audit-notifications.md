# 08. Access, Audit and Notifications

What teams need to trust KubeiQ with production: who can do what, a record of what happened, and
alerts where they work.

## Today

- Users with the master-key admin, invite-only sign-in, password and Google (ADR 0008, 0013).
- Projects scope clusters and namespaces, with viewer and editor roles (ADR 0012).
- Cluster changes behind an admin switch, confirmed and audited (ADR 0009).
- Settings › Activity lists audit events.

## Roles and permissions

- **MUST** keep the built-in roles: Admin, Editor, Viewer (per project).
- **SHOULD** define permissions as verbs per resource area, so custom roles are possible:
  - Workloads: view, logs, exec, files, edit, scale, restart, delete.
  - Network, config, storage, access: view, edit, delete. Secrets: view keys only.
  - Nodes: view, cordon, drain.
  - KubeiQ itself: investigate, use the assistant, manage clusters, users, settings, view activity.
- **MUST** scope roles to projects (clusters and namespaces), as today.
- **MUST** hide what a user may not do (navigation, buttons), and enforce it on the server for
  every request (`auth.deps.check`), always, in every tier. (The reference enforces roles only with a
  paid license; ours always enforce the built-in roles.)
- Custom roles are `ee/` (ADR 0001).

## Audit log (Activity)

- **MUST** show: time, user, action (coloured: sign-in, create, update, delete, exec, scale, drain,
  connect), target and its kind, cluster, namespace, IP, result; details in a side panel.
- **MUST** filter by user, action, target kind, cluster and text, with pagination ("Showing 1 to 25
  of 259").
- **MUST** record every change, every exec and file download, every connection and setting change.
- **SHOULD** stream new entries live.
- Export (CSV, JSON, a SIEM webhook) and long retention are `ee/`.

## Notifications

- **MUST** support channels: email (SMTP), Slack, Microsoft Teams, Discord, Telegram and a generic
  webhook, each with **Send test**. Secrets write-only.
- **MUST** support rules, starting with ones that always have a real signal:
  - cluster unreachable and back, lost read access;
  - Cluster Doctor found a new critical issue (with the root cause and a link);
  - workloads failing for longer than N minutes (CrashLoopBackOff, ImagePullBackOff, Pending);
  - nodes NotReady; warning events matching a reason;
  - license or plan limit reached.
- **MUST** choose per cluster which channels get which rules; quiet hours and a cooldown per alert.
- **MUST** use one shared events watch per cluster for detection (not per rule), and only offer rules
  that Kubernetes can actually signal. (The reference lists many toggles with no matching event.)
- **SHOULD** include an **AI summary** in alerts: the likely cause and the first fix command.

## Tier

Core: built-in roles, activity view, channels and rules. `ee/`: custom roles, generic SSO, audit
export and retention.

## Done when

- A viewer cannot see or call exec, edit or delete, checked by API tests for every endpoint.
- Every change made in a test run appears in Activity with user, target and result.
- A failing deployment on kind sends one Slack message with the root cause, then nothing more until
  it recovers or the cooldown ends.
