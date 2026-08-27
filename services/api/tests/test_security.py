import uuid

import pytest
from fastapi import HTTPException

from app.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_roundtrip():
    h = hash_password("s3cret!")
    assert h != "s3cret!"
    assert verify_password("s3cret!", h) is True
    assert verify_password("wrong", h) is False


def test_access_token_roundtrip():
    uid = uuid.uuid4()
    tok = create_access_token(uid)
    assert decode_token(tok, "access") == uid


def test_refresh_token_type_enforced():
    uid = uuid.uuid4()
    tok = create_refresh_token(uid)
    with pytest.raises(Exception):
        decode_token(tok, "access")
    assert decode_token(tok, "refresh") == uid


def test_tampered_token_rejected():
    uid = uuid.uuid4()
    tok = create_access_token(uid)
    with pytest.raises(Exception):
        decode_token(tok + "x", "access")
