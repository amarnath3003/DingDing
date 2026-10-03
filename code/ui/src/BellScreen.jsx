import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanner } from './useScanner.js'
import { useListener } from './useListener.js'
import ContextBar from './ContextBar.jsx'

// The user's screen. Their only input is the bell (Enter key for now).
//   PRESS = choose the highlighted option (or wake the screen)
//   HOLD  = back; on the main screen: undo the last choice (within a few seconds), else rest
//   RAPID = SOS: the hub raises a Help alert by itself
//
// Main loop (kept short because every second of scanning costs the user effort):
//   4 guesses · [Reactions, only in conversation] · Other ideas · Keyboard · More · Help
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
  const [view, setView] = useState('idle') // idle | main | keyboard
  const [idleReason, setIdleReason] = useState('start')
  const [draft, setDraftState] = useState('')
  const [deck, setDeck] = useState(null) // what's on screen; frozen while being scanned
  const pendingDeck = useRef(null)
  const [fx, setFx] = useState(null) // bell feedback {kind, t}
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
  const pauseReason = mode === 'checkin' ? null : attentionPause || (someoneTalking ? 'Someone is talking…' : null)
  const dwell = settings.scan_ms * (face?.label === 'tired' ? 1.3 : 1)

  const setDraft = useCallback((d) => {
    setDraftState(d)
    send({ type: 'kb_draft', draft: d })
  }, [send])

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
        { id: 'ok', label: "✅ I'm OK", big: true, onSelect: () => send({ type: 'alert_response', ok: true }) },
        { id: 'nok', label: '🆘 No, get help', big: true, onSelect: () => send({ type: 'alert_response', ok: false }) },
      ]
    }

    if (mode === 'keyboard') {
      const kb = state.keyboard?.draft === draft ? state.keyboard : null
      const row = (id, label, items) => ({ id, label, children: items, skip: items.length === 0 })
      const type = (s) => () => setDraft(draft + s)
      return [
        row('r:complete', 'Complete', (kb?.completions || []).map((c) => ({
          id: `c:${c}`, label: c, onSelect: () => setDraft(c.trim() + ' '),
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
          { id: 'k:speak', label: '🔊 Speak', onSelect: () => {
            if (draft.trim()) send({ type: 'say', text: draft.trim(), source: 'keyboard' })
            setDraft('')
            setView('main')
          }, after: 'none' },
          { id: 'k:space', label: '␣ Space', onSelect: type(' ') },
          { id: 'k:del', label: '⌫ Letter', onSelect: () => setDraft(draft.slice(0, -1)), after: 'stay' },
          { id: 'k:delw', label: '⌫ Word', onSelect: () => setDraft(draft.replace(/\S+\s*$/, '')), after: 'stay' },
          { id: 'k:q', label: '?', onSelect: () => setDraft(draft.trimEnd() + '? ') },
          { id: 'k:dot', label: '.', onSelect: () => setDraft(draft.trimEnd() + '. ') },
          { id: 'k:clear', label: 'Clear', onSelect: () => setDraft('') },
          { id: 'k:back', label: '↶ Back', onSelect: () => setView('main'), after: 'none' },
        ]),
      ]
    }

    // main
    const cards = (deck?.cards || []).map((c, i) => ({
      id: `card:${c.id}`, label: c.text, card: c,
      onSelect: () => send({ type: 'select', card: { ...c, rank: i + 1 } }),
    }))
    const devices = Object.entries(state.devices || {}).map(([k, d]) => ({
      id: `dev:${k}`, label: `${d.icon} Turn ${d.label} ${d.on ? 'off' : 'on'}`,
      onSelect: () => send({ type: 'device', device: k, on: !d.on, source: 'scan' }),
    }))
    const nodes = []
    if (alert.kind === 'help') {
      nodes.push({ id: 'cancel-help', label: "✅ I'm OK now. Cancel help.", wide: true,
        onSelect: () => send({ type: 'alert_response', ok: true }) })
    }
    nodes.push(...cards)
    if (inConversation) {
      nodes.push({ id: 'g:react', label: 'Reactions', icon: '😂', tile: true,
        children: uniq([...(deck?.quick_reactions || []), ...REACTIONS]).slice(0, 5).map(leaf('r')) })
    }
    nodes.push(
      { id: 'more-ideas', label: 'Other ideas', icon: '↻', tile: true, onSelect: () => send({ type: 'deck_refresh' }) },
      { id: 'keyboard', label: 'Keyboard', icon: '⌨️', tile: true, onSelect: () => setView('keyboard'), after: 'none' },
      { id: 'g:more', label: 'More', icon: '☰', tile: true, children: [
        { id: 'g:quick', label: 'Quick replies', icon: '💬', children: uniq(state.profile?.quick || []).map(leaf('q')) },
        { id: 'g:needs', label: 'Needs', icon: '🙋', children: (state.profile?.needs || []).map(leaf('n')) },
        { id: 'g:room', label: 'Room', icon: '🏠', children: devices },
        { id: 'mic', label: settings.mic_on ? 'Turn microphone off' : 'Turn microphone on', icon: settings.mic_on ? '🔇' : '🎙',
          onSelect: toggleMic },
        { id: 'rest', label: 'Rest', icon: '⏸', onSelect: () => goIdle('rest'), after: 'none' },
      ] },
      { id: 'help', label: 'Help', icon: '🆘', tile: true, danger: true, onSelect: () => send({ type: 'help' }) },
    )
    return nodes
  }, [state, mode, deck, draft, alert.kind, inConversation, settings.mic_on, send, setDraft, goIdle, toggleMic])

  const cycleMs = Math.max(1, root.length) * dwell
  const scanner = useScanner({
    root,
    dwellMs: dwell,
    active: connected && mode !== 'idle',
    paused: !!pauseReason,
    idleCycles: mode === 'main' && alert.kind === 'none' ? Math.max(3, Math.round(IDLE_AFTER_MS / cycleMs)) : Infinity,
    onIdle: () => goIdle('timeout'),
    onRootBack: () => {
      if (mode === 'keyboard') setView('main')
      else if (mode === 'main') undoAvailable ? send({ type: 'undo' }) : goIdle('rest')
    },
    onCycleStart: applyPending,
  })

  // Restart scanning from the top whenever the mode changes; tell the hub (it skips paid refreshes while idle).
  useEffect(() => {
    scanner.reset(0)
    send({ type: 'ui_event', event: 'mode', mode })
    if (mode === 'keyboard') send({ type: 'kb_draft', draft }) // fresh predictions from context
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

  // A check-in or help alert always wakes the screen.
  useEffect(() => {
    if (alert.kind !== 'none' && view === 'idle') setView('main')
  }, [alert.kind]) // eslint-disable-line react-hooks/exhaustive-deps

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
  latest.current = { mode, scanner, wake, state }
  useEffect(() => onEvent((msg) => {
    const { mode: m, scanner: sc, wake: wk, state: st } = latest.current
    if (msg.type === 'bell') {
      if (msg.phase === 'down') setFx({ kind: 'down', t: Date.now() })
      else if (msg.phase === 'hold_started') setFx({ kind: 'holding', t: Date.now() })
      else if (msg.phase === 'gesture') {
        setFx({ kind: msg.gesture, t: Date.now() })
        if (msg.gesture === 'press') {
          if (m === 'idle') wk()
          else sc.press(msg.ms_since_down || 0)
        } else if (msg.gesture === 'hold' && m !== 'idle') {
          sc.back()
        }
      }
    } else if (msg.type === 'speak' && st?.tts_in_browser && 'speechSynthesis' in window) {
      speechSynthesis.cancel()
      speechSynthesis.speak(new SpeechSynthesisUtterance(msg.text))
    }
  }), [onEvent])

  if (!state) {
    return <div className="screen"><div className="connecting">{connected ? 'Loading…' : 'Connecting to DING…'}</div></div>
  }

  // --- rendering --------------------------------------------------------------
  const isHi = (n) => scanner.highlightedId === n.id
  const opt = (n, base, content) => (
    <div key={n.id} className={[base, isHi(n) && 'hi', scanner.flashId === n.id && 'flash', n.danger && 'danger', n.big && 'big']
      .filter(Boolean).join(' ')}>
      {content ?? n.label}
      {isHi(n) && !pauseReason && <i key={scanner.tick} className="dwell" style={{ animationDuration: `${scanner.dwellNow}ms` }} />}
    </div>
  )

  const night = state.env?.part_of_day === 'night'
  const announcement = recent(state.announcement?.at, 8) ? state.announcement.text : null
  const undone = recent(state.undone?.at, 4) ? state.undone.text : null
  const bubble = speaking.text && (speaking.active || recent(speaking.at, 5)) ? speaking : null
  const done = !bubble && recent(state.done?.at, 4) ? state.done.text : null

  return (
    <div className={`screen mode-${mode} ${night ? 'night' : ''}`}>
      <ContextBar state={state} connected={connected} listener={listener} onToggleMic={toggleMic} />

      {alert.kind === 'help' && (
        <div className="banner danger">
          🆘 Help requested{alert.source === 'auto' ? ' automatically' : ''}: {alert.reason}
          <span className="banner-sub">
            {alert.acknowledged_by ? `✅ ${alert.acknowledged_by} is coming` : 'Caregiver alerted (SIMULATED). Waiting for a reply…'}
          </span>
        </div>
      )}
      {announcement && alert.kind !== 'help' && mode !== 'checkin' && <div className="banner info">🔔 {announcement}</div>}

      {(bubble || undone || done) && mode !== 'checkin' && (
        <div className={`bubble ${bubble?.active ? 'live' : ''} ${undone ? 'undone' : ''} ${done ? 'done' : ''}`}>
          {undone ? <>↶ Cancelled: “{undone}”</> : done ? <>✅ {done}</> : <>🔊 “{bubble.text}”</>}
          {!undone && undoAvailable && <span className="bubble-hint">Hold the bell to undo</span>}
        </div>
      )}

      {heard && mode !== 'checkin' && (
        <div className="banner heard">
          <span className="who">{heard.speaker}</span>
          <span className="said-text">“{heard.text}”</span>
        </div>
      )}

      <main className="stage">
        {mode === 'idle' && <IdleView reason={idleReason} state={state} />}
        {mode === 'checkin' && <CheckinView alert={alert} root={root} opt={opt} />}
        {mode === 'main' && <MainView root={root} scanner={scanner} opt={opt} deck={deck} status={state.deck_status} />}
        {mode === 'keyboard' && <KeyboardView root={root} scanner={scanner} opt={opt} draft={draft} source={state.keyboard?.source} />}
        {pauseReason && mode !== 'idle' && <div className="pause-overlay">⏸ {pauseReason}</div>}
      </main>

      <footer className="footer">
        <BellFx fx={fx} />
        <span className="hint">
          {mode === 'idle' ? 'Press the bell to start'
            : mode === 'checkin' ? 'Press = choose'
            : `Press = choose · Hold = ${mode === 'keyboard' ? 'back' : scanner.path.length ? 'back' : undoAvailable ? 'undo' : 'rest'} · Tap ×3 = SOS`}
        </span>
      </footer>
    </div>
  )
}

function IdleView({ reason, state }) {
  return (
    <div className="idle">
      <div className="idle-time">{state.env?.time}</div>
      <div className="idle-bell">🔔</div>
      <div className="idle-text">{reason === 'rest' ? 'Resting' : 'Ring the bell'}</div>
      <div className="idle-sub">
        {reason === 'rest' ? 'Ring once when you want me.' : reason === 'timeout' ? 'Paused after no rings. Ring once to continue.' : `Ready for ${state.profile?.name || 'you'}.`}
      </div>
    </div>
  )
}

function CheckinView({ alert, root, opt }) {
  const total = Math.max(1, alert.deadline - alert.since)
  const left = Math.max(0, alert.deadline - Date.now() / 1000)
  return (
    <div className="checkin">
      <div className="checkin-q">Are you OK?</div>
      <div className="checkin-why">{alert.reason}</div>
      <div className="countdown"><i style={{ width: `${(left / total) * 100}%` }} /></div>
      <div className="checkin-count">Calling for help automatically in {Math.round(left)} s</div>
      <div className="checkin-options">{root.map((n) => opt(n, 'option'))}</div>
    </div>
  )
}

function MainView({ root, scanner, opt, deck, status }) {
  const cards = root.filter((n) => n.card || n.wide)
  const tiles = root.filter((n) => n.tile)
  // Deepest open group (e.g. More › Room) and its breadcrumb
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
        <div className="group-panel">
          <div className="crumbs">{trail.map((g) => g.label).join(' › ')} <span className="muted">· hold to go back</span></div>
          <div className="group-items">
            {open.children.map((c) => opt(c, 'option small', c.icon ? <><span className="icon">{c.icon}</span> {c.label}{c.children ? ' ›' : ''}</> : undefined))}
          </div>
        </div>
      ) : (
      <>
      <div className="deck-head">
        {deck?.source === 'ai' ? '✨ My guesses' : '📖 Phrasebook'}
        {status?.loading && <span className="loading"> · thinking…</span>}
      </div>
      <div className="cards">
        {cards.length === 0 && <div className="option muted">Preparing guesses…</div>}
        {cards.map((n) => opt(n, `option card ${n.wide ? 'cancel' : ''}`, n.card ? (
          <>
            <span className="text">{n.label}</span>
            {n.card.device !== 'none' && (
              <span className="tag">turns {n.card.device === 'light' ? '💡' : '📺'} {n.card.device_on ? 'on' : 'off'}</span>
            )}
          </>
        ) : undefined))}
      </div>
      </>
      )}
      <div className="tiles">
        {tiles.map((n) => opt(n, `tile ${trail[0]?.id === n.id ? 'open' : ''}`, <><span className="icon">{n.icon}</span>{n.label}</>))}
      </div>
    </>
  )
}

function KeyboardView({ root, scanner, opt, draft, source }) {
  return (
    <div className="keyboard">
      <div className="draft">
        {draft || <span className="muted">Spell your message…</span>}
        <span className="caret">▌</span>
        <span className="kb-source">{source === 'ai' ? '✨ AI' : '📖 local'}</span>
      </div>
      {root.map((row) => {
        const hi = scanner.highlightedId === row.id
        const open = scanner.path[0] === row.id
        return (
          <div key={row.id} className={`kb-row ${hi ? 'row-hi' : ''} ${open ? 'open' : ''} ${row.skip ? 'empty' : ''}`}>
            <span className="kb-label">{row.label}</span>
            <div className="kb-items">
              {row.children.length === 0 && <span className="muted">…</span>}
              {row.children.map((it) => opt(it, `kb-item ${it.letter ? 'letter' : ''}`))}
            </div>
            {hi && <i key={scanner.tick} className="dwell" style={{ animationDuration: `${scanner.dwellNow}ms` }} />}
          </div>
        )
      })}
    </div>
  )
}

function BellFx({ fx }) {
  if (!fx || Date.now() - fx.t > (fx.kind === 'holding' || fx.kind === 'down' ? 4000 : 1200)) {
    return <span className="bellfx">🔔</span>
  }
  const text = { down: '🔔 …', holding: '🔔 holding…', press: '🔔 Press', hold: '🔔 Hold', rapid: '🔔🔔🔔 SOS' }[fx.kind]
  return <span className={`bellfx on ${fx.kind}`}>{text}</span>
}
