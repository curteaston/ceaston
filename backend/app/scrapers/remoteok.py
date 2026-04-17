from datetime import datetime
import httpx
from app.scrapers.base import BaseScraper, RawJob


class RemoteOKScraper(BaseScraper):
    source = "remoteok"
    calls_per_minute = 5  # RemoteOK asks for respectful crawling

    async def search(self, keywords: list[str], location: str | None, remote_only: bool) -> list[RawJob]:
        jobs: list[RawJob] = []
        kw_lower = [k.lower() for k in keywords]

        async with httpx.AsyncClient() as client:
            try:
                resp = await self._get(
                    client,
                    "https://remoteok.com/api",
                    headers={"User-Agent": "JobAutomator/1.0 (personal use)"},
                )
                data = resp.json()
                for j in data:
                    if not isinstance(j, dict) or "id" not in j:
                        continue
                    title = j.get("position", "")
                    description = j.get("description", "")
                    tags = " ".join(j.get("tags", []))
                    searchable = f"{title} {description} {tags}".lower()
                    if not any(k in searchable for k in kw_lower):
                        continue
                    epoch = j.get("epoch")
                    posted = datetime.fromtimestamp(epoch) if epoch else None
                    jobs.append(RawJob(
                        board_source=self.source,
                        external_id=str(j["id"]),
                        title=title,
                        company=j.get("company", "Unknown"),
                        location="Remote",
                        url=j.get("url", f"https://remoteok.com/remote-jobs/{j['id']}"),
                        description=description,
                        apply_url=j.get("apply_url") or j.get("url"),
                        posted_at=posted,
                    ))
            except Exception:
                pass
        return jobs
