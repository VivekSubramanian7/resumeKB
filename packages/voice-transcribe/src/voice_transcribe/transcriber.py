"""faster-whisper wrapper: validates duration first, then transcribes."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from faster_whisper import WhisperModel

from voice_transcribe.audio import validate_duration


@dataclass
class Segment:
    start: float
    end: float
    text: str


@dataclass
class Transcription:
    text: str
    language: str
    duration_s: float
    segments: list[Segment] = field(default_factory=list)


class Transcriber:
    def __init__(
        self,
        model_size: str = "large-v3",
        device: str = "auto",
        compute_type: str = "default",
    ) -> None:
        self._model = WhisperModel(model_size, device=device, compute_type=compute_type)

    def transcribe(self, path: Path, max_seconds: float = 120.0) -> Transcription:
        info = validate_duration(path, max_seconds=max_seconds)
        raw_segments, whisper_info = self._model.transcribe(str(path), vad_filter=True)
        segments = [Segment(start=s.start, end=s.end, text=s.text.strip()) for s in raw_segments]
        text = " ".join(s.text for s in segments).strip()
        return Transcription(
            text=text,
            language=whisper_info.language,
            duration_s=info.duration_s,
            segments=segments,
        )
