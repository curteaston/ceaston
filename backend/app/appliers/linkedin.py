import os
import pickle
from pathlib import Path
from playwright.async_api import Page, BrowserContext
from app.appliers.base import BaseApplier, ApplyResult
from app.config import settings

_SESSION_PATH = Path.home() / ".ceaston" / "linkedin_session.pkl"
_SCREENSHOT_DIR = "uploads/screenshots"


class LinkedInApplier(BaseApplier):
    source = "linkedin"

    async def save_cookies(self, context: BrowserContext) -> None:
        _SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
        cookies = await context.cookies()
        with open(_SESSION_PATH, "wb") as f:
            pickle.dump(cookies, f)

    async def load_cookies(self, context: BrowserContext) -> bool:
        if not _SESSION_PATH.exists():
            return False
        with open(_SESSION_PATH, "rb") as f:
            cookies = pickle.load(f)
        await context.add_cookies(cookies)
        return True

    async def apply(self, page: Page, job_url: str, resume_pdf_path: str, profile: dict) -> ApplyResult:
        os.makedirs(_SCREENSHOT_DIR, exist_ok=True)
        screenshot_path = os.path.join(_SCREENSHOT_DIR, f"linkedin_{os.urandom(4).hex()}.png")

        try:
            await page.goto(job_url, wait_until="networkidle")

            # Click Easy Apply button
            easy_apply_btn = page.locator("button.jobs-apply-button, button[aria-label*='Easy Apply']")
            if await easy_apply_btn.count() == 0:
                return ApplyResult(success=False, error="No Easy Apply button found")
            await easy_apply_btn.first.click()
            await page.wait_for_selector("div[aria-label*='Apply']", timeout=10000)

            # Walk through multi-step dialog
            for _step in range(10):
                # Fill contact fields if present
                phone_input = page.locator("input[id*='phoneNumber']")
                if await phone_input.count() > 0:
                    await phone_input.fill(profile.get("phone", "") or "")

                # Upload resume if file input is present
                if resume_pdf_path and os.path.exists(resume_pdf_path):
                    file_input = page.locator("input[type='file']")
                    if await file_input.count() > 0:
                        await file_input.first.set_input_files(resume_pdf_path)

                # Handle radio buttons / dropdowns with default first option
                for select in await page.locator("select").all():
                    try:
                        await select.select_option(index=0)
                    except Exception:
                        pass

                await page.screenshot(path=screenshot_path, full_page=True)

                # Next / Review / Submit buttons
                next_btn = page.locator("button[aria-label='Continue to next step']")
                review_btn = page.locator("button[aria-label='Review your application']")
                submit_btn = page.locator("button[aria-label='Submit application']")

                if await submit_btn.count() > 0:
                    await submit_btn.click()
                    await page.wait_for_load_state("networkidle")
                    await page.screenshot(path=screenshot_path, full_page=True)
                    return ApplyResult(success=True, screenshot_path=screenshot_path)
                elif await review_btn.count() > 0:
                    await review_btn.click()
                elif await next_btn.count() > 0:
                    await next_btn.click()
                else:
                    break

                await page.wait_for_timeout(1000)

            return ApplyResult(success=False, screenshot_path=screenshot_path, error="Could not reach submit step")

        except Exception as e:
            try:
                await page.screenshot(path=screenshot_path, full_page=True)
            except Exception:
                pass
            return ApplyResult(success=False, screenshot_path=screenshot_path, error=str(e))
