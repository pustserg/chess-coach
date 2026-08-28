import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import schemas
from . import ollama_client
from .prompts import build_system_prompt

router = APIRouter(prefix="/coach", tags=["coach"])


@router.post("/message")
async def coach_message(req: schemas.CoachRequest) -> StreamingResponse:
    system_prompt = build_system_prompt(req)
    messages = [{"role": "system", "content": system_prompt}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]

    token_gen = ollama_client.stream_chat(messages)
    try:
        first_token = await anext(token_gen, None)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="coach unavailable") from exc

    async def token_stream():
        if first_token is not None:
            yield first_token
        async for token in token_gen:
            yield token

    return StreamingResponse(token_stream(), media_type="text/plain")
