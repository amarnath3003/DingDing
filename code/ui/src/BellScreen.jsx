import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanner } from './useScanner.js'
import ContextBar from './ContextBar.jsx'

// The user's screen. Only input: the bell (Enter key for now).
//   PRESS = choose the highlighted option (or wake the screen)
//   HOLD  = back (close group / leave keyboard / rest)
//   RAPID = SOS: the hub raises a Help alert by itself
const GRID = ['etaoin', 'shrdlu', 'cmfwyp', 'gbvkjxqz']
const IDLE_CYCLES = 3
const ATTENTION_PAUSE = { eyes_closed: 'Eyes closed', looking_away: 'Looking away', no_face: 'No face in view' }

const uniq = (xs) => [...new Map(xs.filter(Boolean).map((x) => [x.toLowerCase(), x])).values()]

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

  const alert = state?.alert || { kind: 'none' }
  const mode = alert.kind === 'checkin' ? 'checkin' : view
  const face = state?.face
  const settings = state?.settings || { scan_ms: 1200 }
  const attentionPause =
    settings.pause_on_attention !== false && face?.source === 'camera' && face?.status === 'running'
      ? ATTENTION_PAUSE[face.attention]
      : null
  const dwell = settings.scan_ms * (face?.label === 'tired' ? 1.3 : 1)

  const setDraft = useCallback((d) => {
    setDraftState(d)
    send({ type: 'kb_draft', draft: d })
  }, [send])

  const goIdle = useCallback((reason) => {
    setIdleReason(reason)
    setView('idle')
    send({ type: 'ui_event', event: 'idle', reason })
  }, [send])

  const applyPending = useCallback(() => {
    if (pendingDeck.current) {
      setDeck(pendingDeck.current)
      pendingDeck.current = null
    }
  }, [])

  const wake = useCallback(() => {
    applyPending()
    setView('main')
    send({ type: 'ui_event', event: 'wake' })
  }, [applyPending, send])

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
        row('r:next', 'Next', (kb?.next_letters || []).map((l) => ({
          id: `n:${l}`, label: l.toUpperCase(), letter: true, onSelect: type(l),
        }))),
        ...GRID.map((g, i) => row(`r:grid${i}`, '', [...g].map((ch) => ({
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
    const quick = uniq([...(deck?.quick_reactions || []), ...(state.profile?.quick || [])])
    const devices = Object.entries(state.devices || {}).map(([k, d]) => ({
      id: `dev:${k}`, label: `${d.icon} Turn ${d.label} ${d.on ? 'off' : 'on'}`,
      onSelect: () => send({ type: 'device', device: k, on: !d.on, source: 'scan' }),
    }))
    const nodes = [
      ...cards,
      { id: 'g:quick', label: 'Quick', icon: '💬', tile: true, children: quick.map(leaf('q')) },
      { id: 'g:needs', label: 'Needs', icon: '🙋', tile: true, children: (state.profile?.needs || []).map(leaf('n')) },
      { id: 'g:room', label: 'Room', icon: '🏠', tile: true, children: devices },
      { id: 'keyboard', label: 'Keyboard', icon: '⌨️', tile: true, onSelect: () => setView('keyboard'), after: 'none' },
      { id: 'more', label: 'Other ideas', icon: '↻', tile: true, onSelect: () => send({ type: 'deck_refresh' }) },
      { id: 'rest', label: 'Rest', icon: '⏸', tile: true, onSelect: () => goIdle('rest'), after: 'none' },
      { id: 'help', label: 'Help', icon: '🆘', tile: true, danger: true, onSelect: () => send({ type: 'help' }) },
    ]
    if (alert.kind === 'help') {
      nodes.unshift({ id: 'cancel-help', label: "✅ I'm OK now. Cancel help.",
        onSelect: () => send({ type: 'alert_response', ok: true }) })
    }
    return nodes
  }, [state, mode, deck, draft, alert.kind, send, setDraft, goIdle])

  const scanner = useScanner({
    root,
    dwellMs: dwell,
    active: connected && mode !== 'idle',
    paused: !!attentionPause && mode !== 'checkin',
    idleCycles: mode === 'main' && alert.kind === 'none' ? IDLE_CYCLES : Infinity,
    onIdle: () => goIdle('timeout'),
    onRootBack: () => (mode === 'keyboard' ? setView('main') : mode === 'main' ? goIdle('rest') : null),
    onCycleStart: applyPending,
  })

  // Restart scanning from the top whenever the mode changes.
  useEffect(() => {
    scanner.reset(0)
    send({ type: 'ui_event', event: 'mode', mode })
    if (mode === 'keyboard') send({ type: 'kb_draft', draft }) // fresh predictions from context
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // New deck from the hub: show now if nobody is scanning it, else at the next cycle.
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

  // --- bell input -----------------------------------------------------------
  // Enter key = the bell contact. Raw edges go to the hub, which classifies
  // PRESS / HOLD / RAPID with the same timings as the ESP32 firmware.
  useEffect(() => {
    const down = (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (!e.repeat) send({ type: 'bell_edge', down: true })
    }
    const up = (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      send({ type: 'bell_edge', down: false })
    }
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

  // A check-in or help alert wakes the screen.
  useEffect(() => {
    if (alert.kind !== 'none' && view === 'idle') setView('main')
  }, [alert.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return <div className="screen"><div className="connecting">{connected ? 'Loading…' : 'Connecting to hub…'}</div></div>
  }

  const hi = (id) => scanner.highlightedId === id
  const cls = (n, base) =>
    [base, hi(n.id) && 'hi', scanner.flashId === n.id && 'flash', n.danger && 'danger', n.big && 'big']
      .filter(Boolean).join(' ')
  const heard = (state.heard || []).filter((h) => h.secs_ago < 120).slice(-1)[0]

  return (
    <div className={`screen mode-${mode}`}>
      <ContextBar state={state} connected={connected} />

      {alert.kind === 'help' && (
        <div className="banner danger">
          🆘 Help requested{alert.source === 'auto' ? ' automatically' : ''}: {alert.reason}
          <span className="banner-sub">
            {alert.acknowledged_by ? `✅ ${alert.acknowledged_by} is coming` : 'Caregiver alerted (SIMULATED), waiting for reply…'}
          </span>
        </div>
      )}
      {heard && mode !== 'checkin' && (
        <div className="banner heard">
          <span className="who">{heard.speaker}:</span> “{heard.text}”
        </div>
      )}

      <main className="stage">
        {mode === 'idle' && <IdleView reason={idleReason} name={state.profile?.name} />}
        {mode === 'checkin' && (
          <div className="checkin">
            <div className="checkin-q">Are you OK?</div>
            <div className="checkin-why">{alert.reason}</div>
            <div className="checkin-count">
              Getting help automatically in {Math.max(0, Math.round(alert.deadline - Date.now() / 1000))} s
            </div>
            <div className="checkin-options">
              {root.map((n) => <div key={n.id} className={cls(n, 'option')}>{n.label}</div>)}
            </div>
          </div>
        )}
        {mode === 'main' && <MainView root={root} scanner={scanner} cls={cls} deck={deck} status={state.deck_status} />}
        {mode === 'keyboard' && <KeyboardView root={root} scanner={scanner} cls={cls} draft={draft} source={state.keyboard?.source} />}
      </main>

      <footer className="footer">
        <BellFx fx={fx} />
        {attentionPause && mode !== 'idle' && <span className="paused">⏸ Paused: {attentionPause}</span>}
        <span className={`said ${state.speaking?.active ? 'speaking' : ''}`}>
          {state.speaking?.text ? <>🔊 {state.speaking.text}</> : 'Press = choose · Hold = back · Rapid = SOS'}
        </span>
      </footer>
    </div>
  )
}

function IdleView({ reason, name }) {
  return (
    <div className="idle">
      <div className="idle-bell">🔔</div>
      <div className="idle-text">Ring the bell</div>
      <div className="idle-sub">
        {reason === 'rest' ? 'Resting. Ring once to wake.' : reason === 'timeout' ? 'Dimmed after no rings.' : `DING is ready for ${name || 'you'}.`}
      </div>
    </div>
  )
}

function MainView({ root, scanner, cls, deck, status }) {
  const cards = root.filter((n) => n.card || n.id === 'cancel-help')
  const tiles = root.filter((n) => n.tile)
  const openGroup = scanner.path[0] ? root.find((n) => n.id === scanner.path[0]) : null
  return (
    <>
      <div className="deck-head">
        {deck?.source === 'ai' ? '✨ Guesses for right now' : '📖 Phrasebook guesses'}
        {status?.loading && <span className="loading"> · thinking…</span>}
        {deck?.reason && <span className="deck-reason"> · {deck.reason}</span>}
      </div>
      <div className="cards">
        {cards.length === 0 && <div className="option muted">Preparing guesses…</div>}
        {cards.map((n, i) => (
          <div key={n.id} className={cls(n, 'option card')}>
            <span className="num">{n.card ? i + 1 - (cards[0].id === 'cancel-help' ? 1 : 0) : '!'}</span>
            <span className="text">{n.label}</span>
            {n.card?.device && n.card.device !== 'none' && (
              <span className="tag">{n.card.device === 'light' ? '💡' : '📺'} {n.card.device_on ? 'on' : 'off'}</span>
            )}
          </div>
        ))}
      </div>
      <div className="tiles">
        {tiles.map((n) => (
          <div key={n.id} className={cls(n, `tile ${openGroup?.id === n.id ? 'open' : ''}`)}>
            <span className="icon">{n.icon}</span>
            {n.label}
          </div>
        ))}
      </div>
      {openGroup && (
        <div className="group-panel">
          {openGroup.children.map((c) => <div key={c.id} className={cls(c, 'option small')}>{c.label}</div>)}
        </div>
      )}
    </>
  )
}

function KeyboardView({ root, scanner, cls, draft, source }) {
  return (
    <div className="keyboard">
      <div className="draft">
        {draft || <span className="muted">Start spelling…</span>}
        <span className="caret">▌</span>
        <span className="kb-source">{source === 'ai' ? '✨ AI' : '📖 local'}</span>
      </div>
      {root.map((row) => {
        const open = scanner.path[0] === row.id
        return (
          <div key={row.id} className={`kb-row ${scanner.highlightedId === row.id ? 'hi' : ''} ${open ? 'open' : ''} ${row.skip ? 'empty' : ''}`}>
            <span className="kb-label">{row.label}</span>
            <div className="kb-items">
              {row.children.length === 0 && <span className="muted">…</span>}
              {row.children.map((it) => (
                <span key={it.id} className={cls(it, `kb-item ${it.letter ? 'letter' : ''}`)}>{it.label}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BellFx({ fx }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 200)
    return () => clearInterval(t)
  }, [])
  if (!fx || Date.now() - fx.t > (fx.kind === 'holding' || fx.kind === 'down' ? 4000 : 1200)) {
    return <span className="bellfx">🔔</span>
  }
  const text = { down: '🔔 …', holding: '🔔 holding → Back', press: '🔔 Press', hold: '🔔 Hold → Back', rapid: '🔔🔔🔔 SOS' }[fx.kind]
  return <span className={`bellfx on ${fx.kind}`}>{text}</span>
}
