import json
import re
import anthropic
from app.config import settings
from app.services.resume_parser import ResumeStructured


client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

_SYSTEM_PROMPT = """You are a professional resume writer. Tailor the candidate's resume to match a specific job description.

CRITICAL RULES — violations will cause rejection:
1. NEVER add job titles, companies, or degrees the candidate did not hold.
2. NEVER invent metrics (e.g. "increased revenue by 40%") unless they appear in the original resume.
3. NEVER add skills that do not appear in the original resume.
4. You MAY: reorder bullet points, rephrase existing bullets to use the job's vocabulary, adjust the summary to reflect the role's priorities, reorder skills to highlight relevance.
5. Return ONLY valid JSON matching this exact schema — no markdown fences, no extra keys:
{
  "summary": "string",
  "experience": [{"company":"string","title":"string","dates":"string","bullets":["string"]}],
  "skills": ["string"],
  "education": [{"institution":"string","degree":"string","dates":"string"}],
  "certifications": ["string"]
}"""

_SCORE_SYSTEM = """You are a recruiter. Given a resume and job description, output ONLY valid JSON:
{"match_score": 0.0-1.0, "missing_skills": ["string"], "strong_matches": ["string"]}
match_score: 1.0 = perfect match, 0.0 = no match."""


def score_job(resume: ResumeStructured, job_title: str, job_description: str) -> dict:
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=_SCORE_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": f"Resume skills: {resume.skills}\nResume experience titles: {[e.title for e in resume.experience]}\n\nJob: {job_title}\n\nDescription (first 1500 chars):\n{job_description[:1500]}",
            }
        ],
    )
    try:
        return json.loads(response.content[0].text)
    except (json.JSONDecodeError, IndexError):
        return {"match_score": 0.5, "missing_skills": [], "strong_matches": []}


def customize_resume(
    resume: ResumeStructured,
    job_title: str,
    company: str,
    job_description: str,
    *,
    cached_resume_json: str | None = None,
) -> ResumeStructured:
    resume_json = cached_resume_json or resume.model_dump_json(indent=2)

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": f"Original resume (JSON):\n{resume_json}",
                    "cache_control": {"type": "ephemeral"},
                },
                {
                    "type": "text",
                    "text": f"Job description:\n{job_description[:3000]}\n\nTarget role: {job_title} at {company}",
                },
            ],
        }
    ]

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{"type": "text", "text": _SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=messages,
        betas=["prompt-caching-2024-07-31"],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    tailored = ResumeStructured.model_validate_json(raw)
    _validate_no_fabrication(resume, tailored)
    return tailored


def _validate_no_fabrication(original: ResumeStructured, tailored: ResumeStructured) -> None:
    orig_companies = {e.company.lower() for e in original.experience}
    orig_institutions = {e.institution.lower() for e in original.education}
    orig_skills_lower = {s.lower() for s in original.skills}

    for entry in tailored.experience:
        if entry.company.lower() not in orig_companies:
            raise ValueError(f"Fabricated company detected: {entry.company}")

    for entry in tailored.education:
        if entry.institution.lower() not in orig_institutions:
            raise ValueError(f"Fabricated institution detected: {entry.institution}")

    for skill in tailored.skills:
        if skill.lower() not in orig_skills_lower:
            # Allow minor reformatting (e.g. "Python 3" vs "Python")
            if not any(skill.lower() in s for s in orig_skills_lower):
                raise ValueError(f"Fabricated skill detected: {skill}")
