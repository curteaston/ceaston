import re
import httpx
from bs4 import BeautifulSoup
from app.scrapers.base import BaseScraper, RawJob


class IndeedScraper(BaseScraper):
    source = "indeed"
    calls_per_minute = 3  # Be very conservative

    async def search(self, keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
        jobs: list[RawJob] = []
        query = " ".join(keywords)
        loc = "remote" if remote_only else (location or "")

        async with httpx.AsyncClient(follow_redirects=True) as client:
            try:
                resp = await self._get(
                    client,
                    "https://www.indeed.com/jobs",
                    params={"q": query, "l": loc, "sort": "date"},
                )
                soup = BeautifulSoup(resp.text, "lxml")
                cards = soup.find_all("div", {"data-jk": True})

                for card in cards:
                    job_key = card.get("data-jk", "")
                    title_el = card.find("h2", class_=re.compile("jobTitle"))
                    company_el = card.find("span", {"data-testid": "company-name"})
                    loc_el = card.find("div", {"data-testid": "text-location"})

                    title = title_el.get_text(strip=True) if title_el else ""
                    company = company_el.get_text(strip=True) if company_el else ""
                    location_text = loc_el.get_text(strip=True) if loc_el else ""

                    if not job_key or not title:
                        continue

                    jobs.append(RawJob(
                        board_source=self.source,
                        external_id=job_key,
                        title=title,
                        company=company,
                        location=location_text or None,
                        url=f"https://www.indeed.com/viewjob?jk={job_key}",
                        description=None,
                        apply_url=f"https://www.indeed.com/viewjob?jk={job_key}",
                        posted_at=None,
                    ))
            except Exception:
                pass
        return jobs
