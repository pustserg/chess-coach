from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import engine
from .models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.create_tables_on_startup:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="chess-trainer-api", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .auth.routes import router as auth_router, me_router

app.include_router(auth_router)
app.include_router(me_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
