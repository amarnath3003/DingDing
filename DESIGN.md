---
name: Ding.AI
description: One bell press becomes a whole sentence. A Claude-like conversation for a single switch.
colors:
  ground: "#faf9f5"
  sidebar: "#f3f1ea"
  surface: "#ffffff"
  sunk: "#efede5"
  bubble: "#ebe8de"
  line: "#e2dfd5"
  line-strong: "#cfcbbf"
  ink: "#1f1e1c"
  ink-muted: "#5f5d56"
  ink-faint: "#6c6961"
  clay: "#b9542f"
  clay-ink: "#8f3d1f"
  on-clay: "#ffffff"
  clay-wash: "#f6e5da"
  moss: "#3d6b4a"
  ochre: "#8a5a00"
  ochre-wash: "#f6ecd6"
  brick: "#a3271f"
  brick-wash: "#f7e1dd"
  ground-night: "#262624"
  sidebar-night: "#1f1e1d"
  surface-night: "#30302e"
  sunk-night: "#2b2b29"
  bubble-night: "#3a3936"
  line-night: "#3b3a37"
  line-strong-night: "#4d4c48"
  ink-night: "#f3f1ea"
  ink-muted-night: "#b9b5aa"
  ink-faint-night: "#a29e93"
  clay-night: "#d9774f"
  clay-ink-night: "#f0a07d"
  on-clay-night: "#1f1e1c"
  clay-wash-night: "#45302a"
  moss-night: "#8fc29b"
  ochre-night: "#e6b450"
  ochre-wash-night: "#3b3222"
  brick-night: "#f08a7e"
  brick-wash-night: "#45292a"
typography:
  display:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "clamp(36px, 7vh, 56px)"
    fontWeight: 500
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "clamp(32px, 6vh, 48px)"
    fontWeight: 500
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "clamp(22px, 3.4vh, 28px)"
    fontWeight: 500
    letterSpacing: "-0.01em"
  voice:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "clamp(21px, 3.5vh, 30px)"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  voice-small:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "clamp(16px, 2.3vh, 19px)"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "'Figtree Variable', 'Figtree', -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum'"
  action:
    fontFamily: "'Figtree Variable', 'Figtree', -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(15px, 2.2vh, 18px)"
    fontWeight: 550
  brand:
    fontFamily: "'Figtree Variable', 'Figtree', -apple-system, 'Segoe UI', sans-serif"
    fontSize: "19px"
    fontWeight: 650
    letterSpacing: "-0.01em"
  label:
    fontFamily: "'Figtree Variable', 'Figtree', -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "999px"
spacing:
  option-gap: "6px"
  chip-gap: "8px"
  stack: "14px"
  option-inset: "18px"
  column-x: "32px"
components:
  guess-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.voice}"
    rounded: "{rounded.md}"
    padding: "clamp(9px, 1.6vh, 14px) 18px"
  guess-option-highlighted:
    backgroundColor: "{colors.clay-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  guess-option-flash:
    backgroundColor: "{colors.clay}"
    textColor: "{colors.on-clay}"
    rounded: "{rounded.md}"
  action-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  action-chip-help:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brick}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  action-chip-open:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  does-chip:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "3px 10px 3px 8px"
  user-bubble:
    backgroundColor: "{colors.bubble}"
    textColor: "{colors.ink}"
    typography: "{typography.voice-small}"
    rounded: "{rounded.lg}"
    padding: "9px 16px"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.voice-small}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "58px"
  sim-tag:
    backgroundColor: "{colors.ochre-wash}"
    textColor: "{colors.ochre}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  callout-help:
    backgroundColor: "{colors.brick-wash}"
    textColor: "{colors.brick}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  callout-info:
    backgroundColor: "{colors.ochre-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  key:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  ops-button:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  ops-button-hover:
    backgroundColor: "{colors.sunk}"
  ops-button-on:
    backgroundColor: "{colors.clay-wash}"
    textColor: "{colors.clay-ink}"
  ops-button-primary:
    backgroundColor: "{colors.clay}"
    textColor: "{colors.on-clay}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  ops-button-primary-hover:
    backgroundColor: "{colors.clay-ink}"
  ops-input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  ops-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
---

# Design System: Ding.AI

## Overview

**Creative North Star: "A Conversation, Not a Control Board"**

Ding.AI looks and behaves like a calm assistant chat. People's words arrive as messages; the user's possible replies appear beneath them the way an assistant's answer does, set large in a reading serif and written in the user's own voice; a single clay highlight walks down them, and one bell press sends the lit line. The world is warm and unhurried: ivory paper by day, warm charcoal at night, hairline rules, one soft shadow under the composer, drawn line icons, and a desk call bell as the only mark.

Density is deliberately low. A centred conversation column (at most 800px) carries the transcript, three or four guesses, a quiet row of pill actions and the composer pinned at the bottom. A narrow sidebar on the left holds context for the people in the room: who is here, the room, simulated vitals, the camera's read, the mic switch. Nothing on the user's screen is reached by pointer; every interactive thing is a scan target, so the system is built around one legible "now" state rather than hover affordances.

The theme follows the day. `settings.theme` is `auto`, `light` or `dark`; on `auto` the screen goes dark when the hub reports `part_of_day === 'night'` (21:00 to 05:00) and crossfades over 0.4s. The operator panel is a separate tool and always renders in day.

**Key Characteristics:**
- Two-face voice: serif for words the user says or could say, sans for everything around them.
- One accent with one meaning on the user's screen: clay is "this option, now".
- One signature motion: the dwell line filling under the highlighted option.
- Flat, tonal layering with hairlines; the composer is the one lifted surface.
- Light by day, dark at night, same structure in both.
- Anything simulated wears an ochre "Simulated" tag.

## Colors

A warm, low-chroma paper-and-ink palette with a single clay accent and three quiet status hues; every role has a day and a night value, swapped on `[data-theme]`.

### Primary
- **Clay** (`clay`; night `clay-night`): the scan highlight's 2px inset ring, the flash fill when a press lands, the dwell line, the keyboard caret, the focus ring, the mic level meter, and the bell mark in the brand, idle screen and favicon.
- **Clay Wash** (`clay-wash`; night `clay-wash-night`): the fill inside the highlighted option or keyboard row; also the text-selection colour and the operator input focus halo.
- **Deep Clay Ink** (`clay-ink`; night `clay-ink-night`): clay as text: links, a device that is "On" in the sidebar, the operator's selected toggle text, and the primary operator button's hover.
- **On Clay** (`on-clay`): text on a flashed (pressed) option.

### Neutral
- **Warm Ivory** (`ground`) / **Warm Charcoal** (`ground-night`): the page and conversation ground.
- **Parchment** (`sidebar`) / **Soot** (`sidebar-night`): the sidebar and operator top bar, one step off the ground.
- **Paper** (`surface`) / **Graphite** (`surface-night`): raised things: composer, action chips, keys, switch, operator panels, check-in answers.
- **Linen** (`sunk`): recessed things: the "does" chip, an open action, kbd caps, the open keyboard row.
- **Oat** (`bubble`): the user's own sent line in the transcript.
- **Hairline** (`line`) and **Strong Hairline** (`line-strong`): 1px borders, row dividers, empty tracks; the strong step for the dashed "did" entry, switch track and scrollbar.
- **Ink** (`ink`), **Muted Ink** (`ink-muted`), **Faint Ink** (`ink-faint`): primary text; secondary text and icons; labels, speaker names and quiet metadata.

### Status
- **Moss** (`moss`): connected dot, mic switch on, "done" note, the "No, cancel" wide option.
- **Ochre** (`ochre`) on **Ochre Wash** (`ochre-wash`): simulated tags, the pause pill, the undo note, info callouts, vitals in warning.
- **Brick** (`brick`) on **Brick Wash** (`brick-wash`): Help only: the Help action, the help callout, the check-in reason and countdown, critical vitals, a rapid-tap bell, a live mic border.

### Named Rules
**The Clay Means Now Rule.** On the user's screen, a clay fill or clay ring means exactly one thing: this option, now (or the line being spoken now). Outside that, clay appears only as the bell mark and as thin live indicators (dwell line, caret, mic level). Never use clay for decoration, emphasis, headings, or a second kind of "selected".

**The Simulated Tag Rule.** Every mocked value (people in the room, room devices and temperature, vitals, a check-in reason, an overridden face read, shifted time) carries the ochre "Simulated" pill or the word "simulated" beside it. Ochre means "attention, not alarm"; brick is reserved for help.

## Typography

**Voice Font:** Source Serif 4 Variable (with Georgia, serif), self-hosted via @fontsource-variable.
**Chrome Font:** Figtree Variable (with -apple-system, Segoe UI, sans-serif), self-hosted via @fontsource-variable.

**Character:** A bookish, warm reading serif carries the user's words so they read as authored sentences, not buttons; a friendly geometric sans with fine variable weights (550, 600, 650) carries everything Ding.AI and other people say. Numerals are tabular throughout.

### Hierarchy
- **Display** (serif 500, clamp(36px, 7vh, 56px), -0.02em): the check-in question "Are you OK?".
- **Headline** (serif 500, clamp(32px, 6vh, 48px), -0.015em): the idle screen's "Ring the bell" / "Resting".
- **Title** (serif 500, clamp(22px, 3.4vh, 28px), -0.01em): an open group's breadcrumb title (More › Room); operator panel titles use the same face at 21px.
- **Voice** (serif 400, clamp(21px, 3.5vh, 30px), line-height 1.25): the AI guesses, the main thing on screen. Check-in answers rise to clamp(26px, 4.6vh, 36px); the keyboard draft sits at clamp(22px, 3.6vh, 30px); say-items in groups at clamp(18px, 2.8vh, 24px).
- **Voice small** (serif 400, clamp(16px, 2.3vh, 19px), line-height 1.4): the user's sent bubble and the composer line.
- **Body** (sans 400, 16px, line-height 1.45): base text; other people's transcript lines use clamp(16px, 2.3vh, 19px).
- **Action** (sans 550, clamp(15px, 2.2vh, 18px)): the action chips.
- **Brand** (sans 650, 19px, -0.01em): the "Ding.AI" wordmark beside the bell; the sidebar clock is sans 600 22px.
- **Label** (sans 600, 13px): speaker names, sidebar group headings, keyboard row labels. Sentence case, no tracking.

### Named Rules
**The Two Voices Rule.** If the user could say it, set it in the serif: guesses, the user's sent lines, say-items, keyboard completions and the draft. Other people's words, Ding.AI's chrome, labels, values and buttons are sans. The serif also sets the few display headings (check-in, idle, group and panel titles).

**The Sentence Case Rule.** No uppercase labels and no letter-spaced kickers anywhere; hierarchy comes from size, weight and ink step.

## Layout

A two-column app: a 264px sidebar and a main area. The main area centres one column at `min(800px, 100%)` with 32px side padding; the composer sits in an identically sized wrap pinned below it, so the conversation and its input share edges. Like a chat, the column's content settles to the bottom (first child `margin-top: auto`), just above the composer, rather than hanging from the top. A quiet conversation title ("Sunday night with Lakshmi") sits in the top band, 15px sans 550 in muted ink.

Vertical rhythm is tight and literal: 14px between column blocks, 10px between transcript lines, 6px between guesses, 8px between action chips, 2px between group items. Sizes inside the scan area scale with viewport height (`vh` clamps) so a laptop at arm's length fits transcript, guesses, actions and composer without scrolling.

**The One Left Edge Rule.** Other people's lines, the guesses, group titles and hints all start at an 18px inset, so the eye scans down one edge. The user's own lines sit right, in a bubble.

Below 860px the sidebar becomes a single top bar (brand, mic switch, connection dot); its groups and the clock are hidden, side padding drops to 16px, keyboard hints hide, long composer copy switches to its short form, keyboard rows stack their labels, and guesses scale on width (clamp(19px, 5.4vw, 24px)). The operator panel lays panels out as 380px masonry columns with an 18px gap.

## Elevation & Depth

Flat by default, with depth from tonal layering: ground, a sidebar one step darker, paper surfaces one step lighter, linen recesses and an oat bubble, separated by 1px hairlines. One soft two-layer shadow exists, and on the user's screen only the composer wears it; operator panels share it. The highlight is a 2px inset ring, not a lift.

### Shadow Vocabulary
- **Soft lift** (day `0 1px 2px rgba(31,30,28,0.06), 0 6px 18px -6px rgba(31,30,28,0.12)`; night `0 1px 2px rgba(0,0,0,0.3), 0 8px 22px -8px rgba(0,0,0,0.5)`): the composer and operator panels.
- **Now ring** (`inset 0 0 0 2px` clay): the highlighted option and keyboard row.
- **Speaking ring** (`0 0 0 2px` clay): the user's bubble while it is being spoken aloud.
- **Row divider** (`0 -1px 0` hairline): between group items, dropped next to the highlight.

### Named Rules
**The One Lifted Thing Rule.** On the user's screen the composer is the only surface with a shadow. Everything else is flat and separated by tone or hairline.

## Shapes

Soft, rounded, never sharp, on four steps: 8px for keys and inputs, 12px for option rows, callouts, the mic switch and keyboard rows, 18px for the composer, the user's bubble and operator panels, and full pills for anything chip-like (actions, the "does" chip, simulated tags, the pause pill, operator buttons, switch tracks). 6px is used for kbd caps and the focus outline. A dashed hairline outline marks a transcript entry that was an action ("Did: Turn the light off") rather than speech. Icons are lucide line icons at 15 to 24px (stroke 2, 1.75 for larger marks); the idle bell is 88px at stroke 1.25.

## Components

### Guess option (signature)
Large serif lines in the user's voice; the core of the screen.
- **Rest:** transparent, ink text, 12px radius, padding clamp(9px, 1.6vh, 14px) 18px, 14px gap to an optional trailing "does" chip.
- **Highlighted:** clay wash fill with a 2px clay inset ring; the "does" chip turns paper.
- **Flash (press landed):** solid clay with on-clay text, ring removed.
- **Transitions:** background, ring and colour over 0.18s on the house ease.
- **"Does" chip:** a linen pill (14px sans, muted ink, 15px icon) saying what the option also does to the room ("Turns on").
- **Cancel variant:** full-width, sans, moss text, 1px hairline border, check icon.

### Dwell line (signature motion)
A 3px clay bar along the bottom of the highlighted option (or keyboard row), scaling from 0 to full width, linear, over exactly the dwell time (`settings.scan_ms`, default 1200ms, stretched 1.3x when the camera reads the user as tired). It restarts each tick and is absent while scanning is paused.

**The Dwell Line Rule.** The dwell line is the only thing that travels on the user's screen. Everything else is a state crossfade, the bell mark breathing while the AI thinks (1.8s alternate), or the caret blinking. Options never move, reorder or reflow while they are being scanned. Reduced motion removes all transitions and animations.

### Action chips
A quiet row under the guesses: Other ideas, Keyboard, More, Help (Reactions when offered).
- **Shape:** full pill, 1px hairline border, paper fill, padding 9px 16px, 8px gap to an 18px icon in muted ink.
- **Highlighted / flash:** same clay states as the guesses; the icon takes the text colour.
- **Open:** linen fill, strong hairline border, while its group is showing.
- **Help:** brick text and icon at rest; always in the loop.

### Composer
Where an assistant's input box would be; pinned at the bottom of the column.
- **Style:** paper, 1px hairline, 18px radius, soft lift, padding 12px 16px, min-height 58px.
- **Content:** a speaker icon and a single serif line in muted ink (ink while speaking: "Speaking: “…”"), then bell feedback and kbd hints (Press / Hold / 3 taps) in 13px faint sans with linen kbd caps.
- **Keyboard mode:** the composer holds the serif draft, a clay caret and the prediction source.

### Transcript
The last three lines. Others: sans, left at the 18px edge, with a 13px faint speaker name above. The user: serif in an oat bubble, 18px radius, right-aligned, max 85% width. Older lines fade to 55%. Notes (done in moss, cancelled in ochre, "Hold the bell to undo") sit right-aligned under the last line at 14px.

### Groups
When More or a sub-menu opens it takes the guesses' place: a serif title with breadcrumbs, a 14px faint hint ("Hold the bell to go back."), then full-width list rows (clamp(18px, 2.8vh, 24px), 20px icons, chevron when it opens further) divided by hairlines. Rows that are things to say switch to the serif.

### Scanning keyboard
Rows with a 86px label column and a 12px-radius key tray; the whole row highlights (clay wash plus ring, with the dwell line) before its keys are scanned. Keys are paper, 1px hairline, 8px radius, padding 5px 12px; letters are 44px minimum and semibold; AI completions are serif. An empty row drops to 40% opacity.

### Callouts and check-in
- **Help callout:** brick wash, brick icon and text with an ink title, 12px radius, padding 12px 16px.
- **Info callout:** ochre wash with an ochre bell icon, ink text.
- **Pause pill:** ochre on ochre wash, 14px semibold, right-aligned.
- **Check-in:** a display serif question, the brick reason with its Simulated tag, a 4px brick countdown bar draining linearly, then larger guess options on paper with a hairline border.

### Sidebar
Parchment, hairline right border, padding 20px 18px, 22px between groups. Brand row (clay bell at 24px, stroke 1.75) and a large sans clock. Groups have a 13px faint heading with a Simulated tag and 15px rows: a 17px faint icon, the label, and a right-aligned muted value (clay ink for "On", ochre for warning, brick bold for critical). The footer holds the mic switch (paper, 12px radius, a pill track that turns moss when on and a brick border while hearing) and a connection dot.

### Operator panel
A separate, always-day tool for the team. Parchment top bar; paper panels (18px radius, hairline, soft lift, padding 18px 20px) with serif 21px titles. Buttons are hairline pills on the ground colour, 14px sans 550; hover goes linen with a strong hairline; a selected toggle is clay wash with a clay border and clay-ink text; the primary button is solid clay. Inputs are ground-coloured with 8px radius and take a clay border plus a 3px clay-wash halo on focus. Here clay may mean "selected" or "primary", because this is not the user's screen.

## Do's and Don'ts

### Do:
- **Do** keep clay for the single current option on the user's screen: clay-wash fill plus a 2px clay inset ring, a solid clay flash on press.
- **Do** set anything the user could say in Source Serif 4 and everything else in Figtree.
- **Do** run the dwell line for exactly the scan dwell, linear, and restart it on each tick.
- **Do** put the "Simulated" ochre pill on every mocked value, in every theme and every surface.
- **Do** build each new surface in both themes from the same custom properties and let `settings.theme` (auto, light, dark) decide.
- **Do** keep the conversation in the centred column (max 800px), settled above the pinned composer, with text on the shared 18px edge.
- **Do** keep Help reachable as a brick-text action in the main loop.

### Don't:
- **Don't** lay out guesses as an AAC symbol-tile grid; they are sentences in a column.
- **Don't** use clay for headings, decoration, badges or a second meaning of "selected" on the user's screen.
- **Don't** move, reorder or animate options while they are being scanned; the dwell line is the only travelling motion.
- **Don't** add shadows to the user's screen beyond the composer's soft lift.
- **Don't** use brick for anything that is not help or critical, or ochre for anything that is not simulated, paused or cautionary.
- **Don't** add uppercase or letter-spaced labels; use sentence case.
- **Don't** add hover-only affordances to the user's screen; it is reached only by scanning.
