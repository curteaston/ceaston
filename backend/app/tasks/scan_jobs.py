import os
import logging
from sqlalchemy import select, insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.database import AsyncSessionLocal
from app.models import UserProfile, JobSearchCriteria, Job, Application, ApplicationStatus
from app.services.job_scraper import scrape_all
from app.services.resume_parser import ResumeStructured
from app.services.resume_customizer import score_job, customize_resume
from app.services.pdf_generator import generate_resume_pdf
from app.config import settings

log = logging.getLogger(__name__)


async def run_scan(profile_id: int) -> None:
    async with AsyncSessionLocal() as db:
        profile_result = await db.execute(select(UserProfile).where(UserProfile.id == profile_id))
        profile = profile_result.scalar_one_or_none()
        if not profile or not profile.raw_resume_text:
            log.warning("Profile %s missing or has no resume", profile_id)
            return

        criteria_result = await db.execute(
            select(JobSearchCriteria).where(
                JobSearchCriteria.profile_id == profile_id,
                JobSearchCriteria.is_active == True,  # noqa: E712
            )
        )
        criteria_list = criteria_result.scalars().all()
        if not criteria_list:
            log.warning("No active criteria for profile %s", profile_id)
            return

        resume = ResumeStructured.model_validate_json(profile.raw_resume_text)
        resume_json = resume.model_dump_json(indent=2)
        profile_dict = {
            "full_name": profile.full_name,
            "email": profile.email,
            "phone": profile.phone,
            "location": profile.location,
            "linkedin_url": profile.linkedin_url,
        }

        applied_count = 0
        for criteria in criteria_list:
            if applied_count >= settings.max_applications_per_run:
                break

            raw_jobs = await scrape_all(
                keywords=criteria.keywords,
                location=criteria.location,
                remote_only=criteria.remote_only,
            )
            log.info("Found %d raw jobs for criteria %s", len(raw_jobs), criteria.id)

            for raw in raw_jobs:
                if applied_count >= settings.max_applications_per_run:
                    break

                # Upsert job
                stmt = sqlite_insert(Job).values(
                    board_source=raw.board_source,
                    external_id=raw.external_id,
                    title=raw.title,
                    company=raw.company,
                    location=raw.location,
                    url=raw.url,
                    description_raw=raw.description,
                    apply_url=raw.apply_url,
                    posted_at=raw.posted_at,
                    status="new",
                ).on_conflict_do_nothing(index_elements=["board_source", "external_id"])
                await db.execute(stmt)
                await db.commit()

                job_result = await db.execute(
                    select(Job).where(Job.board_source == raw.board_source, Job.external_id == raw.external_id)
                )
                job = job_result.scalar_one_or_none()
                if not job or job.status != "new":
                    continue

                # Score the job
                description = raw.description or ""
                try:
                    score_data = score_job(resume, raw.title, description)
                    match_score = float(score_data.get("match_score", 0.5))
                except Exception as e:
                    log.error("Scoring failed for job %s: %s", job.id, e)
                    match_score = 0.5

                job.match_score = match_score
                if match_score < settings.min_match_score:
                    job.status = "skipped"
                    await db.commit()
                    continue

                # Customize resume
                try:
                    tailored = customize_resume(
                        resume, raw.title, raw.company, description, cached_resume_json=resume_json
                    )
                    tailored_text = tailored.model_dump_json()
                except Exception as e:
                    log.error("Customization failed for job %s: %s", job.id, e)
                    job.status = "skipped"
                    await db.commit()
                    continue

                # Generate PDF
                pdf_dir = "uploads/resumes/tailored"
                pdf_path = os.path.join(pdf_dir, f"profile_{profile_id}_job_{job.id}.pdf")
                try:
                    generate_resume_pdf(tailored, profile_dict, pdf_path)
                except Exception as e:
                    log.error("PDF generation failed for job %s: %s", job.id, e)
                    pdf_path = None

                # Create application in pending_review state
                application = Application(
                    job_id=job.id,
                    profile_id=profile_id,
                    tailored_resume_text=tailored_text,
                    tailored_resume_pdf_path=pdf_path,
                    status=ApplicationStatus.PENDING_REVIEW,
                )
                db.add(application)
                job.status = "queued"
                await db.commit()
                applied_count += 1
                log.info("Created application for job %s (score %.2f)", job.id, match_score)
