import chess
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.models import Base, Game, User


@pytest.fixture
async def session(tmp_path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path}/models.db", poolclass=NullPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_game_defaults(session):
    g = Game(time_control_minutes=10, white_clock_ms=600_000, black_clock_ms=600_000)
    session.add(g)
    await session.flush()
    assert g.id is not None
    assert g.fen == chess.STARTING_FEN
    assert g.status == "waiting"
    assert g.turn == "w"
    assert g.white_player_id is None
    assert g.black_player_id is None


async def test_user_anonymous_default(session):
    u = User(display_name="guest")
    session.add(u)
    await session.flush()
    assert u.is_anonymous is True
    assert u.email is None
    assert u.password_hash is None
