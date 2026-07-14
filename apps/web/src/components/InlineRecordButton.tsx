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
