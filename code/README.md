# DING: main code (iteration 1)

The core loop, runnable on one laptop:

```
Enter key (bell) ─┐                         ┌─> Bell Screen (React): guesses, quick replies, room, Hawking keyboard
ESP32 button ─────┤                         ├─> voice (macOS `say`)
laptop camera ────┼──> hub (Python) <──LLM──┼─> devices: light, TV (mocked)
health mock ──────┤      (OpenAI)           └─> alerts: check-in, Help, caregiver "coming"
room mock + clock ┘
```

What's real and what's mocked in this iteration:

| Part | Status |
|---|---|
| Bell | **Enter key** or a **push button on an ESP32** (`bell_esp32/`, `BELL_SERIAL_PORT=auto`), same press/hold/rapid timings as `bell_test/bell_test.ino`. |
| Face | **Real**, from the laptop camera: MediaPipe Face Landmarker → rules → `neutral / happy / sad / uncomfortable / tired` + attention. Override from the sim panel. |
| Health (HR, SpO₂, BP, RR, temp) | **Simulated**, with scenarios |
| Room (temp, humidity, light, noise, CO₂) | **Simulated**, with scenarios. The clock is real but can be shifted. |
| Light + TV | **Simulated** on/off (`hub/devices.py::_apply` is where the 2nd ESP32 goes) |
| Suggestions + keyboard prediction | **Real** OpenAI calls (`OPENAI_MODEL`; `gpt-5-mini` recommended, see below), local phrasebook + 20k-word list fallback |
| User's voice | **Real** OpenAI TTS (`gpt-4o-mini-tts`, cheapest), disk-cached and pre-fetched; local macOS voice fallback |
| Hearing people | **Microphone toggle, OFF by default** (top bar on the Bell Screen, sim panel, or More › mic). When on: browser VAD → `gpt-4o-mini-transcribe` (cheapest). You can always type what people say in the sim panel instead. |
| Learning from picks | Not yet (next iteration). Events are already logged to `code/logs/`. |

## Run

```bash
# once
python3 -m venv .venv
.venv/bin/pip install -r code/requirements.txt
cp code/.env.example code/.env      # add OPENAI_API_KEY

# every time
./code/run.sh          # http://127.0.0.1:8000  (Bell Screen)  and  /#/sim  (operator panel)
./code/run.sh dev      # same, with React hot reload on :5173
```

Open the **Bell Screen** full screen for the user, and the **sim panel** (`/#/sim`) in a second window for the team.
On macOS the first run asks for camera permission for your terminal app. If it's denied, face shows as unavailable and everything else still works.

## Using it (bell only)

| Gesture | Enter key | Meaning |
|---|---|---|
| **Press** | tap (a double tap counts as one press) | choose the highlighted option; wakes the screen when idle |
| **Hold** | hold ≥ 1 s | **confirm the bigger action for where you are** (always shown on screen as `Hold · …`): |
| | keyboard | **speak it** (send it, in Ask AI); empty draft: back |
| | a card on the main screen | **close, but…**: 4 AI variations of that card, plus `Edit on keyboard` (card text as the draft), `Say the first one`, `Back` |
| | right after a choice (10 s) | **undo** it: stops the voice, reverts the device, or says "Sorry, wrong one" |
| | inside a group / refine / Ask AI | go back |
| | any other main-screen option | back to the top of the loop |
| **Rapid** | 3 quick taps | SOS: Help fires **on the third tap** (no wait); further taps in that burst are swallowed |

- Options are highlighted one at a time (scan speed is set in the sim panel). A press picks the option that was highlighted **when the key went down**, plus a 250 ms grace window for late reactions (not after a jump such as a reset). A press is only recognised ~0.5 s later, because a second tap might follow.
- **The highlight freezes the moment the bell goes down** and stays until the gesture is known, so nothing moves while the user rings. While held, the scan line gives way to an ink **hold line** that fills to the 1 s threshold (it only appears after 250 ms, so presses never flash it); the composer reads `Keep holding to …`, then `Let go to …`. Letting go early is just a press. Taps are counted (`2 taps · a third calls help`).
- Main loop, kept short because every second of scanning costs the user effort (~10 s per pass):
  4 AI guesses → `Reactions` (only during a conversation) → `Other ideas` → `Keyboard` → `Ask AI` → `More` (Quick replies, Needs, Room, mic, Rest) → `Help`.
- **Ask AI**: a private chat with Ding.AI on the screen (nothing is spoken aloud). Every AI turn is a short reply plus 3-4 answers to scan and pick, so the AI only ever asks for what the bell can give: ask about vitals, the room, the time, who's here, or anything general (no internet). `Type my own` opens the same keyboard; its `Speak` becomes `Send` (also HOLD), which goes to the chat. Loop: answers → `Type my own` → `New chat` → `Back` → `Help`; HOLD = back to the main screen. The chat can't act on the room; picking answers that promise that is filtered out. Offline it still answers from what the hub knows.
  Help stays at the top level: a person with ALS may not manage three rapid taps.
- A bar fills on the highlighted option so the user can time the ring. Opening a group replaces the cards so everything scanned is on screen.
- What DING says appears in a large bubble for everyone in the room; device actions show a ✅ confirmation.
- A card can only switch a device if its own words are about that device (the AI is never allowed to attach a hidden action).
- New guesses never replace the ones being scanned. They appear at the start of the next cycle, except replies to something just said, or after `Other ideas`.
- Scanned past all the guesses twice without a ring? The screen tells the hub (`deck_skipped`); those options are marked rejected for 10 minutes and fresh ones arrive at a later cycle start. While Help is active, the cards come first and `I'm OK now. Cancel help.` after them, so stray SOS taps can't cancel it.
- Keyboard rows: AI sentence completions (also expands initials like `i w t g o`) → next words → 6 likeliest letters → frequency grid → controls (`Speak` first). Picking a completion jumps straight to `Speak`; HOLD speaks from anywhere.
  Local prediction is instant (everyday AAC words, the user's own names and phrases, then a 20k-word English frequency list, so `dont` finds `don't`); the AI result lands ~1.5 s later. The AI's words must start with the half-typed word, its completions must keep what was typed, and the `Likely` letters are re-ranked by what the AI expects (`tell her to c` → a, o for call/come).

### How the guesses are made

`GET /api/context` shows exactly what the model sees. The pieces that matter most:
`waiting_for_answer` (someone spoke and the user hasn't replied: all 4 cards answer it), `conversation` (both sides, oldest first), `rejected` (scanned past or replaced), `due_now` (routines with a clock time within 30 min), plain-language room readings (`32.4°C (hot)`), only the vitals that are off, and who is present with their relation. The model writes a short `read` of the moment before its cards (shown in the sim panel), and the hub then drops cards that parrot the question back, repeat what the user just said, ask for someone who is already in the room, or were rejected, topping up from the phrasebook if needed.
`code/tests/guess_eval.py` runs 10 realistic moments through any model (`python -m tests.guess_eval gpt-5-mini gpt-5-nano`). On it, `gpt-5-nano` stays weak (repeats the question, asks the user questions, misses distress); `gpt-5-mini` answers what was asked, in the user's voice, at the same ~2.3 s. That's why `gpt-5-mini` is recommended (≈ $0.001 per deck).
- Scanning pauses when the camera sees eyes closed or the face turned away for ~2 s (or while someone is talking, with the mic on), and slows down when the face looks `tired`. When someone speaks, the screen wakes with replies (unless the user chose Rest).
- At night the screen dims.
- If a vital stays critical for 5 s: "Are you OK?" (I'm OK / Get help). No answer within 20 s → automatic Help alert. "Caregiver: I'm coming" in the sim panel closes the loop out loud.

## Voice: cost and latency

OpenAI TTS takes 1-5 s per sentence, far too slow after a ring. So:
- every clip is cached on disk (`hub/cache/tts/`); repeats are free and instant
- quick replies, needs and the undo phrase are generated once at startup
- the top `TTS_PREFETCH` (2) cards of every deck are generated as soon as the deck arrives
- if a clip still isn't ready after `TTS_MAX_WAIT_S` (2.5 s), the local macOS voice speaks it immediately
- DING's own alerts always use the local voice (instant, offline-safe, never sounds like the user)
- no deck refreshes are paid for while the screen is idle

Rough cost while in use: decks ~$0.001 each, voice ~$0.015 per minute of speech, transcription ~$0.003 per minute (mic on only).

## Layout

```
code/
  hub/                 Python, FastAPI + one WebSocket
    main.py            wiring, WebSocket protocol, deck/keyboard workers, safety (check-in → help)
    bell.py            Enter-key + ESP32 button edges → gestures (one classifier)
    brain.py           OpenAI deck + keyboard calls (strict JSON schema), local fallback, word list
    chat.py            Ask AI: private chat turns (reply + pickable answers), local fallback from known facts
    face.py            camera → MediaPipe blendshapes → label + attention
    health.py          SIMULATED vitals + thresholds + scenarios
    environment.py     SIMULATED room sensors + clock
    devices.py         light / TV (mock backend)
    tts.py             OpenAI TTS with cache + prefetch; macOS `say` fallback and system voice
    stt.py             transcription (mic toggle), hallucination + self-echo filtering
    profile.json       who the user is (illustrative persona, replace with the real one)
  ui/                  React + Vite
    src/BellScreen.jsx user screen (main / keyboard / Ask AI chat / check-in / idle)
    src/useScanner.js  the scanning engine
    src/useListener.js microphone voice-activity detection → WAV → hub (only when the toggle is on)
    src/SimPanel.jsx   operator & simulation panel
  logs/                events-YYYYMMDD.jsonl (bell, selections, decks, alerts)
```

## Hub protocol (for the team's control-centre UI)

One WebSocket at `/ws`, JSON both ways. Any UI can replace `ui/`; the hub doesn't care who scans.

**Hub → UI**

| `type` | Payload |
|---|---|
| `state` | `data`: a **partial** state object; merge it into what you have. The first message is the full state: `profile, health, env, face, devices, deck, deck_status, keyboard, chat, heard, present, alert, speaking, last_said, announcement, llm, settings, scenarios, tts_in_browser` |
| `bell` | `phase`: `down` · `up` (`count` so far) · `hold_started` · `gesture` (with `gesture`: `press` / `hold` / `rapid`, `count`, `ms_since_down`) · `burst_end` (a burst ended with nothing more to report: unfreeze) |
| `speak` | `text` (only if `tts_in_browser`: speak it with `speechSynthesis`) |
| `error` | `message` |

`deck` = `{situation, reason, source: "ai"|"local", cards: [{id, text, kind: "say"|"do"|"say_and_do", device: "none"|"light"|"tv", device_on, p}], quick_reactions, reasons, latency_ms}`
`keyboard` = `{draft, completions[], next_words[], next_letters[], source}`
`chat` = `{messages: [{role: "user"|"ai", text, at}], options[], loading, source: "ai"|"local"|null}` (Ask AI; options are empty while loading)
`alert` = `{kind: "none"|"checkin"|"help", reason, deadline?, source?, acknowledged_by?}`
`refine` = `{for: card text, loading, cards: [card], latency_ms}` · `bell` (in state) = `{hold_ms, repeat_gap_ms, rapid_min}`
`speaking` = `{active, text, engine: "openai"|"say", at}` · `last_action` = `{text, expires}` (undo available) · `done` / `undone` = `{text, at}`
Cards also carry `tone`: `neutral | warm | playful | firm | urgent | sad` (passed to the voice).

**UI → hub**

| `type` | Fields | Does |
|---|---|---|
| `bell_edge` | `down: bool` | raw Enter-key edge (hub classifies the gesture) |
| `select` | `card` | do/say a deck card |
| `say` | `text` | speak text in the user's voice |
| `device` | `device, on` | switch light / TV |
| `kb_draft` | `draft`, `target?: "say"\|"chat"` | keyboard draft changed → new predictions (`chat`: typing to Ask AI) |
| `chat_open` | | entering Ask AI: greets if the chat is empty (or older than 30 min), else carries on |
| `chat_send` | `text` | the user's answer (picked or typed) → next AI turn |
| `chat_reset` | | new chat (fresh greeting) |
| `deck_refresh` | `avoid?: [text]` | "Other ideas" |
| `deck_skipped` | `cards: [text]` | the whole deck was scanned past twice: reject those, make fresh ones |
| `refine` | `card` | HOLD on a card: "Close, but…" variations arrive in `refine` |
| `help` | `reason?` | raise Help |
| `alert_response` | `ok: bool` | answer the check-in / cancel Help |
| `stop_speaking` | | |
| `undo` | | undo the last choice (within `undo_window_s`) |
| `settings` | `scan_ms`, `pause_on_attention`, `mic_on`, `tts_voice` | |
| sim only | `bell_sim{gesture}` `heard{speaker,text}` `clear_heard` `present{names}` `sim_health{scenario}` `sim_env{scenario}` `sim_time{hhmm}` `face_override{label}` `face_calibrate` `caregiver_ack{name}` | |

HTTP: `POST /api/transcribe` (one WAV utterance; ignored unless `mic_on`), `GET /api/state`, `GET /api/context` (exactly what the LLM sees), `GET /camera.mjpg` (local preview).

## Swapping in the hardware later

- **Bell button on an ESP32 DevKit:** momentary push button between **GPIO 4 (D4)** and **GND** (diagonal legs on a 4-leg tactile button; internal pull-up, no resistor). The on-board LED lights while it's pressed. The ESP32 runs MicroPython with `bell_esp32/main.py` (`bell_esp32.ino` is the same thing for Arduino) and only sends debounced `DOWN` / `UP` edges; the hub classifies them exactly like the Enter key, so freeze, hold line and SOS-on-third-tap all behave the same. `BELL_SERIAL_PORT=auto` finds the board; the sim panel shows whether it's connected; the Enter key keeps working too. Flashing (stop the hub first: it holds the port):
  ```bash
  P=/dev/cu.usbserial-0001   # once per board: MicroPython from micropython.org/download/ESP32_GENERIC
  .venv/bin/python -m esptool --chip esp32 --port $P erase_flash
  .venv/bin/python -m esptool --chip esp32 --port $P --baud 460800 write_flash -z 0x1000 ESP32_GENERIC-*.bin
  .venv/bin/mpremote connect $P cp bell_esp32/main.py :main.py + reset   # after every change to main.py
  ```
- **ESP32-CAM:** `CAMERA_SOURCE=http://<cam-ip>:81/stream`.
- **Light/TV ESP32:** implement `Devices._apply()` in `hub/devices.py`.
- **Real sensors:** replace `HealthMock` / `EnvironmentMock` but keep their `snapshot()` shape.
