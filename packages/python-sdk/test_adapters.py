"""Smoke tests for D4 framework adapters.

Run with: pytest packages/python-sdk/test_adapters.py
"""
from __future__ import annotations

import base64
import json
import time
from unittest.mock import patch
from urllib.error import HTTPError

import pytest

from settle_sdk.adapters import (
    SettleAdapterError,
    SettlePaymentRequired,
    build_settle_header,
    make_crewai_tool,
    make_langchain_tool,
)


def _builder() -> dict:
    return {
        "card_pubkey": "C" * 44,
        "agent_pubkey": "A" * 44,
        "signature_hex": "0" * 128,
        "nonce": "11111111-1111-4111-8111-111111111111",
        "expires_at": int(time.time()) + 60,
    }


def test_build_settle_header_returns_b64url_dict() -> None:
    header = build_settle_header(_builder)
    assert "X-Settle-Credential" in header
    raw = header["X-Settle-Credential"]
    # base64url with stripped padding
    pad = "=" * (-len(raw) % 4)
    decoded = base64.urlsafe_b64decode(raw + pad).decode("utf-8")
    parsed = json.loads(decoded)
    assert parsed["agent_pubkey"] == "A" * 44


def test_build_settle_header_rejects_non_dict_builder() -> None:
    def bad_builder() -> str:
        return "not a dict"

    with pytest.raises(SettleAdapterError):
        build_settle_header(bad_builder)  # type: ignore[arg-type]


def test_langchain_tool_renders_payment_required_on_402() -> None:
    tool = make_langchain_tool(
        name="translate",
        description="Translate EN→FR.",
        endpoint="https://merchant.example.com/v1/translate",
        credential_builder=_builder,
    )

    def raise_402(*_args, **_kwargs):
        err = HTTPError(
            url="https://merchant.example.com/v1/translate",
            code=402,
            msg="Payment Required",
            hdrs=None,  # type: ignore[arg-type]
            fp=None,
        )
        err.read = lambda: json.dumps(  # type: ignore[method-assign]
            {"settle": {"pay_url": "https://settle.so/agents"}}
        ).encode("utf-8")
        raise err

    with patch("settle_sdk.adapters.core._urlreq.urlopen", side_effect=raise_402):
        out = tool({"text": "hello"})
    assert "settle_payment_required" in out
    assert "https://settle.so/agents" in out


def test_crewai_tool_run_returns_json_on_success() -> None:
    tool = make_crewai_tool(
        name="summarize",
        description="Summarize.",
        endpoint="https://merchant.example.com/v1/summarize",
        credential_builder=_builder,
    )

    class FakeResp:
        headers = {"Content-Type": "application/json"}

        def read(self) -> bytes:
            return json.dumps({"summary": "ok"}).encode("utf-8")

        def __enter__(self) -> "FakeResp":
            return self

        def __exit__(self, *_: object) -> None:
            return None

    with patch(
        "settle_sdk.adapters.core._urlreq.urlopen",
        return_value=FakeResp(),
    ):
        out = tool.run(text="x" * 50)
    assert json.loads(out) == {"summary": "ok"}


def test_payment_required_carries_tool_name() -> None:
    err = SettlePaymentRequired(tool_name="t", reason="denied", pay_url="u")
    assert err.tool_name == "t"
    assert err.reason == "denied"
    assert err.pay_url == "u"
