from sqlalchemy import Integer, String, Text, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(200))
    raw_resume_text: Mapped[str | None] = mapped_column(Text)
    resume_file_path: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    criteria: Mapped[list["JobSearchCriteria"]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    applications: Mapped[list["Application"]] = relationship(back_populates="profile")  # type: ignore[name-defined]


class JobSearchCriteria(Base):
    __tablename__ = "job_search_criteria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"))
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    location: Mapped[str | None] = mapped_column(String(200))
    remote_only: Mapped[bool] = mapped_column(Boolean, default=False)
    job_type: Mapped[str | None] = mapped_column(String(50))  # full-time, contract, part-time
    salary_min: Mapped[int | None] = mapped_column(Integer)
    experience_level: Mapped[str | None] = mapped_column(String(50))
    excluded_companies: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    profile: Mapped["UserProfile"] = relationship(back_populates="criteria")
