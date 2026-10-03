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
        ok("connected, full state received", f"(deck source={c.state['deck']['source']})")
        await c.send(type="sim_health", scenario="normal")
        await c.send(type="alert_response", ok=True, source="test")

        # Someone asks a question -> reply deck
        await c.send(type="heard", speaker="Lakshmi", text="Do you want tea or coffee?")
        dt = await c.wait(lambda: "heard" in c.state["deck"].get("reasons", []), 15, "reply deck")
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

        # Room control
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

        # Rapid ring -> SOS
        for _ in range(3):
            await c.send(type="bell_edge", down=True); await asyncio.sleep(0.1)
            await c.send(type="bell_edge", down=False); await asyncio.sleep(0.15)
        await c.wait(lambda: c.state["alert"]["kind"] == "help", 3, "SOS help")
        ok("rapid ring -> SOS Help", f"({c.state['alert']['reason']})")
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
