import os
from dataclasses import dataclass

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_CORS_ORIGINS = ["http://localhost", "http://127.0.0.1"]
DEFAULT_APP_PUBLIC_URL = "http://localhost"
DEFAULT_EVENT_TIME_ZONE = "Europe/Warsaw"


@dataclass(frozen=True)
class GoogleCalendarConfig:
    client_id: str
    client_secret: str
    redirect_uri: str
    token_encryption_key: str
    app_public_url: str
    event_time_zone: str

def admin_credentials() -> tuple[str, str]:
    username = os.getenv("ADMIN_USERNAME", DEFAULT_ADMIN_USERNAME).strip() or DEFAULT_ADMIN_USERNAME
    password = os.getenv("ADMIN_PASSWORD") or DEFAULT_ADMIN_PASSWORD
    return username, password

def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS")
    if not raw:
        return DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def google_calendar_config() -> GoogleCalendarConfig | None:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
    token_encryption_key = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY", "").strip()

    if not any((client_id, client_secret, redirect_uri, token_encryption_key)):
        return None

    missing = [
        name
        for name, value in (
            ("GOOGLE_OAUTH_CLIENT_ID", client_id),
            ("GOOGLE_OAUTH_CLIENT_SECRET", client_secret),
            ("GOOGLE_OAUTH_REDIRECT_URI", redirect_uri),
            ("GOOGLE_TOKEN_ENCRYPTION_KEY", token_encryption_key),
        )
        if not value
    ]
    if missing:
        raise ValueError(f"Missing Google Calendar configuration: {', '.join(missing)}")

    return GoogleCalendarConfig(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        token_encryption_key=token_encryption_key,
        app_public_url=(os.getenv("APP_PUBLIC_URL", DEFAULT_APP_PUBLIC_URL).strip() or DEFAULT_APP_PUBLIC_URL).rstrip("/"),
        event_time_zone=(os.getenv("EVENT_TIME_ZONE", DEFAULT_EVENT_TIME_ZONE).strip() or DEFAULT_EVENT_TIME_ZONE),
    )

