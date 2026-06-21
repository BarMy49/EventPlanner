import os

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_CORS_ORIGINS = ["http://localhost", "http://127.0.0.1"]

def admin_credentials() -> tuple[str, str]:
    username = os.getenv("ADMIN_USERNAME", DEFAULT_ADMIN_USERNAME).strip() or DEFAULT_ADMIN_USERNAME
    password = os.getenv("ADMIN_PASSWORD") or DEFAULT_ADMIN_PASSWORD
    return username, password

def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS")
    if not raw:
        return DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

