"""Voice output.

The user's voice is OpenAI TTS (cheapest model, gpt-4o-mini-tts by default), but
a network round trip takes 1-5 s, far too slow after a ring. So:

  * every clip is cached on disk (text + voice + tone -> mp3); repeats are free and instant
  * quick replies / needs are pre-generated at startup, top deck cards as soon as a
    deck arrives, so the audio is usually ready before the user rings
  * if a clip isn't ready within TTS_MAX_WAIT_S, the local macOS voice says it now
    (the clip still finishes caching for next time)

DING's own announcements (alerts, check-ins) always use the local system voice:
instant, works offline, and never sounds like the user.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import shutil
import time
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

from . import config

log = logging.getLogger("tts")

OPENAI_VOICES = ["onyx", "ash", "echo", "fable", "alloy", "ballad", "coral", "nova", "sage", "shimmer", "verse"]


class Voice:
    def __init__(self, profile: dict):
        self.instructions = profile.get("voice_instructions", "")
        self.voice = config.OPENAI_TTS_VOICE
        self.client = None
        if config.TTS_ENGINE == "openai" and config.OPENAI_API_KEY:
            from openai import AsyncOpenAI
            self.client = AsyncOpenAI(api_key=config.OPENAI_API_KEY, timeout=20, max_retries=1)
        self.has_say = shutil.which("say") is not None
        self.has_afplay = shutil.which("afplay") is not None
        self.available = self.has_say or (self.client is not None and self.has_afplay)
        config.TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._gen = 0
        self._inflight: Dict[str, asyncio.Future] = {}
        self._sem = asyncio.Semaphore(2)  # don't flood the API with prefetches
        self.stats = {"engine": "openai" if self.client else "say", "model": config.OPENAI_TTS_MODEL,
                      "voice": self.voice, "last_ms": None, "last_engine": None,
                      "cached": len(list(config.TTS_CACHE_DIR.glob("*.mp3"))), "fallbacks": 0, "last_error": ""}

    # --- clip cache ---------------------------------------------------------------
    def _instructions(self, tone: str) -> str:
        tone_line = "" if tone in ("", "neutral") else f" Tone for this line: {tone}."
        return (self.instructions + tone_line).strip()

    def _path(self, text: str, tone: str) -> Path:
        key = "|".join([config.OPENAI_TTS_MODEL, self.voice, self._instructions(tone), text.strip()])
        return config.TTS_CACHE_DIR / (hashlib.sha1(key.encode()).hexdigest()[:20] + ".mp3")

    def cached(self, text: str, tone: str = "neutral") -> bool:
        return self._path(text, tone).exists()

    async def prepare(self, text: str, tone: str = "neutral") -> Optional[Path]:
        """Make sure the clip exists on disk. Concurrent calls for the same clip share one request."""
        if not self.client or not text.strip():
            return None
        path = self._path(text, tone)
        if path.exists():
            return path
        key = path.name
        if key not in self._inflight:
            self._inflight[key] = asyncio.ensure_future(self._fetch(text, tone, path))
        try:
            return await asyncio.shield(self._inflight[key])
        finally:
            if self._inflight.get(key) and self._inflight[key].done():
                self._inflight.pop(key, None)

    async def _fetch(self, text: str, tone: str, path: Path) -> Optional[Path]:
        async with self._sem:
            t0 = time.monotonic()
            tmp = path.with_suffix(".part")
            try:
                kwargs = {}
                if "gpt-4o" in config.OPENAI_TTS_MODEL and self._instructions(tone):
                    kwargs["instructions"] = self._instructions(tone)  # tts-1 doesn't accept instructions
                async with self.client.audio.speech.with_streaming_response.create(
                        model=config.OPENAI_TTS_MODEL, voice=self.voice, input=text.strip(),
                        response_format="mp3", **kwargs) as resp:
                    await resp.stream_to_file(tmp)
                tmp.rename(path)
                self.stats.update(last_ms=round((time.monotonic() - t0) * 1000), last_error="",
                                  cached=self.stats["cached"] + 1)
                return path
            except Exception as e:
                tmp.unlink(missing_ok=True)
                self.stats["last_error"] = f"{type(e).__name__}: {str(e)[:120]}"
                log.warning("tts fetch failed: %s", self.stats["last_error"])
                return None

    def prefetch(self, items: Iterable[Tuple[str, str]]) -> None:
        for text, tone in items:
            if self.client and text.strip() and not self.cached(text, tone):
                asyncio.ensure_future(self.prepare(text, tone))

    def set_voice(self, voice: str) -> None:
        if voice in OPENAI_VOICES:
            self.voice = voice
            self.stats["voice"] = voice

    # --- playback -----------------------------------------------------------------
    async def speak(self, text: str, tone: str = "neutral", system: bool = False) -> str:
        """Speak now (interrupting anything playing). Returns the engine actually used."""
        await self.stop()
        my = self._gen
        if not system and self.client and self.has_afplay:
            path = self._path(text, tone)
            if not path.exists():
                try:
                    path = await asyncio.wait_for(asyncio.shield(self.prepare(text, tone)), config.TTS_MAX_WAIT_S)
                except asyncio.TimeoutError:
                    path = None
            if my != self._gen:  # something newer was said while we waited
                return "superseded"
            if path and path.exists():
                self._proc = await asyncio.create_subprocess_exec(
                    "afplay", str(path), stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                self.stats["last_engine"] = "openai"
                return "openai"
            self.stats["fallbacks"] += 1
        if not self.has_say:
            return "none"
        voice = config.SYSTEM_VOICE if system else config.TTS_VOICE
        self._proc = await asyncio.create_subprocess_exec(
            "say", "-v", voice, "-r", str(config.TTS_RATE), text,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        if not system:
            self.stats["last_engine"] = "say"
        return "say"

    def playing(self) -> bool:
        return bool(self._proc and self._proc.returncode is None)

    async def wait(self) -> None:
        proc = self._proc
        if proc:
            await proc.wait()

    async def stop(self) -> None:
        self._gen += 1
        proc, self._proc = self._proc, None
        if proc and proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), 1)
            except asyncio.TimeoutError:
                proc.kill()
