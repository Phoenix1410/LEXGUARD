from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class UserSync(BaseModel):
    clerk_id: str
    email: str
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
