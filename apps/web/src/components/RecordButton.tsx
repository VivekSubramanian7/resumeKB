interface RecordButtonProps {
  isRecording: boolean;
  elapsed: number;
  maxSeconds: number;
  onToggle: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordButton({ isRecording, elapsed, maxSeconds, onToggle }: RecordButtonProps) {
  return (
    <section className="flex flex-col items-center gap-5">
      <div className="relative w-[120px] h-[120px] flex items-center justify-center">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border border-[var(--border)]" />
        {/* Inner dashed ring */}
        <div className="absolute inset-2 rounded-full border border-dashed border-[var(--border-subtle)]" />
        {/* Button */}
        <button
          onClick={onToggle}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className="w-[68px] h-[68px] rounded-full bg-[var(--surface-raised)] flex items-center justify-center shadow-[0_4px_20px_oklch(0_0_0/0.3)] transition-transform duration-300 hover:scale-[1.06]"
        >
          {isRecording ? (
            <span className="w-5 h-5 rounded-sm bg-[var(--warm)]" />
          ) : (
            <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]" />
          )}
        </button>
      </div>

      <div className="text-center">
        <span className="text-[1rem] font-medium text-[var(--ink)]">{formatTime(elapsed)}</span>
        <span className="text-[0.75rem] text-[var(--ink-dim)] ml-1">/ {formatTime(maxSeconds)}</span>
      </div>

      <p className="text-[0.75rem] text-[var(--ink-dim)] text-center max-w-[28ch]">
        Speak freely — skills, projects, and connections are extracted automatically.
      </p>
    </section>
  );
}
