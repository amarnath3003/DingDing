"""Bell input -> gestures: PRESS, HOLD, RAPID.

Two sources feed the same gesture stream:
  * Enter key in the Bell Screen: the browser sends raw down/up edges and
    GestureClassifier turns them into gestures with the same thresholds as the
    ESP32 firmware (bell_test/bell_test.ino).
  * ESP32 bell (bell_esp32/bell_esp32.ino): debounced DOWN / UP edges over USB
    serial go through the same GestureClassifier. The older bell_test.ino output
    (PRESS / HOLD ... / REPEATED n presses ...) is still parsed directly.

Phases sent to the screen: down, up (with the tap count so far), hold_started,
gesture, and burst_end (the burst finished without a further gesture). The screen
freezes the highlight from `down` until `gesture` or `burst_end`.

RAPID fires on the third tap itself, not after the repeat gap, and any further taps
in that burst are swallowed: they must never land as a press on whatever is
highlighted next.

Every gesture carries `ms_since_down`: how long ago the (first) contact was made.
The scanner uses it to pick the option that was highlighted when the user
actually reacted, not the one highlighted when the gesture finished.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Awaitable, Callable, Optional

from . import config

log = logging.getLogger("bell")

Emit = Callable[[dict], Awaitable[None]]


def now_ms() -> float:
    return time.monotonic() * 1000.0


class GestureClassifier:
    """Raw edges -> gestures. Mirrors onRelease()/flushBurst() in bell_test.ino."""

    def __init__(self, emit: Emit):
        self.emit = emit
        self.closed = False
        self.down_at = 0.0
        self.burst_count = 0
        self.burst_start = 0.0
        self.last_release = 0.0
        self.fired = False  # this burst already became RAPID: swallow the rest of it
        self._flush_task: Optional[asyncio.Task] = None
        self._hold_task: Optional[asyncio.Task] = None

    async def edge(self, down: bool) -> None:
        t = now_ms()
        if down and not self.closed:
            self.closed = True
            self.down_at = t
            self._cancel(self._flush_task)  # a new press may extend the burst
            self._hold_task = asyncio.ensure_future(self._announce_hold())
            await self.emit({"type": "bell", "phase": "down"})
        elif not down and self.closed:
            self.closed = False
            self._cancel(self._hold_task)
            await self._on_release(t)

    async def _announce_hold(self) -> None:
        await asyncio.sleep(config.HOLD_MS / 1000)
        if self.closed:
            await self.emit({"type": "bell", "phase": "hold_started"})

    async def _on_release(self, t: float) -> None:
        dur = t - self.down_at
        if dur < config.MIN_EVENT_MS:
            if self.burst_count or self.fired:
                self._schedule_flush()
            else:
                await self.emit({"type": "bell", "phase": "burst_end"})  # a bounce, not a press
            return
        if dur >= config.HOLD_MS:
            await self._flush()
            await self.emit(self._gesture("hold", self.down_at, duration_ms=round(dur)))
            return
        if (self.burst_count > 0 or self.fired) and self.down_at - self.last_release > config.REPEAT_GAP_MS:
            await self._flush()
        if self.burst_count == 0 and not self.fired:
            self.burst_start = self.down_at
        self.last_release = t
        if self.fired:  # more taps after SOS: same emergency, not a press
            self._schedule_flush()
            return
        self.burst_count += 1
        await self.emit({"type": "bell", "phase": "up", "count": self.burst_count})
        if self.burst_count >= config.RAPID_MIN_PRESSES:
            # SOS the moment the third tap lands: an emergency must not wait for the
            # repeat gap, and the taps that follow must never turn into a press.
            self.burst_count, self.fired = 0, True
            await self.emit(self._gesture("rapid", self.burst_start, count=config.RAPID_MIN_PRESSES))
        self._schedule_flush()

    def _schedule_flush(self) -> None:
        self._cancel(self._flush_task)
        if self.burst_count or self.fired:
            self._flush_task = asyncio.ensure_future(self._delayed_flush())

    async def _delayed_flush(self) -> None:
        await asyncio.sleep(config.REPEAT_GAP_MS / 1000)
        if not self.closed:
            await self._flush()

    async def _flush(self) -> None:
        n, self.burst_count = self.burst_count, 0
        if self.fired:
            self.fired = False
            await self.emit({"type": "bell", "phase": "burst_end"})
            return
        if n == 0:
            await self.emit({"type": "bell", "phase": "burst_end"})  # a bounce: nothing happened
            return
        if n >= config.RAPID_MIN_PRESSES:
            await self.emit(self._gesture("rapid", self.burst_start, count=n))
        else:
            # A double tap counts as one deliberate press (spasm-safe).
            await self.emit(self._gesture("press", self.burst_start, count=n))

    @staticmethod
    def _gesture(kind: str, started: float, **extra) -> dict:
        return {"type": "bell", "phase": "gesture", "gesture": kind,
                "ms_since_down": round(now_ms() - started), **extra}

    @staticmethod
    def _cancel(task: Optional[asyncio.Task]) -> None:
        if task and not task.done():
            task.cancel()


# --- Real bell over USB serial ----------------------------------------------

_HOLD_RE = re.compile(r"^HOLD\s+duration=(\d+)")
_REPEAT_RE = re.compile(r"^REPEATED\s+(\d+)\s+presses in\s+(\d+)")
# Firmware prints PRESS only after the burst gap has passed, so the contact
# started roughly (typical press ~170 ms) + gap ago.
_FIRMWARE_PRESS_LAG_MS = 170 + config.REPEAT_GAP_MS


def parse_firmware_line(line: str) -> Optional[dict]:
    line = line.strip()
    if line == "PRESS":
        return {"type": "bell", "phase": "gesture", "gesture": "press", "count": 1,
                "ms_since_down": _FIRMWARE_PRESS_LAG_MS}
    if line.startswith("HOLD") and "started" in line:
        return {"type": "bell", "phase": "hold_started"}
    m = _HOLD_RE.match(line)
    if m:
        return {"type": "bell", "phase": "gesture", "gesture": "hold",
                "duration_ms": int(m.group(1)), "ms_since_down": int(m.group(1)) + 30}
    m = _REPEAT_RE.match(line)
    if m:
        n, span = int(m.group(1)), int(m.group(2))
        kind = "rapid" if n >= config.RAPID_MIN_PRESSES else "press"
        return {"type": "bell", "phase": "gesture", "gesture": kind, "count": n,
                "ms_since_down": span + config.REPEAT_GAP_MS}
    return None


SERIAL_STATUS = {"port": None, "connected": False}  # shown in the sim panel

_PORT_PATTERNS = ("/dev/cu.usbserial-*", "/dev/cu.SLAB_USBtoUART*", "/dev/cu.wchusbserial*",
                  "/dev/cu.usbmodem*", "/dev/ttyUSB*", "/dev/ttyACM*")


def _find_port() -> Optional[str]:
    if config.BELL_SERIAL_PORT.lower() != "auto":
        return config.BELL_SERIAL_PORT
    import glob
    for pattern in _PORT_PATTERNS:
        found = sorted(glob.glob(pattern))
        if found:
            return found[0]
    return None


async def serial_reader(emit: Emit, edge: Callable[[bool], Awaitable[None]],
                        on_status: Callable[[], Awaitable[None]]) -> None:
    """Read the bell ESP32. Runs only if BELL_SERIAL_PORT is set ("auto" = first USB serial port).

    bell_esp32.ino sends DOWN / UP edges, which go through the same GestureClassifier as the
    Enter key. Lines from the older bell_test.ino (already classified) are still understood.
    """
    if not config.BELL_SERIAL_PORT:
        return
    try:
        import serial  # pyserial
    except ImportError:
        log.warning("BELL_SERIAL_PORT set but pyserial not installed; using Enter key only")
        return
    loop = asyncio.get_running_loop()
    warned = None
    while True:
        name = _find_port()
        if not name:
            if warned != "none":
                log.warning("bell serial: no USB serial port found (waiting for the ESP32)")
                warned = "none"
            await asyncio.sleep(2)
            continue
        is_down = False
        port = None
        try:
            # Keep DTR/RTS low: on ESP32 DevKits they drive EN/IO0 (reset / bootloader).
            # Opening the port may still reboot the board once; it's back in <1 s with READY.
            port = serial.Serial(None, config.BELL_SERIAL_BAUD, timeout=0.2)
            port.port, port.dtr, port.rts = name, False, False
            port.open()
            SERIAL_STATUS.update(port=name, connected=True)
            warned = None
            log.info("bell serial connected on %s", name)
            await on_status()
            while True:
                raw = await loop.run_in_executor(None, port.readline)
                if not raw:
                    continue
                line = raw.decode(errors="ignore").strip()
                if line == "DOWN":
                    is_down = True
                    await edge(True)
                elif line == "UP":
                    is_down = False
                    await edge(False)
                elif line.startswith("READY"):
                    log.info("bell ESP32 ready (%s)", line)
                else:
                    event = parse_firmware_line(line)
                    if event:
                        await emit(event)
        except Exception as e:  # unplugged, permission, port busy (flashing), etc. -> retry
            if warned != str(e):
                log.warning("bell serial: %s (retrying every 2 s)", e)
                warned = str(e)
        finally:
            if SERIAL_STATUS["connected"]:
                SERIAL_STATUS.update(connected=False)
                await on_status()
            if port is not None:
                try:
                    port.close()
                except Exception:
                    pass
            if is_down:  # unplugged mid-contact: don't leave the screen frozen
                await edge(False)
        await asyncio.sleep(2)
