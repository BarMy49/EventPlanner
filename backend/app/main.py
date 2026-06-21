import os
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from .schemas import (
    UserCreate,
    UserAdminCreate,
    UserAdminUpdate,
    Token,
    UserOut,
    BusySlotCreate,
    BusySlotUpdate,
    BusySlotOut,
    CommonBusyOut,
    ProposalCreate,
    ProposalVoteCreate,
    ProposalOut,
)
from .auth import hash_password, verify_password, create_access_token, get_current_user
from .store import load_data, save_data, find_user_by_username

app = FastAPI(title="Event Planner API")

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


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    votes = proposal.get("votes", [])
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


def proposal_public(proposal: dict, users_by_id: dict[int, dict], current_user: dict) -> ProposalOut:
    creator = users_by_id.get(proposal["creator_user_id"])
    my_vote = next(
        (vote.get("vote") for vote in proposal.get("votes", []) if vote.get("user_id") == current_user["id"]),
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
        my_vote=my_vote,
        can_manage=can_manage,
        results=proposal_results(proposal) if status_value == "closed" else None,
    )


def find_proposal(store: dict, proposal_id: int) -> dict:
    proposal = next((item for item in store["proposals"] if item["id"] == proposal_id), None)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal


def require_proposal_manager(proposal: dict, current_user: dict) -> None:
    if proposal["creator_user_id"] != current_user["id"] and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only the creator or admin can manage this proposal")


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


@app.on_event("startup")
def startup() -> None:
    ensure_admin_user()


@app.get("/")
def root():
    return {"status": "ok", "message": "Event Planner API"}


@app.post("/auth/register", response_model=UserOut)
def register(data: UserCreate):
    store = load_data()
    if any(u["username"] == data.username for u in store["users"]):
        raise HTTPException(status_code=409, detail="Username already exists")

    user = {
        "id": store["next_user_id"],
        "username": data.username,
        "password_hash": hash_password(data.password),
        "is_admin": False,
    }
    store["next_user_id"] += 1
    store["users"].append(user)
    save_data(store)
    return user_public(user)


@app.post("/auth/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = find_user_by_username(form.username)
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad username or password")
    return Token(access_token=create_access_token(user["username"]))


@app.get("/users/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)):
    return user_public(user)


@app.get("/users", response_model=list[UserOut])
def list_users(current_user: dict = Depends(get_current_user)):
    store = load_data()
    visible_users = store["users"] if is_admin(current_user) else [
        user for user in store["users"] if not user.get("is_admin")
    ]
    users = sorted(visible_users, key=lambda u: u["username"].lower())
    return [user_public(user) for user in users]


@app.post("/users", response_model=UserOut)
def create_user_by_admin(data: UserAdminCreate, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    store = load_data()
    ensure_unique_username(store, username)
    user = {
        "id": store["next_user_id"],
        "username": username,
        "password_hash": hash_password(data.password),
        "is_admin": data.is_admin,
    }
    store["next_user_id"] += 1
    store["users"].append(user)
    save_data(store)
    return user_public(user)


@app.put("/users/{user_id}", response_model=UserOut)
def update_user_by_admin(
    user_id: int,
    data: UserAdminUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    store = load_data()
    user = find_user_by_id(store, user_id)

    if data.username is not None:
        username = data.username.strip()
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        if user_id == current_user["id"] and username != user["username"]:
            raise HTTPException(status_code=400, detail="Cannot rename your own account while logged in")
        ensure_unique_username(store, username, except_user_id=user_id)
        user["username"] = username

    if data.password:
        user["password_hash"] = hash_password(data.password)

    if data.is_admin is not None:
        if user_id == current_user["id"] and not data.is_admin:
            raise HTTPException(status_code=400, detail="Cannot remove admin role from your own account")
        if user.get("is_admin") and not data.is_admin and admin_count(store) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")
        user["is_admin"] = data.is_admin

    save_data(store)
    return user_public(user)


@app.delete("/users/{user_id}")
def delete_user_by_admin(user_id: int, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    store = load_data()
    user = find_user_by_id(store, user_id)
    if user.get("is_admin") and admin_count(store) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last admin")

    store["users"] = [item for item in store["users"] if item["id"] != user_id]
    store["busy_slots"] = [slot for slot in store["busy_slots"] if slot["user_id"] != user_id]
    store["proposals"] = [
        proposal
        for proposal in store["proposals"]
        if proposal["creator_user_id"] != user_id
    ]
    for proposal in store["proposals"]:
        proposal["votes"] = [vote for vote in proposal.get("votes", []) if vote.get("user_id") != user_id]

    save_data(store)
    return {"deleted": True}


@app.get("/busy", response_model=list[BusySlotOut])
def list_busy(current_user: dict = Depends(get_current_user)):
    store = load_data()
    users_by_id = {u["id"]: u for u in store["users"]}
    slots = sorted(store["busy_slots"], key=lambda s: s["start_time"])
    return [slot_public(s, users_by_id) for s in slots]


@app.post("/busy", response_model=BusySlotOut)
def create_busy(data: BusySlotCreate, current_user: dict = Depends(get_current_user)):
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    store = load_data()
    target_user_id = resolve_target_user_id(data.user_id, current_user, store, current_user["id"])
    slot = {
        "id": store["next_slot_id"],
        "user_id": target_user_id,
        "start_time": data.start_time.isoformat(),
        "end_time": data.end_time.isoformat(),
    }
    store["next_slot_id"] += 1
    store["busy_slots"].append(slot)
    save_data(store)

    users_by_id = {u["id"]: u for u in store["users"]}
    return slot_public(slot, users_by_id)


@app.put("/busy/{slot_id}", response_model=BusySlotOut)
def update_busy(slot_id: int, data: BusySlotUpdate, current_user: dict = Depends(get_current_user)):
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    store = load_data()
    slot = next((s for s in store["busy_slots"] if s["id"] == slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot["user_id"] != current_user["id"] and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can manage other users' busy slots")

    slot["user_id"] = resolve_target_user_id(data.user_id, current_user, store, slot["user_id"])
    slot["start_time"] = data.start_time.isoformat()
    slot["end_time"] = data.end_time.isoformat()
    save_data(store)

    users_by_id = {u["id"]: u for u in store["users"]}
    return slot_public(slot, users_by_id)


@app.delete("/busy/{slot_id}")
def delete_busy(slot_id: int, current_user: dict = Depends(get_current_user)):
    store = load_data()
    slot = next((s for s in store["busy_slots"] if s["id"] == slot_id), None)
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot["user_id"] != current_user["id"] and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can manage other users' busy slots")

    store["busy_slots"] = [s for s in store["busy_slots"] if s["id"] != slot_id]
    save_data(store)
    return {"deleted": True}


@app.get("/proposals", response_model=list[ProposalOut])
def list_proposals(current_user: dict = Depends(get_current_user)):
    store = load_data()
    users_by_id = {u["id"]: u for u in store["users"]}
    proposals = sorted(
        store["proposals"],
        key=lambda proposal: (
            proposal.get("status") == "closed",
            proposal["start_time"],
            proposal["id"],
        ),
    )
    return [proposal_public(proposal, users_by_id, current_user) for proposal in proposals]


@app.post("/proposals", response_model=ProposalOut)
def create_proposal(data: ProposalCreate, current_user: dict = Depends(get_current_user)):
    title = data.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Proposal title is required")
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    store = load_data()
    proposal = {
        "id": store["next_proposal_id"],
        "creator_user_id": current_user["id"],
        "title": title,
        "start_time": data.start_time.isoformat(),
        "end_time": data.end_time.isoformat(),
        "status": "open",
        "created_at": now_iso(),
        "closed_at": None,
        "votes": [],
    }
    store["next_proposal_id"] += 1
    store["proposals"].append(proposal)
    save_data(store)

    users_by_id = {u["id"]: u for u in store["users"]}
    return proposal_public(proposal, users_by_id, current_user)


@app.post("/proposals/{proposal_id}/vote", response_model=ProposalOut)
def vote_proposal(
    proposal_id: int,
    data: ProposalVoteCreate,
    current_user: dict = Depends(get_current_user),
):
    store = load_data()
    proposal = find_proposal(store, proposal_id)

    if proposal.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Closed proposals do not accept votes")
    if proposal["creator_user_id"] == current_user["id"]:
        raise HTTPException(status_code=403, detail="Proposal creators cannot vote on their own proposals")

    vote = next((item for item in proposal["votes"] if item["user_id"] == current_user["id"]), None)
    if vote:
        vote["vote"] = data.vote
    else:
        proposal["votes"].append({"user_id": current_user["id"], "vote": data.vote})
    save_data(store)

    users_by_id = {u["id"]: u for u in store["users"]}
    return proposal_public(proposal, users_by_id, current_user)


@app.post("/proposals/{proposal_id}/close", response_model=ProposalOut)
def close_proposal(proposal_id: int, current_user: dict = Depends(get_current_user)):
    store = load_data()
    proposal = find_proposal(store, proposal_id)
    require_proposal_manager(proposal, current_user)

    if proposal.get("status") != "closed":
        proposal["status"] = "closed"
        proposal["closed_at"] = now_iso()
        save_data(store)

    users_by_id = {u["id"]: u for u in store["users"]}
    return proposal_public(proposal, users_by_id, current_user)


@app.delete("/proposals/{proposal_id}")
def delete_proposal(proposal_id: int, current_user: dict = Depends(get_current_user)):
    store = load_data()
    proposal = find_proposal(store, proposal_id)
    require_proposal_manager(proposal, current_user)

    store["proposals"] = [item for item in store["proposals"] if item["id"] != proposal_id]
    save_data(store)
    return {"deleted": True}


@app.get("/busy/common", response_model=list[CommonBusyOut])
def common_busy(current_user: dict = Depends(get_current_user)):
    """
    Zwraca przedziały, w których przynajmniej jeden użytkownik jest zajęty.
    Łączy zachodzące na siebie sloty i dopisuje osoby, które w tym zakresie mają konflikt.
    """
    store = load_data()
    users_by_id = {u["id"]: u for u in store["users"]}
    slots = sorted(store["busy_slots"], key=lambda s: s["start_time"])
    if not slots:
        return []

    merged = []
    for raw_slot in slots:
        slot = slot_public(raw_slot, users_by_id)
        if not merged or slot.start_time > merged[-1]["end_time"]:
            merged.append({"start_time": slot.start_time, "end_time": slot.end_time, "users": {slot.username}})
        else:
            merged[-1]["end_time"] = max(merged[-1]["end_time"], slot.end_time)
            merged[-1]["users"].add(slot.username)

    return [
        CommonBusyOut(start_time=m["start_time"], end_time=m["end_time"], users=sorted(m["users"]))
        for m in merged
    ]
