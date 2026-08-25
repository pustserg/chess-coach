import asyncio
import uuid
from datetime import datetime, timezone

import chess
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import SessionLocal
from ..models import Game, Move, User
from .chess_engine import STARTING_FEN, apply_move, board_from_uci_moves, export_pgn
from .clock import decrement, elapsed_ms

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    # SQLite round-trips datetimes without tzinfo; normalize to aware UTC so
    # elapsed_ms can subtract from an aware `now` without raising TypeError.
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _check_square(fen: str) -> str | None:
    board = chess.Board(fen)
    if board.is_check():
        king = board.king(board.turn)
        return chess.square_name(king) if king is not None else None
    return None


def _result_payload(game: Game) -> dict | None:
    if game.status in ("white-won", "black-won", "draw"):
        result = "draw" if game.status == "draw" else ("white" if game.status == "white-won" else "black")
        return {"result": result, "reason": game.result_reason or "unknown"}
    return None


class GameSession:
    def __init__(self, game_id: uuid.UUID):
        self.game_id = game_id
        self.connections: dict[str, WebSocket] = {}
        self.board: chess.Board | None = None
        self.draw_offer: str | None = None
        self.clock_task: asyncio.Task | None = None

    async def add(self, color: str, ws: WebSocket) -> None:
        self.connections[color] = ws

    def remove(self, color: str) -> None:
        self.connections.pop(color, None)

    async def send(self, color: str, message: dict) -> None:
        ws = self.connections.get(color)
        if ws is not None:
            await ws.send_json(message)

    async def broadcast(self, message: dict) -> None:
        for ws in list(self.connections.values()):
            await ws.send_json(message)


class GameRegistry:
    def __init__(self) -> None:
        self.sessions: dict[uuid.UUID, GameSession] = {}

    def get(self, game_id: uuid.UUID) -> GameSession:
        if game_id not in self.sessions:
            self.sessions[game_id] = GameSession(game_id)
        return self.sessions[game_id]

    def drop(self, game_id: uuid.UUID) -> None:
        self.sessions.pop(game_id, None)


registry = GameRegistry()


def _move_list(moves: list[Move]) -> list[str]:
    return [m.uci for m in moves]


async def _load_moves(session_db: AsyncSession, game_id: uuid.UUID) -> list[Move]:
    rows = await session_db.scalars(
        select(Move).where(Move.game_id == game_id).order_by(Move.ply)
    )
    return list(rows)


def _san_history(moves: list[Move]) -> list[str]:
    return [m.san for m in moves]


def _last_move(moves: list[Move]) -> dict | None:
    if not moves:
        return None
    last = moves[-1]
    return {"from": last.uci[:2], "to": last.uci[2:4]}


def _captured(board: chess.Board) -> dict:
    captured: dict[str, list[str]] = {"w": [], "b": []}
    replay = chess.Board()
    for move in board.move_stack:
        mover = "w" if replay.turn == chess.WHITE else "b"
        if replay.is_capture(move):
            piece = replay.piece_at(move.to_square)
            captured[mover].append("p" if piece is None else piece.symbol().lower())
        replay.push(move)
    return captured


async def _state_message(
    game: Game, you_are: str, moves: list[Move], connected: dict[str, bool],
    board: chess.Board,
) -> dict:
    now = _utcnow()
    elapsed = elapsed_ms(_as_utc(game.last_turn_started_at), now)
    mover = game.turn
    w_ms = decrement(game.white_clock_ms, elapsed) if mover == "w" else game.white_clock_ms
    b_ms = decrement(game.black_clock_ms, elapsed) if mover == "b" else game.black_clock_ms

    def _player(pid, color):
        return {"id": str(pid) if pid else None, "display_name": None, "connected": connected.get(color, False)}

    return {
        "type": "state",
        "status": game.status,
        "turn": game.turn,
        "fen": game.fen,
        "san_history": _san_history(moves),
        "last_move": _last_move(moves),
        "check": board.is_check() if board else False,
        "check_square": _check_square(game.fen),
        "clocks": {"w_ms": w_ms, "b_ms": b_ms},
        "white": _player(game.white_player_id, "w"),
        "black": _player(game.black_player_id, "b"),
        "you_are": you_are,
        "captured": _captured(board) if board else {"w": [], "b": []},
        "result": _result_payload(game),
        "draw_offered_by": None,
    }


async def _attach_players(game: Game, moves: list[Move], connected: dict[str, bool], session_db: AsyncSession) -> None:
    for color, pid in (("w", game.white_player_id), ("b", game.black_player_id)):
        if pid is not None:
            u = await session_db.get(User, pid)
            if u is not None:
                connected.setdefault(color, False)


async def _persist_move(game: Game, board: chess.Board, mover: str, elapsed: int, result, session_db: AsyncSession) -> None:
    if mover == "w":
        game.white_clock_ms = decrement(game.white_clock_ms, elapsed)
    else:
        game.black_clock_ms = decrement(game.black_clock_ms, elapsed)
    game.last_turn_started_at = _utcnow()
    game.fen = board.fen()
    game.turn = "b" if mover == "w" else "w"

    ply = len(board.move_stack)
    last = board.move_stack[-1]
    session_db.add(Move(
        game_id=game.id, ply=ply, color=mover,
        san=result.san, uci=last.uci(), fen_after=board.fen(),
    ))

    if result is not None and result.result_reason:
        game.result_reason = result.result_reason
        if result.winner == "w":
            game.status = "white-won"
        elif result.winner == "b":
            game.status = "black-won"
        else:
            game.status = "draw"
        game.ended_at = _utcnow()
    await session_db.commit()


async def _broadcast_full_state(game: Game, session: GameSession, session_db: AsyncSession) -> None:
    moves = await _load_moves(session_db, game.id)
    connected = {c: True for c in session.connections}

    for color in list(session.connections):
        payload = await _state_message(game, color, moves, connected, session.board)
        # fill display names
        for seat, pid in (("w", game.white_player_id), ("b", game.black_player_id)):
            if pid is not None:
                u = await session_db.get(User, pid)
                payload[seat] = {
                    "id": str(pid), "display_name": u.display_name if u else None,
                    "connected": connected.get(seat, False),
                }
        await session.send(color, payload)


async def _handle_message(game_id: uuid.UUID, you_are: str, user: User, data: dict, websocket: WebSocket) -> None:
    session = registry.get(game_id)
    async with SessionLocal() as session_db:
        game = await session_db.get(Game, game_id)
        if game is None:
            return
        mtype = data.get("type")

        if mtype == "move":
            if game.status != "playing":
                await websocket.send_json({"type": "move-rejected", "reason": "not-playing"})
                return
            if you_are != game.turn:
                await websocket.send_json({"type": "move-rejected", "reason": "not-your-turn"})
                return
            uci = f"{data.get('from','')}{data.get('to','')}{data.get('promotion','')}"
            elapsed = elapsed_ms(_as_utc(game.last_turn_started_at), _utcnow())
            if decrement(game.white_clock_ms if you_are == "w" else game.black_clock_ms, elapsed) <= 0:
                game.result_reason = "timeout"
                game.status = "white-won" if you_are == "b" else "black-won"
                game.ended_at = _utcnow()
                await session_db.commit()
                await _broadcast_full_state(game, session, session_db)
                return

            result = apply_move(session.board, uci)
            if not result.ok:
                await websocket.send_json({"type": "move-rejected", "reason": result.reason or "illegal"})
                return

            await _persist_move(game, session.board, you_are, elapsed, result, session_db)
            session.draw_offer = None  # a move implicitly declines a pending draw offer
            await websocket.send_json({"type": "move-accepted", "san": result.san, "uci": result.uci})
            await _broadcast_full_state(game, session, session_db)
            return

        if mtype == "ping":
            await websocket.send_json({"type": "pong"})
            return


@router.websocket("/games/{game_id}/ws")
async def game_ws(websocket: WebSocket, game_id: uuid.UUID):
    await websocket.accept()

    async with SessionLocal() as session_db:
        from ..auth.deps import user_from_token
        token = websocket.query_params.get("token", "")
        user = await user_from_token(token, session_db)
        if user is None:
            await websocket.send_json({"type": "error", "reason": "unauthorized"})
            await websocket.close()
            return

        game = await session_db.get(Game, game_id)
        if game is None:
            await websocket.send_json({"type": "error", "reason": "not-found"})
            await websocket.close()
            return

        # Seat assignment
        if game.white_player_id == user.id:
            you_are = "w"
        elif game.black_player_id == user.id:
            you_are = "b"
        elif game.status == "waiting" and game.white_player_id is None:
            game.white_player_id = user.id
            you_are = "w"
            await session_db.commit()
        elif game.status == "waiting" and game.black_player_id is None:
            game.black_player_id = user.id
            you_are = "b"
            await session_db.commit()
        else:
            await websocket.send_json({"type": "error", "reason": "game-full"})
            await websocket.close()
            return

        # Once both seats are filled, the game starts.
        if game.status == "waiting" and game.white_player_id is not None and game.black_player_id is not None:
            game.status = "playing"
            game.started_at = _utcnow()
            await session_db.commit()

        moves = await _load_moves(session_db, game.id)
        session = registry.get(game.id)
        if session.board is None:
            session.board = board_from_uci_moves(_move_list(moves))
        await session.add(you_are, websocket)

        await _broadcast_full_state(game, session, session_db)

    try:
        while True:
            data = await websocket.receive_json()
            await _handle_message(game_id, you_are, user, data, websocket)
    except WebSocketDisconnect:
        session = registry.get(game_id)
        session.remove(you_are)
        async with SessionLocal() as session_db:
            game = await session_db.get(Game, game_id)
            if game is not None:
                await _broadcast_full_state(game, session, session_db)
