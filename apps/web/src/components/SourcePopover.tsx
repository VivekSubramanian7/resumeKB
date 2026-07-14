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
