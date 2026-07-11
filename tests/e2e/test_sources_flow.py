import zipfile

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from resume_kb_server.app import create_app
from helpers import e2e_settings, user_kb_root

pytestmark = pytest.mark.e2e
GITHUB = "https://api.github.com"


@pytest.fixture()
def client(tmp_path, prompts_dir):
    return TestClient(create_app(e2e_settings(tmp_path, prompts_root=prompts_dir)))


@respx.mock
def test_github_ingest_end_to_end(client, tmp_path):
    respx.get(f"{GITHUB}/users/vivek").mock(
        return_value=Response(200, json={"login": "vivek", "name": "Vivek", "bio": "eng"})
    )
    respx.get(f"{GITHUB}/users/vivek/repos").mock(
        return_value=Response(
            200,
            json=[
                {
                    "name": "payments-svc",
                    "description": "Payments",
                    "fork": False,
                    "stargazers_count": 3,
                    "topics": [],
                },
            ],
        )
    )
    respx.get(f"{GITHUB}/repos/vivek/payments-svc/languages").mock(
        return_value=Response(200, json={"Python": 100})
    )
    respx.get(f"{GITHUB}/repos/vivek/payments-svc/readme").mock(
        return_value=Response(200, text="# payments-svc")
    )

    response = client.post("/api/sources/github", json={"username": "vivek"})
    assert response.status_code == 200, response.text
    assert response.json()["repos"] == 1
    assert (user_kb_root(tmp_path) / "project" / "project-payments-svc.md").exists()
    assert (user_kb_root(tmp_path) / "skill" / "skill-python.md").exists()


def test_linkedin_ingest_end_to_end(client, tmp_path):
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr(
            "Profile.csv",
            "First Name,Last Name,Headline,Summary\nVivek,Subramanian,Engineer,Builds things.\n",
        )
        z.writestr("Skills.csv", "Name\nGo\n")

    with open(zip_path, "rb") as f:
        response = client.post("/api/sources/linkedin", files={"export": ("export.zip", f)})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Vivek Subramanian"
    assert (user_kb_root(tmp_path) / "person" / "person-vivek-subramanian.md").exists()
    assert (user_kb_root(tmp_path) / "skill" / "skill-go.md").exists()


def test_cross_source_merge(client, tmp_path):
    """The same skill arriving from two sources merges into one entry with both sources."""
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr("Profile.csv", "First Name,Last Name,Headline,Summary\nV,S,,\n")
        z.writestr("Skills.csv", "Name\nPython\n")
    with open(zip_path, "rb") as f:
        client.post("/api/sources/linkedin", files={"export": ("export.zip", f)})

    with respx.mock:
        respx.get(f"{GITHUB}/users/v").mock(
            return_value=Response(200, json={"login": "v", "name": "V", "bio": ""})
        )
        respx.get(f"{GITHUB}/users/v/repos").mock(
            return_value=Response(
                200,
                json=[
                    {
                        "name": "r",
                        "description": "",
                        "fork": False,
                        "stargazers_count": 0,
                        "topics": [],
                    },
                ],
            )
        )
        respx.get(f"{GITHUB}/repos/v/r/languages").mock(
            return_value=Response(200, json={"Python": 1})
        )
        respx.get(f"{GITHUB}/repos/v/r/readme").mock(return_value=Response(404))
        client.post("/api/sources/github", json={"username": "v"})

    detail = client.get("/api/kb/entries/skill-python").json()
    assert "linkedin-export" in detail["sources"]
    assert "github:v" in detail["sources"]
