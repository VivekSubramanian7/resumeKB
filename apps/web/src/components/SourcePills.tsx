import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";

interface SourcePillsProps {
  onUploadCV: (file: File) => void;
  onGitHub: () => void;
  onLinkedIn: (file: File) => void;
  onTextFile: (file: File) => void;
}

export function SourcePills({ onUploadCV, onGitHub, onLinkedIn, onTextFile }: SourcePillsProps) {
  const cvRef = useRef<HTMLInputElement>(null);
  const linkedInRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="w-full flex items-center gap-4 text-[0.75rem] text-[var(--ink-dim)] tracking-wider">
        <span className="flex-1 h-px bg-[var(--border-subtle)]" />
        or import from
        <span className="flex-1 h-px bg-[var(--border-subtle)]" />
      </div>

      <div className="w-full grid grid-cols-2 gap-2.5">
        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={() => cvRef.current?.click()}
        >
          <Icon name="Upload" size={14} />
          Upload CV
        </Button>
        <input ref={cvRef} type="file" accept=".pdf,.docx" hidden onChange={(e) => { if (e.target.files?.[0]) { onUploadCV(e.target.files[0]); e.target.value = ""; } }} />

        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={onGitHub}
        >
          <Icon name="Github" size={14} />
          GitHub
        </Button>

        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={() => linkedInRef.current?.click()}
        >
          <Icon name="LinkOne" size={14} />
          LinkedIn
        </Button>
        <input ref={linkedInRef} type="file" accept=".zip" hidden onChange={(e) => { if (e.target.files?.[0]) { onLinkedIn(e.target.files[0]); e.target.value = ""; } }} />

        <Button
          variant="outline"
          className="justify-start gap-2 border-[var(--border-subtle)] bg-[var(--surface)] text-[0.75rem] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={() => textRef.current?.click()}
        >
          <Icon name="FileText" size={14} />
          Text file
        </Button>
        <input ref={textRef} type="file" accept=".txt" hidden onChange={(e) => { if (e.target.files?.[0]) { onTextFile(e.target.files[0]); e.target.value = ""; } }} />
      </div>
    </>
  );
}
