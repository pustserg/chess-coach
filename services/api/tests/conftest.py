import os
import tempfile

# Set env BEFORE importing app so settings pick these up.
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["CREATE_TABLES_ON_STARTUP"] = "1"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.main import app
from app.models import Base


@pytest.fixture(scope="session")
def engine():
    from app.config import settings
    e = create_async_engine(settings.database_url, poolclass=NullPool)
    return e


@pytest.fixture
def client():
    # TestClient's `with` triggers lifespan -> create_all on the same loop.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db(engine):
    import asyncio

    async def reset():
        async with engine.begin() as conn:
            # Truncate all tables between tests (SQLite-safe order).
            await conn.execute(text("DELETE FROM moves"))
            await conn.execute(text("DELETE FROM games"))
            await conn.execute(text("DELETE FROM users"))

    asyncio.run(reset())
    yield
    asyncio.run(reset())
