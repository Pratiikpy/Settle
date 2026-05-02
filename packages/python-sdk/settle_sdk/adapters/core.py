"""Core adapter primitives — credential header builder + HTTP helper.

Mirrors the TypeScript `attachSettleHeader` + `validateAndSpend` shape
in `@settle/mcp-middleware` so Python agents have byte-identical behavior.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Awaitable, Callable, Dict, Optional, Union
from urllib import request as _urlreq, error as _urlerr


class SettleAdapterError(Exception):
    """Raised on transport / configuration issues with the Settle endpoint."""


class SettlePaymentRequired(Exception):
    """Raised when the merchant returns 402 / DENY for a tool call."""

    def __init__(self, tool_name: str, reason: str = "denied", pay_url: Optional[str] = None) -> None:
        super().__init__(f"Settle payment required for {tool_name}: {reason}")
        self.tool_name = tool_name
        self.reason = reason
        self.pay_url = pay_url


# A credential builder returns a fresh signed envelope each time it's called.
# In production the agent runtime signs with the agent keypair; here we just
# accept whatever dict the runtime hands us.
CredentialBuilder = Callable[[], Dict[str, Any]]


def build_settle_header(builder: CredentialBuilder) -> Dict[str, str]:
    """Build {'X-Settle-Credential': '<base64url>'} for a single tool call.

    `builder` is called fresh on every request so the credential's nonce
    rotates per-call (replay protection on the Settle facilitator side).
    """
    cred = builder()
    if not isinstance(cred, dict):
        raise SettleAdapterError(
            f"credential_builder returned {type(cred).__name__}, expected dict"
        )
    raw = json.dumps(cred, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64 = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
    return {"X-Settle-Credential": b64}


def settle_post(
    url: str,
    *,
    payload: Any,
    credential_builder: CredentialBuilder,
    extra_headers: Optional[Dict[str, str]] = None,
    timeout_seconds: float = 15.0,
) -> Dict[str, Any]:
    """POST `payload` (JSON) to `url` with the Settle credential attached.

    Returns the parsed JSON response.

    Raises:
        SettlePaymentRequired: when the merchant returns HTTP 402.
        SettleAdapterError: on other transport / parse failures.
    """
    headers = {"Content-Type": "application/json"}
    headers.update(build_settle_header(credential_builder))
    if extra_headers:
        headers.update(extra_headers)

    body = json.dumps(payload).encode("utf-8") if payload is not None else b"{}"
    req = _urlreq.Request(url=url, data=body, headers=headers, method="POST")

    try:
        with _urlreq.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/json" in ctype:
                return json.loads(raw.decode("utf-8")) if raw else {}
            return {"text": raw.decode("utf-8", errors="replace")}
    except _urlerr.HTTPError as exc:
        if exc.code == 402:
            pay_url: Optional[str] = None
            try:
                body_json = json.loads(exc.read().decode("utf-8"))
                pay_url = body_json.get("settle", {}).get("pay_url")
            except Exception:  # noqa: BLE001
                pass
            raise SettlePaymentRequired(
                tool_name=url, reason="denied", pay_url=pay_url
            ) from exc
        raise SettleAdapterError(f"HTTP {exc.code}: {exc.reason}") from exc
    except _urlerr.URLError as exc:
        raise SettleAdapterError(f"transport error: {exc.reason}") from exc
