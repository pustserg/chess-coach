from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth.deps import get_current_user
from .db import get_session
from .models import Game, User

router = APIRouter(tags=["profile"])


@router.get("/me/stats")
async def me_stats(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    games = (await session.scalars(
        select(Game).where(
            (Game.white_player_id == user.id) | (Game.black_player_id == user.id)
        )
    )).all()

    played = wins = losses = draws = 0
    for g in games:
        if g.status not in ("white-won", "black-won", "draw"):
            continue
        played += 1
        if g.status == "draw":
            draws += 1
        elif g.status == "white-won":
            wins += 1 if g.white_player_id == user.id else 0
            losses += 1 if g.black_player_id == user.id else 0
        elif g.status == "black-won":
            wins += 1 if g.black_player_id == user.id else 0
            losses += 1 if g.white_player_id == user.id else 0

    return {"games_played": played, "wins": wins, "losses": losses, "draws": draws}
