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
};

const promptCache = {};

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
    const res = await fetch("/api/notes", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.detail || "Upload failed.");
      return;
    }
    const count = data.entries?.length || 0;
    setStatus(`Saved — ${count} knowledge base ${count === 1 ? "entry" : "entries"} updated.`);
    showTranscript(data.transcript);
    await loadEntries();
  } catch {
    setStatus("Network error — could not upload recording.");
  }
}

function showTranscript(text) {
  const el = $("transcript");
  el.textContent = text;
  el.hidden = false;
}

function setStatus(msg) {
  $("status").textContent = msg;
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
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setSourceStatus(card, data.detail || "Upload failed.", "error");
      return;
    }
    setSourceStatus(card, `Imported ${data.name} — ${data.entries?.length || 0} entries.`, "success");
    await loadEntries();
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
    const res = await fetch("/api/sources/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSourceStatus(card, data.detail || "Import failed.", "error");
      return;
    }
    setSourceStatus(
      card,
      `Imported @${data.username} — ${data.repos} repos, ${data.entries?.length || 0} entries.`,
      "success",
    );
    await loadEntries();
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
    const res = await fetch("/api/sources/linkedin", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setSourceStatus(card, data.detail || "Upload failed.", "error");
      return;
    }
    setSourceStatus(
      card,
      `Imported ${data.name || "profile"} — ${data.entries?.length || 0} entries.`,
      "success",
    );
    await loadEntries();
  } catch {
    setSourceStatus(card, "Network error.", "error");
  }
}

// --- Knowledge base ---

async function loadEntries(type = state.activeType) {
  const url = type ? `/api/kb/entries?type=${encodeURIComponent(type)}` : "/api/kb/entries";
  const res = await fetch(url);
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
    btn.innerHTML = `<span class="entry-type-tag">${entry.entry_type}</span>${escapeHtml(entry.title)}`;
    btn.addEventListener("click", () => showEntry(entry.slug));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function showEntry(slug) {
  const res = await fetch(`/api/kb/entries/${encodeURIComponent(slug)}`);
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
  const res = await fetch(`/api/kb/search?q=${encodeURIComponent(query)}`);
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
  const res = await fetch("/api/prompts");
  const data = await res.json();
  const select = $("prompt-select");
  select.innerHTML = "";
  await Promise.all(
    data.prompts.map(async (name) => {
      const pr = await fetch(`/api/prompts/${encodeURIComponent(name)}`);
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
    const res = await fetch(`/api/prompts/${encodeURIComponent(name)}`, {
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
}

async function init() {
  bindEvents();
  await loadEntries();
  await loadPrompts();
}

init();
