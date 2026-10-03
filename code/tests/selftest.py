"""Quick offline checks (no camera, no network):  cd code && ../.venv/bin/python -m tests.selftest"""
import asyncio
import json

from hub import config
from hub.bell import GestureClassifier, parse_firmware_line
from hub.brain import Brain, local_keyboard


async def bell_cases():
    got = []

    async def emit(e):
        if e.get("phase") == "gesture":
            got.append(e)

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

    await tap(100, 150); await tap(100, 150); await tap(100); await asyncio.sleep(settle)
    cases.append(("3 taps = rapid", got[-1]["gesture"] == "rapid", got[-1]))

    n = len(got)
    await tap(config.HOLD_MS + 150); await asyncio.sleep(0.1)
    cases.append(("hold", len(got) == n + 1 and got[-1]["gesture"] == "hold", got[-1]))

    n = len(got)
    await tap(10); await asyncio.sleep(settle)
    cases.append(("10 ms blip ignored", len(got) == n, None))

    press_ms = got[0]["ms_since_down"]
    cases.append(("press ms_since_down ~ press+gap", 600 <= press_ms <= 900, press_ms))
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
           "heard": [{"speaker": "Lakshmi", "text": "Do you want tea or coffee?", "secs_ago": 2}]}
    d = brain._finish_deck(brain.local_deck(ctx, []), "local", ctx)
    texts = [c["text"] for c in d["cards"]]
    cases.append(("local deck answers choice question", d["situation"] == "reply_choice"
                  and texts[:2] == ["Tea, please.", "Coffee, please."] and len(texts) == 4, texts))
    ctx["heard"] = []
    d = brain._finish_deck(brain.local_deck(ctx, []), "local", ctx)
    cases.append(("local deck uses face + dark room", d["cards"][0]["text"].startswith("I'm tired")
                  and any(c["device"] == "light" for c in d["cards"]), [c["text"] for c in d["cards"]]))
    ctx.update(part_of_day="night", devices={"light": "off", "tv": "off"})
    d = brain._finish_deck(brain.local_deck(ctx, []), "local", ctx)
    cases.append(("no device card for a device already off", all(c["device"] == "none" for c in d["cards"]),
                  [c["text"] for c in d["cards"]]))
    return cases


def main():
    cases = asyncio.run(bell_cases()) + other_cases()
    bad = 0
    for name, ok, detail in cases:
        print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   -> {detail}"))
        bad += not ok
    print(f"\n{len(cases) - bad}/{len(cases)} passed")
    raise SystemExit(bad)


if __name__ == "__main__":
    main()
