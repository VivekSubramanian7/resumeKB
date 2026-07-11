"""Download and cache a faster-whisper model at Docker build time."""

from __future__ import annotations

import os
import sys

from faster_whisper import WhisperModel


def main() -> None:
    model = os.environ.get("WHISPER_MODEL", "small.en")
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE", "int8")
    print(f"Caching Whisper model {model!r} (device={device}, compute={compute_type})...")
    WhisperModel(model, device=device, compute_type=compute_type)
    print(f"Whisper model {model!r} cached.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Failed to cache Whisper model: {exc}", file=sys.stderr)
        raise
