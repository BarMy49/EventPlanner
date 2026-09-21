from .conftest import auth, register


def test_register_login_and_reject_duplicate_user(client):
    created = register(client, "anna")
    assert created["username"] == "anna"
    assert client.post("/auth/register", json={"username": "anna", "password": "password1"}).status_code == 409
    assert client.get("/users/me", headers=auth(client, "anna", "password1")).json()["username"] == "anna"


def test_user_visibility_and_admin_protection(client, admin_headers):
    user = register(client, "anna")
    user_headers = auth(client, "anna", "password1")
    assert [item["username"] for item in client.get("/users", headers=user_headers).json()] == ["anna"]
    assert client.delete(f"/users/{user['id']}", headers=user_headers).status_code == 403
    assert client.delete("/users/1", headers=admin_headers).status_code == 400


def test_busy_slots_enforce_ownership_and_merge_ranges(client, admin_headers):
    anna = register(client, "anna")
    bob = register(client, "bob")
    anna_headers = auth(client, "anna", "password1")
    payload = {"start_time": "2026-01-10T00:00:00+00:00", "end_time": "2026-01-12T00:00:00+00:00"}
    first = client.post("/busy", json=payload, headers=anna_headers)
    assert first.status_code == 200
    assert client.put(f"/busy/{first.json()['id']}", json={**payload, "user_id": bob["id"]}, headers=anna_headers).status_code == 403
    client.post("/busy", json={**payload, "user_id": bob["id"]}, headers=admin_headers)
    common = client.get("/busy/common", headers=anna_headers).json()
    assert common[0]["users"] == ["anna", "bob"]


def test_proposals_close_when_every_participant_votes(client, admin_headers):
    anna = register(client, "anna")
    bob = register(client, "bob")
    proposal = client.post("/proposals", json={
        "title": "Weekend", "start_time": "2026-02-10T00:00:00+00:00", "end_time": "2026-02-12T00:00:00+00:00",
        "participant_user_ids": [anna["id"], bob["id"]],
    }, headers=admin_headers).json()
    assert client.post(f"/proposals/{proposal['id']}/vote", json={"vote": "yes"}, headers=auth(client, "anna", "password1")).json()["status"] == "open"
    closed = client.post(f"/proposals/{proposal['id']}/vote", json={"vote": "no"}, headers=auth(client, "bob", "password1")).json()
    assert closed["status"] == "closed"
    assert closed["results"] == {"yes_count": 1, "no_count": 1, "total_votes": 2, "yes_percent": 50.0, "no_percent": 50.0}


def test_proposal_permissions_and_admin_close(client, admin_headers):
    anna = register(client, "anna")
    proposal = client.post("/proposals", json={
        "title": "Trip", "start_time": "2026-03-10T00:00:00+00:00", "end_time": "2026-03-12T00:00:00+00:00",
        "participant_user_ids": [anna["id"]],
    }, headers=admin_headers).json()
    assert client.post(f"/proposals/{proposal['id']}/close", headers=auth(client, "anna", "password1")).status_code == 403
    assert client.post(f"/proposals/{proposal['id']}/close", headers=admin_headers).json()["status"] == "closed"
