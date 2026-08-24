def _register(client, email="a@b.co", password="pw123456", name="Ann"):
    return client.post("/auth/register", json={"email": email, "password": password, "display_name": name})


def test_register_and_me(client):
    r = _register(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == "a@b.co"
    assert body["user"]["is_anonymous"] is False
    assert "access_token" in body["tokens"]

    me = client.get("/me", headers={"Authorization": f"Bearer {body['tokens']['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@b.co"


def test_login_success_and_failure(client):
    _register(client)
    ok = client.post("/auth/login", json={"email": "a@b.co", "password": "pw123456"})
    assert ok.status_code == 200
    bad = client.post("/auth/login", json={"email": "a@b.co", "password": "nope"})
    assert bad.status_code == 401


def test_duplicate_email_rejected(client):
    _register(client)
    dup = _register(client)
    assert dup.status_code == 409


def test_anonymous_then_claim(client):
    anon = client.post("/auth/anonymous")
    assert anon.status_code == 200
    body = anon.json()
    assert body["user"]["is_anonymous"] is True
    assert body["user"]["email"] is None

    tok = body["tokens"]["access_token"]
    claim = client.post("/auth/claim", json={"email": "c@d.co", "password": "pw123456"},
                        headers={"Authorization": f"Bearer {tok}"})
    assert claim.status_code == 200
    assert claim.json()["user"]["email"] == "c@d.co"
    assert claim.json()["user"]["is_anonymous"] is False


def test_refresh(client):
    body = _register(client).json()
    r = client.post("/auth/refresh", json={"refresh_token": body["tokens"]["refresh_token"]})
    assert r.status_code == 200
    assert "access_token" in r.json()["tokens"]
