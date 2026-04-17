from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.models import Job
from app.schemas.job import JobOut, JobDetail

router = APIRouter()


@router.get("", response_model=list[JobOut])
async def list_jobs(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Job).order_by(desc(Job.scraped_at)).limit(limit).offset(offset)
    if status:
        q = q.where(Job.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobDetail)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.post("/scan")
async def trigger_scan(profile_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    from app.tasks.scan_jobs import run_scan
    background_tasks.add_task(run_scan, profile_id)
    return {"message": "Scan started in background"}
