"""Shared fixtures: synthesized audio files for the whole test suite."""

from __future__ import annotations

import math
import struct
import subprocess
import sys
import wave
from pathlib import Path

import pytest

SPEECH_TEXT = (
    "This week I completed the payment gateway migration project "
    "using Python and Kubernetes with zero downtime."
)


def make_tone_wav(path: Path, seconds: float, freq: float = 440.0, rate: int = 16000) -> Path:
    """Pure-Python WAV generator — used for duration-limit tests."""
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(int(seconds * rate)):
            frames += struct.pack("<h", int(32767 * 0.3 * math.sin(2 * math.pi * freq * i / rate)))
        w.writeframes(bytes(frames))
    return path


def make_speech_wav(path: Path, text: str = SPEECH_TEXT) -> Path:
    """Real synthesized speech via Windows SAPI (System.Speech)."""
    if sys.platform != "win32":
        pytest.skip("speech fixture generation requires Windows SAPI")
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$s.SetOutputToWaveFile('{path}'); "
        f"$s.Speak('{text}'); "
        "$s.Dispose()"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        check=True,
        capture_output=True,
    )
    return path


@pytest.fixture(scope="session")
def speech_wav(tmp_path_factory) -> Path:
    return make_speech_wav(tmp_path_factory.mktemp("audio") / "speech.wav")


@pytest.fixture(scope="session")
def overlong_tone_wav(tmp_path_factory) -> Path:
    return make_tone_wav(tmp_path_factory.mktemp("audio") / "long.wav", seconds=130.0)
