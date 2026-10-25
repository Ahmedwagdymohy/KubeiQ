# 0013 — Sign in with Google in the free core

- **Status:** Accepted
- **Date:** 2026-10-25
- **Narrows:** ADR 0001 (SSO in `ee/`)

## Context
Teams want to sign in with the Google accounts they already use instead of passwords an admin
hands out. ADR 0001 put all SSO in the commercial `ee/`. Many open-source tools offer social
sign-in for free and sell enterprise identity (generic OIDC, SAML, LDAP, group mapping).

## Decision
- **Sign in with Google is core and free.** Generic OIDC, LDAP, SAML and group-to-role mapping
  stay Enterprise features in `ee/`.
- **Server-side OpenID Connect with PKCE** (`auth/google.py`): `/api/v1/auth/google/start` sends
  the browser to Google with a state, a nonce and a code challenge, sealed (Fernet) in a short
  HttpOnly cookie; `/api/v1/auth/google/callback` checks the state, trades the code for an ID
  token and verifies it with `google-auth` (signature, audience, issuer, expiry), then the nonce
  and `email_verified`. Only `openid email profile` are requested.
- **Invite only.** Admins allow people under Users with an email and a role: Admin, or Editor or
  Viewer of a project, which they join at once (`POST /api/v1/users/invite`). With Google
  sign-in on, they sign in with Google and get no password (`auth_provider = "google"`); with it
  off, KubeiQ generates a password shown once. Google sign-in only signs in a user whose username
  is that email; anyone else is refused, and no account is ever created on sign-in. Invites count
  toward the plan's user limit (ADR 0012).
- **Configuration in Settings › Sign-In**: client ID, client secret (encrypted, write-only), and
  the redirect URI to register in Google Cloud. It is computed from the
  address the admin uses, so it is right behind the proxy and on a domain (ADR 0010).
  `KUBEIQ_APP_URL` sends the browser back to the app when it runs on another origin (local
  development). Passwords and the master key keep working.

## Consequences
- Usernames may be email addresses (254 characters; migration 0004 adds `auth_provider`).
- Google requires a domain or localhost in redirect URIs: a server reached by IP needs a domain.
- Each install registers its own OAuth client; KubeiQ ships no shared client.
