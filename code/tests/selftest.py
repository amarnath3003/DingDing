"""Quick offline checks (no camera, no network):  cd code && ../.venv/bin/python -m tests.selftest"""
import asyncio
import json
import sys
import types

from hub import config
from hub import bell as bell_mod
from hub.bell import GestureClassifier, parse_firmware_line
from hub.brain import Brain, local_keyboard


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


def main():
    cases = (asyncio.run(bell_cases()) + asyncio.run(serial_cases()) + asyncio.run(hung_llm_cases())
             + other_cases())
    bad = 0
    for name, ok, detail in cases:
        print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   -> {detail}"))
        bad += not ok
    print(f"\n{len(cases) - bad}/{len(cases)} passed")
    raise SystemExit(bad)


if __name__ == "__main__":
    main()
