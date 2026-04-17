import os
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from app.services.resume_parser import ResumeStructured


_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
_env = Environment(loader=FileSystemLoader(str(_TEMPLATES_DIR)))


def generate_resume_pdf(
    resume: ResumeStructured,
    profile: dict,
    output_path: str,
) -> str:
    template = _env.get_template("resume.html.j2")
    html_content = template.render(resume=resume, profile=profile)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    HTML(string=html_content).write_pdf(output_path)
    return output_path
