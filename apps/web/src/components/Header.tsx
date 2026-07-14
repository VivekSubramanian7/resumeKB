import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  username: string;
  hasProbeQuestion: boolean;
  onProbeTrigger: () => void;
}

export function Header({ username, hasProbeQuestion, onProbeTrigger }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg)]/80 backdrop-blur-xl">
      <h1 className="font-[var(--font-display)] text-[1.25rem] font-normal tracking-tight">
        resumeKB
      </h1>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="relative w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface-raised)]"
          onClick={onProbeTrigger}
          aria-label="Answer a probe question"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-[probe-pulse_2.5s_ease-in-out_infinite]" />
          {hasProbeQuestion && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--warm)] border-2 border-[var(--bg)]" />
          )}
        </Button>
        <Badge variant="outline" className="text-xs text-[var(--ink-muted)] border-[var(--border)] rounded-full px-3 py-1">
          {username}
        </Badge>
      </div>
    </header>
  );
}
