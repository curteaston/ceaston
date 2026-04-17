import pytest
from app.services.resume_parser import _parse_text, ResumeStructured


def test_parse_text_skills():
    text = """
Skills
Python, FastAPI, React, PostgreSQL

Experience
Acme Corp | Software Engineer | 2021 – 2024
Built REST APIs serving 1M requests/day
Reduced latency by 40%

Education
MIT   BS Computer Science   2017 – 2021
"""
    result = _parse_text(text)
    assert isinstance(result, ResumeStructured)
    assert "Python" in result.skills
    assert len(result.experience) > 0


def test_parse_empty_text():
    result = _parse_text("")
    assert result.summary == ""
    assert result.skills == []
