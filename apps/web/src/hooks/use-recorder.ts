import { useCallback, useEffect, useRef, useState } from "react";

interface RecorderState {
  isRecording: boolean;
  elapsed: number;
  analyser: AnalyserNode | null;
  start: () => void;
  stop: () => Promise<Blob | null>;
}

export function useRecorder(maxSeconds: number): RecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const resolveStop = useRef<((blob: Blob | null) => void) | null>(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= maxSeconds) {
            if (mediaRecorder.current?.state === "recording") {
              mediaRecorder.current.stop();
            }
            return maxSeconds;
          }
          return e + 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, maxSeconds]);

  const start = useCallback(async () => {
    chunks.current = [];
    setElapsed(0);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.6;
    source.connect(analyserNode);
    audioContext.current = ctx;
    setAnalyser(analyserNode);

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      audioContext.current?.close();
      audioContext.current = null;
      setAnalyser(null);
      setIsRecording(false);
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      resolveStop.current?.(blob);
      resolveStop.current = null;
    };
    mediaRecorder.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorder.current || mediaRecorder.current.state !== "recording") {
        resolve(null);
        return;
      }
      resolveStop.current = resolve;
      mediaRecorder.current.stop();
    });
  }, []);

  return { isRecording, elapsed, analyser, start, stop };
}
