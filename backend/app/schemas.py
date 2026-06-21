from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=6, max_length=128)

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool = False

    class Config:
        from_attributes = True

class UserAdminCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False

class UserAdminUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=80)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    is_admin: bool | None = None

class BusySlotCreate(BaseModel):
    start_time: datetime
    end_time: datetime
    user_id: int | None = None

class BusySlotUpdate(BaseModel):
    start_time: datetime
    end_time: datetime
    user_id: int | None = None

class BusySlotOut(BaseModel):
    id: int
    user_id: int
    username: str
    start_time: datetime
    end_time: datetime

class CommonBusyOut(BaseModel):
    start_time: datetime
    end_time: datetime
    users: list[str]

class ProposalCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    start_time: datetime
    end_time: datetime

class ProposalVoteCreate(BaseModel):
    vote: Literal["yes", "no"]

class ProposalResults(BaseModel):
    yes_count: int
    no_count: int
    total_votes: int
    yes_percent: float
    no_percent: float

class ProposalOut(BaseModel):
    id: int
    creator_user_id: int
    creator_username: str
    title: str
    start_time: datetime
    end_time: datetime
    status: Literal["open", "closed"]
    created_at: datetime
    closed_at: datetime | None = None
    my_vote: Literal["yes", "no"] | None = None
    can_manage: bool = False
    results: ProposalResults | None = None
