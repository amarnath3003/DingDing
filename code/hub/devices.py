"""Room devices: on/off only, plus the room's SOS alarm.

With ROOM_ESP32_URL set, the second ESP32 (room_esp32/room_esp32.ino) is the room over
Wi-Fi: green LED = light, OLED = TV, red LED + buzzer = SOS. The hub sends the whole room
state on every change and every ROOM_HEARTBEAT_S, so a rebooted board catches up by itself.
Sends happen in the background: a missing board never slows the Bell Screen.
Without ROOM_ESP32_URL everything stays simulated.

The rest of the hub talks to set()/set_alarm()/snapshot() only."""
from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Optional

import httpx

from . import config

log = logging.getLogger("devices")

DEVICES = {
    "light": {"label": "Light", "icon": "💡"},
    "tv": {"label": "TV", "icon": "📺"},
}

ALARM_OFF, ALARM_HELP, ALARM_COMING = 0, 1, 2  # the board's sos=0|1|2


class Devices:
    def __init__(self, on_link: Optional[Callable[[], Awaitable[None]]] = None):
        self.state = {name: False for name in DEVICES}
        self.alarm = ALARM_OFF
        self.on_link = on_link  # called when the board connects or drops
        # connected: None until the first send, so the first failure is logged too
        self.link = {"url": config.ROOM_ESP32_URL.rstrip("/") or None, "connected": None, "error": None}
        self._dirty = asyncio.Event()

    async def set(self, name: str, on: bool) -> None:
        if name not in DEVICES:
            raise ValueError(f"unknown device {name!r}")
        if not self.link["url"]:
            log.info("[SIMULATED] %s -> %s", name, "ON" if on else "OFF")
        self.state[name] = on
        self._dirty.set()

    def set_alarm(self, alert: dict) -> None:
        """The SOS lamp + buzzer follow the on-screen Help alert; "I'm coming" silences the buzzer."""
        if alert.get("kind") != "help":
            level = ALARM_OFF
        else:
            level = ALARM_COMING if alert.get("acknowledged_by") else ALARM_HELP
        if level != self.alarm:
            self.alarm = level
            self._dirty.set()

    def snapshot(self) -> dict:
        simulated = not self.link["connected"]
        return {name: {**meta, "on": self.state[name], "simulated": simulated}
                for name, meta in DEVICES.items()}

    async def run(self, transport: Optional[httpx.AsyncBaseTransport] = None) -> None:
        """Keeps the room ESP32 in step with self.state for the hub's lifetime."""
        url = self.link["url"]
        if not url:
            log.info("room devices simulated (set ROOM_ESP32_URL for the room ESP32)")
            return
        self._dirty.set()  # sync right away: the board may still show the last run's state
        async with httpx.AsyncClient(timeout=config.ROOM_TIMEOUT_S, transport=transport) as client:
            while True:
                try:
                    await asyncio.wait_for(self._dirty.wait(), config.ROOM_HEARTBEAT_S)
                except asyncio.TimeoutError:
                    pass  # heartbeat: resend so a rebooted board catches up
                self._dirty.clear()
                await self._send(client, url)

    async def _send(self, client: httpx.AsyncClient, url: str) -> None:
        params = {"light": int(self.state["light"]), "tv": int(self.state["tv"]), "sos": self.alarm}
        try:
            (await client.get(f"{url}/state", params=params)).raise_for_status()
            error = None
        except httpx.HTTPError as e:
            error = str(e) or type(e).__name__
        connected = error is None
        if connected == self.link["connected"]:
            self.link["error"] = error
            return
        self.link.update(connected=connected, error=error)
        if connected:
            log.info("room ESP32 connected at %s", url)
        else:
            log.warning("room ESP32 not reachable at %s: %s", url, error)
        if self.on_link:
            await self.on_link()
