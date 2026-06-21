import os
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from .schemas import UserCreate, Token, UserOut, BusySlotCreate, BusySlotUpdate, BusySlotOut, CommonBusyOut
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


def resolve_target_user_id(user_id: int | None, current_user: dict, store: dict, default_user_id: int) -> int:
    target_user_id = user_id if user_id is not None else default_user_id
    if target_user_id != current_user["id"] and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can manage other users' busy slots")
    if not any(u["id"] == target_user_id for u in store["users"]):
        raise HTTPException(status_code=404, detail="Target user not found")
    return target_user_id


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
    require_admin(current_user)
    store = load_data()
    users = sorted(store["users"], key=lambda u: u["username"].lower())
    return [user_public(user) for user in users]


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
