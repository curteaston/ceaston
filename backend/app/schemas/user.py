from pydantic import BaseModel, EmailStr


class ProfileCreate(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    linkedin_url: str | None = None
    location: str | None = None


class ProfileOut(ProfileCreate):
    id: int
    resume_file_path: str | None = None

    model_config = {"from_attributes": True}


class CriteriaCreate(BaseModel):
    keywords: list[str] = []
    location: str | None = None
    remote_only: bool = False
    job_type: str | None = None
    salary_min: int | None = None
    experience_level: str | None = None
    excluded_companies: list[str] = []


class CriteriaOut(CriteriaCreate):
    id: int
    profile_id: int
    is_active: bool

    model_config = {"from_attributes": True}
