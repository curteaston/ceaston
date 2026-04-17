from pydantic import BaseModel
from datetime import datetime


class JobOut(BaseModel):
    id: int
    board_source: str
    title: str
    company: str
    location: str | None
    url: str
    match_score: float | None
    status: str
    posted_at: datetime | None
    scraped_at: datetime

    model_config = {"from_attributes": True}


class JobDetail(JobOut):
    description_raw: str | None
    apply_url: str | None
