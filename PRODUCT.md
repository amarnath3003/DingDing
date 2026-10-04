# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary user:** an adult who is paralysed and cannot speak (ALS / motor neurone disease, locked-in syndrome) but whose mind is fully intact. Their only reliable output is one small movement that presses a desk call bell. Every press costs effort and they tire quickly, usually more as the day goes on.
- **Job:** say what they want, answer people talking to them, and control the room (light, TV), using nothing but the bell, at conversational speed.
- **People around them:** caregiver and family (e.g. spouse, daughter, grandson), doctors, visitors. They read the screen over the user's shoulder, hear the synthetic voice, and respond to alerts.
- **Team operators (development/demo only):** use the separate sim/operator panel to drive mocks; never the user's screen.

## Product Purpose

Ding.AI turns a single bell press into a whole sentence or action. Instead of making the user spell, it guesses what they most likely want right now, from the time, who is present, what was just said, the room, vitals and their facial expression, and offers those guesses one at a time; one press confirms. Success: the user's real need is among the first few highlighted options, most replies take one or two presses, and the user says it feels like theirs.

## Positioning

The bell is the only input; the AI supplies the bandwidth. The user supplies the decision. Origin: Hector "Tío" Salamanca's bell in *Breaking Bad*, a bell that could only say "come here". Ding.AI's bell can say anything.

## Operating Context

- Viewed on a **laptop at arm's length** (table or wheelchair tray), at the user's eye level.
- Single-switch auto-scanning: options are highlighted one at a time; press = choose, hold = back/undo, three quick taps = SOS. Enter key stands in for the bell during development; the real bell is a service bell wired to an ESP32.
- A voice (OpenAI TTS, local fallback) speaks the chosen words in the user's voice; DING's own alerts use a separate local voice.
- Runs all day: daytime, evenings, and at night beside the bed.
- Health and room sensors are mocked in this build and must be labelled as simulated wherever shown.

## Capabilities and Constraints

- Screens: idle, main (AI guesses + Other ideas, Keyboard, More, Help), Hawking-style scanning keyboard with AI completions, health check-in ("Are you OK?") with automatic escalation, Help alert with caregiver acknowledgement.
- Options must never change while they are being scanned; Help is always reachable within the main loop.
- The user cannot use a mouse, touch, or keyboard. Anything on the user's screen is reached only by scanning.
- Frontend: React + Vite (`code/ui`), hub over one WebSocket (`code/hub`). A teammate is building a parallel control-centre UI against the same protocol.
- Learns from picks (`code/hub/memory.py`): past choices return first in similar moments, marked Learned. Stored on this machine only.

## Brand Commitments

- **Name:** Ding.AI.
- **Icon / motif:** a desk call bell (service / reception bell), not a temple or church bell.

## Evidence on Hand

- Concept and design docs: `docs/report.md`, `docs/demo.md`.
- Illustrative persona only (Ravi, 54, retired headmaster, Mysuru) in `code/hub/profile.json`; a real user's profile does not exist yet. Do not present the persona as a real person, and do not invent testimonials or results.

## Product Principles

1. **Every press is precious.** Fewer, better options; the likeliest first; never make the user wait or repeat.
2. **The user is an adult author.** Their words, their humour, their tone. Never childish, never clinical.
3. **Nothing moves under their eyes.** Calm, predictable, stable; change only at moments the user can expect.
4. **Readable by the room.** What the user says and what DING does must be legible to people nearby at a glance.
5. **Safety without drama.** Help is always one scan away; alerts are clear and unmistakable, never alarming by default.

## Accessibility & Inclusion

No user-specific visual needs are to be designed for yet (decided 2026-10-03). The single-switch, no-pointer interaction model is the binding accessibility requirement.
