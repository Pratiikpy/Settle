"""LangChain Python adapter — D4 / Wave 2.

Returns a callable that LangChain agents can wrap as a tool. We don't
import `langchain` at module load — instead, we expose a function that
the host can hand to `langchain.tools.Tool.from_function(...)` (or any
LCEL runnable wrapper).

Usage:
    from settle_sdk.adapters import make_langchain_tool

    settle_translate = make_langchain_tool(
        name="translate",
        description="Translate text EN→FR via paid Settle merchant.",
        endpoint="https://merchant.example.com/v1/translate",
        credential_builder=lambda: {
            "card_pubkey": "...",
            "agent_pubkey": "...",
            "signature_hex": "...",
            "nonce": "<uuid4>",
            "expires_at": int(time.time()) + 60,
        },
    )

    # Then in your LangChain agent:
    from langchain.tools import Tool
    tools = [Tool.from_function(
        name=settle_translate.name,
        description=settle_translate.description,
        func=settle_translate,
    )]
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional

from .core import (
    CredentialBuilder,
    SettleAdapterError,
    SettlePaymentRequired,
    settle_post,
)


@dataclass
class _LangChainTool:
    name: str
    description: str
    endpoint: str
    credential_builder: CredentialBuilder

    def __call__(self, input: Any) -> str:
        """LangChain tools take a single string OR dict argument and return string."""
        # Normalize: LangChain often passes a single positional string.
        if isinstance(input, str):
            try:
                payload: Any = json.loads(input)
            except (json.JSONDecodeError, ValueError):
                payload = {"input": input}
        else:
            payload = input

        try:
            result = settle_post(
                self.endpoint,
                payload=payload,
                credential_builder=self.credential_builder,
            )
        except SettlePaymentRequired as exc:
            return (
                f"[settle_payment_required] tool={self.name} "
                f"pay_url={exc.pay_url or '<unset>'}"
            )
        except SettleAdapterError as exc:
            return f"[settle_error] tool={self.name} message={exc}"

        if isinstance(result, dict) and "text" in result:
            return str(result["text"])
        return json.dumps(result, ensure_ascii=False)


def make_langchain_tool(
    *,
    name: str,
    description: str,
    endpoint: str,
    credential_builder: CredentialBuilder,
) -> _LangChainTool:
    return _LangChainTool(
        name=name,
        description=description,
        endpoint=endpoint,
        credential_builder=credential_builder,
    )
