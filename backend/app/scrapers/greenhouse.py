import httpx
from app.scrapers.base import BaseScraper, RawJob

# Well-known companies using Greenhouse ATS
_KNOWN_COMPANIES = [
    "stripe", "airbnb", "dropbox", "lyft", "pinterest", "reddit", "robinhood",
    "brex", "figma", "notion", "linear", "vercel", "netlify", "supabase",
    "hashicorp", "datadog", "segment", "twilio", "zendesk", "hubspot",
    "intercom", "gusto", "rippling", "lattice", "carta", "plaid",
]


class GreenhouseScraper(BaseScraper):
    source = "greenhouse"
    calls_per_minute = 30  # Public API, very permissive

    async def search(self, keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
        jobs: list[RawJob] = []
        kw_lower = [k.lower() for k in keywords]

        async with httpx.AsyncClient() as client:
            for company in _KNOWN_COMPANIES:
                try:
                    resp = await self._get(
                        client,
                        f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true",
                    )
                    data = resp.json()
                    for j in data.get("jobs", []):
                        title = j.get("title", "")
                        if not any(k in title.lower() for k in kw_lower):
                            continue
                        loc = j.get("location", {}).get("name", "")
                        if remote_only and "remote" not in loc.lower():
                            continue
                        content = j.get("content", "")
                        # Strip HTML tags simply
                        import re
                        description = re.sub(r"<[^>]+>", " ", content).strip()
                        jobs.append(RawJob(
                            board_source=self.source,
                            external_id=str(j["id"]),
                            title=title,
                            company=j.get("company", {}).get("name", company.title()),
                            location=loc or None,
                            url=j.get("absolute_url", ""),
                            description=description,
                            apply_url=j.get("absolute_url"),
                            posted_at=None,
                        ))
                except Exception:
                    continue
        return jobs
