import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings

log = logging.getLogger(__name__)
_scheduler = AsyncIOScheduler()


async def _scan_all_profiles():
    from app.database import AsyncSessionLocal
    from sqlalchemy import select
    from app.models import UserProfile, JobSearchCriteria
    from app.tasks.scan_jobs import run_scan

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserProfile.id).join(
                JobSearchCriteria,
                (JobSearchCriteria.profile_id == UserProfile.id) & (JobSearchCriteria.is_active == True),  # noqa: E712
            )
        )
        profile_ids = result.scalars().all()

    for pid in profile_ids:
        try:
            await run_scan(pid)
        except Exception as e:
            log.error("Scan failed for profile %s: %s", pid, e)


def start_scheduler():
    _scheduler.add_job(_scan_all_profiles, "interval", hours=settings.scan_interval_hours, id="job_scan")
    _scheduler.start()
    log.info("Scheduler started. Job scan every %dh.", settings.scan_interval_hours)


def stop_scheduler():
    _scheduler.shutdown(wait=False)
