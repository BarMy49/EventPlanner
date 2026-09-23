from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from cryptography.fernet import Fernet

from app import main
from app.google_calendar import GoogleCalendarService

from .conftest import auth, register


class FakeRequest:
    def __init__(self, callback):
        self.callback = callback

    def execute(self):
        return self.callback()


class FakeEvents:
    def __init__(self):
        self.inserted = []
        self.patched = []
        self.deleted = []

    def insert(self, **kwargs):
        self.inserted.append(kwargs)
        return FakeRequest(lambda: {"id": f"google-{len(self.inserted)}"})

    def patch(self, **kwargs):
        self.patched.append(kwargs)
        return FakeRequest(lambda: {"id": kwargs["eventId"]})

    def delete(self, **kwargs):
        self.deleted.append(kwargs)
        return FakeRequest(lambda: {})


class FakeCalendarApi:
    def __init__(self):
        self.events_api = FakeEvents()

    def events(self):
        return self.events_api


class FakeOAuthCalendar:
    def __init__(self):
        self.sync_calls = []

    def config(self):
        return SimpleNamespace(app_public_url="http://frontend.test")

    def is_available(self):
        return True

    def create_oauth_state(self):
        return {"value": "test-state", "expires_at": "4102444800"}

    def oauth_state_is_valid(self, record, state):
        return bool(record and record.get("value") == state)

    def authorization_url(self, state):
        return f"https://accounts.google.test/authorize?state={state}"

    def exchange_code(self, code):
        assert code == "google-code"
        return "refresh-token"

    def encrypt_refresh_token(self, refresh_token):
        return f"encrypted:{refresh_token}"

    def sync_user(self, user, proposals):
        self.sync_calls.append((user["id"], [proposal["id"] for proposal in proposals]))
        user["google_calendar"]["last_sync_at"] = "2027-01-01T00:00:00+00:00"
        user["google_calendar"]["last_error"] = None

    def sync_connected_users_for_proposal(self, store, proposal):
        return None

    def delete_proposal_events(self, store, proposal):
        return None

    def disconnect_user(self, user, proposals):
        user.pop("google_calendar", None)

    def status(self, user):
        calendar = user.get("google_calendar", {})
        return {
            "available": True,
            "connected": bool(calendar.get("refresh_token")),
            "last_sync_at": calendar.get("last_sync_at"),
            "last_error": calendar.get("last_error"),
        }


def future_proposal(votes=None, status="open"):
    start = datetime.now(timezone.utc) + timedelta(days=30)
    end = start + timedelta(days=2)
    return {
        "id": 44,
        "creator_user_id": 1,
        "title": "Weekend",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "participant_user_ids": [2, 3, 4],
        "status": status,
        "votes": votes or [],
    }


def configure_calendar(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GOOGLE_OAUTH_REDIRECT_URI", "https://app.test/api/integrations/google-calendar/callback")
    monkeypatch.setenv("GOOGLE_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("APP_PUBLIC_URL", "https://app.test")
    monkeypatch.setenv("EVENT_TIME_ZONE", "Europe/Warsaw")


def test_calendar_lifecycle_reuses_event_id_and_deletes_rejected_event(monkeypatch):
    configure_calendar(monkeypatch)
    service = GoogleCalendarService()
    api = FakeCalendarApi()
    monkeypatch.setattr(service, "_calendar_api", lambda user: api)
    user = {"id": 1, "google_calendar": {"refresh_token": "encrypted", "event_links": {}}}
    store = {"users": [user]}
    proposal = future_proposal()

    service.sync_connected_users_for_proposal(store, proposal)
    assert user["google_calendar"]["last_error"] is None
    assert api.events_api.inserted[0]["body"]["summary"] == "Głosowanie: Weekend"
    assert user["google_calendar"]["event_links"]["44"]["event_id"] == "google-1"

    proposal["status"] = "closed"
    proposal["votes"] = [
        {"user_id": 2, "vote": "yes"},
        {"user_id": 3, "vote": "yes"},
        {"user_id": 4, "vote": "no"},
    ]
    service.sync_connected_users_for_proposal(store, proposal)
    assert api.events_api.patched[0]["eventId"] == "google-1"
    assert api.events_api.patched[0]["body"]["summary"] == "Potwierdzone: Weekend"

    proposal["votes"] = [
        {"user_id": 2, "vote": "yes"},
        {"user_id": 3, "vote": "no"},
        {"user_id": 4, "vote": "no"},
    ]
    service.sync_connected_users_for_proposal(store, proposal)
    assert api.events_api.deleted[0]["eventId"] == "google-1"
    assert "44" not in user["google_calendar"]["event_links"]


def test_disconnect_removes_future_google_events(monkeypatch):
    configure_calendar(monkeypatch)
    service = GoogleCalendarService()
    api = FakeCalendarApi()
    monkeypatch.setattr(service, "_calendar_api", lambda user: api)
    proposal = future_proposal()
    user = {
        "id": 1,
        "google_calendar": {
            "refresh_token": "encrypted",
            "event_links": {"44": {"event_id": "google-44", "state": "pending"}},
        },
    }

    service.disconnect_user(user, [proposal])

    assert api.events_api.deleted[0]["eventId"] == "google-44"
    assert "google_calendar" not in user


def test_google_oauth_callback_links_the_authenticated_app_user(client, monkeypatch):
    fake_calendar = FakeOAuthCalendar()
    monkeypatch.setattr(main, "google_calendar", fake_calendar)
    user = register(client, "anna")
    headers = auth(client, "anna", "password1")

    connect = client.post("/integrations/google-calendar/connect", headers=headers)
    assert connect.status_code == 200
    assert connect.json()["authorization_url"].endswith("state=test-state")

    callback = client.get(
        "/integrations/google-calendar/callback?code=google-code&state=test-state",
        follow_redirects=False,
    )
    assert callback.status_code == 303
    assert callback.headers["location"] == "http://frontend.test/?googleCalendar=connected"

    status = client.get("/integrations/google-calendar/status", headers=headers)
    assert status.json()["connected"] is True
    assert fake_calendar.sync_calls == [(user["id"], [])]


def test_calendar_is_reported_unavailable_without_configuration(client, admin_headers):
    status = client.get("/integrations/google-calendar/status", headers=admin_headers)
    assert status.status_code == 200
    assert status.json()["available"] is False
