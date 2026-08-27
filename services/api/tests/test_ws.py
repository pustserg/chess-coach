import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.models import Game


def _anon(client):
    return client.post("/auth/anonymous").json()


def _mk_game(client, headers, side="white", minutes=5):
    return client.post("/games", json={"side": side, "time_control_minutes": minutes}, headers=headers).json()


def _token(body):
    return body["tokens"]["access_token"]


def test_two_players_move_sync(client):
    w = _anon(client)
    b = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"})

    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        state_w = ws_w.receive_json()
        assert state_w["type"] == "state"
        assert state_w["you_are"] == "w"
        assert state_w["status"] == "waiting"

        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            state_b = ws_b.receive_json()
            assert state_b["you_are"] == "b"
            assert state_b["status"] == "playing"
            ws_w.receive_json()  # drain the "game started" broadcast to the already-connected player

            ws_w.send_json({"type": "move", "from": "e2", "to": "e4"})
            accepted = ws_w.receive_json()
            assert accepted["type"] == "move-accepted"
            assert accepted["san"] == "e4"

            # The opponent receives an authoritative state with the move applied.
            upd = ws_b.receive_json()
            assert upd["type"] == "state"
            assert upd["san_history"] == ["e4"]
            assert upd["turn"] == "b"


def test_illegal_move_rejected(client):
    w = _anon(client)
    b = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        ws_w.receive_json()
        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            ws_b.receive_json()
            ws_w.receive_json()  # drain the "game started" broadcast to the already-connected player
            ws_w.send_json({"type": "move", "from": "e2", "to": "e5"})
            msg = ws_w.receive_json()
            assert msg["type"] == "move-rejected"
            assert msg["reason"] == "illegal"


def test_out_of_turn_rejected(client):
    w = _anon(client)
    b = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        ws_w.receive_json()
        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            ws_b.receive_json()
            ws_b.send_json({"type": "move", "from": "b8", "to": "c6"})  # black moving on white's turn
            msg = ws_b.receive_json()
            assert msg["type"] == "move-rejected"


def test_third_connection_rejected(client):
    w = _anon(client)
    b = _anon(client)
    c = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        ws_w.receive_json()
        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            ws_b.receive_json()
            with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(c)}") as ws_c:
                msg = ws_c.receive_json()
                assert msg["type"] == "error"
                assert msg["reason"] == "game-full"


def test_waiting_time_not_decremented(client, db, engine):
    w = _anon(client)
    b = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"}, minutes=5)
    full = 5 * 60 * 1000  # 300000 ms

    # Simulate white waiting 60s for an opponent by backdating the clock start.
    async def backdate():
        async with engine.begin() as conn:
            await conn.execute(
                update(Game)
                .where(Game.id == uuid.UUID(game["id"]))
                .values(last_turn_started_at=datetime.now(timezone.utc) - timedelta(seconds=60))
            )

    asyncio.run(backdate())

    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        ws_w.receive_json()  # waiting state for white
        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            state_b = ws_b.receive_json()
            assert state_b["status"] == "playing"
            # The clock starts at game start, not creation: the simulated 60s
            # wait must not be deducted from either player's clock.
            assert state_b["clocks"]["w_ms"] >= full - 1000
            assert state_b["clocks"]["b_ms"] == full
            started = ws_w.receive_json()  # game-started broadcast to white
            assert started["clocks"]["w_ms"] >= full - 1000
            assert started["clocks"]["b_ms"] == full


def test_invalid_token_rejected(client):
    game = _mk_game(client, {"Authorization": f"Bearer {_token(_anon(client))}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token=bad-token") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["reason"] == "unauthorized"

def test_draw_offer_and_accept(client):
    w = _anon(client)
    b = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        ws_w.receive_json()
        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            ws_b.receive_json()
            ws_w.send_json({"type": "offer-draw"})
            offered = ws_b.receive_json()
            assert offered["type"] == "draw-offered"
            assert offered["by"] == "w"

            ws_b.send_json({"type": "accept-draw"})
            over = ws_b.receive_json()
            assert over["type"] == "game-over"
            assert over["result"] == "draw"
            assert over["reason"] == "agreed-draw"


def test_resign(client):
    w = _anon(client)
    b = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        ws_w.receive_json()
        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            ws_b.receive_json()
            ws_w.receive_json()  # drain the "game started" broadcast to the already-connected player
            ws_w.send_json({"type": "resign"})
            over = ws_w.receive_json()
            assert over["type"] == "game-over"
            assert over["result"] == "black"
            assert over["reason"] == "resignation"


def test_reconnect_reattaches_seat(client):
    w = _anon(client)
    b = _anon(client)
    game = _mk_game(client, {"Authorization": f"Bearer {_token(w)}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w:
        ws_w.receive_json()
        with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(b)}") as ws_b:
            ws_b.receive_json()
            ws_w.receive_json()  # drain the "game started" broadcast to the already-connected player
            ws_w.send_json({"type": "move", "from": "e2", "to": "e4"})
            ws_w.receive_json()  # move-accepted
            ws_b.receive_json()  # state
    # ws_w disconnected (left the with block)

    with client.websocket_connect(f"/games/{game['id']}/ws?token={_token(w)}") as ws_w2:
        state = ws_w2.receive_json()
        assert state["type"] == "state"
        assert state["you_are"] == "w"
        assert state["san_history"] == ["e4"]
