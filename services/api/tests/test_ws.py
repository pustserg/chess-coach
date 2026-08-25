import uuid


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


def test_invalid_token_rejected(client):
    game = _mk_game(client, {"Authorization": f"Bearer {_token(_anon(client))}"})
    with client.websocket_connect(f"/games/{game['id']}/ws?token=bad-token") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["reason"] == "unauthorized"
