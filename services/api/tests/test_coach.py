import json

import httpx
import pytest

from app.coach.ollama_client import stream_chat


def _mock_client(lines: list[str]) -> httpx.AsyncClient:
    body = "\n".join(lines) + "\n"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_stream_chat_yields_content_tokens_until_done():
    lines = [
        json.dumps({"message": {"content": "Hel"}, "done": False}),
        json.dumps({"message": {"content": "lo"}, "done": False}),
        json.dumps({"message": {"content": ""}, "done": True}),
    ]
    client = _mock_client(lines)
    tokens = [t async for t in stream_chat([{"role": "user", "content": "hi"}], client=client)]
    await client.aclose()
    assert tokens == ["Hel", "lo"]


async def test_stream_chat_raises_on_http_error_status():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content="boom")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(httpx.HTTPStatusError):
        async for _ in stream_chat([{"role": "user", "content": "hi"}], client=client):
            pass
    await client.aclose()
