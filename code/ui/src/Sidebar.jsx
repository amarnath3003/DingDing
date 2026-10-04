import { useState } from 'react'
import { ConciergeBell, Eye, Gauge, HeartPulse, History, House, Lamp, Mic, MicOff, Moon, Sun, Thermometer, Tv, Users, Wind } from 'lucide-react'

// Quiet context beside the conversation. The user never navigates here; it is
// for the people in the room. Everything simulated is labelled as such.
const VITALS = [
  ['heart_rate', 'Heart rate', HeartPulse],
  ['spo2', 'Oxygen', Wind],
  ['bp', 'Blood pressure', Gauge],
  ['body_temp', 'Temperature', Thermometer],
]
const DEVICE_ICON = { light: Lamp, tv: Tv }
const MIC_TEXT = {
  off: 'Microphone off', starting: 'Starting microphone', listening: 'Listening',
  hearing: 'Hearing someone', sending: 'Understanding', error: 'Microphone blocked',
}

export default function Sidebar({ state, connected, listener, onToggleMic, night, onToggleTheme }) {
  const { env, health, face, devices, present, llm, settings, memory } = state
  const v = health?.vitals || {}
  const micOn = !!settings?.mic_on
  const micState = state.stt_status?.busy && listener?.status === 'listening' ? 'sending' : listener?.status || 'off'
  const faceOn = face?.status === 'running' || face?.source === 'override'
  // Hovering the camera row shows the live feed with the face mesh. Frames only stream while it's open.
  const [camAt, setCamAt] = useState(null)
  const showCam = (e) => {
    if (face?.status !== 'running') return
    const r = e.currentTarget.getBoundingClientRect()
    setCamAt({ left: r.right + 12, top: Math.max(12, Math.min(r.top - 120, window.innerHeight - 400)) })
  }

  const vital = (key) => {
    if (key === 'bp') {
      const s = v.bp_sys, d = v.bp_dia
      if (!s) return null
      const status = s.status !== 'normal' ? s.status : d.status
      return { text: `${s.value}/${d.value}`, status }
    }
    return v[key] && { text: `${v[key].value}${key === 'body_temp' ? '°' : key === 'spo2' ? '%' : ''}`, status: v[key].status }
  }

  return (
    <aside className="sidebar">
      <div className="brand"><ConciergeBell size={24} strokeWidth={1.75} /> Ding.AI</div>
      <div className="side-when">
        <strong>{env?.time}</strong>
        {env?.day}{env?.time_shifted ? ', simulated time' : ''}
      </div>

      <section className="side-group">
        <h3>In the room</h3>
        <div className="side-row"><Users size={17} /> {present?.length ? present.join(', ') : 'Nobody'}</div>
        {Object.entries(devices || {}).map(([k, d]) => {
          const Icon = DEVICE_ICON[k] || Lamp
          return (
            <div className="side-row" key={k}>
              <Icon size={17} /> {d.label}
              <span className={`val ${d.on ? 'on' : ''}`}>{d.on ? 'On' : 'Off'}</span>
            </div>
          )
        })}
        <div className="side-row"><House size={17} /> Room temperature <span className="val">{env?.sensors?.room_temp?.value}°C</span></div>
      </section>

      <section className="side-group">
        <h3>Body <span className="sim-tag">Simulated</span></h3>
        {VITALS.map(([k, label, Icon]) => {
          const x = vital(k)
          return x && (
            <div className="side-row" key={k}>
              <Icon size={17} /> {label}
              <span className={`val ${x.status}`}>{x.text}</span>
            </div>
          )
        })}
      </section>

      <section className="side-group">
        <h3>Camera</h3>
        <div className={`side-row ${face?.status === 'running' ? 'has-cam' : ''}`} title={face?.error || ''}
          onMouseEnter={showCam} onMouseLeave={() => setCamAt(null)}>
          <Eye size={17} /> Looks
          <span className="val">{faceOn ? face.label : 'Camera off'}</span>
          {face?.source === 'override' && <span className="sim-tag">Simulated</span>}
        </div>
        {camAt && (
          <div className="cam-pop" style={camAt} role="img" aria-label="Live camera with the face mesh">
            <img src="/camera.mjpg" alt="" />
            <p>Live camera, on this laptop only. MediaPipe face mesh: eyes, brows, lips and irises.</p>
          </div>
        )}
      </section>

      {memory?.enabled && (
        <section className="side-group">
          <h3>Learning</h3>
          <div className="side-row"><History size={17} /> Phrases learned <span className="val">{memory.phrases}</span></div>
        </section>
      )}

      <div className="side-foot">
        <button className={`switch ${night ? 'on' : ''}`} title="Switch dark mode on or off (also under More)"
          onClick={(e) => { e.currentTarget.blur(); onToggleTheme?.() }}>
          {night ? <Moon size={17} /> : <Sun size={17} />}
          <span className="switch-text">Dark mode</span>
          <span className="track" />
        </button>
        <button
          className={`switch ${micOn ? 'on' : ''} ${micState === 'hearing' || micState === 'sending' ? 'live' : ''}`}
          title={listener?.error || 'Switch the microphone on or off'}
          onClick={(e) => { e.currentTarget.blur(); onToggleMic?.() }}
        >
          {micOn ? <Mic size={17} /> : <MicOff size={17} />}
          <span className="switch-text">{MIC_TEXT[micState] || MIC_TEXT.off}</span>
          {micState === 'listening' && <span className="meter"><i style={{ width: `${(listener.level || 0) * 100}%` }} /></span>}
          <span className="track" />
        </button>
        <span className="status"><span className={`dot ${connected ? 'ok' : 'bad'}`} /> <span className="status-text">{connected ? (llm?.enabled ? (llm.last_error ? 'AI unavailable, using phrasebook' : 'Connected') : 'Phrasebook only') : 'Reconnecting'}</span></span>
      </div>
    </aside>
  )
}
