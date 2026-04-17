import httpx
from app.scrapers.base import BaseScraper, RawJob

_KNOWN_COMPANIES = [
    "netflix", "shopify", "coinbase", "scale-ai", "openai", "anthropic",
    "cohere", "huggingface", "stability-ai", "mistral", "otter-ai",
    "airtable", "canva", "asana", "miro", "loom", "retool", "dbt-labs",
    "benchling", "gong", "outreach", "salesloft", "amplitude", "mixpanel",
]


class LeverScraper(BaseScraper):
    source = "lever"
    calls_per_minute = 30

    async def search(self, keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
        jobs: list[RawJob] = []
        kw_lower = [k.lower() for k in keywords]

        async with httpx.AsyncClient() as client:
            for company in _KNOWN_COMPANIES:
                try:
                    resp = await self._get(
                        client,
                        f"https://api.lever.co/v0/postings/{company}?mode=json",
                    )
                    for j in resp.json():
                        title = j.get("text", "")
                        if not any(k in title.lower() for k in kw_lower):
                            continue
                        loc = j.get("categories", {}).get("location", "")
                        if remote_only and "remote" not in (loc or "").lower():
                            continue
                        lists = j.get("lists", [])
                        description = "\n".join(
                            f"{l['text']}: {' '.join(l.get('content', []))}" for l in lists
                        )
                        jobs.append(RawJob(
                            board_source=self.source,
                            external_id=j["id"],
                            title=title,
                            company=company.replace("-", " ").title(),
                            location=loc or None,
                            url=j.get("hostedUrl", ""),
                            description=description,
                            apply_url=j.get("applyUrl"),
                            posted_at=None,
                        ))
                except Exception:
                    continue
        return jobs
