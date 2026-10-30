"""Sending a message to Slack, Microsoft Teams, Discord, Telegram, a webhook or email."""

import hashlib
import hmac
import json
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from typing import Any

from kubeiq.notifications.models import Alert

TIMEOUT = 10


class SendError(RuntimeError):
    pass


def _post(url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> None:
    if not url.startswith(("https://", "http://")):
        raise SendError("The address must start with https://")
    body = json.dumps(payload).encode()
    request = urllib.request.Request(  # noqa: S310 - the scheme is checked above
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310
            if response.status >= 300:
                raise SendError(f"The service answered {response.status}")
    except SendError:
        raise
    except urllib.error.HTTPError as exc:
        raise SendError(f"The service answered {exc.code}") from exc
    except Exception as exc:
        raise SendError(f"Could not reach the service: {type(exc).__name__}") from exc


def _plain(alert: Alert) -> str:
    lines = [alert.title, alert.text]
    if alert.link:
        lines.append(alert.link)
    return "\n".join(line for line in lines if line)


def send(kind: str, config: dict[str, Any], alert: Alert) -> None:
    """Deliver one alert. ``config`` holds decrypted values."""
    text = _plain(alert)
    if kind == "slack":
        blocks: list[dict[str, Any]] = [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*{alert.title}*\n{alert.text}"},
            }
        ]
        if alert.link:
            blocks.append(
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "Open in KubeiQ"},
                            "url": alert.link,
                        }
                    ],
                }
            )
        _post(config["url"], {"text": text, "blocks": blocks})
    elif kind == "teams":
        _post(config["url"], {"text": text.replace("\n", "\n\n")})
    elif kind == "discord":
        _post(config["url"], {"content": text[:1900]})
    elif kind == "telegram":
        url = f"https://api.telegram.org/bot{config['token']}/sendMessage"
        _post(
            url,
            {"chat_id": config["chat_id"], "text": text[:4000], "disable_web_page_preview": True},
        )
    elif kind == "webhook":
        payload = alert.model_dump(mode="json")
        headers = {}
        if config.get("secret"):
            signature = hmac.new(
                str(config["secret"]).encode(), json.dumps(payload).encode(), hashlib.sha256
            )
            headers["X-KubeiQ-Signature"] = f"sha256={signature.hexdigest()}"
        _post(config["url"], payload, headers)
    elif kind == "email":
        _email(config, alert)
    else:
        raise SendError(f"Unknown channel type {kind}")


def _email(config: dict[str, Any], alert: Alert) -> None:
    message = EmailMessage()
    message["Subject"] = f"[KubeiQ] {alert.title}"
    message["From"] = config["sender"]
    recipients = [r.strip() for r in str(config["to"]).replace(";", ",").split(",") if r.strip()]
    message["To"] = ", ".join(recipients)
    message.set_content(_plain(alert))
    port = int(config.get("port") or 587)
    try:
        if port == 465:
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                config["host"], port, timeout=TIMEOUT, context=ssl.create_default_context()
            )
        else:
            server = smtplib.SMTP(config["host"], port, timeout=TIMEOUT)
            if str(config.get("starttls", True)).lower() != "false":
                server.starttls(context=ssl.create_default_context())
        with server:
            if config.get("username"):
                server.login(config["username"], config.get("password") or "")
            server.send_message(message, to_addrs=recipients)
    except Exception as exc:
        raise SendError(f"Email failed: {type(exc).__name__}: {exc}"[:240]) from exc
