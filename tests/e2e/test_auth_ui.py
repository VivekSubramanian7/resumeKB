"""Browser E2E: login gate hides record, KB, and import UI until authenticated."""

import threading
import time

import pytest
import uvicorn
from playwright.sync_api import sync_playwright

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = [pytest.mark.e2e, pytest.mark.browser]

PORT = 8766


@pytest.fixture()
def auth_required_server(tmp_path, prompts_dir):
    settings = Settings(
        kb_data_dir=tmp_path / "kb-data",
        prompts_root=prompts_dir,
        extractor_backend="fake",
        auth_disabled=False,
        supabase_url="https://example.supabase.co",
        supabase_anon_key="test-anon-key",
    )
    config = uvicorn.Config(create_app(settings), host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 15
    while not server.started:
        if time.time() > deadline:
            raise RuntimeError("uvicorn did not start")
        time.sleep(0.1)
    yield f"http://127.0.0.1:{PORT}"
    server.should_exit = True
    thread.join(timeout=10)


def test_unauthenticated_user_sees_login_not_app(auth_required_server):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(auth_required_server)

        page.wait_for_selector("#auth-panel", state="visible")
        assert page.locator("#auth-email").is_visible()
        assert page.locator("#auth-password").is_visible()

        assert page.locator("main.page").is_hidden()
        assert page.locator("#record-btn").is_hidden()
        assert page.locator(".sources-row").is_hidden()
        assert page.locator(".kb-browser").is_hidden()
        assert page.locator("#admin-toggle").is_hidden()
        assert page.locator("#user-menu").is_hidden()

        browser.close()
