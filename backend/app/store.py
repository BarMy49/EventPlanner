import json
import os
from pathlib import Path
from threading import Lock
from typing import Any

DATA_FILE = Path(os.getenv("DATA_FILE", Path(__file__).resolve().parent.parent / "data.json"))
_LOCK = Lock()

DEFAULT_DATA = {
    "next_user_id": 1,
    "next_slot_id": 1,
    "next_proposal_id": 1,
    "users": [],
    "busy_slots": [],
    "proposals": [],
}


def normalize_data(data: dict[str, Any]) -> dict[str, Any]:
    data.setdefault("next_user_id", 1)
    data.setdefault("next_slot_id", 1)
    data.setdefault("next_proposal_id", 1)
    data.setdefault("users", [])
    data.setdefault("busy_slots", [])
    data.setdefault("proposals", [])

    for user in data["users"]:
        user.setdefault("is_admin", user.get("username") == "admin")

    for proposal in data["proposals"]:
        proposal.setdefault("status", "open")
        proposal.setdefault("votes", [])
        participant_user_ids = []
        for user_id in proposal.get("participant_user_ids", []):
            try:
                normalized_user_id = int(user_id)
            except (TypeError, ValueError):
                continue
            if normalized_user_id not in participant_user_ids:
                participant_user_ids.append(normalized_user_id)
        proposal["participant_user_ids"] = participant_user_ids
        proposal.setdefault("created_at", "1970-01-01T00:00:00")
        proposal.setdefault("closed_at", None)

    return data


def load_data() -> dict[str, Any]:
    with _LOCK:
        if not DATA_FILE.exists():
            save_data(DEFAULT_DATA.copy())
        with DATA_FILE.open("r", encoding="utf-8") as f:
            data = normalize_data(json.load(f))
        return data


def save_data(data: dict[str, Any]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def find_user_by_username(username: str) -> dict[str, Any] | None:
    data = load_data()
    return next((u for u in data["users"] if u["username"] == username), None)
