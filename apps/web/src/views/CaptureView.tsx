import { useState, useRef } from "react";
import { toast } from "sonner";
import { UnifiedCaptureCard } from "@/components/UnifiedCaptureCard";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";

interface ProbeData {
  question: string;
  context: string;
  related_entries: string[];
}

interface CaptureViewProps {
  probeVisible: boolean;
  probeData: ProbeData | null;
  onProbeTrigger: () => void;
  onProbeDismiss: () => void;
  maxNoteSeconds: number;
  onProcessingChange: (delta: 1 | -1) => void;
}

const HINT_CHIPS = [
  { label: "Upload CV", action: "cv" as const },
  { label: "Import GitHub", action: "github" as const },
  { label: "Answer a probe", action: "probe" as const },
];

export function CaptureView({ probeVisible, probeData, onProbeTrigger, onProbeDismiss, maxNoteSeconds, onProcessingChange }: CaptureViewProps) {
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [githubUsername, setGithubUsername] = useState("");
  const [hintHovered, setHintHovered] = useState<string | null>(null);
  const cvRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handleSaveProbe = (answer: string) => {
    api.post("/api/probe/answer", { text: answer })
      .then((r) => {
        toast.success((r as { message: string }).message);
        onProbeDismiss();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to save answer"));
  };

  const handleSkipProbe = () => {
    api.post("/api/probe/skip").catch(() => {});
    onProbeDismiss();
  };

  const handleUploadCV = async (file: File) => {
    onProcessingChange(1);
    try {
      const result = await api.upload("/api/documents", file, "document");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      onProcessingChange(-1);
    }
  };

  const openGithubDialog = () => {
    setGithubUsername("");
    setGithubDialogOpen(true);
    // Use native <dialog> — opened via state-driven show, not showModal, to avoid focus trap issues
    requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  const submitGithub = () => {
    const u = githubUsername.trim();
    if (!u) return;
    dialogRef.current?.close();
    setGithubDialogOpen(false);
    onProcessingChange(1);
    api.post("/api/sources/github", { username: u })
      .then((r) => toast.success((r as { message: string }).message))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Import failed"))
      .finally(() => onProcessingChange(-1));
  };

  const handleLinkedIn = async (file: File) => {
    onProcessingChange(1);
    try {
      const result = await api.upload("/api/sources/linkedin", file, "export");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      onProcessingChange(-1);
    }
  };

  const handleTextFile = async (file: File) => {
    onProcessingChange(1);
    try {
      const result = await api.upload("/api/notes/text", file, "document");
      toast.success((result as { message: string }).message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      onProcessingChange(-1);
    }
  };

  const handleHintClick = (action: typeof HINT_CHIPS[number]["action"]) => {
    if (action === "cv") cvRef.current?.click();
    else if (action === "github") openGithubDialog();
    else if (action === "probe") onProbeTrigger();
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full animate-[probe-enter_0.4s_var(--ease-out-expo)]">
      <UnifiedCaptureCard
        probeVisible={probeVisible}
        probeQuestion={probeData?.question ?? ""}
        probeContext={probeData?.context ?? ""}
        onProbeSave={handleSaveProbe}
        onProbeSkip={handleSkipProbe}
        onProbeTrigger={onProbeTrigger}
        maxNoteSeconds={maxNoteSeconds}
        onUploadCV={handleUploadCV}
        onGitHub={openGithubDialog}
        onLinkedIn={handleLinkedIn}
        onTextFile={handleTextFile}
        onProcessingChange={onProcessingChange}
      />

      {/* Empty-state hint chips */}
      <div className="flex flex-col items-center gap-3 w-full">
        <p className="text-[0.75rem] text-[var(--ink-dim)] tracking-wide">
          or get started with
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {HINT_CHIPS.map(({ label, action }) => (
            <button
              key={action}
              onMouseEnter={() => setHintHovered(action)}
              onMouseLeave={() => setHintHovered(null)}
              onClick={() => handleHintClick(action)}
              className="px-3.5 py-1.5 rounded-full border text-[0.75rem] transition-all duration-200"
              style={{
                borderColor: hintHovered === action ? "var(--accent)" : "var(--border-subtle)",
                color: hintHovered === action ? "var(--accent)" : "var(--ink-muted)",
                background: hintHovered === action ? "var(--accent-soft)" : "transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden CV input triggered by hint chip */}
      <input
        ref={cvRef}
        type="file"
        accept=".pdf,.docx"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) { handleUploadCV(e.target.files[0]); e.target.value = ""; }
        }}
      />

      {/* GitHub username dialog — native <dialog> for proper stacking */}
      {githubDialogOpen && (
        <dialog
          ref={dialogRef}
          onClose={() => setGithubDialogOpen(false)}
          onKeyDown={(e) => { if (e.key === "Enter") submitGithub(); }}
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-6 w-80 shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
          style={{ color: "var(--ink)" }}
        >
          <h2 className="text-[0.9375rem] font-medium mb-1">Import from GitHub</h2>
          <p className="text-[0.75rem] text-[var(--ink-muted)] mb-4">
            We'll fetch your public repos and extract project context.
          </p>
          <input
            autoFocus
            type="text"
            value={githubUsername}
            onChange={(e) => setGithubUsername(e.target.value)}
            placeholder="username"
            className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[0.875rem] text-[var(--ink)] placeholder:text-[var(--ink-dim)] outline-none focus:border-[var(--accent)] transition-colors duration-150 mb-4"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { dialogRef.current?.close(); setGithubDialogOpen(false); }}
              className="text-[var(--ink-muted)] text-[0.8125rem]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!githubUsername.trim()}
              onClick={submitGithub}
              className="bg-[var(--accent)] text-white hover:opacity-90 text-[0.8125rem] disabled:opacity-40"
            >
              Import
            </Button>
          </div>
        </dialog>
      )}
    </div>
  );
}
