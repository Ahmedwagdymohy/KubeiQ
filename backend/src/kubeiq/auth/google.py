"""Sign in with Google (ADR 0013): OpenID Connect with PKCE, verified ID tokens.

The flow runs on the server: the browser goes to Google and back to the callback, which trades
the code for an ID token, verifies its signature, audience, issuer, expiry and nonce, and only
then trusts the email in it.
"""

import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import requests
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from sqlalchemy.ext.asyncio import AsyncSession

from kubeiq.settings import repository
from kubeiq.settings.crypto import decrypt, encrypt

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - an endpoint, not a secret
STATE_COOKIE = "kubeiq_oauth"
STATE_MAX_AGE = 600


class GoogleSignInError(Exception):
    """Why a sign-in was refused, as a short code the login page explains."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class GoogleConfig:
    client_id: str
    client_secret: str
    allowed_domains: tuple[str, ...]


def defaults() -> dict[str, Any]:
    return {"enabled": False, "client_id": "", "client_secret": None, "allowed_domains": []}


async def load_settings(session: AsyncSession) -> dict[str, Any]:
    return defaults() | (await repository.get_value(session, repository.GOOGLE_KEY) or {})


async def load_config(session: AsyncSession) -> GoogleConfig | None:
    """The saved configuration when Google sign-in is on and complete, else None."""
    saved = await load_settings(session)
    if not (saved["enabled"] and saved["client_id"] and saved["client_secret"]):
        return None
    return GoogleConfig(
        client_id=saved["client_id"],
        client_secret=decrypt(saved["client_secret"]),
        allowed_domains=tuple(saved["allowed_domains"]),
    )


def start(config: GoogleConfig, redirect_uri: str, next_path: str) -> tuple[str, str]:
    """The Google URL to send the browser to, and the sealed state to keep in a cookie."""
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
    query = {
        "client_id": config.client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge.rstrip(b"=").decode(),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    sealed = encrypt(
        json.dumps({"state": state, "nonce": nonce, "verifier": verifier, "next": next_path})
    )
    return f"{AUTHORIZE_URL}?{urlencode(query)}", sealed


def unseal(cookie: str | None, state: str | None) -> dict[str, str]:
    """The flow saved by ``start``, if the state Google sent back matches it."""
    try:
        saved: dict[str, str] = json.loads(decrypt(cookie or ""))
    except Exception as exc:
        raise GoogleSignInError("expired") from exc
    if not state or not secrets.compare_digest(saved.get("state", ""), state):
        raise GoogleSignInError("expired")
    return saved


def verified_email(config: GoogleConfig, code: str, redirect_uri: str, flow: dict[str, str]) -> str:
    """Trade the code for an ID token, verify it, and return its verified email (blocking)."""
    try:
        response = requests.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": config.client_id,
                "client_secret": config.client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": flow["verifier"],
            },
            timeout=15,
        )
        token = response.json().get("id_token") if response.ok else None
        if not token:
            raise GoogleSignInError("failed")
        claims: dict[str, Any] = id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
            token, Request(), config.client_id
        )
    except (requests.RequestException, ValueError, GoogleAuthError) as exc:
        raise GoogleSignInError("failed") from exc
    if claims.get("nonce") != flow["nonce"] or not claims.get("email_verified"):
        raise GoogleSignInError("failed")
    return str(claims["email"]).lower()


def domain_allowed(config: GoogleConfig, email: str) -> bool:
    return email.rsplit("@", 1)[-1] in config.allowed_domains
