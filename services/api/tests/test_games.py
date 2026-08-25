import uuid


def _anon(client):
    return client.post("/auth/anonymous").json()


def _auth(client, body):
    return {"Authorization": f"Bearer {body['tokens']['access_token']}"}


def test_create_game_assigns_white_seat(client):
    body = _anon(client)
    r = client.post("/games", json={"side": "white", "time_control_minutes": 5}, headers=_auth(client, body))
    assert r.status_code == 200, r.text
    game = r.json()
    assert game["id"]
    assert game["status"] == "waiting"
    assert game["white_player_id"] == body["user"]["id"]
    assert game["black_player_id"] is None
    assert game["fen"].startswith("rnbqkbnr")
    assert game["white_clock_ms"] == 300_000
    assert game["black_clock_ms"] == 300_000


def test_create_game_black_side(client):
    body = _anon(client)
    r = client.post("/games", json={"side": "black", "time_control_minutes": 10}, headers=_auth(client, body))
    assert r.json()["black_player_id"] == body["user"]["id"]


def test_create_requires_auth(client):
    r = client.post("/games", json={"side": "white"})
    assert r.status_code == 401


def test_get_game_summary(client):
    body = _anon(client)
    game = client.post("/games", json={"side": "white"}, headers=_auth(client, body)).json()
    r = client.get(f"/games/{game['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == game["id"]


def test_abort_waiting_game(client):
    body = _anon(client)
    game = client.post("/games", json={"side": "white"}, headers=_auth(client, body)).json()
    r = client.post(f"/games/{game['id']}/abort", headers=_auth(client, body))
    assert r.status_code == 200
    assert client.get(f"/games/{game['id']}").json()["status"] == "aborted"


def test_abort_forbidden_for_non_creator(client):
    body = _anon(client)
    game = client.post("/games", json={"side": "white"}, headers=_auth(client, body)).json()
    other = _anon(client)
    r = client.post(f"/games/{game['id']}/abort", headers=_auth(client, other))
    assert r.status_code == 403
