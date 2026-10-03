import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanner } from './useScanner.js'
import { useListener } from './useListener.js'
import {
  Check, ChevronRight, ConciergeBell, Delete, Ellipsis, Eye, HeartHandshake, Keyboard, Lamp, Laugh, LifeBuoy,
  MessageSquare, Mic, MicOff, Moon, RotateCcw, Send, Shuffle, Space, Sparkles, Tv, Undo2, Volume2, X,
} from 'lucide-react'
import Sidebar from './Sidebar.jsx'

// The user's screen. Their only input is the bell (Enter key for now).
//   PRESS = choose the highlighted option (or wake the screen)
//   HOLD  = confirm the bigger action for where you are. A line fills while the bell is
//           held; let go early and it is just a press. What it does is always on screen:
//             keyboard: speak the message · a card: "Close, but…" (variations of it)
//             just chose something: undo it · inside a group: back · elsewhere: back to the top
//   RAPID = SOS: fires on the third tap; the hub raises a Help alert by itself
// The highlight freezes from the moment the bell goes down until the gesture is known,
// so nothing moves under the user's eyes while they ring.
//
// Main loop (kept short because every second of scanning costs the user effort):
//   4 guesses · [Reactions, only in conversation] · Other ideas · Keyboard · Ask AI · More · Help
//
// Ask AI: a private chat with Ding.AI. Every AI turn ends in 3-4 answers to scan and pick, so it
// only ever asks for what a bell can give; "Type my own" opens the same keyboard, and Send goes to
// the chat instead of the voice. Nothing in the chat is spoken aloud.
const GRID = ['etaoin', 'shrdlu', 'cmfwyp', 'gbvkjxqz']
const IDLE_AFTER_MS = 45000
const ATTENTION_PAUSE = { eyes_closed: 'Eyes closed', looking_away: 'Looking away', no_face: 'No face in view' }
const REACTIONS = ['Haha!', 'Exactly.', 'No way!', 'Hmm…', 'Tell me more.']

const uniq = (xs) => [...new Map(xs.filter(Boolean).map((x) => [x.toLowerCase(), x])).values()]
const recent = (at, s) => at && Date.now() / 1000 - at < s

// Completes the half-typed last word if the suggestion continues it ("wa" + "want"),
// otherwise appends it as the next word ("i" + "want" -> "i want ").
function insertWord(draft, word) {
  const partial = draft.match(/\S+$/)?.[0] || ''
  if (partial && word.toLowerCase().startsWith(partial.toLowerCase())) return draft.slice(0, -partial.length) + word + ' '
  return `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}${word} `
}

export default function BellScreen({ hub }) {
  const { state, connected, send, onEvent } = hub
  const [view, setView] = useState('idle') // idle | main | keyboard | refine | chat
  const [idleReason, setIdleReason] = useState('start')
  const [draft, setDraftState] = useState('')
  const [kbTarget, setKbTarget] = useState('say') // what the keyboard writes: 'say' (aloud) | 'chat' (to Ask AI)
  const [deck, setDeck] = useState(null) // what's on screen; frozen while being scanned
  const pendingDeck = useRef(null)
  const [fx, setFx] = useState(null) // bell feedback {kind, t}
  const [bell, setBell] = useState(null) // bell contact in progress {down, at, count}: freezes the highlight
  const [refineCard, setRefineCard] = useState(null) // the card held for "Close, but…"
  const [refineGaveUp, setRefineGaveUp] = useState(false) // variations took too long: offer the way out
  const skips = useRef({ key: null, cycles: 0, sent: false }) // full cycles of one deck without a ring
  const [inControl, setInControl] = useState(true) // only one open Bell Screen acts on the bell
  const [, setClock] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setClock((x) => x + 1), 500) // keeps countdowns / bubbles fresh
    return () => clearInterval(t)
  }, [])

  const settings = state?.settings || { scan_ms: 1200 }
  const alert = state?.alert || { kind: 'none' }
  const mode = alert.kind === 'checkin' ? 'checkin' : view
  const face = state?.face
  const speaking = state?.speaking || {}
  const undoAvailable = !!(state?.last_action && state.last_action.expires > Date.now() / 1000)

  // Microphone: off by default, switched on from the screen toggle / sim panel / More menu.
  const listener = useListener({
    enabled: connected && !!settings.mic_on && !!state?.stt?.enabled,
    blocked: !!speaking.active,
  })
  const someoneTalking = listener.status === 'hearing' || listener.status === 'sending' || !!state?.stt_status?.busy
  const toggleMic = useCallback(() => send({ type: 'settings', mic_on: !settings.mic_on }), [send, settings.mic_on])

  const attentionPause =
    settings.pause_on_attention !== false && face?.source === 'camera' && face?.status === 'running'
      ? ATTENTION_PAUSE[face.attention]
      : null
  const pauseReason = !inControl ? 'another screen is in control'
    : mode === 'checkin' ? null : attentionPause || (someoneTalking ? 'someone is talking' : null)
  const dwell = settings.scan_ms * (face?.label === 'tired' ? 1.3 : 1)
  const frozen = !!pauseReason || !!bell // the scan stops while the bell is in contact
  const holdMs = state?.bell?.hold_ms || 1000

  const setDraft = useCallback((d) => {
    setDraftState(d)
    send({ type: 'kb_draft', draft: d, target: kbTarget })
  }, [send, kbTarget])

  // A half-typed message belongs to one place: switching between speaking and Ask AI starts it empty.
  const openKeyboard = useCallback((target, initial) => {
    if (initial !== undefined) setDraftState(initial)
    else if (target !== kbTarget) setDraftState('')
    setKbTarget(target)
    setView('keyboard')
  }, [kbTarget])

  // Keyboard done (Speak / Send, or HOLD): say it aloud, or send it to Ask AI when typing there.
  const speakDraft = useCallback(() => {
    const text = draft.trim()
    if (kbTarget === 'chat') {
      if (text) send({ type: 'chat_send', text, source: 'keyboard' })
      setDraft('')
      setView('chat')
      return
    }
    if (text) send({ type: 'say', text, source: 'keyboard' })
    setDraft('')
    setView('main')
  }, [draft, kbTarget, send, setDraft])

  const goIdle = useCallback((reason) => {
    setIdleReason(reason)
    setView('idle')
  }, [])

  const applyPending = useCallback(() => {
    if (pendingDeck.current) {
      setDeck(pendingDeck.current)
      pendingDeck.current = null
    }
  }, [])

  const wake = useCallback(() => {
    applyPending()
    setView('main')
  }, [applyPending])

  const heard = (state?.heard || []).filter((h) => h.secs_ago < 120).slice(-1)[0]
  const inConversation = !!heard

  // --- the option tree for the current mode ---------------------------------
  const root = useMemo(() => {
    if (!state) return []
    const say = (text) => () => send({ type: 'say', text, source: 'scan' })
    const leaf = (prefix) => (text) => ({ id: `${prefix}:${text}`, label: text, onSelect: say(text) })

    if (mode === 'checkin') {
      return [
        { id: 'ok', label: "I'm OK", icon: Check, big: true, onSelect: () => send({ type: 'alert_response', ok: true }) },
        { id: 'nok', label: 'No, get help', icon: LifeBuoy, big: true, onSelect: () => send({ type: 'alert_response', ok: false }) },
      ]
    }

    if (mode === 'keyboard') {
      const kb = state.keyboard?.draft === draft ? state.keyboard : null
      const row = (id, label, items) => ({ id, label, children: items, skip: items.length === 0 })
      const type = (s) => () => setDraft(draft + s)
      return [
        row('r:complete', 'Complete', (kb?.completions || []).map((c) => ({
          id: `c:${c}`, label: c, complete: true, onSelect: () => setDraft(c.trim() + ' '),
          after: () => ({ path: ['r:controls'], index: 0 }), // straight to Speak
        }))),
        row('r:words', 'Words', (kb?.next_words || []).map((w) => ({
          id: `w:${w}`, label: w, onSelect: () => setDraft(insertWord(draft, w)),
        }))),
        row('r:next', 'Likely', (kb?.next_letters || []).map((l) => ({
          id: `n:${l}`, label: l.toUpperCase(), letter: true, onSelect: type(l),
        }))),
        ...GRID.map((g, i) => row(`r:grid${i}`, i === 0 ? 'Letters' : '', [...g].map((ch) => ({
          id: `g${i}:${ch}`, label: ch.toUpperCase(), letter: true, onSelect: type(ch),
        })))),
        row('r:controls', 'Controls', [
          { id: 'k:speak', label: kbTarget === 'chat' ? 'Send' : 'Speak', icon: kbTarget === 'chat' ? Send : Volume2,
            onSelect: speakDraft, after: 'none' },
          { id: 'k:space', label: 'Space', icon: Space, onSelect: type(' ') },
          { id: 'k:del', label: 'Letter', icon: Delete, onSelect: () => setDraft(draft.slice(0, -1)), after: 'stay' },
          { id: 'k:delw', label: 'Word', icon: Delete, onSelect: () => setDraft(draft.replace(/\S+\s*$/, '')), after: 'stay' },
          { id: 'k:q', label: '?', onSelect: () => setDraft(draft.trimEnd() + '? ') },
          { id: 'k:dot', label: '.', onSelect: () => setDraft(draft.trimEnd() + '. ') },
          { id: 'k:clear', label: 'Clear', icon: X, onSelect: () => setDraft('') },
          { id: 'k:back', label: 'Back', icon: Undo2, onSelect: () => setView(kbTarget === 'chat' ? 'chat' : 'main'), after: 'none' },
        ]),
      ]
    }

    if (mode === 'refine') {
      const r = state.refine || {}
      if (!refineCard) return []
      if (!refineGaveUp && (r.for !== refineCard.text || r.loading)) return [] // nothing to scan until they arrive
      const variants = r.for === refineCard.text ? r.cards || [] : []
      return [
        ...variants.map((c, i) => ({
          id: `var:${c.text}`, label: c.text, card: c,
          onSelect: () => { send({ type: 'select', card: { ...c, rank: i + 1, refined_from: refineCard.text } }); setView('main') },
          after: 'none',
        })),
        { id: 'r:edit', label: 'Edit on keyboard', icon: Keyboard, tile: true,
          onSelect: () => openKeyboard('say', refineCard.text.replace(/[.!]$/, '') + ' '), after: 'none' },
        { id: 'r:orig', label: 'Say the first one', icon: Volume2, tile: true,
          onSelect: () => { send({ type: 'select', card: refineCard }); setView('main') }, after: 'none' },
        { id: 'r:back', label: 'Back', icon: Undo2, tile: true, onSelect: () => setView('main'), after: 'none' },
      ]
    }

    if (mode === 'chat') {
      const c = state.chat || {}
      return [
        // Answers change only after the user picks one (or starts a new chat), never mid-scan.
        ...(c.loading ? [] : c.options || []).map((o, i) => ({
          id: `ask:${i}:${o}`, label: o, answer: true, onSelect: () => send({ type: 'chat_send', text: o, source: 'scan' }),
        })),
        { id: 'a:type', label: 'Type my own', icon: Keyboard, tile: true, onSelect: () => openKeyboard('chat'), after: 'none' },
        { id: 'a:new', label: 'New chat', icon: RotateCcw, tile: true, onSelect: () => send({ type: 'chat_reset' }) },
        { id: 'a:back', label: 'Back', icon: Undo2, tile: true, onSelect: () => setView('main'), after: 'none' },
        { id: 'help', label: 'Help', icon: LifeBuoy, tile: true, danger: true, onSelect: () => send({ type: 'help' }) },
      ]
    }

    // main
    const cards = (deck?.cards || []).map((c, i) => ({
      id: `card:${c.id}`, label: c.text, card: c,
      onSelect: () => send({ type: 'select', card: { ...c, rank: i + 1 } }),
    }))
    const devices = Object.entries(state.devices || {}).map(([k, d]) => ({
      id: `dev:${k}`, label: `Turn ${d.label} ${d.on ? 'off' : 'on'}`, icon: k === 'tv' ? Tv : Lamp,
      onSelect: () => send({ type: 'device', device: k, on: !d.on, source: 'scan' }),
    }))
    // While help is on its way, the cards (what's wrong) come first; cancelling comes after them,
    // so stray extra taps from an SOS can never cancel it.
    const nodes = [...cards]
    if (alert.kind === 'help') {
      nodes.push({ id: 'cancel-help', label: "I'm OK now. Cancel help.", wide: true,
        onSelect: () => send({ type: 'alert_response', ok: true }) })
    }
    if (inConversation) {
      nodes.push({ id: 'g:react', label: 'Reactions', icon: Laugh, tile: true, sayItems: true,
        children: uniq([...(deck?.quick_reactions || []), ...REACTIONS]).slice(0, 5).map(leaf('r')) })
    }
    nodes.push(
      { id: 'more-ideas', label: 'Other ideas', icon: Shuffle, tile: true, onSelect: () => send({ type: 'deck_refresh' }) },
      { id: 'keyboard', label: 'Keyboard', icon: Keyboard, tile: true, onSelect: () => openKeyboard('say'), after: 'none' },
      { id: 'ai', label: 'Ask AI', icon: Sparkles, tile: true, onSelect: () => setView('chat'), after: 'none' },
      { id: 'g:more', label: 'More', icon: Ellipsis, tile: true, children: [
        { id: 'g:quick', label: 'Quick replies', icon: MessageSquare, sayItems: true, children: uniq(state.profile?.quick || []).map(leaf('q')) },
        { id: 'g:needs', label: 'Needs', icon: HeartHandshake, sayItems: true, children: (state.profile?.needs || []).map(leaf('n')) },
        { id: 'g:room', label: 'Room', icon: Lamp, children: devices },
        { id: 'mic', label: settings.mic_on ? 'Turn microphone off' : 'Turn microphone on', icon: settings.mic_on ? MicOff : Mic,
          onSelect: toggleMic },
        { id: 'rest', label: 'Rest', icon: Moon, onSelect: () => goIdle('rest'), after: 'none' },
      ] },
      { id: 'help', label: 'Help', icon: LifeBuoy, tile: true, danger: true, onSelect: () => send({ type: 'help' }) },
    )
    return nodes
  }, [state, mode, deck, draft, alert.kind, inConversation, settings.mic_on, send, setDraft, goIdle, toggleMic, refineCard, refineGaveUp, kbTarget, openKeyboard, speakDraft])

  const cycleMs = Math.max(1, root.length) * dwell
  const scanner = useScanner({
    root,
    dwellMs: dwell,
    active: connected && mode !== 'idle',
    paused: frozen,
    idleCycles: mode === 'main' && alert.kind === 'none' ? Math.max(3, Math.round(IDLE_AFTER_MS / cycleMs)) : Infinity,
    onIdle: () => goIdle('timeout'),
    onRootBack: () => {
      if (mode === 'keyboard' && kbTarget === 'chat') setView('chat')
      else if (mode !== 'main') setView('main')
    },
    onCycleStart: () => {
      applyPending()
      // Scanned past every guess twice without a ring: none of them fit. Ask for fresh ones;
      // they replace these at the start of a later cycle, never mid-scan.
      const sk = skips.current
      const key = deck?.generated_at
      if (mode !== 'main' || !key || !deck.cards?.length) return
      if (sk.key !== key) Object.assign(sk, { key, cycles: 0, sent: false })
      sk.cycles += 1
      if (sk.cycles >= 2 && !sk.sent) {
        sk.sent = true
        send({ type: 'deck_skipped', cards: deck.cards.map((c) => c.text) })
      }
    },
  })

  // What a HOLD does right now, for the option highlighted when the bell went down.
  const holdAction = (target) => {
    if (mode === 'keyboard') return draft.trim() ? (kbTarget === 'chat' ? 'send' : 'speak') : 'back'
    if (mode === 'refine' || mode === 'chat') return 'back'
    if (mode !== 'main') return null
    if (scanner.path.length) return 'back'
    if (undoAvailable) return 'undo'
    if (target?.card) return 'refine'
    return 'top'
  }
  const HOLD_TEXT = { speak: 'speak it', send: 'send it', back: 'go back', undo: 'undo', refine: 'close, but…', top: 'back to the top' }
  const holdMeaning = HOLD_TEXT[holdAction(bell?.target ?? scanner.highlighted)] // while held: the frozen option

  const onHold = (sc, msSinceDown) => {
    const target = sc.peek(msSinceDown)
    const act = holdAction(target)
    if (act === 'speak' || act === 'send') speakDraft()
    else if (act === 'undo') send({ type: 'undo' })
    else if (act === 'refine') {
      setRefineCard(target.card)
      send({ type: 'refine', card: target.card })
      setView('refine')
    } else if (act === 'top') sc.reset(0)
    else if (act === 'back') sc.back()
  }

  // Restart scanning from the top whenever the mode changes; tell the hub (it skips paid refreshes while idle).
  useEffect(() => {
    scanner.reset(0)
    send({ type: 'ui_event', event: 'mode', mode })
    if (mode === 'keyboard') send({ type: 'kb_draft', draft, target: kbTarget }) // fresh predictions from context
    if (mode === 'chat') send({ type: 'chat_open' }) // greets on first open; otherwise carries on where it was
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // New deck from the hub: show now if nobody is scanning it, else at the start of the next cycle.
  // Replies to something just heard, and "Other ideas", can't wait.
  useEffect(() => {
    const d = state?.deck
    if (!d) return
    const urgent = (d.reasons || []).some((r) => r === 'heard' || r === 'other_ideas')
    if (!deck || mode !== 'main' || urgent) {
      setDeck(d)
      pendingDeck.current = null
      if (urgent && mode === 'main') scanner.reset(0)
    } else {
      pendingDeck.current = d
    }
  }, [state?.deck]) // eslint-disable-line react-hooks/exhaustive-deps

  // Someone spoke to the user: wake the screen so the replies are in front of them
  // (but respect an explicit Rest).
  const heardKey = heard && `${heard.speaker}:${heard.text}`
  useEffect(() => {
    if (heardKey && view === 'idle' && idleReason !== 'rest') wake()
  }, [heardKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // A check-in or help alert always wakes the screen, and scanning starts over from the top
  // (the options just changed shape).
  useEffect(() => {
    if (alert.kind !== 'none' && (view === 'idle' || view === 'refine' || view === 'chat')) setView('main')
    else if (mode === 'main') scanner.reset(0)
  }, [alert.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  // A new Ask AI reply: scan its answers from the first.
  const chatTurn = mode === 'chat' && !state?.chat?.loading ? state?.chat?.messages?.length : null
  useEffect(() => {
    if (chatTurn) scanner.reset(0)
  }, [chatTurn]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Close, but…" variations arrived: scan them from the first. If they never come, offer the way out.
  const refineReady = mode === 'refine' && !!refineCard && state?.refine?.for === refineCard.text && !state.refine.loading
  useEffect(() => {
    if (refineReady) scanner.reset(0)
  }, [refineReady]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setRefineGaveUp(false)
    if (mode !== 'refine') return
    const t = setTimeout(() => { setRefineGaveUp(true); scanner.reset(0) }, 9000)
    return () => clearTimeout(t)
  }, [mode, refineCard]) // eslint-disable-line react-hooks/exhaustive-deps

  // Safety: never stay frozen if the end of a burst got lost (socket hiccup, window lost focus).
  useEffect(() => {
    if (!bell || bell.down) return
    const t = setTimeout(() => setBell(null), (state?.bell?.repeat_gap_ms || 500) + 1500)
    return () => clearTimeout(t)
  }, [bell, state?.bell?.repeat_gap_ms])

  // Safety net: whatever is highlighted is always on screen, even if a long option overflows the page.
  useEffect(() => {
    document.querySelector('.column .is-hi, .column .row-hi')?.scrollIntoView({ block: 'nearest' })
  }, [scanner.tick, mode])

  // Tell the hub this is a Bell Screen; the newest one (or the one the bell is pressed on) is in control.
  useEffect(() => {
    if (connected) send({ type: 'hello', role: 'bell' })
  }, [connected, send])

  // --- bell input -----------------------------------------------------------
  // Enter key = the bell contact. Raw edges go to the hub, which classifies
  // PRESS / HOLD / RAPID with the same timings as the ESP32 firmware.
  useEffect(() => {
    const edge = (down) => (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (!(down && e.repeat)) send({ type: 'bell_edge', down })
    }
    const down = edge(true)
    const up = edge(false)
    const blur = () => send({ type: 'bell_edge', down: false })
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [send])

  const latest = useRef({})
  latest.current = { mode, scanner, wake, state, onHold }
  useEffect(() => onEvent((msg) => {
    const { mode: m, scanner: sc, wake: wk, state: st, onHold: hold } = latest.current
    if (msg.type === 'role') setInControl(!!msg.in_control)
    else if (msg.type === 'bell') {
      const now = Date.now()
      if (msg.phase === 'down') {
        // Freeze on what the press will pick (inside the grace window that is the previous option).
        setBell((b) => {
          const target = b ? b.target : sc.peek(0)
          return { down: true, at: now, count: b?.count || 0, target, targetId: target?.id ?? null }
        })
        setFx({ kind: 'down', t: now })
      } else if (msg.phase === 'up') {
        setBell((b) => ({ ...(b || {}), down: false, count: msg.count }))
        if (msg.count >= 2) setFx({ kind: 'taps', count: msg.count, t: now })
      } else if (msg.phase === 'hold_started') {
        setFx({ kind: 'holding', t: now })
      } else if (msg.phase === 'burst_end') {
        setBell(null)
      } else if (msg.phase === 'gesture') {
        setBell(null)
        setFx({ kind: msg.gesture, t: now })
        if (msg.gesture === 'press') {
          if (m === 'idle') wk()
          else sc.press(msg.ms_since_down || 0)
        } else if (msg.gesture === 'hold' && m !== 'idle') {
          hold(sc, msg.ms_since_down || 0)
        }
      }
    } else if (msg.type === 'speak' && st?.tts_in_browser && 'speechSynthesis' in window) {
      speechSynthesis.cancel()
      speechSynthesis.speak(new SpeechSynthesisUtterance(msg.text))
    }
  }), [onEvent])

  const night = settings.theme === 'dark' || (settings.theme !== 'light' && state?.env?.part_of_day === 'night')
  if (!state) {
    return <div className="app" data-theme="light"><div className="connecting">{connected ? 'Loading…' : 'Connecting to Ding.AI…'}</div></div>
  }

  // --- rendering --------------------------------------------------------------
  const name = state.profile?.name || 'You'
  const hiId = bell?.targetId ?? scanner.highlightedId
  const isHi = (n) => hiId === n.id
  // While the bell is held, the scan line gives way to the hold line: it fills to the hold
  // threshold (after a short delay, so ordinary presses never flash it).
  const holdLine = bell?.down && holdMeaning && <i key={`h${bell.at}`} className="holdbar" style={{ animationDuration: `${holdMs - 250}ms` }} />
  const opt = (n, base, content) => (
    <div key={n.id} className={[base, 'opt', isHi(n) && 'is-hi', scanner.flashId === n.id && 'is-flash'].filter(Boolean).join(' ')}>
      {content ?? n.label}
      {isHi(n) && !frozen && <i key={scanner.tick} className="dwell" style={{ animationDuration: `${scanner.dwellNow}ms` }} />}
      {isHi(n) && holdLine}
    </div>
  )

  const announcement = recent(state.announcement?.at, 8) ? state.announcement.text : null
  const undone = recent(state.undone?.at, 4) ? state.undone.text : null
  const done = recent(state.done?.at, 5) ? state.done.text : null

  return (
    <div className="app" data-theme={night ? 'dark' : 'light'}>
      <Sidebar state={state} connected={connected} listener={listener} onToggleMic={toggleMic} />
      <div className="main">
        {mode !== 'idle' && (
          <header className="convo-title">
            {state.env?.day} {state.env?.part_of_day}{state.present?.length ? ` with ${state.present.join(' and ')}` : ''}
          </header>
        )}
        <div className="column">
          {alert.kind === 'help' && (
            <div className="callout help" role="alert">
              <LifeBuoy size={22} />
              <div>
                <span className="title">Help requested{alert.source === 'auto' ? ' automatically' : ''}.</span> {alert.reason}
                <span className="sub">{alert.acknowledged_by ? `${alert.acknowledged_by} is coming.` : 'Caregiver alerted (simulated). Waiting for a reply.'}</span>
              </div>
            </div>
          )}
          {announcement && alert.kind !== 'help' && mode !== 'checkin' && (
            <div className="callout info"><ConciergeBell size={20} /> {announcement}</div>
          )}
          {pauseReason && mode !== 'idle' && <div className="pause"><Eye size={15} /> Paused: {pauseReason}{!inControl ? '. Press the bell here to take over.' : ''}</div>}

          {mode === 'keyboard' && kbTarget === 'chat' && <ChatLast chat={state.chat} />}
          {mode !== 'checkin' && mode !== 'idle' && mode !== 'chat' && !(mode === 'keyboard' && kbTarget === 'chat') && (
            <Transcript items={state.transcript || []} max={mode === 'keyboard' ? 1 : 3} name={name} speaking={speaking} undone={undone} done={done} undoAvailable={undoAvailable} />
          )}

          {mode === 'idle' && <IdleView reason={idleReason} name={name} />}
          {mode === 'checkin' && <CheckinView alert={alert} root={root} opt={opt} />}
          {mode === 'main' && <MainView root={root} scanner={scanner} opt={opt} deck={deck} status={state.deck_status} />}
          {mode === 'keyboard' && <KeyboardView root={root} scanner={scanner} opt={opt} hiId={hiId} frozen={frozen} holdLine={holdLine} />}
          {mode === 'chat' && <ChatView chat={state.chat} root={root} opt={opt} heard={heard} />}
          {mode === 'refine' && <RefineView root={root} opt={opt} card={refineCard} waiting={root.length === 0} />}
        </div>

        <div className="composer-wrap">
          <div className="composer">
            {mode === 'keyboard' ? (
              <>
                <div className="draft">{draft || <span className="placeholder">{kbTarget === 'chat' ? 'Spell your message to Ding.AI' : 'Spell your message'}</span>}<span className="caret" /></div>
                <span className="source">{state.keyboard?.source === 'ai' ? 'AI predictions' : 'Word list'}</span>
              </>
            ) : (
              <>
                {mode === 'chat' ? <Sparkles size={20} /> : <Volume2 size={20} />}
                <span className={`said ${speaking.active ? 'live' : ''}`}>
                  {mode === 'idle' ? 'Ring the bell to begin'
                    : speaking.active && speaking.text ? `Speaking: “${speaking.text}”`
                    : mode === 'chat' ? <><span className="copy-long">Ring to answer. Only you see this chat.</span><span className="copy-short">Ring to answer</span></>
                    : <><span className="copy-long">Ring to choose. It’s spoken aloud.</span><span className="copy-short">Ring to choose</span></>}
                </span>
              </>
            )}
            <BellFx fx={fx} holdMeaning={holdMeaning} />
            {!(fx && Date.now() - fx.t < 1500) && (
              <span className="keys">
                <span><kbd>Press</kbd>{mode === 'idle' ? 'start' : mode === 'keyboard' ? 'type' : 'choose'}</span>
                {holdMeaning && <span><kbd>Hold</kbd>{holdMeaning}</span>}
                <span><kbd>3 taps</kbd>help</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Transcript({ items, max, name, speaking, undone, done, undoAvailable }) {
  const shown = items.slice(-max)
  return (
    <div className="transcript" aria-live="polite">
      {shown.map((it, i) => {
        const live = it.me && speaking.active && speaking.text === it.text
        const old = i < shown.length - 1 && it.secs_ago > 90
        return (
          <div key={`${it.who}:${it.text}:${i}`} className={`line ${it.me ? 'me' : 'them'} ${it.kind === 'did' ? 'did' : ''} ${old ? 'old' : ''} ${live ? 'speaking' : ''}`}>
            {!it.me && <span className="who">{it.who}</span>}
            <span className="text">{it.kind === 'did' ? `Did: ${it.text}` : it.text}</span>
          </div>
        )
      })}
      {undone && <div className="note undone"><Undo2 size={15} /> Cancelled “{undone}”</div>}
      {!undone && done && <div className="note done"><Check size={15} /> {done}</div>}
      {!undone && !done && undoAvailable && <div className="note"><Undo2 size={15} /> Hold the bell to undo</div>}
      {shown.length === 0 && <div className="line them"><span className="who">Ding.AI</span><span className="text muted">Nothing said yet. Here is what {name} might want right now.</span></div>}
    </div>
  )
}

function IdleView({ reason, name }) {
  return (
    <div className="idle">
      <ConciergeBell size={88} strokeWidth={1.25} />
      <h1>{reason === 'rest' ? 'Resting' : 'Ring the bell'}</h1>
      <p>
        {reason === 'rest' ? 'Ring once when you want me.'
          : reason === 'timeout' ? 'Paused after a while without rings. Ring once to continue.'
          : `Ready for ${name}.`}
      </p>
    </div>
  )
}

function CheckinView({ alert, root, opt }) {
  const total = Math.max(1, alert.deadline - alert.since)
  const left = Math.max(0, alert.deadline - Date.now() / 1000)
  return (
    <div className="checkin" role="alertdialog" aria-label="Are you OK?">
      <h1>Are you OK?</h1>
      <div className="why">{alert.reason} <span className="sim-tag">Simulated</span></div>
      <div className="countdown"><i style={{ transform: `scaleX(${left / total})` }} /></div>
      <div className="left">If there is no answer, Ding.AI calls for help in {Math.round(left)} seconds.</div>
      <div className="options">
        {root.map((n) => opt(n, 'guess', <><n.icon size={30} strokeWidth={1.75} /><span className="text">{n.label}</span></>))}
      </div>
    </div>
  )
}

function MainView({ root, scanner, opt, deck, status }) {
  const cards = root.filter((n) => n.card || n.wide)
  const tiles = root.filter((n) => n.tile)
  let nodes = root
  const trail = []
  for (const id of scanner.path) {
    const g = nodes.find((n) => n.id === id)
    if (!g?.children) break
    trail.push(g)
    nodes = g.children
  }
  const open = trail[trail.length - 1]
  return (
    <>
      {open ? (
        <div className="group">
          <h2>{trail.map((g) => g.label).join(' › ')}</h2>
          <p className="hint">Hold the bell to go back.</p>
          <div className="group-items">
            {open.children.map((c) => opt(c, `item ${open.sayItems ? 'say' : ''}`, (
              <>
                {c.icon && <c.icon size={20} />}
                <span>{c.label}</span>
                {c.children && <ChevronRight className="chev" size={20} />}
              </>
            )))}
          </div>
        </div>
      ) : (
        <>
          {(status?.loading || deck?.source === 'local') && (
            <div className="guesses-head">
              {status?.loading
                ? <span className="thinking"><ConciergeBell className="breathe" size={16} /> Thinking about what to suggest</span>
                : <span>Using the phrasebook while the AI is unavailable.</span>}
            </div>
          )}
          <div className="guesses">
            {cards.length === 0 && <div className="guess muted">Preparing suggestions…</div>}
            {cards.map((n) => opt(n, `guess ${n.wide ? 'cancel' : ''}`, (
              <>
                {n.wide && <Check size={24} />}
                <span className="text">{n.label}</span>
                {n.card && n.card.device !== 'none' && (
                  <span className="does">
                    {n.card.device === 'tv' ? <Tv size={15} /> : <Lamp size={15} />}
                    {n.card.device_on ? 'Turns on' : 'Turns off'}
                  </span>
                )}
              </>
            )))}
          </div>
        </>
      )}
      <div className="actions">
        {tiles.map((n) => opt(n, `action ${n.danger ? 'help' : ''} ${trail[0]?.id === n.id ? 'is-open' : ''}`, (
          <><n.icon size={18} />{n.label}</>
        )))}
      </div>
    </>
  )
}

function KeyboardView({ root, scanner, opt, hiId, frozen, holdLine }) {
  return (
    <div className="kb">
      {root.map((row) => {
        const hi = hiId === row.id
        const open = scanner.path[0] === row.id
        return (
          <div key={row.id} className={`kb-row ${hi ? 'row-hi' : ''} ${open ? 'row-open' : ''} ${row.skip ? 'empty' : ''}`}>
            <span className="kb-label">{row.label}</span>
            <div className="kb-items">
              {row.children.length === 0 && <span className="muted">No suggestions yet</span>}
              {row.children.map((it) => opt(it, `key ${it.letter ? 'letter' : ''} ${it.complete ? 'complete' : ''}`, (
                <>{it.icon && <it.icon size={18} />}{it.label}</>
              )))}
              {hi && !frozen && <i key={scanner.tick} className="dwell" style={{ animationDuration: `${scanner.dwellNow}ms` }} />}
              {hi && holdLine}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Feedback beside the composer, from the first contact: what holding would do, how many taps
// so far, and what the ring did.
function BellFx({ fx, holdMeaning }) {
  if (!fx || Date.now() - fx.t > (fx.kind === 'holding' || fx.kind === 'down' ? 4000 : 1500)) return null
  if (fx.kind === 'down') {
    return (
      <span className="bell-fx down">
        <ConciergeBell size={16} /> {holdMeaning ? <span className="later">Keep holding to {holdMeaning}</span> : 'Ring'}
      </span>
    )
  }
  const text = {
    holding: holdMeaning ? `Let go to ${holdMeaning}` : 'Holding',
    taps: `${fx.count} taps · a third calls help`,
    press: 'Chosen',
    hold: 'Held',
    rapid: 'Help called',
  }[fx.kind]
  return <span className={`bell-fx ${fx.kind}`}><ConciergeBell size={16} /> {text}</span>
}

function RefineView({ root, opt, card, waiting }) {
  const cards = root.filter((n) => n.card)
  const tiles = root.filter((n) => n.tile)
  return (
    <>
      <div className="refine">
        <h2>Close, but not quite</h2>
        <p className="refine-from">“{card?.text}”</p>
      </div>
      <div className="guesses">
        {waiting && <div className="guess muted"><span className="thinking"><ConciergeBell className="breathe" size={16} /> Finding closer ones</span></div>}
        {cards.map((n) => opt(n, 'guess', <span className="text">{n.label}</span>))}
        {!waiting && cards.length === 0 && <div className="guess muted">No closer ideas this time.</div>}
      </div>
      <div className="actions">
        {tiles.map((n) => opt(n, 'action', <><n.icon size={18} />{n.label}</>))}
      </div>
    </>
  )
}

// Ask AI: Ding.AI's lines on the left, the user's answers on the right, the next answers to pick below.
function ChatView({ chat, root, opt, heard }) {
  const answers = root.filter((n) => n.answer)
  const tiles = root.filter((n) => n.tile)
  const shown = (chat?.messages || []).slice(-3)
  return (
    <>
      <div className="chat-head">
        <Sparkles size={15} /> Ask AI · private, nothing here is spoken aloud
        {chat?.source === 'local' && ' · AI unavailable, answering from what I know'}
      </div>
      <div className="chat-log" aria-live="polite">
        {shown.map((m, i) => (
          <div key={`${m.at}:${i}`} className={`cmsg ${m.role} ${i < shown.length - 2 ? 'old' : ''}`}>
            {m.role === 'ai' && <span className="who">Ding.AI</span>}
            <span className="text">{m.text}</span>
          </div>
        ))}
        {chat?.loading && <div className="cmsg ai"><span className="thinking"><ConciergeBell className="breathe" size={16} /> Thinking</span></div>}
      </div>
      {heard && heard.secs_ago < 60 && (
        <div className="chat-heard">{heard.speaker} said “{heard.text}” · Hold the bell to go back and reply</div>
      )}
      <div className="guesses">
        {answers.map((n) => opt(n, 'guess chat-opt', <span className="text">{n.label}</span>))}
      </div>
      <div className="actions">
        {tiles.map((n) => opt(n, `action ${n.danger ? 'help' : ''}`, <><n.icon size={18} />{n.label}</>))}
      </div>
    </>
  )
}

// Typing to Ask AI: what the user is answering stays in view above the keyboard.
function ChatLast({ chat }) {
  const last = (chat?.messages || []).filter((m) => m.role === 'ai').slice(-1)[0]
  if (!last) return null
  return <div className="cmsg ai"><span className="who">Ding.AI</span><span className="text">{last.text}</span></div>
}
