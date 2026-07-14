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
