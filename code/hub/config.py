"""All tunables in one place. Values come from the environment (or code/.env)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

CODE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(CODE_DIR / ".env")
load_dotenv(CODE_DIR.parent / ".env")


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default).strip()


def _bool(name: str, default: bool) -> bool:
    return _env(name, "1" if default else "0").lower() in ("1", "true", "yes", "on")


HUB_HOST = _env("HUB_HOST", "127.0.0.1")
HUB_PORT = int(_env("HUB_PORT", "8000"))

# --- LLM (OpenAI) -----------------------------------------------------------
OPENAI_API_KEY = _env("OPENAI_API_KEY", "")
OPENAI_MODEL = _env("OPENAI_MODEL", "gpt-4.1-mini")
LLM_TIMEOUT_S = float(_env("LLM_TIMEOUT_S", "8"))
DECK_REFRESH_S = float(_env("DECK_REFRESH_S", "120"))  # background refresh while the screen is in use

# --- Bell gestures (same numbers as bell_test/bell_test.ino) -----------------
HOLD_MS = int(_env("BELL_HOLD_MS", "1000"))          # contact this long = HOLD
REPEAT_GAP_MS = int(_env("BELL_REPEAT_GAP_MS", "500"))  # next press within this gap = same burst
MIN_EVENT_MS = int(_env("BELL_MIN_EVENT_MS", "30"))   # shorter contacts are bounce, ignored
RAPID_MIN_PRESSES = int(_env("BELL_RAPID_MIN", "3"))  # burst of this many presses = RAPID (SOS)
BELL_SERIAL_PORT = _env("BELL_SERIAL_PORT", "")       # e.g. /dev/cu.usbserial-0001; empty = Enter key only
BELL_SERIAL_BAUD = int(_env("BELL_SERIAL_BAUD", "115200"))

# --- Voice out --------------------------------------------------------------
# The user's voice: OpenAI TTS (cheapest model), cached on disk so repeated phrases cost nothing
# and play instantly. If audio isn't ready within TTS_MAX_WAIT_S, the local voice speaks instead.
TTS_ENGINE = _env("TTS_ENGINE", "openai")            # openai | say
OPENAI_TTS_MODEL = _env("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
OPENAI_TTS_VOICE = _env("OPENAI_TTS_VOICE", "onyx")
TTS_MAX_WAIT_S = float(_env("TTS_MAX_WAIT_S", "2.5"))
TTS_PREFETCH = int(_env("TTS_PREFETCH", "2"))        # pre-generate audio for the top N cards of each deck
TTS_CACHE_DIR = CODE_DIR / "hub" / "cache" / "tts"
TTS_VOICE = _env("TTS_VOICE", "Alex")                # local macOS `say` fallback for the user's voice ("Fred" = Hawking-like)
TTS_RATE = int(_env("TTS_RATE", "175"))
SYSTEM_VOICE = _env("SYSTEM_VOICE", "Samantha")      # DING's own announcements: always local, works offline

# --- Voice in (people talking to the user): OFF until someone switches it on ---
OPENAI_STT_MODEL = _env("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")  # cheapest; "whisper-1" also works
MIC_DEFAULT_ON = _bool("MIC_DEFAULT_ON", False)

UNDO_WINDOW_S = float(_env("UNDO_WINDOW_S", "15"))   # HOLD on the main screen undoes the last choice within this

# --- Face -------------------------------------------------------------------
FACE_ENABLED = _bool("FACE_ENABLED", True)
CAMERA_SOURCE = _env("CAMERA_SOURCE", "0")  # "0" = laptop cam; later "http://<esp32-cam-ip>:81/stream"
FACE_MODEL_PATH = CODE_DIR / "hub" / "models" / "face_landmarker.task"
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# --- Health safety ----------------------------------------------------------
CHECKIN_AFTER_S = float(_env("CHECKIN_AFTER_S", "5"))      # vitals critical this long -> "Are you OK?"
CHECKIN_TIMEOUT_S = float(_env("CHECKIN_TIMEOUT_S", "20"))  # no answer -> escalate to Help

PROFILE_PATH = CODE_DIR / "hub" / "profile.json"
LOG_DIR = CODE_DIR / "logs"
UI_DIST = CODE_DIR / "ui" / "dist"
