import { useState } from 'react'
import {
  ConciergeBell, HeartPulse, Home, Lamp, LifeBuoy, MessageSquare, Mic, ScanFace, Sparkles, SlidersHorizontal, Sprout, Tv, Volume2,
} from 'lucide-react'

// Operator & simulation panel (open at /#/sim in a second window). For the team only:
// drives the mocks (vitals, room, time, face, conversation, people) and shows what the AI did.
const VITAL_NAMES = {
  heart_rate: 'Heart rate', spo2: 'Oxygen (SpO₂)', bp_sys: 'Blood pressure, systolic',
  bp_dia: 'Blood pressure, diastolic', resp_rate: 'Breathing rate', body_temp: 'Body temperature',
}
const ROOM_NAMES = { room_temp: 'Temperature', humidity: 'Humidity', light: 'Light level', noise: 'Noise', co2: 'CO₂' }
const SCENARIO_NAMES = {
  normal: 'Normal', tachycardia: 'Fast heart rate', bradycardia: 'Slow heart rate', low_spo2: 'Low oxygen',
  hypertension: 'High blood pressure', fever: 'Fever', distress: 'Distress',
  hot: 'Hot room', cold: 'Cold room', noisy: 'Noisy', stuffy: 'Stuffy air',
}
const STATUS_NAMES = { normal: 'Normal', warn: 'Watch', critical: 'Critical' }
const DEVICE_ICON = { light: Lamp, tv: Tv }
const label = (s) => SCENARIO_NAMES[s] || s.charAt(0).toUpperCase() + s.slice(1)

export default function SimPanel({ hub }) {
  const { state, connected, send } = hub
  const [speaker, setSpeaker] = useState('')
  const [text, setText] = useState('')
  const [hhmm, setHhmm] = useState('')
  const [preview, setPreview] = useState(false) // camera frames only on request
  if (!state) return <div className="ops" data-theme="light"><div className="ops-top">{connected ? 'Loading…' : 'Connecting to Ding.AI…'}</div></div>

  const people = (state.profile?.people || []).map((p) => p.name)
  const who = speaker || state.present?.[0] || people[0] || 'Someone'
  const sendHeard = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    send({ type: 'heard', speaker: who, text })
    setText('')
  }
  const togglePresent = (name) => {
    const cur = new Set(state.present || [])
    cur.has(name) ? cur.delete(name) : cur.add(name)
    send({ type: 'present', names: people.filter((p) => cur.has(p)) })
  }
  const { health, env, face, devices, room, alert, deck, llm, settings, scenarios, bell, memory } = state
  const curve = memory?.curve
  const theme = settings?.theme || 'auto'
  const on = (cond) => `btn ${cond ? 'is-on' : ''}`

  return (
    <div className="ops" data-theme="light">
      <header className="ops-top">
        <div className="brand"><ConciergeBell size={22} strokeWidth={1.75} /> Ding.AI operator</div>
        <p><span className={`dot ${connected ? 'ok' : 'bad'}`} /> {connected ? 'Connected to the hub' : 'Reconnecting'}. The user only ever uses the bell; this panel is for the team.</p>
        <a href="#/">Open the Bell Screen</a>
      </header>

      <div className="ops-grid">
        <section className="panel">
          <h2><ConciergeBell size={20} /> Bell and scanning</h2>
          <p><span className={`dot ${bell?.serial?.connected ? 'ok' : 'bad'}`} />{' '}
            {bell?.serial?.connected ? `ESP32 button on ${bell.serial.port}`
              : bell?.serial_enabled ? 'ESP32 button not connected (Enter key still works)'
              : 'ESP32 button off: set BELL_SERIAL_PORT=auto (Enter key only)'}</p>
          <div className="btns">
            <button className="btn" onClick={() => send({ type: 'bell_sim', gesture: 'press' })}>Press</button>
            <button className="btn" onClick={() => send({ type: 'bell_sim', gesture: 'hold' })}>Hold</button>
            <button className="btn" onClick={() => send({ type: 'bell_sim', gesture: 'rapid' })}>Three taps</button>
          </div>
          <label className="field">Highlight stays {((settings?.scan_ms || 1200) / 1000).toFixed(1)} s on each option
            <input type="range" min="500" max="3000" step="100" value={settings?.scan_ms || 1200}
              onChange={(e) => send({ type: 'settings', scan_ms: Number(e.target.value) })} />
          </label>
          <label className="field check">
            <input type="checkbox" checked={settings?.pause_on_attention !== false}
              onChange={(e) => send({ type: 'settings', pause_on_attention: e.target.checked })} />
            Pause scanning when the camera sees eyes closed or no face
          </label>
          <h3>Screen theme</h3>
          <div className="btns">
            <button className={on(theme === 'auto')} onClick={() => send({ type: 'settings', theme: 'auto' })}>Follow the time of day</button>
            <button className={on(theme === 'light')} onClick={() => send({ type: 'settings', theme: 'light' })}>Day</button>
            <button className={on(theme === 'dark')} onClick={() => send({ type: 'settings', theme: 'dark' })}>Night</button>
          </div>
        </section>

        <section className="panel">
          <h2><MessageSquare size={20} /> Someone speaks to the user</h2>
          <form onSubmit={sendHeard} className="heard-form">
            <select value={who} onChange={(e) => setSpeaker(e.target.value)} aria-label="Who is speaking">
              {people.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Do you want tea or coffee?" aria-label="What they say" />
            <button className="btn primary">Say it</button>
          </form>
          <div className="btns">
            {['Do you want tea or coffee?', 'Are you in pain?', 'How was physio today?', 'India won the match!'].map((q) => (
              <button key={q} className="btn" onClick={() => send({ type: 'heard', speaker: who, text: q })}>{q}</button>
            ))}
            <button className="btn" onClick={() => send({ type: 'clear_heard' })}>Clear conversation</button>
          </div>
          <ul className="heard-list">
            {(state.heard || []).map((h, i) => <li key={i}><b>{h.speaker}</b> {h.text} <span className="muted">{h.secs_ago} s ago</span></li>)}
          </ul>
          <h3>In the room</h3>
          <div className="btns">
            {people.map((p) => <button key={p} className={on(state.present?.includes(p))} onClick={() => togglePresent(p)}>{p}</button>)}
          </div>
        </section>

        <section className="panel">
          <h2><HeartPulse size={20} /> Body <span className="sim-tag">Simulated</span></h2>
          <table className="vt">
            <tbody>
              {Object.entries(health?.vitals || {}).map(([k, v]) => (
                <tr key={k} className={v.status}><td>{VITAL_NAMES[k] || k}</td><td>{v.value} {v.unit}</td><td>{STATUS_NAMES[v.status]}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="btns">
            {scenarios?.health.map((s) => (
              <button key={s} className={on(health?.scenario === s)} onClick={() => send({ type: 'sim_health', scenario: s })}>{label(s)}</button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2><Home size={20} /> Room <span className="sim-tag">Simulated</span></h2>
          <table className="vt">
            <tbody>
              {Object.entries(env?.sensors || {}).map(([k, v]) => <tr key={k}><td>{ROOM_NAMES[k] || k}</td><td>{v.value} {v.unit}</td><td /></tr>)}
              <tr><td>Time</td><td>{env?.time}, {env?.day}</td><td>{label(env?.part_of_day || '')}</td></tr>
            </tbody>
          </table>
          <div className="btns">
            {scenarios?.env.map((s) => (
              <button key={s} className={on(env?.scenario === s)} onClick={() => send({ type: 'sim_env', scenario: s })}>{label(s)}</button>
            ))}
          </div>
          <div className="btns">
            <input type="time" value={hhmm} onChange={(e) => setHhmm(e.target.value)} aria-label="Pretend time" />
            <button className="btn" onClick={() => send({ type: 'sim_time', hhmm })}>Use this time</button>
            <button className="btn" onClick={() => { setHhmm(''); send({ type: 'sim_time', hhmm: null }) }}>Real time</button>
          </div>
          <h3>Devices</h3>
          <p><span className={`dot ${room?.connected ? 'ok' : 'bad'}`} />{' '}
            {room?.connected ? `Room ESP32 at ${room.url}`
              : room?.url ? `Room ESP32 not reachable at ${room.url} (simulated until it answers)`
              : 'Room ESP32 off: set ROOM_ESP32_URL (light and TV simulated)'}</p>
          <div className="btns">
            {Object.entries(devices || {}).map(([k, d]) => {
              const Icon = DEVICE_ICON[k] || Lamp
              return (
                <button key={k} className={on(d.on)} onClick={() => send({ type: 'device', device: k, on: !d.on, source: 'sim' })}>
                  <Icon /> {d.label} {d.on ? 'on' : 'off'}
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <h2><ScanFace size={20} /> Face</h2>
          <p>
            Camera {face?.status === 'running' ? 'running' : face?.status}. {face?.error && <span className="err">{face.error}</span>}
          </p>
          <p>Reads <b>{face?.label}</b> ({Math.round((face?.confidence || 0) * 100)}%), attention <b>{(face?.attention || '').replace('_', ' ')}</b>
            {face?.calibrated && ', calibrated'}{face?.calibrating && ', calibrating…'}
          </p>
          {face?.status === 'running' && (preview
            ? <img className="cam" src="/camera.mjpg" alt="Live camera preview with the face reading" />
            : null)}
          {face?.status === 'running' && (
            <div className="btns"><button className={on(preview)} onClick={() => setPreview(!preview)}>{preview ? 'Hide camera preview' : 'Show camera preview'}</button></div>
          )}
          <div className="bars">
            {Object.entries(face?.scores || {}).map(([k, v]) => (
              <div key={k} className="bar"><span>{label(k)}</span><i style={{ width: `${v * 100}%` }} /></div>
            ))}
          </div>
          <div className="btns">
            <button className="btn primary" onClick={() => send({ type: 'face_calibrate', seconds: 3 })}>Calibrate resting face (3 s)</button>
          </div>
          <h3>Override the camera</h3>
          <div className="btns">
            <button className={on(!face || face.source !== 'override')} onClick={() => send({ type: 'face_override', label: null })}>Use camera</button>
            {scenarios?.face.map((l) => (
              <button key={l} className={on(face?.source === 'override' && face.label === l)} onClick={() => send({ type: 'face_override', label: l })}>{label(l)}</button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2><Volume2 size={20} /> Voice and microphone</h2>
          <label className="field">The user's voice ({state.tts?.engine === 'openai' ? state.tts.model : 'macOS voice'}){' '}
            <select value={settings?.tts_voice} onChange={(e) => send({ type: 'settings', tts_voice: e.target.value })}>
              {(state.voices || []).map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <div className="btns">
            <button className="btn" onClick={() => send({ type: 'say', text: 'Hello, this is my voice.', source: 'sim' })}><Volume2 /> Test the voice</button>
            <button className="btn" onClick={() => send({ type: 'stop_speaking' })}>Stop speaking</button>
          </div>
          <p className="muted">
            Last clip took {state.tts?.last_ms ?? '–'} ms. {state.tts?.cached} clips cached, {state.tts?.fallbacks} spoken by the local voice.
            {state.tts?.last_error && <span className="err"> {state.tts.last_error}</span>}
          </p>
          <h3><Mic size={14} /> Microphone</h3>
          <label className="field check">
            <input type="checkbox" checked={!!settings?.mic_on} onChange={(e) => send({ type: 'settings', mic_on: e.target.checked })} />
            Listen to people talking to the user ({state.stt?.model})
          </label>
          <p className="muted">
            Last transcript: “{state.stt?.last_text || 'none yet'}”{state.stt?.last_ms ? ` in ${state.stt.last_ms} ms` : ''}. {state.stt?.dropped} dropped as noise or echo.
            {state.stt?.last_error && <span className="err"> {state.stt.last_error}</span>}
          </p>
        </section>

        <section className="panel">
          <h2><LifeBuoy size={20} /> Alerts</h2>
          <p>
            {alert?.kind === 'none' ? 'No alert.' : alert?.kind === 'checkin' ? `Asking “Are you OK?” (${alert.reason}).` : `Help requested: ${alert?.reason}.`}
            {alert?.acknowledged_by && ` ${alert.acknowledged_by} is coming.`}
          </p>
          <div className="btns">
            <button className="btn primary" disabled={alert?.kind !== 'help'} onClick={() => send({ type: 'caregiver_ack', name: state.present?.[0] })}>Caregiver replies “I'm coming”</button>
            <button className="btn" onClick={() => send({ type: 'alert_response', ok: true, source: 'operator' })}>Clear alert</button>
          </div>
        </section>

        <section className="panel">
          <h2><Sprout size={20} /> Learning</h2>
          {!memory?.enabled ? <p className="muted">Learning is switched off (LEARNING=0).</p> : (
            <>
              <p>Every pick is remembered with its moment: the time, who was here, what was just asked and the face.
                In a moment like it, the pick comes back first, marked <em>Learned</em>.</p>
              <div className="learn-curve">
                <div><strong>{memory.phrases}</strong>phrases learned</div>
                <div><strong>{memory.picks}</strong>picks so far</div>
                {curve && (
                  <div>
                    <strong className={curve.recent_rank < curve.early_rank ? 'better' : ''}>{curve.early_rank} → {curve.recent_rank}</strong>
                    position of the chosen card (first {curve.window} picks → last {curve.window})
                  </div>
                )}
              </div>
              {!curve && <p className="muted">After 10 card picks, this shows whether the right card is arriving sooner.</p>}
              {memory.top?.length > 0 && (
                <>
                  <h3>Most used</h3>
                  <ol className="deck-list">
                    {memory.top.map((t) => <li key={t.text}>{t.text}<span className="meta">{t.why}</span></li>)}
                  </ol>
                </>
              )}
              <div className="btns">
                <a className="btn" href="/api/memory" target="_blank" rel="noreferrer">What it would recall now</a>
                <button className="btn" disabled={!memory.phrases}
                  onClick={() => window.confirm('Forget everything Ding.AI has learned? This cannot be undone.') && send({ type: 'memory_reset' })}>
                  Forget everything
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel wide">
          <h2><Sparkles size={20} /> Suggestions</h2>
          <p className="muted">
            {llm?.enabled ? `${llm.model}, last call ${llm?.last_ms ?? '–'} ms.` : 'AI is off; the phrasebook is used.'}
            {llm?.last_error && <span className="err"> {llm.last_error}</span>}
          </p>
          <p>{deck?.source === 'ai' ? 'From the AI' : 'From the phrasebook'} in {deck?.latency_ms} ms, because of: {(deck?.reasons || []).join(', ') || 'startup'}. {deck?.reason}</p>
          <ol className="deck-list">
            {(deck?.cards || []).map((c) => (
              <li key={c.id}>{c.text}
                {c.learned && <span className="learned-why">Learned: {c.learned.why}</span>}
                <span className="meta">{c.kind.replaceAll('_', ' ')}{c.device !== 'none' ? `, turns ${c.device} ${c.device_on ? 'on' : 'off'}` : ''}, tone {c.tone}, p {c.p}</span>
              </li>
            ))}
          </ol>
          <div className="btns">
            <button className="btn primary" onClick={() => send({ type: 'deck_refresh', avoid: [] })}><SlidersHorizontal /> New suggestions</button>
            <a className="btn" href="/api/context" target="_blank" rel="noreferrer">See what the AI sees</a>
          </div>
        </section>
      </div>
    </div>
  )
}
