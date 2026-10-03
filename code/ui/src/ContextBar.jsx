// Top strip: what DING knows about this moment. Everything simulated is labelled.
const VITAL_LABELS = { heart_rate: 'HR', spo2: 'SpO₂', body_temp: 'Temp' }
const FACE_ICON = { neutral: '😐', happy: '🙂', sad: '😢', uncomfortable: '😣', tired: '😴' }
// The mic state is always visible (people in the room must know when DING listens)
// and clickable, so a caregiver can switch it on or off.
const MIC = {
  off: ['🔇', 'Mic off', 'muted'],
  starting: ['🎙', 'Starting mic…', ''],
  listening: ['🎙', 'Listening', 'ok'],
  hearing: ['🔴', 'Hearing…', 'live'],
  sending: ['⏳', 'Understanding…', 'live'],
  error: ['⚠️', 'Mic blocked', 'bad'],
}

export default function ContextBar({ state, connected, listener, onToggleMic }) {
  const { env, health, face, devices, present, llm } = state
  const v = health?.vitals || {}
  const s = env?.sensors || {}
  const micState = state.stt_status?.busy && listener?.status === 'listening' ? 'sending' : listener?.status || 'off'
  const [micIcon, micText, micCls] = MIC[micState] || MIC.off
  return (
    <header className="ctx">
      <div className="ctx-group">
        <span className="ctx-time">{env?.time}</span>
        <span className="muted">{env?.day}{env?.time_shifted ? ' · sim time' : ''}</span>
      </div>
      <div className="ctx-group">
        <span className="muted">With</span> {present?.length ? present.join(', ') : 'nobody'}
      </div>
      <button className={`mic-toggle ${micCls}`} title={listener?.error || 'Click to switch the microphone on/off'}
        onClick={(e) => { e.currentTarget.blur(); onToggleMic?.() }}>
        {micIcon} {micText}
        {micState === 'listening' && <span className="meter"><i style={{ width: `${(listener.level || 0) * 100}%` }} /></span>}
      </button>
      <div className="ctx-group" title={face?.error || ''}>
        {face?.status === 'running' || face?.source === 'override' ? (
          <>
            {FACE_ICON[face.label]} {face.label}
            {face.source === 'override' && <span className="sim">SIM</span>}
          </>
        ) : (
          <span className="muted">📷 off</span>
        )}
      </div>
      <div className="ctx-group">
        {Object.entries(devices || {}).map(([k, d]) => (
          <span key={k} className={`dev ${d.on ? 'on' : ''}`}>{d.icon} {d.on ? 'on' : 'off'}</span>
        ))}
      </div>
      <div className="ctx-group vitals">
        {Object.entries(VITAL_LABELS).map(([k, label]) => v[k] && (
          <span key={k} className={`vital ${v[k].status}`}>{label} {v[k].value}</span>
        ))}
        {v.bp_sys && (
          <span className={`vital ${v.bp_sys.status === 'normal' ? v.bp_dia.status : v.bp_sys.status}`}>
            BP {v.bp_sys.value}/{v.bp_dia.value}
          </span>
        )}
        <span className="muted">🌡 {s.room_temp?.value}°</span>
        <span className="sim">SIM</span>
      </div>
      <div className="ctx-group right">
        <span className={`dot ${connected ? 'ok' : 'bad'}`} />
        <span className="muted">{llm?.enabled ? (llm.last_error ? 'AI error' : 'AI on') : 'AI off'}</span>
      </div>
    </header>
  )
}
