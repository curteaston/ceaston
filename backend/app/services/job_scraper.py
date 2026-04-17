import asyncio
from app.scrapers.base import RawJob
from app.scrapers.greenhouse import GreenhouseScraper
from app.scrapers.lever import LeverScraper
from app.scrapers.remoteok import RemoteOKScraper
from app.scrapers.weworkremotely import WeWorkRemotelyScraper
from app.scrapers.linkedin import LinkedInScraper
from app.scrapers.indeed import IndeedScraper

_SCRAPERS = [
    GreenhouseScraper(),
    LeverScraper(),
    RemoteOKScraper(),
    WeWorkRemotelyScraper(),
    LinkedInScraper(),
    IndeedScraper(),
]


async def scrape_all(keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
    results = await asyncio.gather(
        *[s.search(keywords, location, remote_only) for s in _SCRAPERS],
        return_exceptions=True,
    )
    jobs: list[RawJob] = []
    for r in results:
        if isinstance(r, list):
            jobs.extend(r)
    return jobs
