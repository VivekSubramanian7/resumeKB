"""Smoke test for voice-transcribe duration enforcement."""

from __future__ import annotations

import math
import struct
import tempfile
import wave
from pathlib import Path

from voice_transcribe import DurationLimitExceeded, probe, validate_duration


def main() -> None:
    p = Path(tempfile.mkdtemp()) / "t.wav"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(
            b"".join(
                struct.pack("<h", int(32767 * 0.3 * math.sin(2 * math.pi * 440 * i / 16000)))
                for i in range(16000 * 130)
            )
        )
    assert 129 < probe(p).duration_s < 131
    exc: DurationLimitExceeded | None = None
    try:
        validate_duration(p, max_seconds=120.0)
    except DurationLimitExceeded as e:
        exc = e
    assert exc is not None and "120" in str(exc)
    print("audio-ok")


if __name__ == "__main__":
    main()
