import re
import xml.etree.ElementTree as ET
import httpx
from app.scrapers.base import BaseScraper, RawJob

_CATEGORIES = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
    "https://weworkremotely.com/remote-jobs.rss",
]


class WeWorkRemotelyScraper(BaseScraper):
    source = "weworkremotely"
    calls_per_minute = 5

    async def search(self, keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
        jobs: list[RawJob] = []
        kw_lower = [k.lower() for k in keywords]
        seen: set[str] = set()

        async with httpx.AsyncClient() as client:
            for feed_url in _CATEGORIES:
                try:
                    resp = await self._get(client, feed_url)
                    root = ET.fromstring(resp.text)
                    channel = root.find("channel")
                    if channel is None:
                        continue
                    for item in channel.findall("item"):
                        title_el = item.find("title")
                        link_el = item.find("link")
                        desc_el = item.find("description")

                        title = title_el.text or "" if title_el is not None else ""
                        link = link_el.text or "" if link_el is not None else ""
                        raw_desc = desc_el.text or "" if desc_el is not None else ""
                        description = re.sub(r"<[^>]+>", " ", raw_desc).strip()

                        if link in seen:
                            continue

                        if not any(k in title.lower() or k in description.lower() for k in kw_lower):
                            continue

                        # Title format: "Company: Job Title"
                        parts = title.split(":", 1)
                        company = parts[0].strip() if len(parts) > 1 else "Unknown"
                        job_title = parts[1].strip() if len(parts) > 1 else title

                        seen.add(link)
                        ext_id = link.split("/")[-1] or link
                        jobs.append(RawJob(
                            board_source=self.source,
                            external_id=ext_id,
                            title=job_title,
                            company=company,
                            location="Remote",
                            url=link,
                            description=description,
                            apply_url=link,
                            posted_at=None,
                        ))
                except Exception:
                    continue
        return jobs
