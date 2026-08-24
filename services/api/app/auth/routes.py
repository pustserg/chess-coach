import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import User
from ..schemas import (
    AuthResponse,
    ClaimRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserOut,
)
from .deps import get_current_user
from .security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


def _to_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, display_name=user.display_name, is_anonymous=user.is_anonymous)


def _tokens(user: User) -> TokenPair:
    return TokenPair(access_token=create_access_token(user.id), refresh_token=create_refresh_token(user.id))


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(user=_to_out(user), tokens=_tokens(user))


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest, session: AsyncSession = Depends(get_session)):
    existing = await session.scalar(select(User).where(User.email == body.email.lower()))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        is_anonymous=False,
    )
    session.add(user)
    await session.commit()
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or user.password_hash is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return _auth_response(user)


@router.post("/anonymous", response_model=AuthResponse)
async def anonymous(session: AsyncSession = Depends(get_session)):
    user = User(display_name="Guest", is_anonymous=True)
    session.add(user)
    await session.commit()
    return _auth_response(user)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    try:
        user_id = decode_token(body.refresh_token, "refresh")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return _auth_response(user)


@router.post("/logout")
async def logout():
    # Stateless v1: the client discards tokens. No server-side revocation.
    return {"status": "ok"}


@router.post("/claim", response_model=AuthResponse)
async def claim(body: ClaimRequest, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    if not user.is_anonymous:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Account already has credentials")
    existing = await session.scalar(select(User).where(User.email == body.email.lower()))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user.email = body.email.lower()
    user.password_hash = hash_password(body.password)
    user.is_anonymous = False
    await session.commit()
    return _auth_response(user)


@me_router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return _to_out(user)
