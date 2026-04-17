from pydantic import BaseModel
from datetime import datetime
from app.models.application import ApplicationStatus
from app.schemas.job import JobOut


class ApplicationOut(BaseModel):
    id: int
    job_id: int
    profile_id: int
    status: ApplicationStatus
    tailored_resume_text: str | None
    tailored_resume_pdf_path: str | None
    review_notes: str | None
    error_message: str | None
    submitted_at: datetime | None
    created_at: datetime
    job: JobOut

    model_config = {"from_attributes": True}


class ApproveRequest(BaseModel):
    notes: str | None = None


class RejectRequest(BaseModel):
    notes: str | None = None
