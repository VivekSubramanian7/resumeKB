import {
  getAccessToken,
  getSession,
  initAuth,
  isAuthRequired,
  onAuthStateChange,
  signIn,
  signOut,
  signUp,
} from "./auth.js";

const MAX_SECONDS = 120;

const $ = (id) => document.getElementById(id);

const state = {
  recording: false,
  mediaRecorder: null,
  chunks: [],
  timerInterval: null,
  elapsed: 0,
  activeType: "",
  entries: [],
  searchMode: false,
  appConfig: null,
};

const promptCache = {};

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = await getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && isAuthRequired()) {
    await signOut();
    showAuthPanel();
  }
  return res;
}

function updateDemoBanner() {
  const banner = $("demo-banner");
  if (!banner) return;
  banner.hidden = !state.appConfig || state.appConfig.extractor_backend !== "fake";
}

function showAuthPanel(message = "") {
  $("auth-panel").hidden = false;
  document.querySelector(".page").hidden = true;
  $("user-menu").hidden = true;
  $("admin-toggle").hidden = true;
  $("demo-banner").hidden = true;
  const err = $("auth-error");
  if (message) {
    err.textContent = message;
    err.hidden = false;
  } else {
    err.hidden = true;
    err.textContent = "";
  }
}

function showApp(session) {
  $("auth-panel").hidden = true;
  document.querySelector(".page").hidden = false;
  $("admin-toggle").hidden = false;
  updateDemoBanner();
  if (isAuthRequired() && session?.user) {
    $("user-email").textContent = session.user.email || "Signed in";
    $("user-menu").hidden = false;
  } else {
    $("user-menu").hidden = true;
  }
}

async function enterAuthenticatedApp() {
  showApp(await getSession());
  await loadEntries();
  await loadPrompts();
}

function setAuthError(message) {
  const err = $("auth-error");
  err.textContent = message;
  err.hidden = !message;
}

async function handleSignIn(event) {
  event.preventDefault();
  setAuthError("");
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  try {
    await signIn(email, password);
    await enterAuthenticatedApp();
  } catch (error) {
    setAuthError(error.message || "Sign in failed.");
  }
}

async function handleSignUp() {
  setAuthError("");
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  try {
    const { session } = await signUp(email, password);
    if (!session) {
      setAuthError("Check your email to confirm your account, then sign in.");
      return;
    }
    await enterAuthenticatedApp();
  } catch (error) {
    setAuthError(error.message || "Sign up failed.");
  }
}

async function handleSignOut() {
  await signOut();
  showAuthPanel();
}

// --- Recorder ---

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.chunks = [];
    state.elapsed = 0;
    state.mediaRecorder = new MediaRecorder(stream, { mimeType: pickMimeType() });

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.chunks.push(e.data);
    };

    state.mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      uploadRecording();
    };

    state.mediaRecorder.start(250);
    state.recording = true;
    updateRecordUI();
    setStatus("Recording… speak clearly about your professional work.");
    startTimer();
  } catch {
    setStatus("Microphone access denied — allow microphone permission and try again.");
  }
}

function pickMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function stopRecording() {
  if (state.mediaRecorder && state.recording) {
    state.mediaRecorder.stop();
    state.recording = false;
    stopTimer();
    updateRecordUI();
    setStatus("Transcribing and updating knowledge base…");
  }
}

function startTimer() {
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.elapsed += 1;
    updateTimerDisplay();
    if (state.elapsed >= MAX_SECONDS - 10) {
      $("timer").classList.add("timer-warn");
    }
    if (state.elapsed >= MAX_SECONDS) {
      stopRecording();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  $("timer").classList.remove("timer-warn");
}

function updateTimerDisplay() {
  const m = Math.floor(state.elapsed / 60);
  const s = state.elapsed % 60;
  $("timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
}

function updateRecordUI() {
  const btn = $("record-btn");
  const label = btn.querySelector(".record-label");
  const hero = document.querySelector(".recorder-hero");
  if (state.recording) {
    btn.classList.add("recording");
    btn.setAttribute("aria-label", "Stop recording");
    label.textContent = "Stop";
    hero.classList.add("is-recording");
  } else {
    btn.classList.remove("recording");
    btn.setAttribute("aria-label", "Start recording");
    label.textContent = "Record";
    hero.classList.remove("is-recording");
  }
}

async function uploadRecording() {
  const blob = new Blob(state.chunks, { type: state.mediaRecorder?.mimeType || "audio/webm" });
  const form = new FormData();
  form.append("audio", blob, "note.webm");

  try {
    const res = await apiFetch("/api/notes", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.detail || "Upload failed.", "error");
      return;
    }
    showTranscript(data.transcript);
    notifyIngestResult(data);
    await loadEntries();
    highlightChangedEntries(data.changes);
  } catch {
    setStatus("Network error — could not upload recording.", "error");
  }
}

function showTranscript(text) {
  const el = $("transcript");
  el.textContent = text;
  el.hidden = false;
}

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = `status${kind ? ` status-${kind}` : ""}`;
}

function notifyIngestResult(data) {
  const message = data.message || "Processing complete.";
  const kind = data.extraction_mode === "fake" ? "warn" : data.kb_updated ? "success" : "warn";
  setStatus(message, kind);
}

function highlightChangedEntries(changes = []) {
  const touched = new Set(
    changes.filter((c) => c.action === "created" || c.action === "updated").map((c) => c.slug),
  );
  document.querySelectorAll(".entry-item").forEach((btn) => {
    const slug = btn.dataset.slug;
    btn.classList.toggle("entry-new", slug && touched.has(slug));
  });
}

function applySourceResult(card, data, fallbackError) {
  if (!data) {
    setSourceStatus(card, fallbackError, "error");
    return;
  }
  const kind = data.extraction_mode === "fake" ? "warn" : data.kb_updated ? "success" : "warn";
  setSourceStatus(card, data.message || "Processing complete.", kind);
}

async function loadAppConfig() {
  const res = await fetch("/api/config");
  const cfg = await res.json();
  state.appConfig = cfg;
  return cfg;
}

// --- Sources ---

function setSourceStatus(card, msg, kind = "") {
  const el = card.querySelector(".source-status");
  el.textContent = msg;
  el.className = `source-status${kind ? ` ${kind}` : ""}`;
}

async function uploadCV(file) {
  const card = document.querySelector('[data-source="cv"]');
  const btn = $("cv-upload-btn");
  setSourceStatus(card, "Uploading…");
  btn.disabled = true;
  const form = new FormData();
  form.append("document", file);
  try {
    const res = await apiFetch("/api/documents", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setSourceStatus(card, data.detail || "Upload failed.", "error");
      return;
    }
    applySourceResult(card, data);
    await loadEntries();
    highlightChangedEntries(data.changes);
  } catch {
    setSourceStatus(card, "Network error.", "error");
  } finally {
    btn.disabled = false;
  }
}

async function importGitHub(username) {
  const card = document.querySelector('[data-source="github"]');
  setSourceStatus(card, "Fetching profile…");
  try {
    const res = await apiFetch("/api/sources/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSourceStatus(card, data.detail || "Import failed.", "error");
      return;
    }
    applySourceResult(card, data);
    await loadEntries();
    highlightChangedEntries(data.changes);
  } catch {
    setSourceStatus(card, "Network error.", "error");
  }
}

async function uploadLinkedIn(file) {
  const card = document.querySelector('[data-source="linkedin"]');
  setSourceStatus(card, "Parsing export…");
  const form = new FormData();
  form.append("export", file);
  try {
    const res = await apiFetch("/api/sources/linkedin", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setSourceStatus(card, data.detail || "Upload failed.", "error");
      return;
    }
    applySourceResult(card, data);
    await loadEntries();
    highlightChangedEntries(data.changes);
  } catch {
    setSourceStatus(card, "Network error.", "error");
  }
}

async function uploadTextNote(file) {
  const card = document.querySelector('[data-source="text-note"]');
  const btn = $("text-note-btn");
  setSourceStatus(card, "Processing…");
  btn.disabled = true;
  const form = new FormData();
  form.append("document", file);
  try {
    const res = await apiFetch("/api/notes/text", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setSourceStatus(card, data.detail || "Upload failed.", "error");
      return;
    }
    applySourceResult(card, data);
    await loadEntries();
    highlightChangedEntries(data.changes);
  } catch {
    setSourceStatus(card, "Network error.", "error");
  } finally {
    btn.disabled = false;
  }
}

// --- Knowledge base ---

async function loadEntries(type = state.activeType) {
  const url = type ? `/api/kb/entries?type=${encodeURIComponent(type)}` : "/api/kb/entries";
  const res = await apiFetch(url);
  if (!res.ok) {
    return;
  }
  state.entries = await res.json();
  renderEntryList();
}

function renderEntryList() {
  const list = $("notes-list");
  list.innerHTML = "";
  const empty = $("empty-list");

  if (state.searchMode) return;

  if (!state.entries.length) {
    empty.hidden = false;
    $("entry-detail").hidden = true;
    return;
  }
  empty.hidden = true;

  for (const entry of state.entries) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "entry-item";
    btn.dataset.slug = entry.slug;
    btn.innerHTML = `<span class="entry-type-tag">${entry.entry_type}</span>${escapeHtml(entry.title)}`;
    btn.addEventListener("click", () => showEntry(entry.slug));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function showEntry(slug) {
  const res = await apiFetch(`/api/kb/entries/${encodeURIComponent(slug)}`);
  if (!res.ok) return;
  const entry = await res.json();
  $("entry-title").textContent = entry.title;
  $("entry-body").innerHTML = renderBody(entry.body);
  $("entry-detail").hidden = false;
  document.querySelectorAll(".entry-item").forEach((el) => {
    el.classList.toggle("active", el.textContent.includes(entry.title));
  });
}

function renderBody(body) {
  return escapeHtml(body)
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '<span class="wikilink">$1</span>')
    .replace(/\n/g, "<br>");
}

async function searchEntries(query) {
  const results = $("search-results");
  if (!query.trim()) {
    state.searchMode = false;
    results.hidden = true;
    results.innerHTML = "";
    renderEntryList();
    return;
  }
  state.searchMode = true;
  const res = await apiFetch(`/api/kb/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    return;
  }
  const hits = await res.json();
  results.innerHTML = "";
  results.hidden = false;
  $("entry-detail").hidden = true;

  if (!hits.length) {
    const li = document.createElement("li");
    li.textContent = "No matches.";
    li.className = "search-empty";
    results.appendChild(li);
    return;
  }

  for (const hit of hits) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-hit";
    btn.innerHTML = `<strong>${escapeHtml(hit.title)}</strong><span class="snippet">${escapeHtml(hit.snippet)}</span>`;
    btn.addEventListener("click", () => {
      state.searchMode = false;
      results.hidden = true;
      showEntry(hit.slug);
    });
    li.appendChild(btn);
    results.appendChild(li);
  }
}

// --- Prompts (admin) ---

async function loadPrompts() {
  const res = await apiFetch("/api/prompts");
  if (!res.ok) {
    return;
  }
  const data = await res.json();
  const select = $("prompt-select");
  select.innerHTML = "";
  await Promise.all(
    data.prompts.map(async (name) => {
      const pr = await apiFetch(`/api/prompts/${encodeURIComponent(name)}`);
      const pd = await pr.json();
      promptCache[name] = pd.content;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }),
  );
  if (data.prompts.length) {
    loadPromptContent(data.prompts[0]);
  }
}

function loadPromptContent(name) {
  if (name in promptCache) {
    $("prompt-editor").value = promptCache[name];
  }
}

async function savePrompt() {
  const name = $("prompt-select").value;
  const content = $("prompt-editor").value;
  const feedback = document.querySelector(".prompt-feedback");
  try {
    const res = await apiFetch(`/api/prompts/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) {
      feedback.textContent = data.detail || "Save failed.";
      feedback.className = "prompt-feedback error";
      return;
    }
    feedback.textContent = "Saved.";
    feedback.className = "prompt-feedback success";
    promptCache[name] = content;
  } catch {
    feedback.textContent = "Network error.";
    feedback.className = "prompt-feedback error";
  }
}

function toggleAdmin() {
  const btn = $("admin-toggle");
  const panel = $("prompt-panel");
  const pressed = btn.getAttribute("aria-pressed") === "true";
  btn.setAttribute("aria-pressed", String(!pressed));
  panel.hidden = pressed;
  btn.classList.toggle("active", !pressed);
  if (!pressed) {
    loadPromptContent($("prompt-select").value);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Init ---

function bindEvents() {
  $("record-btn").addEventListener("click", () => {
    if (state.recording) stopRecording();
    else startRecording();
  });

  $("cv-upload-btn").addEventListener("click", () => $("cv-input").click());
  $("cv-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadCV(file);
    e.target.value = "";
  });

  $("github-btn").addEventListener("click", () => {
    const username = $("github-input").value.trim();
    if (username) importGitHub(username);
  });
  $("github-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("github-btn").click();
  });

  $("linkedin-btn").addEventListener("click", () => $("linkedin-input").click());
  $("linkedin-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadLinkedIn(file);
    e.target.value = "";
  });

  $("text-note-btn").addEventListener("click", () => $("text-note-input").click());
  $("text-note-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) uploadTextNote(file);
    e.target.value = "";
  });

  let searchDebounce;
  $("search-input").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchEntries(e.target.value), 200);
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.activeType = chip.dataset.type;
      loadEntries(state.activeType);
    });
  });

  $("admin-toggle").addEventListener("click", toggleAdmin);
  $("prompt-select").addEventListener("change", (e) => loadPromptContent(e.target.value));
  $("prompt-save-btn").addEventListener("click", savePrompt);
  $("auth-form").addEventListener("submit", handleSignIn);
  $("sign-up-btn").addEventListener("click", handleSignUp);
  $("sign-out-btn").addEventListener("click", handleSignOut);
}

async function init() {
  bindEvents();
  try {
    const cfg = await loadAppConfig();
    await initAuth(cfg);

    if (isAuthRequired()) {
      onAuthStateChange(async (_event, session) => {
        if (session) {
          if (document.querySelector(".page").hidden) {
            await enterAuthenticatedApp();
          } else {
            showApp(session);
          }
        } else {
          showAuthPanel();
        }
      });
      const session = await getSession();
      if (!session) {
        showAuthPanel();
        return;
      }
      await enterAuthenticatedApp();
      return;
    }

    showApp(null);
    await loadEntries();
    await loadPrompts();
  } catch (error) {
    showAuthPanel(error.message || "Failed to start the app.");
  }
}

init();
