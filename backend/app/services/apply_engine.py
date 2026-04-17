import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from playwright.async_api import async_playwright
from app.database import AsyncSessionLocal
from app.models import Application, ApplicationStatus, UserProfile
from app.services.resume_parser import ResumeStructured
from app.appliers.greenhouse import GreenhouseApplier
from app.appliers.linkedin import LinkedInApplier
from app.config import settings

log = logging.getLogger(__name__)

_APPLIERS = {
    "greenhouse": GreenhouseApplier(),
    "lever": GreenhouseApplier(),  # Lever forms are structurally similar to Greenhouse
    "linkedin": LinkedInApplier(),
}


async def submit_application(application_id: int) -> None:
    assert settings.review_required, "review_required must be True — never bypass human approval"

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Application)
            .options(selectinload(Application.job), selectinload(Application.profile))
            .where(Application.id == application_id)
        )
        app = result.scalar_one_or_none()
        if not app:
            log.error("Application %s not found", application_id)
            return

        assert app.status == ApplicationStatus.APPROVED, (
            f"Application {application_id} is not APPROVED (status={app.status})"
        )

        profile = app.profile
        profile_dict = {
            "full_name": profile.full_name,
            "email": profile.email,
            "phone": profile.phone,
            "location": profile.location,
            "linkedin_url": profile.linkedin_url,
        }

        job = app.job
        applier = _APPLIERS.get(job.board_source)
        if not applier:
            app.status = ApplicationStatus.ERROR
            app.error_message = f"No applier available for board: {job.board_source}"
            await db.commit()
            return

        apply_url = job.apply_url or job.url
        resume_path = app.tailored_resume_pdf_path or ""

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context()

            # Load saved LinkedIn session if applicable
            if job.board_source == "linkedin":
                li_applier: LinkedInApplier = applier  # type: ignore[assignment]
                loaded = await li_applier.load_cookies(context)
                if not loaded:
                    log.warning("No LinkedIn session cookies found. Manual login required.")
                    app.status = ApplicationStatus.ERROR
                    app.error_message = "LinkedIn session not found. Run the login script first."
                    await db.commit()
                    await browser.close()
                    return

            page = await context.new_page()
            try:
                result_obj = await applier.apply(page, apply_url, resume_path, profile_dict)
            finally:
                await browser.close()

        if result_obj.success:
            app.status = ApplicationStatus.SUBMITTED
            app.submitted_at = datetime.now(timezone.utc)
            app.screenshot_path = result_obj.screenshot_path
        else:
            app.status = ApplicationStatus.ERROR
            app.error_message = result_obj.error
            app.screenshot_path = result_obj.screenshot_path

        await db.commit()
        log.info("Application %s -> %s", application_id, app.status.value)
