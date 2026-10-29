# 03. Settings

Settings should feel organized and calm: a short list of areas, each with clear sections, the
dangerous things kept apart.

## Today

Settings has one view per area with a side list (AI Model, Clusters, Cluster Changes, Users,
Sign-In, Projects, Activity, Account, About), each a label column beside a grey panel
(docs/design.md).

## Requirements

### Layout

- **MUST** keep the side list of areas (it scales better than a row of tabs), grouped:
  - **Workspace:** General, Appearance, Clusters, Projects.
  - **People:** Users, Sign-In, Roles (08).
  - **Intelligence:** AI Model.
  - **Operations:** Notifications, Cluster Changes.
  - **System:** Activity, License, About, Danger Zone.
- **MUST** keep each area addressable (`/settings#clusters`) and searchable from the command palette.
- Admin-only areas are hidden for others; Account and Appearance are for everyone.

### Areas

- **General:** display preferences that apply to the workspace: show resource usage, show namespace
  badges, compact table rows, confirm before delete (on by default and always on for production
  clusters).
- **Appearance** (per user): light, dark or system; table density; font size. We keep Manrope for
  the UI (brand), but **MAY** offer a choice of monospace font for logs and the terminal.
- **Clusters:** see 02.
- **Projects:** as today (ADR 0012).
- **Users:** invite by email with a role (exists), plus status (invited, active), last sign-in,
  and resend or revoke an invitation.
- **Sign-In:** password and Google (exists, ADR 0013). **SHOULD** add two-factor authentication
  (TOTP with backup codes) for password users, in core. Generic OIDC, LDAP and SAML stay in `ee/`.
- **Roles:** see 08.
- **AI Model:** today one model. **SHOULD** allow several providers (OpenAI, Anthropic, OpenRouter,
  Azure, Bedrock, Ollama, any OpenAI-compatible endpoint through LiteLLM), one default, with Test.
  Keys stay write-only (last 4 characters shown).
- **Notifications:** channels and rules, see 08.
- **Cluster Changes:** as today (ADR 0009), plus which actions are allowed (08).
- **Activity:** the audit log, see 08.
- **License:** plan, limits and usage, activate or remove a license key (`ee/`). In core it shows
  the Free plan and what a license adds, without nagging.
- **About:** version, build, database, uptime, links to the changelog and docs, "copy diagnostics"
  for support (no secrets).
- **Danger Zone:** clear activity (license-dependent), remove all clusters, reset the workspace.
  Each asks for a typed confirmation and is audited. Shown in red, last in the list.

## Tier

Core except: generic SSO, custom roles and audit export (`ee/`, ADR 0001 and 0013).

## Done when

- Every area has a title, a one-line description and sections; nothing shows internals.
- Each destructive action needs a typed confirmation and appears in Activity.
- Non-admins see only Account and Appearance.
