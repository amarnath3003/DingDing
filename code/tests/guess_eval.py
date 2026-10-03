"""Side-by-side look at the AI's guesses on realistic moments (costs a few cents).

    cd code && ../.venv/bin/python -m tests.guess_eval [model ...]

Prints each scenario's cards, latency and token use per model, for a human to judge:
is the thing the user most likely wants in the first two cards, and is it specific?
"""
import asyncio
import json
import os
import sys
import time

MODELS = sys.argv[1:] or [os.environ.get("OPENAI_MODEL", "gpt-5-nano")]

BASE = {
    "day": "Saturday", "place": "home, bedroom", "draft": "",
    "devices": {"light": "on", "tv": "off"},
    "room": {"room_temp": 27.5, "humidity": 55, "light": 320, "noise": 38},
    "room_units": {"room_temp": "°C", "humidity": "%", "light": "lux", "noise": "dB"},
    "health": {"overall": "normal", "vitals": {"heart_rate": "78bpm (normal)", "spo2": "97% (normal)",
                                               "bp_sys": "122mmHg (normal)", "bp_dia": "79mmHg (normal)",
                                               "resp_rate": "15/min (normal)", "body_temp": "36.8°C (normal)"}},
    "face": {"label": "neutral", "confidence": 0.6, "attention": "looking"},
    "people_present": ["Lakshmi"],
}

# (name, overrides, conversation [(who, text, secs_ago)], skipped)
SCENARIOS = [
    ("tea or coffee", {"time": "08:10", "part_of_day": "morning"},
     [("Lakshmi", "Good morning! Tea or coffee today?", 3)], []),
    ("doctor: pain", {"time": "11:30", "part_of_day": "morning", "people_present": ["Lakshmi", "Dr. Rao"]},
     [("Dr. Rao", "How is the pain in your lower back this week? Better or worse than last time?", 4)], []),
    ("grandson: match", {"time": "19:40", "part_of_day": "evening", "people_present": ["Lakshmi", "Arjun"]},
     [("Arjun", "Ajja! India won the match! Kohli hit a century!", 2)], []),
    ("night, idle, tired", {"time": "22:50", "part_of_day": "night", "devices": {"light": "on", "tv": "on"},
                            "face": {"label": "tired", "confidence": 0.7, "attention": "looking"}}, [], []),
    ("vitals critical", {"time": "15:05", "part_of_day": "afternoon",
                         "health": {"overall": "critical", "vitals": {**BASE["health"]["vitals"], "heart_rate": "131bpm (critical)",
                                                                      "resp_rate": "26/min (warn)"}},
                         "face": {"label": "uncomfortable", "confidence": 0.65, "attention": "looking"}}, [], []),
    ("visitor: open question", {"time": "16:20", "part_of_day": "afternoon", "people_present": ["Lakshmi", "Visitor"]},
     [("Visitor", "Lakshmi told me you were a headmaster. What was that like?", 3)], []),
    ("daughter leaving", {"time": "18:00", "part_of_day": "evening", "people_present": ["Lakshmi", "Meena"]},
     [("Meena", "Appa, I have to go back to Bengaluru tomorrow morning. Work.", 3)], []),
    ("multi-turn: message for Meena", {"time": "13:15", "part_of_day": "afternoon"},
     [("Lakshmi", "Shall I call Meena?", 40), ("me", "Yes, please.", 30), ("Lakshmi", "Okay, what should I tell her?", 4)], []),
    ("hot room, nothing heard", {"time": "14:30", "part_of_day": "afternoon",
                                 "room": {**BASE["room"], "room_temp": 32.4}}, [], []),
    ("other ideas after misses", {"time": "17:10", "part_of_day": "evening"}, [],
     ["What's the score?", "Did Meena call today?", "Time for my medicine.", "I need water, please."]),
]


def build(sc, now=None):
    name, over, convo, skipped = sc
    ctx = {**BASE, **over}
    ctx["conversation"] = [{"who": w, "text": t, "secs_ago": s} for w, t, s in convo]
    ctx["heard"] = [{"speaker": w, "text": t, "secs_ago": s} for w, t, s in convo if w != "me"][-3:]
    ctx["recent_choices"] = [{"text": t, "mins_ago": round(s / 60)} for w, t, s in convo if w == "me"]
    return ctx, skipped


async def main():
    for model in MODELS:
        os.environ["OPENAI_MODEL"] = model
        for m in [k for k in sys.modules if k.startswith("hub")]:
            del sys.modules[m]
        from hub import config
        from hub.brain import Brain
        brain = Brain(json.loads(config.PROFILE_PATH.read_text()))
        print(f"\n=================== {model} ===================")
        total = 0
        for sc in SCENARIOS:
            ctx, skipped = build(sc)
            t0 = time.monotonic()
            d = await brain.deck(ctx, skipped)
            ms = round((time.monotonic() - t0) * 1000)
            total += ms
            print(f"\n## {sc[0]}  [{d['source']}, {ms} ms]  {d.get('reason', '')[:140]}")
            for c in d["cards"]:
                dev = f"  -> {c['device']} {'on' if c['device_on'] else 'off'}" if c["device"] != "none" else ""
                print(f"   {c['p']:.2f} {c['tone']:8} {c['text']}{dev}")
            if d["quick_reactions"]:
                print("   reactions:", ", ".join(d["quick_reactions"]))
        print(f"\nmean latency {total // len(SCENARIOS)} ms; last error: {brain.status['last_error'] or 'none'}")


if __name__ == "__main__":
    asyncio.run(main())
