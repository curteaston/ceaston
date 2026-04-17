from pathlib import Path
from pydantic import BaseModel
import pdfplumber
import re


class ExperienceEntry(BaseModel):
    company: str
    title: str
    dates: str
    bullets: list[str]


class EducationEntry(BaseModel):
    institution: str
    degree: str
    dates: str


class ResumeStructured(BaseModel):
    summary: str = ""
    experience: list[ExperienceEntry] = []
    skills: list[str] = []
    education: list[EducationEntry] = []
    certifications: list[str] = []


def parse_resume(file_path: str) -> ResumeStructured:
    path = Path(file_path)
    if path.suffix.lower() == ".pdf":
        return _parse_pdf(str(path))
    raise ValueError(f"Unsupported file type: {path.suffix}")


def _parse_pdf(path: str) -> ResumeStructured:
    with pdfplumber.open(path) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    text = "\n".join(pages)
    return _parse_text(text)


def _parse_text(text: str) -> ResumeStructured:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    sections = _split_sections(lines)

    return ResumeStructured(
        summary=_extract_summary(sections),
        experience=_extract_experience(sections),
        skills=_extract_skills(sections),
        education=_extract_education(sections),
        certifications=_extract_certifications(sections),
    )


_SECTION_HEADERS = {
    "summary": ["summary", "objective", "profile", "about"],
    "experience": ["experience", "work history", "employment", "work experience"],
    "skills": ["skills", "technical skills", "competencies", "technologies"],
    "education": ["education", "academic background", "degrees"],
    "certifications": ["certifications", "certificates", "licenses"],
}


def _split_sections(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {k: [] for k in _SECTION_HEADERS}
    sections["header"] = []
    current = "header"

    for line in lines:
        lower = line.lower().rstrip(":")
        matched = False
        for section, keywords in _SECTION_HEADERS.items():
            if lower in keywords or any(lower.startswith(k) for k in keywords):
                current = section
                matched = True
                break
        if not matched:
            sections[current].append(line)

    return sections


def _extract_summary(sections: dict) -> str:
    return " ".join(sections.get("summary", []))


def _extract_skills(sections: dict) -> list[str]:
    skills = []
    for line in sections.get("skills", []):
        # Split on commas, pipes, bullets
        parts = re.split(r"[,|•·]", line)
        skills.extend(p.strip() for p in parts if p.strip())
    return skills


def _extract_experience(sections: dict) -> list[ExperienceEntry]:
    entries: list[ExperienceEntry] = []
    lines = sections.get("experience", [])
    i = 0
    while i < len(lines):
        line = lines[i]
        # Heuristic: a date pattern on a line signals a new job entry
        date_match = re.search(r"\b(19|20)\d{2}\b", line)
        if date_match and i + 1 < len(lines):
            # Treat this line as "Company | Title | Dates" or similar
            parts = re.split(r"[|–—\-]{2,}|\s{3,}", line)
            company = parts[0].strip() if parts else line
            title = parts[1].strip() if len(parts) > 1 else ""
            dates = parts[-1].strip() if len(parts) > 1 else ""
            bullets: list[str] = []
            i += 1
            while i < len(lines) and not re.search(r"\b(19|20)\d{2}\b", lines[i]):
                b = lines[i].lstrip("•·-– ").strip()
                if b:
                    bullets.append(b)
                i += 1
            entries.append(ExperienceEntry(company=company, title=title, dates=dates, bullets=bullets))
        else:
            i += 1
    return entries


def _extract_education(sections: dict) -> list[EducationEntry]:
    entries: list[EducationEntry] = []
    lines = sections.get("education", [])
    i = 0
    while i < len(lines):
        line = lines[i]
        date_match = re.search(r"\b(19|20)\d{2}\b", line)
        if date_match:
            parts = re.split(r"[|–—\-]{2,}|\s{3,}", line)
            institution = parts[0].strip()
            degree = parts[1].strip() if len(parts) > 1 else ""
            dates = parts[-1].strip() if len(parts) > 1 else ""
            entries.append(EducationEntry(institution=institution, degree=degree, dates=dates))
        i += 1
    return entries


def _extract_certifications(sections: dict) -> list[str]:
    return [line.lstrip("•·-– ").strip() for line in sections.get("certifications", []) if line.strip()]
