"""End-to-end check against a running hub (talks the same WebSocket protocol as the UI).
   cd code && ../.venv/bin/python -m tests.e2e      (the voice will speak a few lines)"""
import asyncio
import json
import sys
import time

import websockets

URL = "ws://127.0.0.1:8000/ws"
ERRORS = []


class Client:
    def __init__(self, ws):
        self.ws, self.state, self.events = ws, {}, []

    async def pump(self):
        async for raw in self.ws:
            msg = json.loads(raw)
            if msg["type"] == "state":
                self.state.update(msg["data"])
            else:
                self.events.append(msg)
                if msg["type"] == "error":
                    ERRORS.append(msg["message"])

    async def send(self, **msg):
        await self.ws.send(json.dumps(msg))

    async def wait(self, pred, timeout, what):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if pred():
                return round(time.time() - t0, 1)
            await asyncio.sleep(0.1)
        raise AssertionError(f"timed out after {timeout}s waiting for: {what}")


async def main():
    results = []

    def ok(name, detail=""):
        results.append(name)
        print(f"PASS {name} {detail}")

    async with websockets.connect(URL) as ws:
        c = Client(ws)
        pump = asyncio.ensure_future(c.pump())
        await c.wait(lambda: "deck" in c.state, 5, "initial state")
        await c.send(type="hello", role="bell")  # take control so bell gestures come to this test
        await c.wait(lambda: any(e.get("type") == "role" and e.get("in_control") for e in c.events), 3, "in control")
        ok("only the Bell Screen in control receives the bell")
        ok("connected, full state received", f"(deck source={c.state['deck']['source']})")
        await c.send(type="sim_health", scenario="normal")
        await c.send(type="alert_response", ok=True, source="test")

        # Someone asks a question -> reply deck
        await c.send(type="heard", speaker="Lakshmi", text="Do you want tea or coffee?")
        dt = await c.wait(lambda: c.state["deck"].get("for_heard") == "Do you want tea or coffee?", 20, "reply deck")
        deck = c.state["deck"]
        ok("reply deck after a question", f"in {dt}s [{deck['source']}/{deck['situation']}] {[x['text'] for x in deck['cards']]}")

        # Bell: Enter-key edges -> PRESS gesture
        await c.send(type="bell_edge", down=True); await asyncio.sleep(0.15)
        await c.send(type="bell_edge", down=False)
        await c.wait(lambda: any(e.get("gesture") == "press" for e in c.events), 3, "press gesture")
        g = [e for e in c.events if e.get("gesture") == "press"][-1]
        ok("Enter edges -> PRESS", f"(ms_since_down={g['ms_since_down']})")

        # Choose the top card -> spoken
        card = deck["cards"][0]
        await c.send(type="select", card=card)
        await c.wait(lambda: c.state.get("last_said", {}).get("text") == card["text"], 3, "spoken")
        ok("card spoken", f"'{card['text']}'")

        # HOLD on a card: "Close, but..." -> variations near it, never the card itself
        held = deck["cards"][1]
        await c.send(type="refine", card=held)
        dt = await c.wait(lambda: c.state.get("refine", {}).get("for") == held["text"]
                          and not c.state["refine"]["loading"], 20, "variations")
        vs = [x["text"] for x in c.state["refine"]["cards"]]
        assert held["text"] not in vs, vs
        ok("hold on a card -> 'Close, but...' variations", f"in {dt}s for {held['text']!r}: {vs}")

        # The whole deck scanned past twice -> those options are rejected and replaced
        skipped = [x["text"] for x in c.state["deck"]["cards"]]
        gen = c.state["deck"]["generated_at"]
        await c.send(type="deck_skipped", cards=skipped)
        await c.wait(lambda: c.state["deck"]["generated_at"] != gen, 20, "fresh deck")
        fresh = [x["text"] for x in c.state["deck"]["cards"]]
        assert not set(fresh) & set(skipped), (fresh, skipped)
        ok("skipped deck -> fresh, different options", f"{fresh}")

        # Undo right after a choice: voice stops, hub confirms
        await c.send(type="say", text="Put the cricket on.", source="test")
        await c.wait(lambda: (c.state.get("last_action") or {}).get("text") == "Put the cricket on.", 3, "undo offered")
        await c.send(type="undo")
        await c.wait(lambda: (c.state.get("undone") or {}).get("text") == "Put the cricket on.", 3, "undone")
        ok("hold-to-undo after a wrong choice")
        await c.send(type="stop_speaking")
        await asyncio.sleep(1.5)

        # Microphone: OFF by default -> hub refuses audio; transcription itself works (tested directly,
        # so we don't switch on the mic of a Bell Screen someone has open)
        import subprocess, urllib.request
        from hub import config
        from hub.stt import Transcriber
        assert c.state["settings"]["mic_on"] is False, "mic should default to off"
        subprocess.run(["say", "-v", "Samantha", "-o", "/tmp/ding-q.wav", "--data-format=LEI16@16000",
                        "Ravi, would you like some tea?"], check=True)
        wav = open("/tmp/ding-q.wav", "rb").read()
        req = urllib.request.Request("http://127.0.0.1:8000/api/transcribe", data=wav, headers={"Content-Type": "audio/wav"})
        r = json.load(urllib.request.urlopen(req, timeout=30))
        assert r.get("ignored") == "mic off", r
        ok("mic off by default: audio refused")
        t0 = time.time()
        text = await Transcriber(json.loads(config.PROFILE_PATH.read_text())).transcribe(wav, [])
        assert text and "tea" in text.lower(), f"transcript was {text!r}"
        ok("speech -> transcript", f"in {time.time() - t0:.1f}s: {text!r}")
        echo = await Transcriber(json.loads(config.PROFILE_PATH.read_text())).transcribe(wav, ["Ravi, would you like some tea?"])
        assert echo is None
        ok("DING's own voice is dropped as echo")

        # Room control
        await c.send(type="device", device="light", on=False)  # known starting point
        await c.wait(lambda: c.state["env"]["sensors"]["light"]["value"] < 120, 10, "room dark")
        before = c.state["env"]["sensors"]["light"]["value"]
        await c.send(type="device", device="light", on=True)
        await c.wait(lambda: c.state["devices"]["light"]["on"], 3, "light on")
        await c.wait(lambda: c.state["env"]["sensors"]["light"]["value"] > before + 150, 8, "room brighter")
        ok("light on -> room light sensor rises", f"({before} -> {c.state['env']['sensors']['light']['value']} lx)")
        await c.send(type="device", device="light", on=False)

        # Keyboard prediction
        await c.send(type="kb_draft", draft="i wa")
        await c.wait(lambda: c.state["keyboard"]["draft"] == "i wa", 3, "keyboard")
        kb = c.state["keyboard"]
        ok("keyboard predictions", f"[{kb['source']}] words={kb['next_words']} letters={kb['next_letters']}")
        await c.send(type="kb_draft", draft="")

        # Ask AI: greeting with pickable answers -> pick one -> reply with new answers; typed text works too
        await c.send(type="chat_reset")
        await c.wait(lambda: not c.state["chat"]["loading"] and len(c.state["chat"]["messages"]) == 1, 20, "chat greeting")
        chat = c.state["chat"]
        assert len(chat["options"]) >= 2, chat
        ok("Ask AI greets with answers to pick", f"[{chat['source']}] {chat['messages'][0]['text']!r} {chat['options']}")
        await c.send(type="chat_send", text=chat["options"][0], source="test")
        await c.wait(lambda: not c.state["chat"]["loading"] and len(c.state["chat"]["messages"]) == 3, 20, "chat reply")
        ok("picked answer -> AI reply", f"{c.state['chat']['messages'][-1]['text']!r} {c.state['chat']['options']}")
        await c.send(type="chat_send", text="what time is it", source="test")
        await c.wait(lambda: not c.state["chat"]["loading"] and len(c.state["chat"]["messages"]) == 5, 20, "typed chat reply")
        ok("typed message -> AI reply", f"{c.state['chat']['messages'][-1]['text']!r}")
        await c.send(type="chat_reset")

        # Critical vital -> check-in -> no answer -> automatic help
        await c.send(type="sim_health", scenario="tachycardia")
        dt = await c.wait(lambda: c.state["alert"]["kind"] == "checkin", 45, "check-in")
        ok("critical HR -> 'Are you OK?' check-in", f"after {dt}s: {c.state['alert']['reason']}")
        dt = await c.wait(lambda: c.state["alert"]["kind"] == "help", 30, "auto help")
        ok("no answer -> automatic Help", f"after {dt}s ({c.state['alert']['source']})")
        await c.send(type="caregiver_ack", name="Lakshmi")
        await c.wait(lambda: c.state["alert"].get("acknowledged_by") == "Lakshmi", 3, "ack")
        ok("caregiver 'coming' acknowledged")
        await c.send(type="sim_health", scenario="normal")
        await c.send(type="alert_response", ok=True)
        await c.wait(lambda: c.state["alert"]["kind"] == "none", 3, "cleared")

        # Rapid ring -> SOS on the third tap; a fourth tap must not become a press
        n_press = sum(e.get("gesture") == "press" for e in c.events)
        for i in range(4):
            await c.send(type="bell_edge", down=True); await asyncio.sleep(0.1)
            await c.send(type="bell_edge", down=False)
            if i == 2:
                dt = await c.wait(lambda: c.state["alert"]["kind"] == "help", 3, "SOS help")
            await asyncio.sleep(0.15)
        await asyncio.sleep(0.8)
        assert sum(e.get("gesture") == "press" for e in c.events) == n_press, "a tap of the SOS burst became a press"
        ok("rapid ring -> SOS Help on the 3rd tap", f"({c.state['alert']['reason']}, {dt}s after the 3rd tap)")
        await c.send(type="alert_response", ok=True)
        await c.send(type="clear_heard")
        await c.wait(lambda: c.state["alert"]["kind"] == "none", 3, "cleared")
        await c.send(type="stop_speaking")
        pump.cancel()

    print(f"\n{len(results)} checks passed")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as e:
        print("FAIL", e)
        for ev in ERRORS:
            print("  hub error:", ev)
        sys.exit(1)
