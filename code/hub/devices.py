"""Room devices: on/off only. Mocked for now.

Later the second ESP32 (LED = light, 1.8" SPI display = TV) replaces _apply();
keep the rest of the hub talking to set()/snapshot() only."""
from __future__ import annotations

import logging

log = logging.getLogger("devices")

DEVICES = {
    "light": {"label": "Light", "icon": "💡"},
    "tv": {"label": "TV", "icon": "📺"},
}


class Devices:
    def __init__(self):
        self.state = {name: False for name in DEVICES}

    async def set(self, name: str, on: bool) -> None:
        if name not in DEVICES:
            raise ValueError(f"unknown device {name!r}")
        await self._apply(name, on)
        self.state[name] = on

    async def _apply(self, name: str, on: bool) -> None:
        log.info("[SIMULATED] %s -> %s", name, "ON" if on else "OFF")

    def snapshot(self) -> dict:
        return {name: {**meta, "on": self.state[name], "simulated": True}
                for name, meta in DEVICES.items()}
