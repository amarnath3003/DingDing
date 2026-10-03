# DING: main code (iteration 1)

The core loop, runnable on one laptop:

```
Enter key (bell) ─┐                         ┌─> Bell Screen (React): guesses, quick replies, room, Hawking keyboard
ESP32 serial ─────┤                         ├─> voice (macOS `say`)
laptop camera ────┼──> hub (Python) <──LLM──┼─> devices: light, TV (mocked)
health mock ──────┤      (OpenAI)           └─> alerts: check-in, Help, caregiver "coming"
room mock + clock ┘
```

What's real and what's mocked in this iteration:

| Part | Status |
|---|---|
| Bell | **Enter key**, with the same press/hold/rapid timings as `bell_test/bell_test.ino`. ESP32 serial input already supported (`BELL_SERIAL_PORT`). |
| Face | **Real**, from the laptop camera: MediaPipe Face Landmarker → rules → `neutral / happy / sad / uncomfortable / tired` + attention. Override from the sim panel. |
| Health (HR, SpO₂, BP, RR, temp) | **Simulated**, with scenarios |
| Room (temp, humidity, light, noise, CO₂) | **Simulated**, with scenarios. The clock is real but can be shifted. |
| Light + TV | **Simulated** on/off (`hub/devices.py::_apply` is where the 2nd ESP32 goes) |
| Suggestions + keyboard prediction | **Real** OpenAI calls (`OPENAI_MODEL`, default `gpt-4.1-mini`), local phrasebook fallback |
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
| **Hold** | hold ≥ 1 s | back: close the group / leave the keyboard. On the main screen: **undo** the last choice (within 15 s: stops the voice, reverts the device, or says "Sorry, wrong one"), otherwise rest |
| **Rapid** | ≥ 3 quick taps | SOS: Help alert straight away |

- Options are highlighted one at a time (scan speed is set in the sim panel). A press picks the option that was highlighted **when the key went down**, plus a 250 ms grace window for late reactions. A press is only recognised ~0.5 s later, because a second tap might follow.
- Main loop, kept short because every second of scanning costs the user effort (~10 s per pass):
  4 AI guesses → `Reactions` (only during a conversation) → `Other ideas` → `Keyboard` → `More` (Quick replies, Needs, Room, mic, Rest) → `Help`.
  Help stays at the top level: a person with ALS may not manage three rapid taps.
- A bar fills on the highlighted option so the user can time the ring. Opening a group replaces the cards so everything scanned is on screen.
- What DING says appears in a large bubble for everyone in the room; device actions show a ✅ confirmation.
- A card can only switch a device if its own words are about that device (the AI is never allowed to attach a hidden action).
- New guesses never replace the ones being scanned. They appear at the start of the next cycle, except replies to something just said, or after `Other ideas`.
- Keyboard rows: AI sentence completions (also expands initials like `i w t g o`) → next words → 6 likeliest letters → frequency grid → controls (`Speak` first). Picking a completion jumps straight to `Speak`.
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
    bell.py            Enter-key edges → gestures; ESP32 serial line parser
    brain.py           OpenAI deck + keyboard calls (strict JSON schema), local fallback, word list
    face.py            camera → MediaPipe blendshapes → label + attention
    health.py          SIMULATED vitals + thresholds + scenarios
    environment.py     SIMULATED room sensors + clock
    devices.py         light / TV (mock backend)
    tts.py             OpenAI TTS with cache + prefetch; macOS `say` fallback and system voice
    stt.py             transcription (mic toggle), hallucination + self-echo filtering
    profile.json       who the user is (illustrative persona, replace with the real one)
  ui/                  React + Vite
    src/BellScreen.jsx user screen (main / keyboard / check-in / idle)
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
| `state` | `data`: a **partial** state object; merge it into what you have. The first message is the full state: `profile, health, env, face, devices, deck, deck_status, keyboard, heard, present, alert, speaking, last_said, announcement, llm, settings, scenarios, tts_in_browser` |
| `bell` | `phase`: `down` · `up` · `hold_started` · `gesture` (with `gesture`: `press` / `hold` / `rapid`, `count`, `ms_since_down`) |
| `speak` | `text` (only if `tts_in_browser`: speak it with `speechSynthesis`) |
| `error` | `message` |

`deck` = `{situation, reason, source: "ai"|"local", cards: [{id, text, kind: "say"|"do"|"say_and_do", device: "none"|"light"|"tv", device_on, p}], quick_reactions, reasons, latency_ms}`
`keyboard` = `{draft, completions[], next_words[], next_letters[], source}`
`alert` = `{kind: "none"|"checkin"|"help", reason, deadline?, source?, acknowledged_by?}`
`speaking` = `{active, text, engine: "openai"|"say", at}` · `last_action` = `{text, expires}` (undo available) · `done` / `undone` = `{text, at}`
Cards also carry `tone`: `neutral | warm | playful | firm | urgent | sad` (passed to the voice).

**UI → hub**

| `type` | Fields | Does |
|---|---|---|
| `bell_edge` | `down: bool` | raw Enter-key edge (hub classifies the gesture) |
| `select` | `card` | do/say a deck card |
| `say` | `text` | speak text in the user's voice |
| `device` | `device, on` | switch light / TV |
| `kb_draft` | `draft` | keyboard draft changed → new predictions |
| `deck_refresh` | `avoid?: [text]` | "Other ideas" |
| `help` | `reason?` | raise Help |
| `alert_response` | `ok: bool` | answer the check-in / cancel Help |
| `stop_speaking` | | |
| `undo` | | undo the last choice (within `undo_window_s`) |
| `settings` | `scan_ms`, `pause_on_attention`, `mic_on`, `tts_voice` | |
| sim only | `bell_sim{gesture}` `heard{speaker,text}` `clear_heard` `present{names}` `sim_health{scenario}` `sim_env{scenario}` `sim_time{hhmm}` `face_override{label}` `face_calibrate` `caregiver_ack{name}` | |

HTTP: `POST /api/transcribe` (one WAV utterance; ignored unless `mic_on`), `GET /api/state`, `GET /api/context` (exactly what the LLM sees), `GET /camera.mjpg` (local preview).

## Swapping in the hardware later

- **Bell ESP32:** flash `bell_test/bell_test.ino`, set `BELL_SERIAL_PORT=/dev/cu.usbserial-…`. The Enter key keeps working too.
- **ESP32-CAM:** `CAMERA_SOURCE=http://<cam-ip>:81/stream`.
- **Light/TV ESP32:** implement `Devices._apply()` in `hub/devices.py`.
- **Real sensors:** replace `HealthMock` / `EnvironmentMock` but keep their `snapshot()` shape.
