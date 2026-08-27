import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from ..config import settings

_ph = PasswordHasher()
ALG = "HS256"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _create_token(user_id: uuid.UUID, token_type: str, expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALG)


def create_access_token(user_id: uuid.UUID) -> str:
    return _create_token(user_id, "access", timedelta(minutes=settings.access_token_minutes))


def create_refresh_token(user_id: uuid.UUID) -> str:
    return _create_token(user_id, "refresh", timedelta(days=settings.refresh_token_days))


def decode_token(token: str, expected_type: str) -> uuid.UUID:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALG])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return uuid.UUID(payload["sub"])
