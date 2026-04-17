import asyncio
import random
import urllib.robotparser
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential


@dataclass
class RawJob:
    board_source: str
    external_id: str
    title: str
    company: str
    location: str | None
    url: str
    description: str | None
    apply_url: str | None
    posted_at: datetime | None
    extra: dict = field(default_factory=dict)


_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
]


def random_headers() -> dict[str, str]:
    return {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "application/json, text/html, */*",
    }


class BaseScraper(ABC):
    source: str = ""
    _robots_cache: dict[str, bool] = {}
    _semaphore: asyncio.Semaphore | None = None
    calls_per_minute: int = 10

    def _get_semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self.calls_per_minute)
        return self._semaphore

    async def _throttle(self):
        sem = self._get_semaphore()
        async with sem:
            await asyncio.sleep(60 / self.calls_per_minute + random.uniform(0, 2))

    def _robots_allowed(self, url: str) -> bool:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        if robots_url in self._robots_cache:
            return self._robots_cache[robots_url]
        try:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(robots_url)
            rp.read()
            allowed = rp.can_fetch("*", url)
        except Exception:
            allowed = True
        self._robots_cache[robots_url] = allowed
        return allowed

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def _get(self, client: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
        await self._throttle()
        response = await client.get(url, headers=random_headers(), timeout=15, **kwargs)
        response.raise_for_status()
        return response

    @abstractmethod
    async def search(self, keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
        ...
