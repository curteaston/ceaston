from abc import ABC, abstractmethod
from dataclasses import dataclass
from playwright.async_api import Page


@dataclass
class ApplyResult:
    success: bool
    screenshot_path: str | None = None
    error: str | None = None


class BaseApplier(ABC):
    source: str = ""

    @abstractmethod
    async def apply(self, page: Page, job_url: str, resume_pdf_path: str, profile: dict) -> ApplyResult:
        ...
