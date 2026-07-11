"""Browser E2E: fake microphone feeds real speech WAV → recorder → server → KB list updates."""

import threading
import time

import pytest
import uvicorn
from playwright.sync_api import sync_playwright

from resume_kb_server.app import create_app
from helpers import e2e_settings

pytestmark = [pytest.mark.e2e, pytest.mark.browser, pytest.mark.transcription]

PORT = 8765


@pytest.fixture()
def live_server(tmp_path, prompts_dir):
    settings = e2e_settings(
        tmp_path,
        prompts_root=prompts_dir,
        whisper_model="tiny",
        whisper_device="cpu",
        whisper_compute_type="int8",
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


@pytest.fixture()
def page(live_server, speech_wav):
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                f"--use-file-for-fake-audio-capture={speech_wav}",
            ]
        )
        context = browser.new_context(permissions=["microphone"])
        page = context.new_page()
        page.goto(live_server)
        yield page
        browser.close()


def test_record_and_save_note_in_browser(page):
    page.click("#record-btn")  # start
    page.wait_for_timeout(4000)  # capture ~4s of the fake mic (our speech wav)
    page.click("#record-btn")  # stop → upload

    page.wait_for_selector("#status:has-text('Saved')", timeout=120_000)
    assert page.locator("#transcript").inner_text().strip() != ""
    # Fake extractor is deterministic → these entries must appear in the list.
    page.wait_for_selector("#notes-list li:has-text('Python')")
    page.wait_for_selector("#notes-list li:has-text('Payment Gateway Migration')")


def test_prompt_editor_is_admin_gated_and_roundtrips(page):
    # Hidden for regular users by default.
    assert not page.locator("#prompt-panel").is_visible()

    # Admin toggle reveals it.
    page.click("#admin-toggle")
    page.wait_for_selector("#prompt-panel", state="visible")

    page.select_option("#prompt-select", "professional_update")
    editor = page.locator("#prompt-editor")
    original = editor.input_value()
    assert "explicitly mentioned" in original

    editor.fill(original + "\nBROWSER EDIT MARKER")
    page.click("#prompt-save-btn")
    page.reload()
    assert not page.locator("#prompt-panel").is_visible()  # gate resets on reload
    page.click("#admin-toggle")
    page.select_option("#prompt-select", "professional_update")
    assert "BROWSER EDIT MARKER" in page.locator("#prompt-editor").input_value()
