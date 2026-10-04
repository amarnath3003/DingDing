"""Learning from picks: Ding.AI gets better the longer it is used.

Every time the user says or does something, it is remembered together with the moment it was chosen
in: the (simulated) clock, who was in the room, what they had just been asked, the face label. Later,
in a moment that looks like that one, those past picks come back:

  * to the AI, as context.learned ("said 4x in the evening, with Lakshmi"), so it offers the user's own
    words and habits instead of inventing new ones;
  * to the deck itself: a strong habit moves to the top, or is added if the AI left it out, and is marked
    "Learned" on screen so the room can see why it is there;
  * to the offline phrasebook and the keyboard, so learning works without the network.

Negative signals count too: an undone pick is forgotten, and a learned card scanned past fades.
Stored as JSON on this machine only (config.MEMORY_PATH); the operator panel can wipe it.
"""
from __future__ import annotations

import json
import logging
import math
import re
import time
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from . import config

log = logging.getLogger("memory")

HALF_LIFE_S = 30 * 86400  # a habit not used for a month counts half
RECALL_MIN = 0.6          # relevant enough to show the AI
STRONG = 2.5              # sure enough to put on screen without the AI (one exact repeat, or a habit used twice)
SKIP_FADE = 0.7           # each time a learned card is scanned past, it keeps 70% of its weight
MAX_FORCED = 2            # learned cards placed by us; the AI keeps the other slots
MAX_USES, MAX_PHRASES, MAX_PICKS = 30, 400, 1000
NOT_LEARNED = ("undo", "ui", "system")  # sources that aren't the user's own choice

STOP = set("""a an the i you me my your we us our it its is are was were be been am do does did to of in on at for
and or but so with this that these those there here what which who how please can could would will shall should
just some any now then too very ok okay oh ah um not want like need get have has had let lets""".split())


@lru_cache(maxsize=4096)
def _tokens(text: str, keep_stop: bool = False) -> frozenset:
    words = re.findall(r"[a-z0-9]+", text.lower().replace("'", "").replace("’", ""))
    out = set()
    for w in words:
        if not keep_stop and (w in STOP or len(w) < 2):
            continue
        for suffix, min_len in (("ing", 6), ("ed", 5), ("s", 4)):
            if w.endswith(suffix) and len(w) >= min_len and not w.endswith("ss"):
                w = w[:-len(suffix)]
                break
        out.add(w)
    return frozenset(out)


def _cos(a: frozenset, b: frozenset) -> float:
    return len(a & b) / math.sqrt(len(a) * len(b)) if a and b else 0.0


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def _minutes(hhmm: str) -> Optional[int]:
    m = re.match(r"(\d{1,2}):(\d{2})", hhmm or "")
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def _clip(text: str, n: int) -> str:
    return text if len(text) <= n else text[:n - 1].rstrip() + "…"


def _part_phrase(part: str) -> str:
    return "at night" if part == "night" else f"in the {part}"


def moment_from(ctx: dict, people: list) -> dict:
    """The parts of the context a habit is tied to (people as plain names, not "Lakshmi (wife)")."""
    waiting = ctx.get("waiting_for_answer") or {}
    return {"clock": ctx.get("time", ""), "part": ctx.get("part_of_day", ""), "people": list(people),
            "heard": waiting.get("text", ""), "heard_by": waiting.get("who", ""),
            "face": (ctx.get("face") or {}).get("label", "neutral")}


class Memory:
    def __init__(self, path: Path = config.MEMORY_PATH):
        self.path = Path(path)
        self.phrases: dict = {}  # norm(text) -> {text, kind, device, device_on, tone, first, uses: [moment+t], skips}
        self.words: dict = {}    # words the user spelled on the keyboard -> count
        self.picks: list = []    # [{t, rank, learned, source}]: is the right card arriving sooner?
        self._load()

    # --- storage ---------------------------------------------------------------
    def _load(self) -> None:
        try:
            data = json.loads(self.path.read_text())
        except FileNotFoundError:
            return
        except Exception as e:  # a damaged file must never stop the hub: start fresh, keep the file
            log.warning("could not read %s (%s); starting with an empty memory", self.path, e)
            return
        self.phrases, self.words, self.picks = data.get("phrases", {}), data.get("words", {}), data.get("picks", [])

    def _save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"version": 1, "phrases": self.phrases, "words": self.words,
                                       "picks": self.picks}, ensure_ascii=False))
            tmp.replace(self.path)
        except OSError as e:
            log.warning("could not save memory: %s", e)

    def reset(self) -> None:
        self.phrases, self.words, self.picks = {}, {}, []
        self._save()

    # --- signals in ------------------------------------------------------------
    def learn(self, card: dict, moment: dict, source: str, rank: Optional[int] = None) -> Optional[str]:
        """The user chose this. Returns its key (so an undo can take it back)."""
        text = (card.get("text") or "").strip()
        key = _norm(text)
        if not key or source in NOT_LEARNED or not config.LEARNING_ENABLED:
            return None
        now = time.time()
        e = self.phrases.get(key) or {"text": text, "first": round(now), "uses": [], "skips": 0.0}
        e.update(text=text, kind=card.get("kind", "say"), device=card.get("device", "none"),
                 device_on=bool(card.get("device_on")), tone=card.get("tone", "neutral"))
        e["uses"] = (e["uses"] + [{"t": round(now, 1), **moment, "source": source}])[-MAX_USES:]
        e["skips"] = max(0.0, e["skips"] - 1.0)  # choosing it again outweighs an old skip
        self.phrases[key] = e
        if source == "keyboard":
            for w in _tokens(text, keep_stop=True):
                self.words[w] = self.words.get(w, 0) + 1
        self.picks = (self.picks + [{"t": round(now, 1), "rank": rank, "learned": bool(card.get("learned")),
                                     "source": source}])[-MAX_PICKS:]
        self._trim()
        self._save()
        return key

    def unlearn(self, key: str) -> None:
        """Undo: that pick was a mistake, so it never happened."""
        e = self.phrases.get(key)
        if not e or not e["uses"]:
            return
        last = e["uses"].pop()
        if last.get("source") == "keyboard":
            for w in _tokens(e["text"], keep_stop=True):
                if self.words.get(w, 0) > 1:
                    self.words[w] -= 1
                else:
                    self.words.pop(w, None)
        if not e["uses"]:
            del self.phrases[key]
        if self.picks:
            self.picks.pop()
        self._save()

    def skip(self, texts: list, weight: float = 1.0) -> None:
        """Learned cards the user scanned past: that habit fits less than we thought."""
        changed = False
        for t in texts or []:
            e = self.phrases.get(_norm(t or ""))
            if e:
                e["skips"] = round(e["skips"] + weight, 2)
                changed = True
        if changed:
            self._save()

    def _trim(self) -> None:
        if len(self.phrases) <= MAX_PHRASES:
            return
        now = time.time()
        weight = lambda e: sum(0.5 ** ((now - u["t"]) / HALF_LIFE_S) for u in e["uses"]) * SKIP_FADE ** e["skips"]
        keep = sorted(self.phrases.items(), key=lambda kv: weight(kv[1]), reverse=True)[:MAX_PHRASES]
        self.phrases = dict(keep)

    # --- recall ----------------------------------------------------------------
    @staticmethod
    def _fit(use: dict, moment: dict, heard: frozenset) -> float:
        """How much a past moment looks like this one (1.0 = no evidence either way)."""
        fit = 1.0
        a, b = _minutes(use.get("clock", "")), _minutes(moment.get("clock", ""))
        if a is not None and b is not None:
            d = abs(a - b)
            d = min(d, 1440 - d)
            fit *= 1.6 if d <= 45 else 1.2 if use.get("part") == moment.get("part") else 0.6
        if heard:  # someone is waiting for an answer: only answers to a similar line count
            fit *= 0.15 + 3.0 * _cos(_tokens(use.get("heard") or ""), heard)
        elif use.get("heard"):  # that was an answer, and nobody is asking now
            fit *= 0.25
        then, now = set(use.get("people") or []), set(moment.get("people") or [])
        if then or now:
            fit *= 0.7 + 0.6 * len(then & now) / len(then | now)
        if moment.get("face") not in (None, "", "neutral") and use.get("face") == moment.get("face"):
            fit *= 1.3
        return fit

    def recall(self, ctx: dict, people: list, limit: int = 5) -> List[dict]:
        """Past picks that fit this moment, strongest first."""
        if not self.phrases or not config.LEARNING_ENABLED:
            return []
        moment = moment_from(ctx, people)
        heard = _tokens(moment["heard"])
        avoid = {_norm(t) for t in ctx.get("rejected") or []}
        avoid |= {_norm(c["text"].removeprefix("(did) ")) for c in ctx.get("conversation") or []
                  if c.get("who") == "me" and c.get("secs_ago", 999) < 300}
        if moment["heard"]:
            avoid.add(_norm(moment["heard"]))
        devices = {k: v == "on" for k, v in (ctx.get("devices") or {}).items()}
        now, out = time.time(), []
        for key, e in self.phrases.items():
            if key in avoid:
                continue
            if e["kind"] != "say" and e["device"] in devices and devices[e["device"]] == e["device_on"]:
                continue  # "Turn the light on" while it's already on
            score, best, best_fit = 0.0, None, -1.0
            for u in e["uses"]:
                fit = self._fit(u, moment, heard)
                score += 0.5 ** ((now - u["t"]) / HALF_LIFE_S) * fit
                if fit > best_fit:
                    best, best_fit = u, fit
            score *= SKIP_FADE ** e["skips"]
            if score >= RECALL_MIN:
                out.append({"key": key, "entry": e, "score": round(score, 2), "best": best,
                            "why": self._why(e, best, moment, heard)})
        out.sort(key=lambda x: -x["score"])
        return out[:limit]

    @staticmethod
    def _why(e: dict, best: dict, moment: dict, heard: frozenset) -> str:
        n = len(e["uses"])
        times = "once" if n == 1 else f"{n}×"
        if heard and best.get("heard") and _cos(_tokens(best["heard"]), heard) >= 0.4:
            return f"{'your' if n == 1 else 'usual'} answer to {best.get('heard_by') or 'someone'}: “{_clip(best['heard'], 44)}”"
        parts = Counter(u.get("part") for u in e["uses"] if u.get("part"))
        why = f"said {times}"
        if parts:
            part, k = parts.most_common(1)[0]
            if k * 2 >= n:
                why += " " + _part_phrase(part)
        people = Counter(p for u in e["uses"] for p in u.get("people") or [])
        here = [p for p, k in people.most_common() if k * 2 >= n and p in (moment.get("people") or [])]
        if here:
            why += f", with {here[0]}"
        return why

    @staticmethod
    def for_ai(items: List[dict]) -> list:
        return [{"text": it["entry"]["text"], "times": len(it["entry"]["uses"]), "when": it["why"]} for it in items]

    def shape(self, cards: list, items: List[dict], ctx: dict, local: bool = False) -> list:
        """Mark deck cards the user has chosen before, and make sure strong habits are on screen and first."""
        if not items:
            return cards
        tagged, used = [], set()
        for c in cards:
            m = self._match(c, items, used)
            if m:
                used.add(m["key"])
                c = {**c, "learned": {"times": len(m["entry"]["uses"]), "why": m["why"]}, "_score": m["score"]}
                if m["entry"]["device"] == c.get("device", "none"):
                    c["text"] = m["entry"]["text"]  # the user's exact words (and an already cached voice)
            tagged.append(c)
        urgent = ctx.get("alert") or (ctx.get("health") or {}).get("overall") == "critical"
        if urgent:  # never push a habit above what the moment needs
            return [{k: v for k, v in c.items() if k != "_score"} for c in tagged]
        bar = RECALL_MIN if local else STRONG  # offline, anything learned beats the generic phrasebook
        stamp = int(time.time() * 1000)
        inserts = [{"text": it["entry"]["text"], "kind": it["entry"]["kind"], "device": it["entry"]["device"],
                    "device_on": it["entry"]["device_on"], "tone": it["entry"]["tone"],
                    "p": round(min(0.9, it["score"] / 10), 2), "id": f"{stamp}-L{i}",
                    "learned": {"times": len(it["entry"]["uses"]), "why": it["why"]}, "_score": it["score"]}
                   for i, it in enumerate(items) if it["key"] not in used and it["score"] >= bar]
        forced = sorted([c for c in tagged if c.get("_score", 0) >= bar] + inserts,
                        key=lambda c: -c["_score"])[:MAX_FORCED + (1 if local else 0)]
        ids = {c["id"] for c in forced}
        out = forced + [c for c in tagged if c["id"] not in ids]
        return [{k: v for k, v in c.items() if k != "_score"} for c in out[:4]]

    @staticmethod
    def _match(card: dict, items: List[dict], used: set) -> Optional[dict]:
        t = card.get("text", "")
        words = _tokens(t, keep_stop=True)
        for it in items:
            e = it["entry"]
            if it["key"] in used:
                continue
            if e["device"] != card.get("device", "none") or (e["device"] != "none" and e["device_on"] != card.get("device_on")):
                continue
            if it["key"] == _norm(t) or _cos(_tokens(e["text"], keep_stop=True), words) >= 0.85:
                return it
        return None

    # --- keyboard --------------------------------------------------------------
    def sentences(self, limit: int = 40) -> List[str]:
        """The user's own messages, most used first: offline completions."""
        ranked = sorted(self.phrases.values(), key=lambda e: (len(e["uses"]), e["uses"][-1]["t"]), reverse=True)
        return [e["text"] for e in ranked if e["kind"] != "do"][:limit]

    def top_words(self, limit: int = 300) -> List[str]:
        return [w for w, _ in sorted(self.words.items(), key=lambda kv: -kv[1])][:limit]

    # --- for the screens -------------------------------------------------------
    def stats(self, top: int = 8) -> dict:
        ranked = [p for p in self.picks if p.get("rank")]
        window = min(20, len(ranked) // 2)

        def avg(ps):
            return round(sum(p["rank"] for p in ps) / len(ps), 1) if ps else None

        curve = ({"window": window, "early_rank": avg(ranked[:window]), "recent_rank": avg(ranked[-window:]),
                  "recent_learned": round(sum(p.get("learned", False) for p in ranked[-window:]) / window, 2)}
                 if window >= 5 else None)
        best = sorted(self.phrases.values(), key=lambda e: (len(e["uses"]), e["uses"][-1]["t"]), reverse=True)[:top]
        return {
            "enabled": config.LEARNING_ENABLED,
            "phrases": len(self.phrases), "picks": len(self.picks), "words": len(self.words),
            "curve": curve,
            "top": [{"text": e["text"], "times": len(e["uses"]),
                     "why": self._why(e, e["uses"][-1], {}, frozenset())} for e in best],
        }
