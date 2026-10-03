// Top strip: what DING knows about this moment. Everything simulated is labelled.
const VITAL_LABELS = { heart_rate: 'HR', spo2: 'SpO₂', resp_rate: 'RR', body_temp: 'Temp' }
const FACE_ICON = { neutral: '😐', happy: '🙂', sad: '😢', uncomfortable: '😣', tired: '😴' }

export default function ContextBar({ state, connected }) {
  const { env, health, face, devices, present, llm } = state
  const v = health?.vitals || {}
  const s = env?.sensors || {}
  return (
    <header className="ctx">
      <div className="ctx-group">
        <span className="ctx-time">{env?.time}</span>
        <span className="muted">{env?.day}{env?.time_shifted ? ' · sim time' : ''}</span>
      </div>
      <div className="ctx-group">
        <span className="muted">With</span> {present?.length ? present.join(', ') : 'nobody'}
      </div>
      <div className="ctx-group" title={face?.error || ''}>
        {face?.status === 'running' || face?.source === 'override' ? (
          <>
            {FACE_ICON[face.label]} {face.label}
            <span className="muted"> {Math.round((face.confidence || 0) * 100)}%</span>
            {face.source === 'override' && <span className="sim">SIM</span>}
          </>
        ) : (
          <span className="muted">📷 {face?.status || 'off'}</span>
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
        <span className="sim">SIM</span>
      </div>
      <div className="ctx-group">
        🌡 {s.room_temp?.value}° · 💧{s.humidity?.value}% · ☀ {s.light?.value} lx
        <span className="sim">SIM</span>
      </div>
      <div className="ctx-group right">
        <span className={`dot ${connected ? 'ok' : 'bad'}`} />
        <span className="muted">{llm?.enabled ? (llm.last_error ? 'AI error' : 'AI') : 'offline AI'}</span>
      </div>
    </header>
  )
}
