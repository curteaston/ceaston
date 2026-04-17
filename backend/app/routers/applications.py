from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Application, ApplicationStatus
from app.schemas.application import ApplicationOut, ApproveRequest, RejectRequest
from app.config import settings

router = APIRouter()


@router.get("", response_model=list[ApplicationOut])
async def list_applications(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Application)
        .options(selectinload(Application.job))
        .order_by(desc(Application.created_at))
        .limit(limit)
        .offset(offset)
    )
    if status:
        q = q.where(Application.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{app_id}", response_model=ApplicationOut)
async def get_application(app_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Application).options(selectinload(Application.job)).where(Application.id == app_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Application not found")
    return app


@router.post("/{app_id}/approve", response_model=ApplicationOut)
async def approve_application(
    app_id: int,
    body: ApproveRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).options(selectinload(Application.job)).where(Application.id == app_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status != ApplicationStatus.PENDING_REVIEW:
        raise HTTPException(400, f"Application is {app.status.value}, not pending_review")

    app.status = ApplicationStatus.APPROVED
    app.review_notes = body.notes
    await db.commit()
    await db.refresh(app)

    from app.services.apply_engine import submit_application
    background_tasks.add_task(submit_application, app_id)
    return app


@router.post("/{app_id}/reject", response_model=ApplicationOut)
async def reject_application(app_id: int, body: RejectRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status != ApplicationStatus.PENDING_REVIEW:
        raise HTTPException(400, f"Cannot reject application in status {app.status.value}")

    app.status = ApplicationStatus.REJECTED
    app.review_notes = body.notes
    await db.commit()
    await db.refresh(app)
    return app
