"""Settle Python framework adapters — D4 / Wave 2.

Lets agents built on Python LangChain or CrewAI call paid Settle merchants
without inventing custom auth. Each adapter wraps the framework's tool with
a Settle-credential injection step (X-Settle-Credential header).

Adapters are FRAMEWORK-OPTIONAL — they don't `import langchain` or
`import crewai` at module load. Instead they accept the framework's tool
shape duck-typed and return an instance that snaps into the agent runtime.
"""

from .core import (
    CredentialBuilder,
    SettleAdapterError,
    SettlePaymentRequired,
    build_settle_header,
    settle_post,
)
from .langchain_adapter import make_langchain_tool
from .crewai_adapter import make_crewai_tool

__all__ = [
    "CredentialBuilder",
    "SettleAdapterError",
    "SettlePaymentRequired",
    "build_settle_header",
    "settle_post",
    "make_langchain_tool",
    "make_crewai_tool",
]
