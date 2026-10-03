"""Speech-to-text for people talking TO the user (the user can't speak, so
everything heard is someone else). Off by default; switched on from a screen toggle.

The browser does voice-activity detection and posts one WAV per utterance; we
transcribe it with the cheapest OpenAI model (gpt-4o-mini-transcribe, ~$0.003/min).

Two real-world traps handled here:
  * Whisper-family models invent text for silence / noise ("Thank you for watching").
  * DING's own voice coming out of the speakers must never count as someone speaking.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Optional

from . import config

log = logging.getLogger("stt")

# Typical hallucinations on near-silent audio.
HALLUCINATIONS = {
    "", "you", "thank you", "thanks for watching", "thank you for watching", "bye", "okay",
    "subtitles by the amaraorg community", "please subscribe", "so", "uh", "um", "hmm",
}


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


class Transcriber:
    def __init__(self, profile: dict):
        self.client = None
        if config.OPENAI_API_KEY:
            from openai import AsyncOpenAI
            self.client = AsyncOpenAI(api_key=config.OPENAI_API_KEY, timeout=15, max_retries=1)
        names = [p["name"] for p in profile.get("people", [])] + [profile.get("name", "")]
        # A short prompt biases spelling of names; keep it free of sentences the model could echo back.
        self.prompt = "Names: " + ", ".join(n for n in names if n) + "."
        self.stats = {"model": config.OPENAI_STT_MODEL, "enabled": self.client is not None,
                      "last_ms": None, "last_text": "", "last_error": "", "dropped": 0}

    async def transcribe(self, audio: bytes, recently_said: list) -> Optional[str]:
        if not self.client:
            self.stats["last_error"] = "OPENAI_API_KEY not set"
            return None
        t0 = time.monotonic()
        try:
            resp = await self.client.audio.transcriptions.create(
                model=config.OPENAI_STT_MODEL, file=("utterance.wav", audio, "audio/wav"), prompt=self.prompt)
            text = (resp.text or "").strip()
        except Exception as e:
            self.stats["last_error"] = f"{type(e).__name__}: {str(e)[:120]}"
            log.warning("transcribe failed: %s", self.stats["last_error"])
            return None
        self.stats.update(last_ms=round((time.monotonic() - t0) * 1000), last_error="")
        n = _norm(text)
        if n in HALLUCINATIONS or n == _norm(self.prompt) or len(n) < 2:
            self.stats["dropped"] += 1
            log.info("dropped (noise/hallucination): %r", text)
            return None
        for said in recently_said:  # our own voice leaking from the speakers
            s = _norm(said)
            if s and (n == s or (len(n) > 8 and (n in s or s in n))):
                self.stats["dropped"] += 1
                log.info("dropped (echo of DING's own voice): %r", text)
                return None
        self.stats["last_text"] = text
        return text
