from datetime import datetime
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
