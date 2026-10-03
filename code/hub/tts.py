"""Voice output. macOS `say` (offline). A new utterance interrupts the previous one.
On other platforms the hub reports `speak_in_browser` and the UI uses speechSynthesis."""
from __future__ import annotations

import asyncio
import logging
import shutil
from typing import Optional

from . import config

log = logging.getLogger("tts")


class Voice:
    def __init__(self):
        self.available = shutil.which("say") is not None
        self._proc: Optional[asyncio.subprocess.Process] = None

    async def speak(self, text: str, system: bool = False) -> None:
        """system=True uses DING's own voice (alerts, check-ins), not the user's."""
        await self.stop()
        if not self.available:
            return
        voice = config.SYSTEM_VOICE if system else config.TTS_VOICE
        self._proc = await asyncio.create_subprocess_exec(
            "say", "-v", voice, "-r", str(config.TTS_RATE), text,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )

    async def wait(self) -> None:
        if self._proc:
            await self._proc.wait()

    async def stop(self) -> None:
        if self._proc and self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), 1)
            except asyncio.TimeoutError:
                self._proc.kill()
        self._proc = None
