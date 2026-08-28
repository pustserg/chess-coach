import json

import httpx
import httpx as httpx_module  # for the ConnectError used below
import pytest

from app.coach.ollama_client import stream_chat
from app.coach.prompts import build_system_prompt
from app.schemas import CoachRequest, EvaluationIn


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


def _request(**overrides) -> CoachRequest:
    defaults = dict(
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        move_history_san=["e4", "e5"],
        side_to_move="w",
        evaluation=EvaluationIn(score_cp=35, score_mate=None, lines=[["Nf3", "Nc6"]]),
        target_elo=2000,
        messages=[],
    )
    defaults.update(overrides)
    return CoachRequest(**defaults)


def test_prompt_includes_fen_moves_and_target_elo():
    prompt = build_system_prompt(_request())
    assert "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" in prompt
    assert "e4 e5" in prompt
    assert "2000" in prompt


def test_prompt_formats_centipawn_score_in_pawns():
    prompt = build_system_prompt(_request(evaluation=EvaluationIn(score_cp=35, lines=[])))
    assert "+0.35 pawns" in prompt


def test_prompt_formats_mate_score():
    prompt = build_system_prompt(_request(evaluation=EvaluationIn(score_mate=3, lines=[])))
    assert "Mate in 3 for White" in prompt


def test_prompt_forbids_inventing_an_evaluation_when_none_is_available():
    prompt = build_system_prompt(
        _request(evaluation=EvaluationIn(score_cp=None, score_mate=None, lines=[]))
    )
    assert "NO ENGINE DATA IS AVAILABLE FOR THIS POSITION" in prompt
    assert "Do not fabricate an evaluation, score, or engine line" in prompt
    # The "trust the evaluation you were given" instruction must not appear when
    # there is no evaluation to trust.
    assert "do not re-evaluate the position yourself" not in prompt


def test_prompt_keeps_ground_truth_instruction_when_an_evaluation_exists():
    prompt = build_system_prompt(_request())
    assert "do not re-evaluate the position yourself" in prompt
    assert "NO ENGINE DATA" not in prompt


COACH_PAYLOAD = {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "move_history_san": [],
    "side_to_move": "w",
    "evaluation": {"score_cp": 20, "score_mate": None, "lines": [["Nf3", "Nf6"]]},
    "target_elo": 2000,
    "messages": [{"role": "user", "content": "What's the plan here?"}],
}


def test_coach_message_streams_tokens(client, monkeypatch):
    async def fake_stream_chat(messages):
        assert messages[0]["role"] == "system"
        assert messages[-1] == {"role": "user", "content": "What's the plan here?"}
        yield "Hel"
        yield "lo"

    monkeypatch.setattr("app.coach.routes.ollama_client.stream_chat", fake_stream_chat)
    resp = client.post("/coach/message", json=COACH_PAYLOAD)
    assert resp.status_code == 200
    assert resp.text == "Hello"


def test_coach_message_returns_502_when_ollama_unreachable(client, monkeypatch):
    async def fake_stream_chat(messages):
        raise httpx_module.ConnectError("refused")
        yield  # pragma: no cover - unreachable, keeps this an async generator

    monkeypatch.setattr("app.coach.routes.ollama_client.stream_chat", fake_stream_chat)
    resp = client.post("/coach/message", json=COACH_PAYLOAD)
    assert resp.status_code == 502
