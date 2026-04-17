from sqlalchemy import Integer, String, Text, Float, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint("board_source", "external_id", name="uq_job_board_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board_source: Mapped[str] = mapped_column(String(50), index=True)  # linkedin/indeed/greenhouse/lever/remoteok/wwr
    external_id: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    company: Mapped[str] = mapped_column(String(300))
    location: Mapped[str | None] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(1000))
    description_raw: Mapped[str | None] = mapped_column(Text)
    apply_url: Mapped[str | None] = mapped_column(String(1000))
    posted_at: Mapped[DateTime | None] = mapped_column(DateTime)
    scraped_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
    match_score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(50), default="new", index=True)  # new/queued/applied/skipped

    applications: Mapped[list["Application"]] = relationship(back_populates="job")  # type: ignore[name-defined]
