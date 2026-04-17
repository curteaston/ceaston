import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import UserProfile, JobSearchCriteria
from app.schemas.user import ProfileCreate, ProfileOut, CriteriaCreate, CriteriaOut
from app.services.resume_parser import parse_resume

router = APIRouter()
_UPLOAD_DIR = "uploads/resumes"


@router.post("", response_model=ProfileOut)
async def create_profile(data: ProfileCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserProfile).where(UserProfile.email == data.email))
    existing = result.scalar_one_or_none()
    if existing:
        for k, v in data.model_dump().items():
            setattr(existing, k, v)
        await db.commit()
        await db.refresh(existing)
        return existing
    profile = UserProfile(**data.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserProfile).where(UserProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


@router.post("/{profile_id}/resume", response_model=ProfileOut)
async def upload_resume(profile_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserProfile).where(UserProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    os.makedirs(_UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "resume.pdf")[1].lower()
    if ext not in (".pdf",):
        raise HTTPException(400, "Only PDF files are supported")

    dest = os.path.join(_UPLOAD_DIR, f"profile_{profile_id}{ext}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    parsed = parse_resume(dest)
    profile.resume_file_path = dest
    profile.raw_resume_text = parsed.model_dump_json()
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/{profile_id}/criteria", response_model=CriteriaOut)
async def set_criteria(profile_id: int, data: CriteriaCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserProfile).where(UserProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    # Deactivate existing criteria
    existing = await db.execute(select(JobSearchCriteria).where(JobSearchCriteria.profile_id == profile_id))
    for c in existing.scalars().all():
        c.is_active = False

    criteria = JobSearchCriteria(profile_id=profile_id, **data.model_dump())
    db.add(criteria)
    await db.commit()
    await db.refresh(criteria)
    return criteria


@router.get("/{profile_id}/criteria", response_model=list[CriteriaOut])
async def get_criteria(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobSearchCriteria).where(JobSearchCriteria.profile_id == profile_id, JobSearchCriteria.is_active == True)  # noqa: E712
    )
    return result.scalars().all()
