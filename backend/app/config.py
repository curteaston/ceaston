from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import json


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./ceaston.db"
    min_match_score: float = 0.60
    scan_interval_hours: int = 6
    max_applications_per_run: int = 10
    review_required: bool = True
    linkedin_email: str = ""
    linkedin_password: str = ""
    notification_email: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v


settings = Settings()
