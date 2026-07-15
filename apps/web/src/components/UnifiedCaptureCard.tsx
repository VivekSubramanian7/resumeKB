import { useState } from "react";
import { Send, Microphone, Brain } from "@icon-park/react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InlineRecordButton } from "./InlineRecordButton";
import { SourcePopover } from "./SourcePopover";
import { Waveform } from "./Waveform";
import { useRecorder } from "@/hooks/use-recorder";
import * as api from "@/lib/api";

interface UnifiedCaptureCardProps {
  probeVisible: boolean;
  onProbeSave: (answer: string) => void;
  onProbeTrigger: () => void;
  maxNoteSeconds: number;
  onUploadCV: (file: File) => void;
  onGitHub: () => void;
  onLinkedIn: (file: File) => void;
  onTextFile: (file: File) => void;
  onProcessingChange?: (delta: 1 | -1) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function UnifiedCaptureCard({
  probeVisible,
  onProbeSave,
  onProbeTrigger,
  maxNoteSeconds,
  onUploadCV,
  onGitHub,
  onLinkedIn,
  onTextFile,
  onProcessingChange,
}: UnifiedCaptureCardProps) {
  const { isRecording, elapsed, analyser, start, stop } = useRecorder(maxNoteSeconds);
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleRecord = async () => {
    if (isRecording) {
      const blob = await stop();
      if (blob) {
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        setIsUploading(true);
        onProcessingChange?.(1);
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
          onProcessingChange?.(-1);
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
      onProcessingChange?.(1);
      api.post("/api/notes/text", { content: text.trim() })
        .then((r) => toast.success((r as { message: string }).message))
        .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
        .finally(() => onProcessingChange?.(-1));
    }
    setText("");
  };

  const canSend = text.trim().length > 0 && !isRecording && !isUploading;

  return (
    <Card
      className="w-full border-[var(--border)] bg-[var(--surface-raised)] overflow-hidden animate-[probe-enter_0.35s_var(--ease-out-expo)]"
      style={{
        boxShadow: "var(--shadow-card), 0 0 0 1px var(--border-subtle)",
      }}
    >
      {/* Textarea / Recording display */}
      <div className="px-5 py-4 min-h-[120px] flex items-start">
        {isRecording ? (
          <div className="flex flex-col items-center justify-center w-full gap-1 py-2">
            <Waveform analyser={analyser} width={280} height={56} />
            <div className="flex items-center gap-2">
              <Microphone theme="outline" size={16} strokeWidth={3} className="text-[var(--warm)]" />
              <span className="text-[1rem] font-medium text-[var(--ink)] tabular-nums">
                {formatTime(elapsed)}
              </span>
              <span className="text-[0.75rem] text-[var(--ink-dim)]">
                / {formatTime(maxNoteSeconds)}
              </span>
            </div>
          </div>
        ) : (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={probeVisible ? "Type or speak your answer…" : "Speak or type a note…"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
            className="min-h-[80px] border-none shadow-none resize-none bg-transparent text-[var(--ink)] placeholder:text-[var(--ink-dim)] p-0 text-[1rem] outline-none focus-visible:ring-0 transition-[box-shadow] duration-200"
            style={{
              // ponytail: native box-shadow for glow since Tailwind ring bleeds outside card overflow:hidden
              boxShadow: text.length > 0 ? "none" : undefined,
            }}
          />
        )}
      </div>

      {/* Action bar — hairline top only, no background fill */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[var(--border-subtle)]">
        <SourcePopover
          onUploadCV={onUploadCV}
          onGitHub={onGitHub}
          onLinkedIn={onLinkedIn}
          onTextFile={onTextFile}
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onProbeTrigger}
            disabled={probeVisible}
            className="relative w-8 h-8 rounded-full border border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 transition-colors duration-200"
            aria-label="Answer a probe question"
            title="Answer a probe question"
          >
            <Brain theme="outline" size={15} strokeWidth={3} />
            {!probeVisible && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--warm)] border-2 border-[var(--surface-raised)]" />
            )}
          </Button>

          <InlineRecordButton
            isRecording={isRecording}
            onToggle={handleRecord}
            disabled={isUploading}
          />

          {/* Send — accent color only when active, dim when not */}
          <Button
            variant="ghost"
            size="icon"
            disabled={!canSend}
            onClick={handleSend}
            className="w-8 h-8 rounded-full transition-all duration-200 hover:bg-[var(--accent-soft)]"
            style={{
              color: canSend ? "var(--accent)" : "var(--ink-dim)",
            }}
            aria-label="Send"
            title="Send (⌘↵)"
          >
            <Send theme="outline" size={16} strokeWidth={3} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
