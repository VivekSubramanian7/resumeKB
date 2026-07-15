import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from helpers import e2e_settings

pytestmark = pytest.mark.e2e


class _RecordingExtractor:
    """Captures the instructions passed in, returns the canned fake result."""

    def __init__(self, inner):
        self.inner = inner
        self.last_instructions = None
        self.instructions_by_schema: dict = {}

    def extract(self, text, schema, instructions):
        self.last_instructions = instructions
        self.instructions_by_schema[schema] = instructions
        return self.inner.extract(text, schema, instructions)


@pytest.fixture()
def setup(tmp_path, prompts_dir):
    from resume_kb_server.fakes import build_fake_extractor

    extractor = _RecordingExtractor(build_fake_extractor())
    client = TestClient(create_app(e2e_settings(tmp_path, prompts_root=prompts_dir), extractor=extractor))
    return client, extractor


def test_prompts_are_listable_and_readable(setup):
    client, _ = setup
    names = client.get("/api/prompts").json()["prompts"]
    assert {"cv_profile", "professional_update"}.issubset(set(names))
    content = client.get("/api/prompts/professional_update").json()["content"]
    assert "explicitly mentioned" in content


def test_edited_prompt_is_used_on_the_next_request(setup, tmp_path):
    client, extractor = setup

    marker = "ALWAYS TAG ACHIEVEMENTS WITH QUARTER"
    original = client.get("/api/prompts/cv_profile").json()["content"]
    response = client.put(
        "/api/prompts/cv_profile", json={"content": original + "\n" + marker}
    )
    assert response.status_code == 200
    assert marker in response.json()["content"]

    # Trigger an extraction that uses the CV prompt — the edited text must reach the extractor.
    import docx

    doc = docx.Document()
    doc.add_heading("Vivek Subramanian", level=1)
    cv = tmp_path / "cv.docx"
    doc.save(str(cv))
    from doc_ingest import CVProfile

    with open(cv, "rb") as f:
        client.post("/api/documents", files={"document": ("cv.docx", f)})
    cv_instructions = extractor.instructions_by_schema.get(CVProfile)
    assert cv_instructions is not None
    assert marker in cv_instructions


def test_unknown_prompt_is_404(setup):
    client, _ = setup
    assert client.get("/api/prompts/nope").status_code == 404
    assert client.put("/api/prompts/nope", json={"content": "x"}).status_code == 404
