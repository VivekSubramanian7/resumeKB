import { useEffect, useRef } from "react";

interface WaveformProps {
  analyser: AnalyserNode | null;
  width?: number;
  height?: number;
  className?: string;
}

/** Speech threshold: RMS below this counts as silence → idle breathing. */
const SPEECH_THRESHOLD = 0.015;

/** Per-wave config: spatial frequency, phase speed, relative amplitude, alpha. */
const WAVES = [
  { freq: 1.0, speed: 1.6, amp: 1.0, alpha: 0.9 },
  { freq: 1.6, speed: -1.1, amp: 0.65, alpha: 0.5 },
  { freq: 2.3, speed: 0.8, amp: 0.4, alpha: 0.3 },
];

function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function Waveform({ analyser, width = 280, height = 56, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const accent = cssVar(canvas, "--accent") || "#8b5cf6";
    const warm = cssVar(canvas, "--warm") || "#f59e0b";
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, accent);
    gradient.addColorStop(0.5, warm);
    gradient.addColorStop(1, accent);

    const timeData = analyser ? new Float32Array(analyser.fftSize) : null;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Spring state for amplitude (critically-ish damped, slight overshoot)
    let springValue = 0;
    let springVelocity = 0;
    const STIFFNESS = 90;
    const DAMPING = 14;

    let phase = 0;
    let breathePhase = 0;
    let raf = 0;
    let lastTime = performance.now();

    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // --- Measure RMS amplitude ---
      let rms = 0;
      if (analyser && timeData) {
        analyser.getFloatTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) { const s = timeData[i] ?? 0; sum += s * s; }
        rms = Math.sqrt(sum / timeData.length);
      }

      const speaking = rms > SPEECH_THRESHOLD;
      // Perceptual boost: sqrt curve so quiet speech still moves the wave
      const target = speaking ? Math.min(1, Math.sqrt(rms) * 2.2) : 0;

      // --- Spring integration toward target ---
      const force = STIFFNESS * (target - springValue) - DAMPING * springVelocity;
      springVelocity += force * dt;
      springValue += springVelocity * dt;
      if (springValue < 0) springValue = 0;

      // --- Idle breathing: slow sinusoidal swell when silent ---
      breathePhase += dt * 1.2;
      const breathe = (0.08 + 0.05 * Math.sin(breathePhase)) * (1 - springValue);

      const amplitude = (springValue * 0.85 + breathe) * (height / 2 - 4);

      phase += dt * (reducedMotion ? 0.3 : 1.5 + springValue * 2.5);

      // --- Draw ---
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.shadowColor = accent;
      ctx.shadowBlur = 8 + springValue * 14;

      const midY = height / 2;
      for (const wave of WAVES) {
        ctx.beginPath();
        ctx.globalAlpha = wave.alpha;
        ctx.strokeStyle = gradient;
        for (let x = 0; x <= width; x += 2) {
          const t = x / width;
          // Envelope tapers waves to zero at both edges
          const envelope = Math.sin(Math.PI * t);
          const y =
            midY +
            Math.sin(t * Math.PI * 2 * wave.freq * 2 + phase * wave.speed * Math.PI) *
              amplitude * wave.amp * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
