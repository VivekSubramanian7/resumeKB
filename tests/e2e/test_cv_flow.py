import docx
import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from helpers import e2e_settings, user_kb_root

pytestmark = pytest.mark.e2e


@pytest.fixture()
def client(tmp_path, prompts_dir):
    return TestClient(create_app(e2e_settings(tmp_path, prompts_root=prompts_dir)))


@pytest.fixture()
def cv_docx(tmp_path):
    doc = docx.Document()
    doc.add_heading("Vivek Subramanian", level=1)
    doc.add_paragraph("Senior Backend Engineer")
    doc.add_paragraph("Skills: Python, Kubernetes, PostgreSQL")
    path = tmp_path / "cv.docx"
    doc.save(str(path))
    return path


def test_cv_upload_creates_profile_entries(client, cv_docx, tmp_path):
    with open(cv_docx, "rb") as f:
        response = client.post("/api/documents", files={"document": ("cv.docx", f)})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Vivek Subramanian"
    assert (user_kb_root(tmp_path) / "person" / "person-vivek-subramanian.md").exists()
    assert (user_kb_root(tmp_path) / "experience" / "experience-acme-corp-senior-engineer.md").exists()

    hits = client.get("/api/kb/search", params={"q": "payments"}).json()
    assert hits, "CV content should be searchable"


def test_legacy_doc_is_rejected(client, tmp_path):
    legacy = tmp_path / "cv.doc"
    legacy.write_bytes(b"\xd0\xcf\x11\xe0 fake")
    with open(legacy, "rb") as f:
        response = client.post("/api/documents", files={"document": ("cv.doc", f)})
    assert response.status_code == 422
    assert "docx" in response.json()["detail"].lower()
