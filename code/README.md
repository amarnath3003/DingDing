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
| Speech-to-text | Not yet. Type what people say in the sim panel. |
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
| **Hold** | hold ≥ 1 s | back: close the group → leave the keyboard → rest |
| **Rapid** | ≥ 3 quick taps | SOS: Help alert straight away |

- Options are highlighted one at a time (scan speed is set in the sim panel). A press picks the option that was highlighted **when the key went down**, plus a 250 ms grace window for late reactions. A press is only recognised ~0.5 s later, because a second tap might follow.
- Main screen: 4 AI guesses → `Quick` · `Needs` · `Room` · `Keyboard` · `Other ideas` · `Rest` · `Help`.
- New guesses never replace the ones being scanned. They appear at the start of the next cycle, except replies to something just said, or after `Other ideas`.
- Keyboard rows: AI sentence completions (also expands initials like `i w t g o`) → next words → 6 likeliest letters → frequency grid → controls (`Speak` first). Picking a completion jumps straight to `Speak`.
- Scanning pauses when the camera sees eyes closed or the face turned away for ~2 s, and slows down when the face looks `tired`.
- If a vital stays critical for 5 s: "Are you OK?" (I'm OK / Get help). No answer within 20 s → automatic Help alert. "Caregiver: I'm coming" in the sim panel closes the loop out loud.

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
    tts.py             macOS `say` (user voice: Fred; DING's own announcements: Samantha)
    profile.json       who the user is (illustrative persona, replace with the real one)
  ui/                  React + Vite
    src/BellScreen.jsx user screen (main / keyboard / check-in / idle)
    src/useScanner.js  the scanning engine
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
| sim only | `bell_sim{gesture}` `heard{speaker,text}` `clear_heard` `present{names}` `sim_health{scenario}` `sim_env{scenario}` `sim_time{hhmm}` `face_override{label}` `face_calibrate` `caregiver_ack{name}` `settings{scan_ms,pause_on_attention}` | |

Debug: `GET /api/state`, `GET /api/context` (exactly what the LLM sees), `GET /camera.mjpg` (local preview).

## Swapping in the hardware later

- **Bell ESP32:** flash `bell_test/bell_test.ino`, set `BELL_SERIAL_PORT=/dev/cu.usbserial-…`. The Enter key keeps working too.
- **ESP32-CAM:** `CAMERA_SOURCE=http://<cam-ip>:81/stream`.
- **Light/TV ESP32:** implement `Devices._apply()` in `hub/devices.py`.
- **Real sensors:** replace `HealthMock` / `EnvironmentMock` but keep their `snapshot()` shape.
