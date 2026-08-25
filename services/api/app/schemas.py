import uuid

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str = "Player"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ClaimRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str | None
    display_name: str
    is_anonymous: bool


class AuthResponse(BaseModel):
    user: UserOut
    tokens: TokenPair


class GameCreate(BaseModel):
    side: str = "white"  # "white" | "black"
    time_control_minutes: int = 10


class GameOut(BaseModel):
    id: uuid.UUID
    status: str
    turn: str
    fen: str
    white_player_id: uuid.UUID | None
    black_player_id: uuid.UUID | None
    time_control_minutes: int
    white_clock_ms: int
    black_clock_ms: int


class GameSummary(BaseModel):
    id: uuid.UUID
    status: str
    white_player_id: uuid.UUID | None
    black_player_id: uuid.UUID | None
    time_control_minutes: int
