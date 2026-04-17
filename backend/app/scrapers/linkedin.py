import asyncio
import re
import httpx
from app.scrapers.base import BaseScraper, RawJob


class LinkedInScraper(BaseScraper):
    source = "linkedin"
    calls_per_minute = 5  # Be conservative with LinkedIn

    async def search(self, keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
        jobs: list[RawJob] = []
        query = " ".join(keywords)
        loc = location or ("Remote" if remote_only else "")
        start = 0

        async with httpx.AsyncClient(follow_redirects=True) as client:
            while start < 50:  # Cap at 50 results per search
                try:
                    resp = await self._get(
                        client,
                        "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
                        params={
                            "keywords": query,
                            "location": loc,
                            "start": start,
                            "f_WT": "2" if remote_only else "",
                        },
                    )
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(resp.text, "lxml")
                    cards = soup.find_all("li")
                    if not cards:
                        break

                    for card in cards:
                        job_id_el = card.find("div", {"data-entity-urn": True})
                        if not job_id_el:
                            continue
                        urn = job_id_el.get("data-entity-urn", "")
                        ext_id = urn.split(":")[-1]
                        title_el = card.find("h3")
                        company_el = card.find("h4")
                        loc_el = card.find("span", class_=re.compile("job-search-card__location"))
                        title = title_el.get_text(strip=True) if title_el else ""
                        company = company_el.get_text(strip=True) if company_el else ""
                        location_text = loc_el.get_text(strip=True) if loc_el else ""

                        if not ext_id or not title:
                            continue

                        jobs.append(RawJob(
                            board_source=self.source,
                            external_id=ext_id,
                            title=title,
                            company=company,
                            location=location_text or None,
                            url=f"https://www.linkedin.com/jobs/view/{ext_id}/",
                            description=None,  # Fetched separately if needed
                            apply_url=f"https://www.linkedin.com/jobs/view/{ext_id}/",
                            posted_at=None,
                        ))

                    start += len(cards)
                    if len(cards) < 25:
                        break
                    await asyncio.sleep(3)
                except Exception:
                    break
        return jobs
