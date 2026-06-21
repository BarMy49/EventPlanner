from datetime import datetime, timezone
from fastapi import HTTPException
from .schemas import UserOut, BusySlotOut, ProposalOut
from .auth import hash_password, verify_password
from .store import load_data, save_data
from .config import admin_credentials

def user_public(user: dict) -> UserOut:
    return UserOut(id=user["id"], username=user["username"], is_admin=bool(user.get("is_admin")))

def slot_public(slot: dict, users_by_id: dict[int, dict]) -> BusySlotOut:
    user = users_by_id.get(slot["user_id"])
    return BusySlotOut(
        id=slot["id"],
        user_id=slot["user_id"],
        username=user["username"] if user else "unknown",
        start_time=datetime.fromisoformat(slot["start_time"]),
        end_time=datetime.fromisoformat(slot["end_time"]),
    )

def is_admin(user: dict) -> bool:
    return bool(user.get("is_admin"))

def require_admin(user: dict) -> None:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin privileges required")

def find_user_by_id(store: dict, user_id: int) -> dict:
    user = next((item for item in store["users"] if item["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def ensure_unique_username(store: dict, username: str, except_user_id: int | None = None) -> None:
    if any(user["username"] == username and user["id"] != except_user_id for user in store["users"]):
        raise HTTPException(status_code=409, detail="Username already exists")

def admin_count(store: dict) -> int:
    return sum(1 for user in store["users"] if user.get("is_admin"))

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def resolve_target_user_id(user_id: int | None, current_user: dict, store: dict, default_user_id: int) -> int:
    target_user_id = user_id if user_id is not None else default_user_id
    if target_user_id != current_user["id"] and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can manage other users' busy slots")
    if not any(u["id"] == target_user_id for u in store["users"]):
        raise HTTPException(status_code=404, detail="Target user not found")
    return target_user_id

def proposal_results(proposal: dict) -> dict:
    participant_ids = set(proposal.get("participant_user_ids", []))
    votes = [
        vote
        for vote in proposal.get("votes", [])
        if vote.get("user_id") in participant_ids
    ]
    yes_count = sum(1 for vote in votes if vote.get("vote") == "yes")
    no_count = sum(1 for vote in votes if vote.get("vote") == "no")
    total_votes = yes_count + no_count

    return {
        "yes_count": yes_count,
        "no_count": no_count,
        "total_votes": total_votes,
        "yes_percent": round((yes_count / total_votes) * 100, 1) if total_votes else 0,
        "no_percent": round((no_count / total_votes) * 100, 1) if total_votes else 0,
    }

def proposal_participants(proposal: dict, users_by_id: dict[int, dict]) -> list[UserOut]:
    participants = []
    for user_id in proposal.get("participant_user_ids", []):
        user = users_by_id.get(user_id)
        if user:
            participants.append(user_public(user))
    return participants

def proposal_visible_to_user(proposal: dict, current_user: dict) -> bool:
    return (
        is_admin(current_user)
        or proposal["creator_user_id"] == current_user["id"]
        or current_user["id"] in proposal.get("participant_user_ids", [])
    )

def close_proposal_record(proposal: dict) -> None:
    proposal["status"] = "closed"
    proposal["closed_at"] = now_iso()

def close_proposal_if_all_voted(proposal: dict) -> None:
    if proposal.get("status") == "closed":
        return

    participant_ids = set(proposal.get("participant_user_ids", []))
    voter_ids = {
        vote.get("user_id")
        for vote in proposal.get("votes", [])
        if vote.get("user_id") in participant_ids
    }
    if participant_ids and participant_ids <= voter_ids:
        close_proposal_record(proposal)

def resolve_participant_user_ids(store: dict, participant_user_ids: list[int], current_user: dict) -> list[int]:
    participant_ids = []
    for user_id in participant_user_ids:
        if user_id not in participant_ids:
            participant_ids.append(user_id)

    if not participant_ids:
        raise HTTPException(status_code=400, detail="Choose at least one event participant")
    if current_user["id"] in participant_ids:
        raise HTTPException(status_code=400, detail="Event creator cannot be a participant")

    existing_user_ids = {user["id"] for user in store["users"]}
    missing_user_ids = [user_id for user_id in participant_ids if user_id not in existing_user_ids]
    if missing_user_ids:
        raise HTTPException(status_code=404, detail="Participant user not found")

    return participant_ids

def proposal_public(proposal: dict, users_by_id: dict[int, dict], current_user: dict) -> ProposalOut:
    creator = users_by_id.get(proposal["creator_user_id"])
    participant_ids = set(proposal.get("participant_user_ids", []))
    my_vote = next(
        (
            vote.get("vote")
            for vote in proposal.get("votes", [])
            if vote.get("user_id") == current_user["id"] and current_user["id"] in participant_ids
        ),
        None,
    )
    can_manage = proposal["creator_user_id"] == current_user["id"] or is_admin(current_user)
    status_value = proposal.get("status", "open")

    return ProposalOut(
        id=proposal["id"],
        creator_user_id=proposal["creator_user_id"],
        creator_username=creator["username"] if creator else "unknown",
        title=proposal["title"],
        start_time=datetime.fromisoformat(proposal["start_time"]),
        end_time=datetime.fromisoformat(proposal["end_time"]),
        status=status_value,
        created_at=datetime.fromisoformat(proposal["created_at"]),
        closed_at=datetime.fromisoformat(proposal["closed_at"]) if proposal.get("closed_at") else None,
        participants=proposal_participants(proposal, users_by_id),
        my_vote=my_vote,
        can_manage=can_manage,
        can_close=is_admin(current_user) and status_value == "open",
        results=proposal_results(proposal) if status_value == "closed" else None,
    )

def find_proposal(store: dict, proposal_id: int) -> dict:
    proposal = next((item for item in store["proposals"] if item["id"] == proposal_id), None)
    if not proposal:
        raise HTTPException(status_code=404, detail="Event proposal not found")
    return proposal

def require_proposal_manager(proposal: dict, current_user: dict) -> None:
    if proposal["creator_user_id"] != current_user["id"] and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only the creator or admin can manage this event")

def require_proposal_closer(current_user: dict) -> None:
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can close event proposals")

def ensure_admin_user() -> None:
    username, password = admin_credentials()
    store = load_data()
    admin = next((u for u in store["users"] if u["username"] == username), None)

    if admin:
        changed = False
        if not admin.get("is_admin"):
            admin["is_admin"] = True
            changed = True
        if not admin.get("password_hash") or not verify_password(password, admin["password_hash"]):
            admin["password_hash"] = hash_password(password)
            changed = True
        if changed:
            save_data(store)
        return

    user = {
        "id": store["next_user_id"],
        "username": username,
        "password_hash": hash_password(password),
        "is_admin": True,
    }
    store["next_user_id"] += 1
    store["users"].append(user)
    save_data(store)

