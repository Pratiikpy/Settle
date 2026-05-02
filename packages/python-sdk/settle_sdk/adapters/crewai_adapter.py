"""CrewAI Python adapter — D4 / Wave 2.

CrewAI's `BaseTool` subclass exposes `_run(self, **kwargs)`. We mirror
that interface without importing crewai at load time so settle-sdk stays
framework-agnostic.

Usage:
    from settle_sdk.adapters import make_crewai_tool

    settle_summarize = make_crewai_tool(
        name="summarize",
        description="Summarize long text via paid Settle merchant.",
        endpoint="https://merchant.example.com/v1/summarize",
        credential_builder=builder,
    )

    # CrewAI side:
    from crewai.tools import BaseTool
    class MyTool(BaseTool):
        name = settle_summarize.name
        description = settle_summarize.description
        def _run(self, **kwargs):
            return settle_summarize.run(**kwargs)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict

from .core import (
    CredentialBuilder,
    SettleAdapterError,
    SettlePaymentRequired,
    settle_post,
)


@dataclass
class _CrewAITool:
    name: str
    description: str
    endpoint: str
    credential_builder: CredentialBuilder

    def run(self, **kwargs: Any) -> str:
        try:
            result = settle_post(
                self.endpoint,
                payload=kwargs,
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

    # Convenience for hosts that want CrewAI-style _run.
    def _run(self, **kwargs: Any) -> str:
        return self.run(**kwargs)


def make_crewai_tool(
    *,
    name: str,
    description: str,
    endpoint: str,
    credential_builder: CredentialBuilder,
) -> _CrewAITool:
    return _CrewAITool(
        name=name,
        description=description,
        endpoint=endpoint,
        credential_builder=credential_builder,
    )
