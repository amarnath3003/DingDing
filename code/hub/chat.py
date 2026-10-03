"""Ask AI: a private chat between the user and Ding.AI, driven by the bell alone.

Every AI turn is a short reply plus 3-4 answers the user can pick (press), so the AI never asks
for anything the user can't give. Typed answers come from the scanning keyboard. Nothing in the
chat is spoken aloud. Same OpenAI plumbing as the deck (Brain._ask), with a local fallback that
answers from what the hub already knows (time, people, room, vitals).
"""
from __future__ import annotations

import json
import re
from typing import List

from .brain import Brain, _dedupe

CHAT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["reply", "options"],
    "properties": {
        "reply": {"type": "string", "description": "Ding.AI's message to the user: at most 3 short sentences."},
        "options": {"type": "array", "items": {"type": "string"},
                    "description": "3 or 4 answers the user can pick, first person, most likely first, each under 8 words."},
    },
}

CHAT_RULES = """CHAT MODE. These rules replace the card rules above. {name} is chatting privately with you, Ding.AI, on the screen.
Nothing here is spoken aloud. In "reply" you talk TO {name}; the "options" are {name}'s answers, in their voice.
- {name}'s only inputs are the bell: press = choose the highlighted option, hold = go back, three quick taps = call for help.
  They can also spell on the scanning keyboard, but each letter costs seconds.
  So every reply must be answerable by picking one of your options: ask at most ONE thing at a time and make the options
  the actual answers (yes / no / a little, or the real choices). Never ask them to say, type, nod, look, point or explain.
- This chat cannot act: nothing in it switches devices, speaks to the room or reaches anyone. Never offer or promise
  actions ("Turn the fan on", "Ask Lakshmi to...", "I'll adjust it"). If {name} wants something done or said, tell them
  to hold the bell to go back to the main screen. There is no fan; the only devices are the light and the TV.
- reply: readable at arm's length. At most 3 short sentences, plain words, no lists, no markdown, no emoji.
  Never list the options inside the reply; they are shown below it.
- options: 3 or 4, each under 8 words, each a different direction: what {name} would reply to YOU next. When it fits,
  include one to go deeper and one to change topic. Options are only words {name} says to you: never room actions
  ("Turn the light on"), requests to other people, or instructions ("Hold to go back"; Back is always on screen).
- You know the context below (time, people present, room, devices, all vitals, face, what was said aloud recently).
  Answer questions about it directly and briefly. Vitals and room sensors are SIMULATED in this build: always say
  "simulated" when you report them. Never diagnose.
- General knowledge, stories, quizzes, word games, memories from the profile, planning what to say later: all fine.
  You have no internet: for news, scores or weather, say you can't check live.
- If {name} seems in distress, say so plainly and remind them Help is at the end of the list, or three quick taps.
- If the conversation is empty, greet {name} in one short line and offer 4 starting points that fit this moment and
  their interests (e.g. how they're doing, a quiz or story on something they love, the day so far, planning what to say).

EXAMPLE (style only, never reuse these words)
{name}: "How am I doing?"
Good reply: "All steady: heart rate 74 and oxygen 97%, both normal (simulated). Anything bothering you?"
Good options: "No, I feel fine" / "A bit tired" / "Some pain" / "Let's talk about something else"
Bad options: "Turn the fan on" (the chat can't act) / "Tell me more" (asks them to type)"""

# Answers that promise something the chat can't do (it never reaches the room or other people):
# "Turn the light on", "Tell Lakshmi I need help", "Hold to go back". "Tell me a story" is fine.
_CANT_DO = re.compile(r"^(?:(?:tell|ask|call|get|fetch|bring) (?!me\b|you\b|us\b)|(?:turn|switch|put|open|close|dim|hold|press)\b)", re.I)

# Offline, these are the questions the hub can answer by itself.
STARTERS = ["How am I doing?", "What time is it?", "What's the room like?", "Who is here?"]


async def reply(brain: Brain, history: List[dict], ctx: dict) -> dict:
    """One Ding.AI turn: {reply, options, source}. history = [{role: "user"|"ai", text}], oldest first."""
    name = brain.profile.get("name", "the user")
    convo = [{"from": name if m["role"] == "user" else "Ding.AI", "text": m["text"]} for m in history[-12:]]
    user = (f"{CHAT_RULES.replace('{name}', name)}\n\nContext now:\n{json.dumps(ctx, ensure_ascii=False)}"
            f"\n\nConversation so far (oldest first):\n{json.dumps(convo, ensure_ascii=False)}")
    data = await brain._ask(
        [{"role": "system", "content": brain.system}, {"role": "user", "content": user}],
        CHAT_SCHEMA, "chat", 400) or {}
    text = (data.get("reply") or "").strip()
    options = _dedupe([o.strip(" -•*·\t") for o in data.get("options", []) if o.strip(" -•*·\t")])[:4]
    doable = [o for o in options if not _CANT_DO.match(o)]
    if len(doable) >= 2:
        options = doable
    if text and len(options) >= 2:
        return {"reply": text, "options": options, "source": "ai"}
    return {**local_reply(history, ctx), "source": "local"}


def local_reply(history: List[dict], ctx: dict) -> dict:
    """No AI: answer only from what the hub knows."""
    last = next((m["text"] for m in reversed(history) if m["role"] == "user"), "")
    q = last.lower()
    vitals, devices = ctx.get("vitals", {}), ctx.get("devices", {})
    if not last:
        text = "Hello. The AI isn't available right now, but I can tell you what I know."
    elif "how am i" in q:
        text = (f"Your vitals look {ctx.get('health', {}).get('overall', 'unknown')}: heart rate "
                f"{vitals.get('heart_rate', '?')}, oxygen {vitals.get('spo2', '?')}. These readings are simulated.")
    elif "time" in q:
        text = f"It's {ctx.get('time')} on {ctx.get('day')} {ctx.get('part_of_day')}."
    elif "room" in q:
        text = (f"The room is {ctx.get('room', {}).get('room_temp', '?')}. The light is {devices.get('light', 'off')} "
                f"and the TV is {devices.get('tv', 'off')}. Room sensors are simulated.")
    elif "who" in q:
        people = ctx.get("people_present") or []
        text = f"{' and '.join(people)} {'is' if len(people) == 1 else 'are'} here." if people else "Nobody is marked as here."
    else:
        text = "I can't reach the AI right now, so I can only answer from what I know here."
    return {"reply": text, "options": [s for s in STARTERS if s.lower() != q]}
