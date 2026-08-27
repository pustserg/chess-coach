def _anon(client):
    return client.post("/auth/anonymous").json()


def _auth(body):
    return {"Authorization": f"Bearer {body['tokens']['access_token']}"}


def test_stats_counts(client):
    w = _anon(client)
    b = _anon(client)
    # Create a game, fill both seats, and force a terminal state directly via DB.
    game = client.post("/games", json={"side": "white"}, headers=_auth(w)).json()

    # Simulate a finished game by updating the row (integration shortcut).
    from app.db import engine
    from sqlalchemy import text
    import asyncio

    async def finish():
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE games SET status='white-won', black_player_id=:b WHERE id=:g"),
                {"b": b["user"]["id"].replace("-", ""), "g": game["id"].replace("-", "")},
            )

    asyncio.run(finish())

    r = client.get("/me/stats", headers=_auth(w))
    assert r.status_code == 200
    assert r.json()["games_played"] == 1
    assert r.json()["wins"] == 1
    assert r.json()["losses"] == 0
    assert r.json()["draws"] == 0
