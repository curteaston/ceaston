import os
from playwright.async_api import Page
from app.appliers.base import BaseApplier, ApplyResult

_SCREENSHOT_DIR = "uploads/screenshots"


class GreenhouseApplier(BaseApplier):
    source = "greenhouse"

    async def apply(self, page: Page, job_url: str, resume_pdf_path: str, profile: dict) -> ApplyResult:
        os.makedirs(_SCREENSHOT_DIR, exist_ok=True)
        screenshot_path = os.path.join(_SCREENSHOT_DIR, f"greenhouse_{os.urandom(4).hex()}.png")

        try:
            await page.goto(job_url, wait_until="networkidle")

            # Fill standard Greenhouse fields
            for selector, value in [
                ("input#first_name", profile.get("full_name", "").split()[0]),
                ("input#last_name", " ".join(profile.get("full_name", "").split()[1:])),
                ("input#email", profile.get("email", "")),
                ("input#phone", profile.get("phone", "") or ""),
            ]:
                el = page.locator(selector)
                if await el.count() > 0:
                    await el.fill(value)

            # LinkedIn URL
            linkedin = page.locator("input[name*='linkedin'], input[placeholder*='LinkedIn']")
            if await linkedin.count() > 0:
                await linkedin.first.fill(profile.get("linkedin_url", "") or "")

            # Resume upload
            if resume_pdf_path and os.path.exists(resume_pdf_path):
                resume_input = page.locator("input[type='file'][name*='resume'], input[type='file'][id*='resume']")
                if await resume_input.count() > 0:
                    await resume_input.first.set_input_files(resume_pdf_path)

            # "How did you hear about us?" — select first option
            source_select = page.locator("select[name*='source'], select[id*='source']")
            if await source_select.count() > 0:
                await source_select.first.select_option(index=1)

            await page.screenshot(path=screenshot_path, full_page=True)

            submit_btn = page.locator("button[type='submit'], input[type='submit']").first
            await submit_btn.click()
            await page.wait_for_load_state("networkidle")
            await page.screenshot(path=screenshot_path, full_page=True)

            return ApplyResult(success=True, screenshot_path=screenshot_path)

        except Exception as e:
            try:
                await page.screenshot(path=screenshot_path, full_page=True)
            except Exception:
                pass
            return ApplyResult(success=False, screenshot_path=screenshot_path, error=str(e))
