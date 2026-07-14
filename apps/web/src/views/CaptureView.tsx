import { useState } from "react";
import { toast } from "sonner";
import { ProbeCard } from "@/components/ProbeCard";
import { RecordButton } from "@/components/RecordButton";
import { SourcePills } from "@/components/SourcePills";
import * as api from "@/lib/api";
import { useRecorder } from "@/hooks/use-recorder";

interface CaptureViewProps {
  probeVisible: boolean;
  onProbeDismiss: () => void;
  maxNoteSeconds: number;
}

export function CaptureView({ probeVisible, onProbeDismiss, maxNoteSeconds }: CaptureViewProps) {
  const { isRecording, elapsed, start, stop } = useRecorder(maxNoteSeconds);
  const [isUploading, setIsUploading] = useState(false);

  const handleSaveProbe = (_answer: string) => {
    toast.success("Answer saved to KB");
    onProbeDismiss();
  };

  const handleRecord = async () => {
    if (isRecording) {
      const blob = await stop();
      if (blob) {
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        setIsUploading(true);
        try {
          const result = await api.upload("/api/notes", file, "audio");
          toast.success((result as { message: string }).message);
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
    <div className="flex flex-col items-center gap-10">
      {probeVisible && (
        <ProbeCard
          question="What made you choose FastAPI over Django or Flask for this project?"
          context='This connects your "resumeKB" project with "Python" and "API Design" skills.'
          onSave={handleSaveProbe}
          onSkip={onProbeDismiss}
        />
      )}

      <RecordButton
        isRecording={isRecording}
        elapsed={elapsed}
        maxSeconds={maxNoteSeconds}
        onToggle={handleRecord}
        disabled={isUploading}
      />

      <SourcePills
        onUploadCV={handleUploadCV}
        onGitHub={handleGitHub}
        onLinkedIn={handleLinkedIn}
        onTextFile={handleTextFile}
      />
    </div>
  );
}
