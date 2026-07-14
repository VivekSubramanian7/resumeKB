# Unified Capture Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign CaptureView from scattered components (ProbeCard + RecordButton + SourcePills) into a single unified input card with an inline record button, contextual probe question, and source popover — inspired by Perplexity Pro's single-input-field pattern.

**Architecture:** One `UnifiedCaptureCard` component owns a textarea body, an optional probe section (shown only when triggered), and a bottom action bar containing a source `+` popover, a mode chip, a 40px inline record button (preserving the conic gradient orbit animation), and a send button. During recording, the textarea region swaps to show a timer/waveform. After stop, transcribed text fills the textarea for editing before send.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Card, Button, Textarea, Popover, Separator), @icon-park/react icons, existing `useRecorder` hook and `api` module.

## Global Constraints

- OKLCH design tokens only — use `var(--*)` CSS variables, never raw hex
- Type scale: 0.75rem / 1rem / 1.25rem / 1.5rem — no other sizes
- Icons: `@icon-park/react`, theme="outline", size per-context, strokeWidth={3}
- Fonts: Bricolage Grotesque (body), Instrument Serif (display/italic for probe question)
- Animations must respect `prefers-reduced-motion` (already enforced globally in index.css)
- No new npm dependencies — everything needed is already installed
- File paths relative to: `apps/web/src/`

---

### Task 1: Install Popover component from shadcn

**Files:**
- Create: `apps/web/src/components/ui/popover.tsx`

**Interfaces:**
- Consumes: nothing (shadcn generated component)
- Produces: `<Popover>`, `<PopoverTrigger>`, `<PopoverContent>` — used by Task 3

- [ ] **Step 1: Add the shadcn popover component**

Run from `apps/web/`:
```bash
npx shadcn@latest add popover
```

This creates `src/components/ui/popover.tsx` with Radix Popover primitives.

- [ ] **Step 2: Verify it exists and compiles**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors (zero exit code)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/popover.tsx
git commit -m "feat(web): add shadcn popover component for source menu"
```

---

### Task 2: Create InlineRecordButton component

The existing `RecordButton` is a 140px hero component with rings, ripples, timer text, and a hint paragraph. The unified card needs a compact 40px version that keeps the conic gradient orbit and breathe animation but drops the surrounding decoration. We create a new `InlineRecordButton` rather than modifying the existing one (which can be deleted later).

**Files:**
- Create: `apps/web/src/components/InlineRecordButton.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `<InlineRecordButton isRecording={bool} onToggle={fn} disabled={bool} />` — used by Task 4

- [ ] **Step 1: Create the component file**

```tsx
// apps/web/src/components/InlineRecordButton.tsx

interface InlineRecordButtonProps {
  isRecording: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function InlineRecordButton({ isRecording, onToggle, disabled }: InlineRecordButtonProps) {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      {/* Conic gradient orbit ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, var(--accent), transparent 40%, var(--accent-soft) 60%, transparent 80%, var(--accent))",
          animation: `orbit ${isRecording ? "2s" : "8s"} linear infinite`,
          opacity: isRecording ? 0.9 : 0.4,
          transition: "opacity 0.6s ease",
        }}
      >
        <div className="absolute inset-[2px] rounded-full bg-[var(--surface)]" />
      </div>

      {/* Ripple — recording only */}
      {isRecording && (
        <span className="absolute inset-0 rounded-full border border-[var(--accent)]/60 animate-[record-ripple_2s_ease-out_infinite]" />
      )}

      {/* Button */}
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
        className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: isRecording
            ? "linear-gradient(135deg, var(--warm), oklch(0.6 0.2 20))"
            : "linear-gradient(135deg, var(--accent), oklch(0.55 0.22 310))",
          boxShadow: isRecording
            ? "0 0 16px var(--warm)"
            : "0 2px 12px var(--accent-glow)",
          animation: isRecording ? "none" : "breathe 3s ease-in-out infinite",
        }}
      >
        <span
          className="block bg-white/90 transition-all duration-300 ease-[var(--ease-out-expo)]"
          style={{
            width: isRecording ? "10px" : "8px",
            height: isRecording ? "10px" : "8px",
            borderRadius: isRecording ? "2px" : "50%",
          }}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/InlineRecordButton.tsx
git commit -m "feat(web): add InlineRecordButton (40px compact version with orbit)"
```

---

### Task 3: Create SourcePopover component

Replaces the 2x2 grid `SourcePills`. The `+` button in the action bar opens a popover with the four source options stacked vertically.

**Files:**
- Create: `apps/web/src/components/SourcePopover.tsx`

**Interfaces:**
- Consumes: `<Popover>`, `<PopoverTrigger>`, `<PopoverContent>` from Task 1
- Produces: `<SourcePopover onUploadCV={fn} onGitHub={fn} onLinkedIn={fn} onTextFile={fn} />` — used by Task 4

- [ ] **Step 1: Create the component file**

```tsx
// apps/web/src/components/SourcePopover.tsx
import { useRef } from "react";
import { Plus, Upload, Github, FileText } from "@icon-park/react";
import { LinkOne } from "@icon-park/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SourcePopoverProps {
  onUploadCV: (file: File) => void;
  onGitHub: () => void;
  onLinkedIn: (file: File) => void;
  onTextFile: (file: File) => void;
}

export function SourcePopover({ onUploadCV, onGitHub, onLinkedIn, onTextFile }: SourcePopoverProps) {
  const cvRef = useRef<HTMLInputElement>(null);
  const linkedInRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 rounded-full border border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--border)]"
          aria-label="Import sources"
        >
          <Plus theme="outline" size={16} strokeWidth={3} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-48 p-1 bg-[var(--surface-raised)] border-[var(--border-subtle)] rounded-[var(--radius-sm)]"
      >
        <button
          className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-[0.75rem] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors"
          onClick={() => cvRef.current?.click()}
        >
          <Upload theme="outline" size={14} strokeWidth={3} />
          Upload CV
        </button>
        <input
          ref={cvRef}
          type="file"
          accept=".pdf,.docx"
          hidden
          onChange={(e) => { if (e.target.files?.[0]) { onUploadCV(e.target.files[0]); e.target.value = ""; } }}
        />

        <button
          className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-[0.75rem] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors"
          onClick={onGitHub}
        >
          <Github theme="outline" size={14} strokeWidth={3} />
          GitHub
        </button>

        <button
          className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-[0.75rem] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors"
          onClick={() => linkedInRef.current?.click()}
        >
          <LinkOne theme="outline" size={14} strokeWidth={3} />
          LinkedIn
        </button>
        <input
          ref={linkedInRef}
          type="file"
          accept=".zip"
          hidden
          onChange={(e) => { if (e.target.files?.[0]) { onLinkedIn(e.target.files[0]); e.target.value = ""; } }}
        />

        <button
          className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-[0.75rem] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors"
          onClick={() => textRef.current?.click()}
        >
          <FileText theme="outline" size={14} strokeWidth={3} />
          Text file
        </button>
        <input
          ref={textRef}
          type="file"
          accept=".txt"
          hidden
          onChange={(e) => { if (e.target.files?.[0]) { onTextFile(e.target.files[0]); e.target.value = ""; } }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SourcePopover.tsx
git commit -m "feat(web): add SourcePopover (replaces grid source pills)"
```

---

### Task 4: Build the UnifiedCaptureCard component

The main deliverable. A single card that contains:
- (optional) Probe question section at top, shown only when `probeVisible` is true
- Textarea body (editable, placeholder "Speak or type a note...")
- Recording state: replaces textarea content with timer display
- Action bar: SourcePopover | mode chip | InlineRecordButton | Send button

**Files:**
- Create: `apps/web/src/components/UnifiedCaptureCard.tsx`

**Interfaces:**
- Consumes:
  - `<InlineRecordButton>` from Task 2
  - `<SourcePopover>` from Task 3
  - `useRecorder(maxSeconds)` from `@/hooks/use-recorder`
  - `* as api` from `@/lib/api`
- Produces: `<UnifiedCaptureCard probeVisible={bool} probeQuestion={string} probeContext={string} onProbeSave={fn} onProbeSkip={fn} maxNoteSeconds={number} onUploadCV={fn} onGitHub={fn} onLinkedIn={fn} onTextFile={fn} />` — used by Task 5

- [ ] **Step 1: Create the component file**

```tsx
// apps/web/src/components/UnifiedCaptureCard.tsx
import { useState } from "react";
import { Send, Microphone } from "@icon-park/react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { InlineRecordButton } from "./InlineRecordButton";
import { SourcePopover } from "./SourcePopover";
import { useRecorder } from "@/hooks/use-recorder";
import * as api from "@/lib/api";

interface UnifiedCaptureCardProps {
  probeVisible: boolean;
  probeQuestion: string;
  probeContext: string;
  onProbeSave: (answer: string) => void;
  onProbeSkip: () => void;
  maxNoteSeconds: number;
  onUploadCV: (file: File) => void;
  onGitHub: () => void;
  onLinkedIn: (file: File) => void;
  onTextFile: (file: File) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function UnifiedCaptureCard({
  probeVisible,
  probeQuestion,
  probeContext,
  onProbeSave,
  onProbeSkip,
  maxNoteSeconds,
  onUploadCV,
  onGitHub,
  onLinkedIn,
  onTextFile,
}: UnifiedCaptureCardProps) {
  const { isRecording, elapsed, start, stop } = useRecorder(maxNoteSeconds);
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleRecord = async () => {
    if (isRecording) {
      const blob = await stop();
      if (blob) {
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        setIsUploading(true);
        try {
          const result = await api.upload("/api/notes", file, "audio");
          const msg = (result as { transcription?: string; message?: string }).transcription
            ?? (result as { message: string }).message;
          if (msg) setText(msg);
          toast.success("Recording captured");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Processing failed");
        } finally {
          setIsUploading(false);
        }
      }
    } else {
      try {
        await start();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Microphone access denied");
      }
    }
  };

  const handleSend = () => {
    if (!text.trim()) return;
    if (probeVisible) {
      onProbeSave(text.trim());
    } else {
      api.post("/api/notes/text", { content: text.trim() })
        .then((r) => toast.success((r as { message: string }).message))
        .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"));
    }
    setText("");
  };

  const canSend = text.trim().length > 0 && !isRecording && !isUploading;

  return (
    <Card className="w-full border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden">
      {/* Probe question section */}
      {probeVisible && (
        <div className="px-5 pt-5 pb-0 animate-[probe-enter_0.4s_var(--ease-out-expo)]">
          <p className="font-[var(--font-display)] text-[1.25rem] font-normal italic leading-[1.35] text-[var(--ink)]">
            {probeQuestion}
          </p>
          <p className="text-[0.75rem] text-[var(--ink-muted)] mt-1">
            {probeContext}
          </p>
          <div className="flex items-center justify-end mt-2">
            <Button
              variant="ghost"
              onClick={onProbeSkip}
              className="text-[0.75rem] text-[var(--ink-dim)] h-6 px-2"
            >
              Skip
            </Button>
          </div>
          <Separator className="mt-3 bg-[var(--border-subtle)]" />
        </div>
      )}

      {/* Textarea / Recording display */}
      <div className="px-5 py-4 min-h-[120px] flex items-start">
        {isRecording ? (
          <div className="flex flex-col items-center justify-center w-full gap-2 py-4">
            <div className="flex items-center gap-2">
              <Microphone theme="outline" size={16} strokeWidth={3} className="text-[var(--warm)]" />
              <span className="text-[1rem] font-medium text-[var(--ink)] tabular-nums">
                {formatTime(elapsed)}
              </span>
              <span className="text-[0.75rem] text-[var(--ink-dim)]">
                / {formatTime(maxNoteSeconds)}
              </span>
            </div>
            <p className="text-[0.75rem] text-[var(--ink-dim)]">Recording...</p>
          </div>
        ) : (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={probeVisible ? "Type or speak your answer..." : "Speak or type a note..."}
            className="min-h-[80px] border-none shadow-none resize-none bg-transparent text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus-visible:ring-0 p-0 text-[1rem]"
          />
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface)]">
        <SourcePopover
          onUploadCV={onUploadCV}
          onGitHub={onGitHub}
          onLinkedIn={onLinkedIn}
          onTextFile={onTextFile}
        />

        <span className="text-[0.75rem] text-[var(--ink-dim)] px-2">Voice</span>

        <div className="ml-auto flex items-center gap-2">
          <InlineRecordButton
            isRecording={isRecording}
            onToggle={handleRecord}
            disabled={isUploading}
          />
          <Button
            variant="ghost"
            size="icon"
            disabled={!canSend}
            onClick={handleSend}
            className="w-8 h-8 rounded-full text-[var(--accent)] disabled:opacity-30 hover:bg-[var(--accent-soft)]"
            aria-label="Send"
          >
            <Send theme="outline" size={16} strokeWidth={3} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Add `Send` and `Plus` to the Icon.tsx iconMap**

Modify `apps/web/src/components/Icon.tsx` to add the `Send` and `Plus` icons to the import and map. This is only needed if other components use the `<Icon>` wrapper for these — but since `UnifiedCaptureCard` and `SourcePopover` import directly from `@icon-park/react`, this step is optional. Skip if no other consumer needs them.

Actually, **skip this step** — the components import directly.

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/UnifiedCaptureCard.tsx
git commit -m "feat(web): add UnifiedCaptureCard (single input card with action bar)"
```

---

### Task 5: Rewrite CaptureView to use UnifiedCaptureCard

Replace the existing `CaptureView` internals. It becomes a thin wrapper that passes props through.

**Files:**
- Modify: `apps/web/src/views/CaptureView.tsx`

**Interfaces:**
- Consumes: `<UnifiedCaptureCard>` from Task 4
- Produces: Same `<CaptureView probeVisible onProbeDismiss maxNoteSeconds />` interface (App.tsx unchanged)

- [ ] **Step 1: Rewrite CaptureView.tsx**

```tsx
// apps/web/src/views/CaptureView.tsx
import { toast } from "sonner";
import { UnifiedCaptureCard } from "@/components/UnifiedCaptureCard";
import * as api from "@/lib/api";

interface CaptureViewProps {
  probeVisible: boolean;
  onProbeDismiss: () => void;
  maxNoteSeconds: number;
}

export function CaptureView({ probeVisible, onProbeDismiss, maxNoteSeconds }: CaptureViewProps) {
  const handleSaveProbe = (_answer: string) => {
    toast.success("Answer saved");
    onProbeDismiss();
  };

  const handleUploadCV = async (file: File) => {
    try {
      const result = await api.upload("/api/documents", file, "document");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const handleGitHub = () => {
    const username = prompt("GitHub username:");
    if (!username) return;
    api.post("/api/sources/github", { username })
      .then((r) => toast.success((r as { message: string }).message))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Import failed"));
  };

  const handleLinkedIn = async (file: File) => {
    try {
      const result = await api.upload("/api/sources/linkedin", file, "export");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const handleTextFile = async (file: File) => {
    try {
      const result = await api.upload("/api/notes/text", file, "document");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <UnifiedCaptureCard
        probeVisible={probeVisible}
        probeQuestion="What made you choose FastAPI over Django or Flask for this project?"
        probeContext='This connects your "resumeKB" project with "Python" and "API Design" skills.'
        onProbeSave={handleSaveProbe}
        onProbeSkip={onProbeDismiss}
        maxNoteSeconds={maxNoteSeconds}
        onUploadCV={handleUploadCV}
        onGitHub={handleGitHub}
        onLinkedIn={handleLinkedIn}
        onTextFile={handleTextFile}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/CaptureView.tsx
git commit -m "refactor(web): CaptureView now uses UnifiedCaptureCard"
```

---

### Task 6: Remove old components and clean up

Delete the components that are no longer imported anywhere.

**Files:**
- Delete: `apps/web/src/components/RecordButton.tsx`
- Delete: `apps/web/src/components/SourcePills.tsx`
- Delete: `apps/web/src/components/ProbeCard.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (cleanup task)

- [ ] **Step 1: Verify no remaining imports of the old components**

Run:
```bash
cd apps/web && grep -r "RecordButton\|SourcePills\|ProbeCard" src/ --include="*.tsx" --include="*.ts"
```
Expected: no matches (or only from the files being deleted themselves)

- [ ] **Step 2: Delete old files**

```bash
rm apps/web/src/components/RecordButton.tsx
rm apps/web/src/components/SourcePills.tsx
rm apps/web/src/components/ProbeCard.tsx
```

- [ ] **Step 3: Verify it still compiles**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add -u apps/web/src/components/RecordButton.tsx apps/web/src/components/SourcePills.tsx apps/web/src/components/ProbeCard.tsx
git commit -m "chore(web): remove old ProbeCard, RecordButton, SourcePills"
```

---

### Task 7: Visual polish and build verification

Final pass: adjust the App.tsx `max-w` for the capture view (the unified card benefits from slightly wider layout), run a production build to confirm no dead code errors.

**Files:**
- Modify: `apps/web/src/App.tsx` (line 75)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new (polish)

- [ ] **Step 1: Widen capture max-width from 520px to 560px**

In `apps/web/src/App.tsx`, change:
```tsx
className={`flex-1 w-full mx-auto px-6 pb-28 ${activeTab === "capture" ? "max-w-[520px] pt-12" : "max-w-[640px] pt-8"}`}
```
to:
```tsx
className={`flex-1 w-full mx-auto px-6 pb-28 ${activeTab === "capture" ? "max-w-[560px] pt-8" : "max-w-[640px] pt-8"}`}
```

(Also reduces `pt-12` to `pt-8` since the card no longer needs centering space for the large button.)

- [ ] **Step 2: Run production build**

```bash
cd apps/web && npm run build
```
Expected: build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "style(web): adjust capture layout for unified card"
```
