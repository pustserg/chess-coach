import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import get_current_user
from ..db import get_session
from ..models import Game, User
from ..schemas import GameCreate, GameOut, GameSummary

router = APIRouter(prefix="/games", tags=["games"])

MINUTES_TO_MS = 60_000


def _game_out(game: Game) -> GameOut:
    return GameOut(
        id=game.id,
        status=game.status,
        turn=game.turn,
        fen=game.fen,
        white_player_id=game.white_player_id,
        black_player_id=game.black_player_id,
        time_control_minutes=game.time_control_minutes,
        white_clock_ms=game.white_clock_ms,
        black_clock_ms=game.black_clock_ms,
    )


@router.post("", response_model=GameOut)
async def create_game(body: GameCreate, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    if body.side not in ("white", "black"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "side must be white or black")
    ms = body.time_control_minutes * MINUTES_TO_MS
    game = Game(
        white_player_id=user.id if body.side == "white" else None,
        black_player_id=user.id if body.side == "black" else None,
        time_control_minutes=body.time_control_minutes,
        white_clock_ms=ms,
        black_clock_ms=ms,
    )
    session.add(game)
    await session.commit()
    return _game_out(game)


@router.get("/{game_id}", response_model=GameSummary)
async def get_game(game_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    game = await session.get(Game, game_id)
    if game is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Game not found")
    return GameSummary(
        id=game.id,
        status=game.status,
        white_player_id=game.white_player_id,
        black_player_id=game.black_player_id,
        time_control_minutes=game.time_control_minutes,
    )


@router.post("/{game_id}/abort", response_model=GameOut)
async def abort_game(game_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    game = await session.get(Game, game_id)
    if game is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Game not found")
    if game.status != "waiting":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Game is not waiting")
    if game.white_player_id != user.id and game.black_player_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a player in this game")
    game.status = "aborted"
    await session.commit()
    return _game_out(game)
