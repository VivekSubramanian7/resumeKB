"""Container probing and duration enforcement via PyAV (no external ffmpeg needed)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import av


class DurationLimitExceeded(Exception):
    pass


@dataclass
class AudioInfo:
    duration_s: float
    format_name: str


def probe(path: Path) -> AudioInfo:
    with av.open(str(path)) as container:
        if container.duration is not None:
            duration = container.duration / 1_000_000  # AV_TIME_BASE microseconds
        else:
            duration = max(
                (float(s.duration * s.time_base) for s in container.streams if s.duration),
                default=0.0,
            )
        return AudioInfo(duration_s=duration, format_name=container.format.name)


def validate_duration(path: Path, max_seconds: float = 120.0) -> AudioInfo:
    info = probe(path)
    if info.duration_s > max_seconds:
        raise DurationLimitExceeded(
            f"audio is {info.duration_s:.1f}s; the maximum allowed is {max_seconds:.0f}s"
        )
    return info
