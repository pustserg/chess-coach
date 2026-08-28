import json
from collections.abc import AsyncIterator

import httpx

from ..config import settings


async def stream_chat(
    messages: list[dict[str, str]],
    client: httpx.AsyncClient | None = None,
) -> AsyncIterator[str]:
    """Stream assistant token deltas from Ollama's /api/chat for the given messages."""
    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=60.0)
    try:
        async with http_client.stream(
            "POST",
            f"{settings.ollama_url}/api/chat",
            json={"model": settings.ollama_model, "messages": messages, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                content = chunk.get("message", {}).get("content", "")
                if content:
                    yield content
                if chunk.get("done"):
                    break
    finally:
        if owns_client:
            await http_client.aclose()
