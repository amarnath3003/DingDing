"""DING hub: one process that owns every input and output.

Inputs : bell (Enter key edges / ESP32 serial), camera face, SIMULATED vitals and
         room sensors, things people say (typed in the sim panel).
Outputs: option decks + keyboard predictions (OpenAI, local fallback), voice,
         room devices, alerts.

Any UI talks to it over one WebSocket (/ws). See code/README.md for the protocol.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Set

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .bell import GestureClassifier, serial_reader
from .brain import Brain
from .devices import Devices
from .environment import SCENARIOS as ENV_SCENARIOS, EnvironmentMock
from .face import LABELS as FACE_LABELS, FaceSensor
from .health import SCENARIOS as HEALTH_SCENARIOS, HealthMock
from .stt import Transcriber
from .tts import OPENAI_VOICES, Voice

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)-8s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("hub")
logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per API call is too noisy

HEARD_TTL_S = 300        # utterances older than this drop out of context
CHECKIN_SNOOZE_S = 120   # after "I'm OK", don't ask again for this long


class Hub:
    def __init__(self):
        self.profile = json.loads(config.PROFILE_PATH.read_text())
        self.brain = Brain(self.profile)
        self.health = HealthMock()
        self.env = EnvironmentMock()
        self.devices = Devices()
        self.voice = Voice(self.profile)
        self.stt = Transcriber(self.profile)
        self.face = FaceSensor(self._face_from_thread)
        self.bell = GestureClassifier(self.on_bell)
        self.clients: Set[WebSocket] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None

        self.present = list(self.profile.get("default_present", []))
        self.heard: list = []            # [{speaker, text, t}]
        self.recent: list = []           # [{text, t}]
        self.draft = ""
        self.alert = {"kind": "none"}
        self.checkin_snooze_until = 0.0
        self.critical_since: Optional[float] = None
        self.settings = {"scan_ms": 1200, "pause_on_attention": True, "tts_voice": self.voice.voice,
                         "mic_on": config.MIC_DEFAULT_ON}
        self.last_action: Optional[dict] = None
        self.ui_mode = "idle"
        self._last_deck_at = 0.0
        book = self.profile.get("phrasebook", {})
        self.undo_phrase = (book.get("undo") or ["Sorry, wrong one. Ignore that."])[0]
        self.speaking = {"active": False, "text": ""}
        self.deck = self.brain._finish_deck({"cards": []}, "local", {})
        self.kb = {"draft": "", **self.brain.local_keyboard(""), "source": "local"}

        self._deck_wakeup = asyncio.Event()
        self._deck_avoid: list = []
        self._deck_reasons: Set[str] = set()
        self._kb_task: Optional[asyncio.Task] = None
        self._deck_face_label = "neutral"
        self._last_part_of_day = ""
        self._last_health_level = "normal"
        self._log_file = None

    # --- lifecycle -------------------------------------------------------------
    async def start(self) -> None:
        self.loop = asyncio.get_running_loop()
        config.LOG_DIR.mkdir(parents=True, exist_ok=True)
        self._log_file = open(config.LOG_DIR / f"events-{datetime.now():%Y%m%d}.jsonl", "a")
        self.face.start()
        self._tasks = [asyncio.ensure_future(c) for c in (
            self._sensor_loop(), self._deck_worker(), serial_reader(self.on_bell))]
        self.request_deck("startup")
        # One-time cost: fixed phrases are cached on disk and play instantly from then on.
        book = self.profile.get("phrasebook", {})
        self.voice.prefetch((t, "neutral") for t in book.get("quick", []) + book.get("needs", []) + [self.undo_phrase])
        log.info("LLM: %s (%s)", config.OPENAI_MODEL if self.brain.client else "OFF", self.brain.status["last_error"] or "ready")

    async def stop(self) -> None:
        self.face.stop()
        for t in self._tasks:
            t.cancel()
        await self.voice.stop()
        if self._log_file:
            self._log_file.close()

    def log_event(self, name: str, /, **data) -> None:
        if self._log_file:
            self._log_file.write(json.dumps({"t": round(time.time(), 3), "event": name, **data}) + "\n")
            self._log_file.flush()

    # --- state out -------------------------------------------------------------
    def full_state(self) -> dict:
        return {
            "profile": {"name": self.profile.get("name"), "people": self.profile.get("people", []),
                        "quick": self.profile.get("phrasebook", {}).get("quick", []),
                        "needs": self.profile.get("phrasebook", {}).get("needs", [])},
            "health": self.health.snapshot(),
            "env": self.env.snapshot(),
            "face": self.face.snapshot(),
            "devices": self.devices.snapshot(),
            "deck": self.deck,
            "keyboard": self.kb,
            "heard": self._heard_out(),
            "present": self.present,
            "alert": self.alert,
            "speaking": self.speaking,
            "llm": self.brain.status,
            "settings": self.settings,
            "tts": self.voice.stats,
            "stt": self.stt.stats,
            "last_action": self._last_action_out(),
            "voices": OPENAI_VOICES,
            "undo_window_s": config.UNDO_WINDOW_S,
            "tts_in_browser": not self.voice.available,
            "scenarios": {"health": list(HEALTH_SCENARIOS), "env": list(ENV_SCENARIOS), "face": list(FACE_LABELS)},
        }

    async def send(self, msg: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def push(self, **partial) -> None:
        await self.send({"type": "state", "data": partial})

    def _heard_out(self) -> list:
        now = time.time()
        return [{"speaker": h["speaker"], "text": h["text"], "secs_ago": round(now - h["t"])}
                for h in self.heard if now - h["t"] < HEARD_TTL_S][-5:]

    # --- context for the LLM -----------------------------------------------------
    def context(self) -> dict:
        env = self.env.snapshot()
        health = self.health.snapshot()
        face = self.face.snapshot()
        now = time.time()
        ctx = {
            "time": env["time"], "day": env["day"], "part_of_day": env["part_of_day"],
            "place": "home, bedroom",
            "people_present": self.present,
            "heard": self._heard_out()[-3:],
            "draft": self.draft,
            "devices": {k: ("on" if v else "off") for k, v in self.devices.state.items()},
            "room": {k: v["value"] for k, v in env["sensors"].items()},
            "room_units": {k: v["unit"] for k, v in env["sensors"].items()},
            "health": {"overall": health["overall"],
                       "vitals": {k: f"{v['value']}{v['unit']} ({v['status']})" for k, v in health["vitals"].items()}},
            "face": {"label": face["label"], "confidence": face["confidence"], "attention": face["attention"]},
            "recent_choices": [{"text": r["text"], "mins_ago": round((now - r["t"]) / 60)} for r in self.recent[-6:]],
        }
        if self.alert["kind"] != "none":
            ctx["alert"] = self.alert["kind"]
        return ctx

    # --- deck generation (precomputed so it's ready the moment the bell rings) ---
    def request_deck(self, reason: str, avoid: Optional[list] = None) -> None:
        self._deck_reasons.add(reason)
        if avoid:
            self._deck_avoid = avoid
        self._deck_wakeup.set()

    async def _deck_worker(self) -> None:
        while True:
            try:
                await asyncio.wait_for(self._deck_wakeup.wait(), timeout=config.DECK_REFRESH_S)
            except asyncio.TimeoutError:
                if self.ui_mode == "idle" and self.alert["kind"] == "none":
                    continue  # nobody is looking: don't pay for decks; refresh on wake instead
                self._deck_reasons.add("periodic")
            urgent = self._deck_reasons & {"heard", "other_ideas", "startup"}
            if not urgent:
                await asyncio.sleep(1.0)  # debounce bursts of small changes
            self._deck_wakeup.clear()
            reasons, self._deck_reasons = sorted(self._deck_reasons), set()
            avoid, self._deck_avoid = self._deck_avoid, []
            ctx = self.context()
            await self.push(deck_status={"loading": True, "reasons": reasons})
            t0 = time.monotonic()
            deck = await self.brain.deck(ctx, avoid)
            deck["reasons"] = reasons
            deck["latency_ms"] = round((time.monotonic() - t0) * 1000)
            self.deck = deck
            self._last_deck_at = time.time()
            self._deck_face_label = ctx["face"]["label"]
            # Pre-generate the voice for the likeliest cards so a ring speaks instantly.
            self.voice.prefetch((c["text"], c["tone"]) for c in deck["cards"][:config.TTS_PREFETCH]
                                if c["kind"] in ("say", "say_and_do"))
            self.log_event("deck", source=deck["source"], reasons=reasons, latency_ms=deck["latency_ms"],
                           cards=[c["text"] for c in deck["cards"]])
            await self.push(deck=deck, deck_status={"loading": False}, llm=self.brain.status)

    # --- keyboard predictions: local instantly, AI shortly after -----------------
    async def on_draft(self, draft: str) -> None:
        self.draft = draft
        local = self.brain.local_keyboard(draft)
        self.kb = {"draft": draft, **local, "source": "local"}
        await self.push(keyboard=self.kb)
        if self._kb_task and not self._kb_task.done():
            self._kb_task.cancel()
        self._kb_task = asyncio.ensure_future(self._kb_ai(draft, local))

    async def _kb_ai(self, draft: str, local: dict) -> None:
        await asyncio.sleep(0.35)  # wait for the user to settle on a letter
        ai = await self.brain.keyboard(draft, self.context())
        if not ai or draft != self.draft:
            return
        words = ai["next_words"] + [w for w in local["next_words"] if w not in ai["next_words"]]
        comps = ai["completions"] or local["completions"]
        self.kb = {"draft": draft, "next_words": words[:5], "completions": comps[:3],
                   "next_letters": local["next_letters"], "source": "ai"}
        await self.push(keyboard=self.kb, llm=self.brain.status)

    # --- bell --------------------------------------------------------------------
    async def on_bell(self, event: dict) -> None:
        if event.get("phase") == "gesture":
            self.log_event("bell", gesture=event["gesture"], count=event.get("count"),
                           ms_since_down=event.get("ms_since_down"))
            if event["gesture"] == "rapid":
                await self.raise_help("rapid ring (SOS)", source="user")
        await self.send(event)

    # --- output actions ----------------------------------------------------------
    async def say(self, text: str, source: str, tone: str = "neutral", undoable: bool = True,
                  device_change: Optional[dict] = None) -> None:
        """Speak in the user's voice. Never blocks the caller: bell input must not wait on TTS."""
        text = text.strip()
        if not text:
            return
        now = time.time()
        self.recent.append({"text": text, "t": now})
        self.recent = self.recent[-20:]
        self.log_event("say", text=text, source=source, tone=tone)
        self.speaking = {"active": True, "text": text, "engine": None, "at": now}
        if undoable:
            self.last_action = {"text": text, "t": now, "device": device_change, "spoken": True}
        await self.push(speaking=self.speaking, last_said={"text": text, "at": now},
                        last_action=self._last_action_out())
        if not self.voice.available:
            await self.send({"type": "speak", "text": text})
        asyncio.ensure_future(self._speak(text, tone))
        self.request_deck("said")

    async def _speak(self, text: str, tone: str) -> None:
        engine = await self.voice.speak(text, tone)
        if engine == "superseded":
            return
        if self.speaking.get("text") == text:
            self.speaking = {**self.speaking, "engine": engine}
            await self.push(speaking=self.speaking, tts=self.voice.stats)
        await self.voice.wait()
        if self.speaking.get("text") == text and not self.voice.playing():
            self.speaking = {**self.speaking, "active": False}
            await self.push(speaking=self.speaking)

    async def announce(self, text: str) -> None:
        """DING's own voice (alerts): local, instant, offline-safe, shown on screen too."""
        await self.push(announcement={"text": text, "at": time.time()})
        if not self.voice.available:
            await self.send({"type": "speak", "text": text, "system": True})
        asyncio.ensure_future(self.voice.speak(text, system=True))

    async def set_device(self, name: str, on: bool, source: str) -> None:
        prev = self.devices.state.get(name)
        await self.devices.set(name, on)
        self.log_event("device", device=name, on=on, source=source)
        done = None
        if source in ("scan", "card") and prev != on:
            label = self.devices.snapshot()[name]["label"]
            done = {"text": f"{label} turned {'on' if on else 'off'}", "at": time.time()}
            self.last_action = {"text": done["text"], "t": time.time(),
                                "device": {"name": name, "prev": prev}, "spoken": False}
        await self.push(devices=self.devices.snapshot(), last_action=self._last_action_out(),
                        **({"done": done} if done else {}))
        self.request_deck("device")

    async def select_card(self, card: dict) -> None:
        kind, device = card.get("kind", "say"), card.get("device", "none")
        self.log_event("select", text=card.get("text"), kind=kind, device=device,
                       deck_source=self.deck.get("source"), rank=card.get("rank"))
        change = None
        if device in self.devices.state and kind in ("do", "say_and_do"):
            change = {"name": device, "prev": self.devices.state[device]}
            await self.set_device(device, bool(card.get("device_on")), source="card")
        if kind in ("say", "say_and_do"):
            await self.say(card["text"], source="card", tone=card.get("tone", "neutral"), device_change=change)
        else:
            self.recent.append({"text": card["text"], "t": time.time()})

    def _last_action_out(self) -> Optional[dict]:
        a = self.last_action
        if not a or time.time() - a["t"] > config.UNDO_WINDOW_S:
            return None
        return {"text": a["text"], "t": a["t"], "expires": a["t"] + config.UNDO_WINDOW_S}

    async def undo(self) -> None:
        """HOLD right after a wrong pick: stop the voice, revert the device, tell the room."""
        a = self._last_action_out() and self.last_action
        if not a:
            return
        self.last_action = None
        was_speaking = self.voice.playing() and self.speaking.get("text") == a["text"]
        await self.voice.stop()
        if a.get("device"):
            d = a["device"]
            await self.devices.set(d["name"], bool(d["prev"]))
            await self.push(devices=self.devices.snapshot())
        self.log_event("undo", text=a["text"], interrupted=was_speaking)
        self.speaking = {"active": False, "text": "", "engine": None}
        await self.push(speaking=self.speaking, last_action=None, undone={"text": a["text"], "at": time.time()})
        if a.get("spoken") and not was_speaking:
            # Already said out loud: tell the listener to disregard it.
            await self.say(self.undo_phrase, source="undo", undoable=False)

    async def on_heard(self, text: str, speaker: Optional[str], source: str) -> None:
        if not speaker:  # from the microphone we don't know who; guess when only one person is here
            speaker = self.present[0] if len(self.present) == 1 else "Someone"
        self.heard.append({"speaker": speaker, "text": text, "t": time.time(), "source": source})
        self.log_event("heard", speaker=speaker, text=text, source=source)
        await self.push(heard=self._heard_out())
        self.request_deck("heard")

    # --- safety: health check-in and help ---------------------------------------
    async def raise_help(self, reason: str, source: str) -> None:
        self.alert = {"kind": "help", "reason": reason, "source": source, "since": time.time(),
                      "acknowledged_by": None}
        self.log_event("help", reason=reason, source=source)
        await self.push(alert=self.alert)
        name = self.profile.get("name", "The user")
        await self.announce(f"Help needed. {name} needs help.")
        self.request_deck("alert")

    async def clear_alert(self, source: str) -> None:
        if self.alert["kind"] == "checkin":
            self.checkin_snooze_until = time.time() + CHECKIN_SNOOZE_S
        self.log_event("alert_cleared", kind=self.alert["kind"], source=source)
        self.alert = {"kind": "none"}
        await self.push(alert=self.alert)
        self.request_deck("alert")

    async def _check_vitals(self) -> None:
        snap = self.health.snapshot()
        now = time.time()
        level = snap["overall"]
        if level != self._last_health_level:
            self._last_health_level = level
            self.request_deck("health")
        if level != "critical":
            self.critical_since = None
            return
        self.critical_since = self.critical_since or now
        if (self.alert["kind"] == "none" and now >= self.checkin_snooze_until
                and now - self.critical_since >= config.CHECKIN_AFTER_S):
            reason = self.health.critical_summary()
            self.alert = {"kind": "checkin", "reason": reason, "since": now,
                          "deadline": now + config.CHECKIN_TIMEOUT_S}
            self.log_event("checkin", reason=reason)
            await self.push(alert=self.alert)
            await self.announce(f"{reason}. Are you OK? Ring once if you are OK.")

    async def _sensor_loop(self) -> None:
        while True:
            self.health.tick()
            self.env.tick(self.devices.state)
            await self._check_vitals()
            if self.alert["kind"] == "checkin" and time.time() > self.alert["deadline"]:
                await self.raise_help(f"No answer to check-in ({self.alert['reason']})", source="auto")
            part = self.env.snapshot()["part_of_day"]
            if part != self._last_part_of_day:
                if self._last_part_of_day:
                    self.request_deck("time")
                self._last_part_of_day = part
            await self.push(health=self.health.snapshot(), env=self.env.snapshot(),
                            heard=self._heard_out(), alert=self.alert)
            await asyncio.sleep(1.0)

    # --- face (called from the camera thread) -------------------------------------
    def _face_from_thread(self, snap: dict) -> None:
        if self.loop:
            self.loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self._on_face(snap)))

    async def _on_face(self, snap: dict) -> None:
        await self.push(face=snap)
        if snap["label"] != self._deck_face_label and snap["confidence"] >= 0.35:
            self._deck_face_label = snap["label"]
            self.request_deck("face")

    # --- messages from UIs ---------------------------------------------------------
    async def handle(self, msg: dict) -> None:
        t = msg.get("type")
        if t == "bell_edge":
            await self.bell.edge(bool(msg.get("down")))
        elif t == "bell_sim":  # sim panel buttons
            await self.on_bell({"type": "bell", "phase": "gesture", "gesture": msg["gesture"],
                                "count": 1, "ms_since_down": 0, "simulated": True})
        elif t == "select":
            await self.select_card(msg["card"])
        elif t == "say":
            await self.say(msg.get("text", ""), source=msg.get("source", "ui"))
        elif t == "device":
            await self.set_device(msg["device"], bool(msg["on"]), source=msg.get("source", "ui"))
        elif t == "kb_draft":
            await self.on_draft(msg.get("draft", ""))
        elif t == "deck_refresh":
            self.request_deck("other_ideas", avoid=msg.get("avoid") or [c["text"] for c in self.deck["cards"]])
        elif t == "help":
            await self.raise_help(msg.get("reason", "Help option selected"), source="user")
        elif t == "alert_response":
            if msg.get("ok"):
                await self.clear_alert(source=msg.get("source", "user"))
            else:
                await self.raise_help(f"Asked for help at check-in ({self.alert.get('reason', '')})", source="user")
        elif t == "caregiver_ack":
            if self.alert["kind"] == "help":
                who = msg.get("name") or (self.present[0] if self.present else "Someone")
                self.alert = {**self.alert, "acknowledged_by": who}
                await self.push(alert=self.alert)
                await self.announce(f"{who} is coming.")
        elif t == "stop_speaking":
            await self.voice.stop()
        elif t == "heard":
            text = msg.get("text", "").strip()
            if text:
                await self.on_heard(text, msg.get("speaker"), source="typed")
        elif t == "undo":
            await self.undo()
        elif t == "clear_heard":
            self.heard = []
            await self.push(heard=[])
            self.request_deck("heard")
        elif t == "present":
            self.present = list(msg.get("names", []))
            await self.push(present=self.present)
            self.request_deck("people")
        elif t == "sim_health":
            self.health.set_scenario(msg["scenario"])
            await self.push(health=self.health.snapshot())
        elif t == "sim_env":
            self.env.set_scenario(msg["scenario"])
            self.request_deck("room")
        elif t == "sim_time":
            self.env.set_time(msg.get("hhmm"))
            await self.push(env=self.env.snapshot())
            self.request_deck("time")
        elif t == "face_override":
            label = msg.get("label") or None
            self.face.override = label if label in FACE_LABELS else None
            await self._on_face(self.face.snapshot())
        elif t == "face_calibrate":
            self.face.calibrate(float(msg.get("seconds", 3)))
        elif t == "settings":
            self.settings.update({k: v for k, v in msg.items()
                                  if k in ("scan_ms", "pause_on_attention", "tts_voice", "mic_on")})
            self.voice.set_voice(self.settings["tts_voice"])
            self.log_event("settings", **{k: v for k, v in msg.items() if k != "type"})
            await self.push(settings=self.settings, tts=self.voice.stats)
        elif t == "ui_event":  # scanner telemetry (view changes, pauses) for later metrics
            self.log_event("ui", **{("ui_" + k if k == "event" else k): v for k, v in msg.items() if k != "type"})
            if msg.get("event") == "mode":
                was, self.ui_mode = self.ui_mode, msg.get("mode", "main")
                if was == "idle" and self.ui_mode != "idle" and time.time() - self._last_deck_at > 60:
                    self.request_deck("wake")
        else:
            log.warning("unknown message %r", t)


hub: Optional[Hub] = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global hub
    hub = Hub()
    await hub.start()
    yield
    await hub.stop()


app = FastAPI(title="DING hub", lifespan=lifespan)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    hub.clients.add(ws)
    await ws.send_json({"type": "state", "data": hub.full_state()})
    try:
        while True:
            msg = await ws.receive_json()
            try:
                await hub.handle(msg)
            except Exception as e:  # a bad message must never kill the connection
                log.exception("handling %s", msg.get("type"))
                await ws.send_json({"type": "error", "message": f"{msg.get('type')}: {e}"})
    except (WebSocketDisconnect, RuntimeError):  # RuntimeError: client vanished mid-receive
        pass
    finally:
        hub.clients.discard(ws)


@app.get("/api/state")
async def api_state():
    return JSONResponse(hub.full_state())


@app.post("/api/transcribe")
async def api_transcribe(request: Request):
    """One utterance (WAV) from the Bell Screen microphone -> text -> 'heard'."""
    audio = await request.body()
    if not hub.settings.get("mic_on"):
        return JSONResponse({"text": None, "ignored": "mic off"})
    if hub.voice.playing():
        return JSONResponse({"text": None, "ignored": "DING was speaking"})
    await hub.push(stt_status={"busy": True})
    recent = [r["text"] for r in hub.recent if time.time() - r["t"] < 20]
    text = await hub.stt.transcribe(audio, recent)
    await hub.push(stt_status={"busy": False}, stt=hub.stt.stats)
    if text:
        await hub.on_heard(text, None, source="mic")
    return JSONResponse({"text": text})


@app.get("/api/context")
async def api_context():
    """Exactly what the LLM sees right now (handy for debugging prompts)."""
    return JSONResponse(hub.context())


@app.get("/camera.mjpg")
async def camera_preview():
    """Local operator preview only. Frames are never stored or sent anywhere else."""
    async def frames():
        hub.face.preview_clients += 1
        try:
            while True:
                jpg = hub.face.latest_jpeg
                if jpg:
                    yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"
                await asyncio.sleep(0.15)
        finally:
            hub.face.preview_clients -= 1
    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame")


if config.UI_DIST.exists():
    app.mount("/", StaticFiles(directory=config.UI_DIST, html=True), name="ui")
