"""Quick offline checks (no camera, no network):  cd code && ../.venv/bin/python -m tests.selftest"""
import asyncio
import json
import sys
import types
from pathlib import Path

from hub import config
from hub import bell as bell_mod
from hub.bell import GestureClassifier, parse_firmware_line
from hub.brain import Brain, local_keyboard
from hub.memory import Memory, moment_from


async def bell_cases():
    got, ends = [], []

    async def emit(e):
        if e.get("phase") == "gesture":
            got.append(e)
        elif e.get("phase") == "burst_end":
            ends.append(e)

    bell = GestureClassifier(emit)

    async def tap(down_ms, gap_ms=0):
        await bell.edge(True)
        await asyncio.sleep(down_ms / 1000)
        await bell.edge(False)
        await asyncio.sleep(gap_ms / 1000)

    settle = (config.REPEAT_GAP_MS + 150) / 1000
    cases = []

    await tap(150); await asyncio.sleep(settle)
    cases.append(("single press", got[-1]["gesture"] == "press" and got[-1]["count"] == 1, got[-1]))

    await tap(150, 200); await tap(150); await asyncio.sleep(settle)
    cases.append(("double tap = press", got[-1]["gesture"] == "press" and got[-1]["count"] == 2, got[-1]))

    n = len(got)
    await tap(100, 150); await tap(100, 150); await tap(100); await asyncio.sleep(0.05)
    cases.append(("3rd tap fires rapid at once (no gap wait)", len(got) == n + 1 and got[-1]["gesture"] == "rapid", got[n:]))
    await asyncio.sleep(settle)

    n, e = len(got), len(ends)
    for _ in range(5):
        await tap(90, 140)
    await asyncio.sleep(settle)
    cases.append(("5 taps = one rapid, extra taps never a press", [g["gesture"] for g in got[n:]] == ["rapid"]
                  and len(ends) == e + 1, [g["gesture"] for g in got[n:]]))

    n = len(got)
    await tap(config.HOLD_MS + 150); await asyncio.sleep(0.1)
    cases.append(("hold", len(got) == n + 1 and got[-1]["gesture"] == "hold", got[-1]))

    n = len(got)
    e = len(ends)
    await tap(10); await asyncio.sleep(settle)
    cases.append(("10 ms blip ignored (and ends the freeze)", len(got) == n and len(ends) == e + 1, None))

    press_ms = got[0]["ms_since_down"]
    cases.append(("press ms_since_down ~ press+gap", 600 <= press_ms <= 1100, press_ms))  # loose: real sleeps under CPU load
    return cases


def other_cases():
    cases = []
    fw = [parse_firmware_line(l) for l in ("PRESS", "HOLD      duration=1340 ms",
                                            "REPEATED  4 presses in 900 ms", "REPEATED  2 presses in 300 ms",
                                            "  contact #1  150 ms", "HOLD      started (still held...)")]
    cases.append(("firmware lines", [f and f.get("gesture", f.get("phase")) for f in fw]
                  == ["press", "hold", "rapid", "press", None, "hold_started"], fw))

    profile = json.loads(config.PROFILE_PATH.read_text())
    kb = local_keyboard("i wa", profile)
    cases.append(("kb completes partial word", kb["next_words"][0] == "want" and kb["next_letters"][0] == "n", kb))
    kb = local_keyboard("i ", profile)
    cases.append(("kb next word after 'i'", kb["next_words"][:2] == ["want", "need"], kb["next_words"]))

    brain = Brain(profile)
    ctx = {"part_of_day": "evening", "devices": {"light": "off", "tv": "off"}, "room": {"light": 20, "room_temp": 27},
           "health": {"overall": "normal"}, "face": {"label": "tired"},
           "waiting_for_answer": {"who": "Lakshmi", "text": "Do you want tea or coffee?", "secs_ago": 2}}
    d = brain._finish_deck(brain.local_deck(ctx, []), "local", ctx)
    texts = [c["text"] for c in d["cards"]]
    cases.append(("local deck answers choice question", d["situation"] == "reply_choice"
                  and texts[:2] == ["Tea, please.", "Coffee, please."] and len(texts) == 4, texts))
    ctx["waiting_for_answer"] = None
    d = brain._finish_deck(brain.local_deck(ctx, []), "local", ctx)
    cases.append(("local deck uses face + dark room", d["cards"][0]["text"].startswith("I'm tired")
                  and any(c["device"] == "light" for c in d["cards"]), [c["text"] for c in d["cards"]]))
    hub_ctx = {**ctx, "room": {"room_temp": "32.4°C (hot)", "light": "20 lux (dark)", "humidity": "58%"}}
    d = brain._finish_deck(brain.local_deck(hub_ctx, []), "local", hub_ctx)
    cases.append(("local deck reads the hub's room text (\"32.4°C (hot)\")", any("hot" in c["text"] for c in d["cards"])
                  and any(c["device"] == "light" for c in d["cards"]), [c["text"] for c in d["cards"]]))
    ctx.update(part_of_day="night", devices={"light": "off", "tv": "off"})
    d = brain._finish_deck(brain.local_deck(ctx, []), "local", ctx)
    cases.append(("no device card for a device already off", all(c["device"] == "none" for c in d["cards"]),
                  [c["text"] for c in d["cards"]]))
    return cases


async def serial_cases():
    """bell_esp32.ino over a fake serial port: DOWN/UP edges reach the shared classifier."""
    lines = [b"\r\n", b"READY level=1\r\n", b"DOWN\r\n", b"UP\r\n", b"DOWN\r\n"]

    class FakeSerial:
        def __init__(self, *a, **k):
            self.port = self.dtr = self.rts = None
            self.opened_with = None

        def open(self):
            self.opened_with = (self.dtr, self.rts)
            fakes.append(self)

        def readline(self):
            if lines:
                return lines.pop(0)
            raise OSError("unplugged")

        def close(self):
            pass

    fakes, edges, statuses = [], [], []
    real_port, real_mod = config.BELL_SERIAL_PORT, sys.modules.get("serial")
    sys.modules["serial"] = types.SimpleNamespace(Serial=FakeSerial)
    config.BELL_SERIAL_PORT = "/dev/fake-esp32"

    async def emit(e):
        pass

    async def edge(down):
        edges.append(down)

    async def on_status():
        statuses.append(bell_mod.SERIAL_STATUS["connected"])

    task = asyncio.ensure_future(bell_mod.serial_reader(emit, edge, on_status))
    await asyncio.sleep(0.3)
    task.cancel()
    config.BELL_SERIAL_PORT = real_port
    if real_mod is not None:
        sys.modules["serial"] = real_mod
    else:
        sys.modules.pop("serial")
    return [
        ("serial DOWN/UP -> edges; unplugged mid-press releases", edges == [True, False, True, False], edges),
        ("serial opened with DTR/RTS low (no ESP32 reset)", fakes and fakes[0].opened_with == (False, False),
         fakes and fakes[0].opened_with),
        ("serial status pushed on connect and disconnect", statuses == [True, False], statuses),
    ]


async def wifi_cases():
    """bell_esp32.ino over Wi-Fi (a local TCP server stands in): same edges, PING ignored."""
    async def board(reader, writer):
        writer.write(b"READY level=1\nDOWN\nPING\nUP\nDOWN\n")
        await writer.drain()
        await asyncio.sleep(0.1)
        writer.close()  # board gone mid-press

    server = await asyncio.start_server(board, "127.0.0.1", 0)
    real = config.BELL_WIFI_HOST, config.BELL_WIFI_PORT
    config.BELL_WIFI_HOST, config.BELL_WIFI_PORT = "127.0.0.1", server.sockets[0].getsockname()[1]
    edges, statuses = [], []

    async def emit(e):
        pass

    async def edge(down):
        edges.append(down)

    async def on_status():
        statuses.append(bell_mod.WIFI_STATUS["connected"])

    task = asyncio.ensure_future(bell_mod.wifi_reader(emit, edge, on_status))
    await asyncio.sleep(0.4)
    task.cancel()
    server.close()
    config.BELL_WIFI_HOST, config.BELL_WIFI_PORT = real
    return [
        ("Wi-Fi DOWN/UP -> edges; link lost mid-press releases", edges == [True, False, True, False], edges),
        ("Wi-Fi status pushed on connect and disconnect", statuses == [True, False], statuses),
    ]


async def hung_llm_cases():
    """The AI call hangs (flaky Wi-Fi): the deck still arrives, from the phrasebook, on time."""
    profile = json.loads(config.PROFILE_PATH.read_text())
    brain = Brain(profile)
    brain.client = object()  # pretend the LLM is configured

    async def hang(*a, **k):
        await asyncio.sleep(3600)

    brain._ask = hang
    real = config.LLM_TIMEOUT_S
    config.LLM_TIMEOUT_S = 0.1
    ctx = {"part_of_day": "evening", "devices": {"light": "off", "tv": "off"}, "room": {"light": 20, "room_temp": 27},
           "health": {"overall": "normal"}, "face": {"label": "neutral"}}
    t0 = asyncio.get_running_loop().time()
    try:
        d = await asyncio.wait_for(brain.deck(ctx, []), 5)
    finally:
        config.LLM_TIMEOUT_S = real
    took = asyncio.get_running_loop().time() - t0
    return [("hung LLM -> phrasebook deck within the deadline",
             d["source"] == "local" and len(d["cards"]) >= 4 and took < 3, (d["source"], round(took, 2)))]


async def room_cases():
    """Room ESP32 link: full state on change, SOS follows the alert, drops are reported."""
    import httpx
    from hub.devices import Devices

    sent, up = [], [True]

    def handler(req):
        if not up[0]:
            raise httpx.ConnectError("board off", request=req)
        sent.append(dict(req.url.params))
        return httpx.Response(200, json={})

    real = config.ROOM_ESP32_URL, config.ROOM_HEARTBEAT_S
    config.ROOM_ESP32_URL, config.ROOM_HEARTBEAT_S = "http://room.test/", 0.3
    links = []
    try:
        dev = Devices()
        dev.on_link = lambda: asyncio.sleep(0, links.append(dev.link["connected"]))
        task = asyncio.ensure_future(dev.run(httpx.MockTransport(handler)))
        await dev.set("light", True)
        await asyncio.sleep(0.05)
        light = sent[-1] if sent else None
        dev.set_alarm({"kind": "help", "acknowledged_by": None})
        await asyncio.sleep(0.05)
        sos = sent[-1]["sos"]
        dev.set_alarm({"kind": "help", "acknowledged_by": "Lakshmi"})
        await asyncio.sleep(0.05)
        coming = sent[-1]["sos"]
        dev.set_alarm({"kind": "checkin"})
        await asyncio.sleep(0.05)
        n = len(sent)
        await asyncio.sleep(0.4)
        heartbeat = len(sent) > n
        up[0] = False
        await asyncio.sleep(0.4)
        dropped = dev.snapshot()["light"]["simulated"]
        task.cancel()
    finally:
        config.ROOM_ESP32_URL, config.ROOM_HEARTBEAT_S = real
    return [
        ("room: change sends the whole state", light == {"light": "1", "tv": "0", "sos": "0"}, light),
        ("room: help -> sos 1, I'm coming -> 2, check-in -> 0", (sos, coming, sent[-1]["sos"]) == ("1", "2", "0"),
         (sos, coming, sent[-1]["sos"])),
        ("room: heartbeat resends", heartbeat, len(sent)),
        ("room: drop reported, devices fall back to simulated", links == [True, False] and dropped, (links, dropped)),
    ]


def memory_cases():
    import tempfile
    cases = []
    path = Path(tempfile.mkdtemp()) / "memory.json"
    mem = Memory(path)
    people = ["Lakshmi"]
    asked = lambda text: {"time": "08:10", "part_of_day": "morning", "devices": {"light": "off", "tv": "off"},
                          "face": {"label": "neutral"}, "health": {"overall": "normal"}, "conversation": [],
                          "waiting_for_answer": {"who": "Lakshmi", "text": text, "secs_ago": 2}}
    ai = lambda texts: [{"text": t, "kind": "say", "device": "none", "device_on": False, "tone": "neutral",
                         "p": 0.25, "id": f"x{i}"} for i, t in enumerate(texts)]
    deck = ai(["Coffee, please.", "Tea, please.", "Neither, thanks.", "Just water."])

    mem.learn({"text": "Filter coffee, strong, no sugar.", "kind": "say"}, moment_from(asked("Tea or coffee?"), people),
              "card", rank=3)
    ctx = asked("Appa, do you want tea or coffee?")
    out = mem.shape(deck, mem.recall(ctx, people), ctx)
    cases.append(("learned answer to a reworded question comes first", out[0]["text"] == "Filter coffee, strong, no sugar."
                  and out[0].get("learned") and len(out) == 4, [c["text"] for c in out]))
    other = asked("Shall I call the doctor?")
    cases.append(("learned answer not recalled for an unrelated question", not mem.recall(other, people),
                  mem.recall(other, people)))
    mem2 = Memory(path)
    cases.append(("memory survives a restart", mem2.recall(ctx, people)
                  and mem2.recall(ctx, people)[0]["entry"]["text"].startswith("Filter coffee"), None))

    idle = {**asked(""), "waiting_for_answer": None, "time": "19:05", "part_of_day": "evening"}
    light = {"text": "Turn the light on, please.", "kind": "say_and_do", "device": "light", "device_on": True}
    mem.learn(light, moment_from(idle, people), "card", rank=2)
    cases.append(("one idle pick: hinted to the AI, not forced", [c["text"] for c in mem.shape(deck, mem.recall(idle, people), idle)]
                  == [c["text"] for c in deck] and mem.recall(idle, people), None))
    key = mem.learn(light, moment_from(idle, people), "card", rank=1)
    out = mem.shape(deck, mem.recall(idle, people), idle)
    cases.append(("habit used twice goes on screen", out[0]["text"] == "Turn the light on, please."
                  and out[0]["device"] == "light", [c["text"] for c in out]))
    lit = {**idle, "devices": {"light": "on", "tv": "off"}}
    cases.append(("no 'light on' habit while the light is on", not mem.recall(lit, people), None))
    mem.unlearn(key)
    cases.append(("undo forgets the pick", len(mem.phrases[next(k for k in mem.phrases if "light" in k)]["uses"]) == 1, None))
    mem.learn(light, moment_from(idle, people), "card", rank=1)
    mem.skip(["Turn the light on, please."] * 3)
    out = mem.shape(deck, mem.recall(idle, people), idle)
    cases.append(("scanned-past habits fade off the screen", out[0]["text"] == "Coffee, please.", [c["text"] for c in out]))

    mem.learn({"text": "Tell Arjun the Kaveri story tonight."}, moment_from(idle, people), "keyboard")
    profile = json.loads(config.PROFILE_PATH.read_text())
    kb = local_keyboard("tell ar", profile, mem.sentences(), mem.top_words())
    cases.append(("keyboard offers the user's own sentence and words", "Tell Arjun the Kaveri story tonight." in kb["completions"]
                  and "kaveri" in local_keyboard("tell arjun the ka", profile, mem.sentences(), mem.top_words())["next_words"], kb))
    crit = {**ctx, "health": {"overall": "critical"}}
    out = mem.shape(deck, mem.recall(crit, people), crit)
    cases.append(("critical vitals: habits never pushed to the top", out[0]["text"] == "Coffee, please.", [c["text"] for c in out]))
    return cases


def main():
    cases = (asyncio.run(bell_cases()) + asyncio.run(serial_cases()) + asyncio.run(wifi_cases())
             + asyncio.run(hung_llm_cases())
             + asyncio.run(room_cases())
             + other_cases() + memory_cases())
    bad = 0
    for name, ok, detail in cases:
        print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   -> {detail}"))
        bad += not ok
    print(f"\n{len(cases) - bad}/{len(cases)} passed")
    raise SystemExit(bad)


if __name__ == "__main__":
    main()
