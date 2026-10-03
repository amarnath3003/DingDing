import { useState } from 'react'

// Operator / simulation panel (open at /#/sim in a second window).
// Drives the mocks: vitals, room, time, face, conversation, people, alerts.
export default function SimPanel({ hub }) {
  const { state, connected, send } = hub
  const [speaker, setSpeaker] = useState('')
  const [text, setText] = useState('')
  const [hhmm, setHhmm] = useState('')
  if (!state) return <div className="sim-panel">{connected ? 'Loading…' : 'Connecting to hub…'}</div>

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
  const { health, env, face, devices, alert, deck, llm, settings, scenarios } = state

  return (
    <div className="sim-panel">
      <h1>DING · operator & simulation panel <span className={`dot ${connected ? 'ok' : 'bad'}`} /></h1>
      <p className="muted">Everything here is for the team. The user only ever uses the bell. <a href="#/">Open Bell Screen</a></p>

      <div className="sim-grid">
        <section>
          <h2>Bell (test without the key)</h2>
          <div className="btns">
            {['press', 'hold', 'rapid'].map((g) => (
              <button key={g} onClick={() => send({ type: 'bell_sim', gesture: g })}>{g}</button>
            ))}
          </div>
          <label>Scan speed: {settings?.scan_ms} ms
            <input type="range" min="500" max="3000" step="100" value={settings?.scan_ms || 1200}
              onChange={(e) => send({ type: 'settings', scan_ms: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={settings?.pause_on_attention !== false}
              onChange={(e) => send({ type: 'settings', pause_on_attention: e.target.checked })} />
            Pause scanning when eyes closed / looking away
          </label>
        </section>

        <section>
          <h2>Someone speaks to the user</h2>
          <form onSubmit={sendHeard} className="heard-form">
            <select value={who} onChange={(e) => setSpeaker(e.target.value)}>
              {people.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Do you want tea or coffee?" />
            <button>Say</button>
          </form>
          <div className="btns">
            {['Do you want tea or coffee?', 'Are you in pain?', 'How was physio today?', 'India won the match!'].map((q) => (
              <button key={q} className="ghost" onClick={() => send({ type: 'heard', speaker: who, text: q })}>{q}</button>
            ))}
            <button className="ghost" onClick={() => send({ type: 'clear_heard' })}>clear</button>
          </div>
          <ul className="heard-list">
            {(state.heard || []).map((h, i) => <li key={i}><b>{h.speaker}:</b> {h.text} <span className="muted">{h.secs_ago}s ago</span></li>)}
          </ul>
          <h3>People present</h3>
          <div className="btns">
            {people.map((p) => (
              <button key={p} className={state.present?.includes(p) ? 'active' : 'ghost'} onClick={() => togglePresent(p)}>{p}</button>
            ))}
          </div>
        </section>

        <section>
          <h2>Health <span className="sim">SIMULATED</span></h2>
          <table className="vt">
            <tbody>
              {Object.entries(health?.vitals || {}).map(([k, v]) => (
                <tr key={k} className={v.status}><td>{k}</td><td>{v.value} {v.unit}</td><td>{v.status}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="btns">
            {scenarios?.health.map((s) => (
              <button key={s} className={health?.scenario === s ? 'active' : 'ghost'} onClick={() => send({ type: 'sim_health', scenario: s })}>{s}</button>
            ))}
          </div>
        </section>

        <section>
          <h2>Room <span className="sim">SIMULATED</span></h2>
          <table className="vt">
            <tbody>
              {Object.entries(env?.sensors || {}).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.value} {v.unit}</td></tr>)}
              <tr><td>time</td><td>{env?.time} {env?.day} ({env?.part_of_day})</td></tr>
            </tbody>
          </table>
          <div className="btns">
            {scenarios?.env.map((s) => (
              <button key={s} className={env?.scenario === s ? 'active' : 'ghost'} onClick={() => send({ type: 'sim_env', scenario: s })}>{s}</button>
            ))}
          </div>
          <div className="btns">
            <input type="time" value={hhmm} onChange={(e) => setHhmm(e.target.value)} />
            <button onClick={() => send({ type: 'sim_time', hhmm })}>pretend time</button>
            <button className="ghost" onClick={() => { setHhmm(''); send({ type: 'sim_time', hhmm: null }) }}>real time</button>
          </div>
          <h3>Devices</h3>
          <div className="btns">
            {Object.entries(devices || {}).map(([k, d]) => (
              <button key={k} className={d.on ? 'active' : 'ghost'} onClick={() => send({ type: 'device', device: k, on: !d.on, source: 'sim' })}>
                {d.icon} {d.label}: {d.on ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Face</h2>
          <p>
            Camera: <b>{face?.status}</b> {face?.error && <span className="err">{face.error}</span>}<br />
            Label: <b>{face?.label}</b> ({Math.round((face?.confidence || 0) * 100)}%) · attention: <b>{face?.attention}</b>
            {face?.calibrated && ' · calibrated'}{face?.calibrating && ' · calibrating…'}
          </p>
          {face?.status === 'running' && <img className="cam" src="/camera.mjpg" alt="camera preview" />}
          <div className="bars">
            {Object.entries(face?.scores || {}).map(([k, v]) => (
              <div key={k} className="bar"><span>{k}</span><i style={{ width: `${v * 100}%` }} /></div>
            ))}
          </div>
          <div className="btns">
            <button onClick={() => send({ type: 'face_calibrate', seconds: 3 })}>Calibrate neutral (3 s)</button>
          </div>
          <div className="btns">
            <span className="muted">Override:</span>
            <button className={!face || face.source !== 'override' ? 'active' : 'ghost'} onClick={() => send({ type: 'face_override', label: null })}>camera</button>
            {scenarios?.face.map((l) => (
              <button key={l} className={face?.source === 'override' && face.label === l ? 'active' : 'ghost'} onClick={() => send({ type: 'face_override', label: l })}>{l}</button>
            ))}
          </div>
        </section>

        <section>
          <h2>Alerts</h2>
          <p>Current: <b>{alert?.kind}</b> {alert?.reason && `(${alert.reason})`} {alert?.acknowledged_by && `· ${alert.acknowledged_by} coming`}</p>
          <div className="btns">
            <button onClick={() => send({ type: 'caregiver_ack', name: state.present?.[0] })}>Caregiver: “I'm coming”</button>
            <button className="ghost" onClick={() => send({ type: 'alert_response', ok: true, source: 'operator' })}>clear alert</button>
            <button className="ghost" onClick={() => send({ type: 'stop_speaking' })}>stop voice</button>
          </div>
        </section>

        <section className="wide">
          <h2>AI deck</h2>
          <p className="muted">
            {llm?.enabled ? `${llm.provider} · ${llm.model}` : 'AI off'} · last call {llm?.last_ms ?? '–'} ms
            {llm?.last_error && <span className="err"> · {llm.last_error}</span>}
          </p>
          <p>Source: <b>{deck?.source}</b> · {deck?.situation} · {deck?.latency_ms} ms · triggers: {(deck?.reasons || []).join(', ')}</p>
          <p className="muted">{deck?.reason}</p>
          <ol>
            {(deck?.cards || []).map((c) => (
              <li key={c.id}>{c.text} <span className="muted">[{c.kind}{c.device !== 'none' ? ` ${c.device}→${c.device_on ? 'on' : 'off'}` : ''}] p={c.p}</span></li>
            ))}
          </ol>
          <div className="btns">
            <button onClick={() => send({ type: 'deck_refresh', avoid: [] })}>regenerate deck</button>
            <a className="ghost" href="/api/context" target="_blank" rel="noreferrer">view LLM context</a>
          </div>
        </section>
      </div>
    </div>
  )
}
