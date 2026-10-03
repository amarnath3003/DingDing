---
version: 1
slug: "code-ui-src-bellscreen-jsx"
primary_target: "code/ui/src/BellScreen.jsx"
related_targets: ["code/ui/src/SimPanel.jsx"]
---

# Bell Screen + operator panel

Scope: `code/ui` Bell Screen (the user's screen, single-switch scanning) and the operator/sim panel. Mode: Operate.
Audience and job: a paralysed adult picks what to say or do with one bell press, at arm's length on a laptop; family and visitors read along. Operators drive mocks on the separate panel.
Constraints: no pointer for the user; options never move while scanned; Help in the main loop; simulated data labelled; laptop first, works narrow.

## Direction contract

THESIS: Ding.AI is a conversation, not a control board. It refuses the AAC symbol-tile grid: people's words arrive as messages, the user's possible replies appear the way an assistant's answer does, and one press sends one.
OWN-WORLD: user-pinned Claude-like interface. Warm ivory ground by day, warm charcoal at night, one clay accent that only ever marks "this is the option now". Reading serif for anything the user would say; quiet sans for chrome. Hairline rules, soft offset shadows, rounded composer, drawn line icons, service-bell mark.
STORY: someone speaks, their line appears; Ding.AI's guesses appear beneath in the user's voice; the clay highlight walks down them; a press sends one, it joins the transcript, the room hears it.
FIRST VIEWPORT: left sidebar (brand, who is here, room, simulated vitals, mic switch); centre column 760px: recent transcript on top, guesses as large serif lines with the clay-tinted highlight and its dwell line, a quiet row of actions (Other ideas, Keyboard, More, Help), and the composer pinned at the bottom showing what was said or the keyboard draft.
FORM: pinned by the user ("Implement Claude Like UI"), overriding the roll; seed key 16557953.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
