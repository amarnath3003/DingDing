import { useEffect, useRef, useState } from 'react'

// Listens for people talking TO the user (only while the mic toggle is on).
// Voice-activity detection runs here in the browser; each finished utterance
// is posted to the hub as a 16 kHz WAV (/api/transcribe), which transcribes it
// and adds it to the conversation.
//
//   blocked = true while DING itself is speaking, plus a short tail, so the
//   user's own synthetic voice is never "heard" (echo cancellation helps too).
//
// status: off | starting | listening | hearing | sending | error
const SR = 16000
const FRAME = 2048                 // 128 ms per frame at 16 kHz
const FRAME_MS = (FRAME / SR) * 1000
const PREROLL_FRAMES = 4           // keep ~0.5 s before speech starts so the first word isn't clipped
const START_FRAMES = 2             // ~250 ms above threshold = speech
const END_SILENCE_MS = 900         // this much quiet = utterance over
const MIN_SPEECH_MS = 450          // shorter blips (coughs, clicks) are dropped
const MAX_UTTERANCE_MS = 15000
const TAIL_AFTER_SPEAKING_MS = 700

export function useListener({ enabled, blocked }) {
  const [status, setStatus] = useState('off')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const blockedRef = useRef(blocked)
  const unblockedAt = useRef(0)

  useEffect(() => {
    if (blockedRef.current && !blocked) unblockedAt.current = performance.now()
    blockedRef.current = blocked
  }, [blocked])

  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      return
    }
    let cancelled = false
    let stream, ctx, proc, src
    const st = { floor: 0.008, above: 0, inSpeech: false, voicedMs: 0, silenceMs: 0, buf: [], pre: [], lastLevel: 0 }

    const reset = () => {
      st.inSpeech = false
      st.above = 0
      st.voicedMs = 0
      st.silenceMs = 0
      st.buf = []
    }

    const finish = () => {
      const frames = st.buf
      const voiced = st.voicedMs
      reset()
      setStatus('listening')
      if (voiced < MIN_SPEECH_MS) return
      setStatus('sending')
      fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: encodeWav(frames, SR) })
        .catch(() => {})
        .finally(() => !cancelled && setStatus('listening'))
    }

    const onFrame = (x) => {
      let sum = 0
      for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
      const rms = Math.sqrt(sum / x.length)
      const now = performance.now()
      if (now - st.lastLevel > 150) {
        st.lastLevel = now
        setLevel(Math.min(1, rms * 12))
      }
      if (blockedRef.current || now - unblockedAt.current < TAIL_AFTER_SPEAKING_MS) {
        if (st.inSpeech) setStatus('listening')
        reset()
        st.pre = []
        return
      }
      const threshold = Math.max(0.012, st.floor * 3)
      if (!st.inSpeech) {
        st.floor = st.floor * 0.95 + rms * 0.05 // adapt to the room's background noise
        st.pre.push(x)
        if (st.pre.length > PREROLL_FRAMES) st.pre.shift()
        st.above = rms > threshold ? st.above + 1 : 0
        if (st.above >= START_FRAMES) {
          st.inSpeech = true
          st.buf = [...st.pre]
          st.voicedMs = st.above * FRAME_MS
          setStatus('hearing')
        }
        return
      }
      st.buf.push(x)
      if (rms > threshold * 0.7) {
        st.voicedMs += FRAME_MS
        st.silenceMs = 0
      } else {
        st.silenceMs += FRAME_MS
      }
      if (st.silenceMs >= END_SILENCE_MS || st.buf.length * FRAME_MS >= MAX_UTTERANCE_MS) finish()
    }

    const start = async () => {
      setStatus('starting')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        ctx = new AudioContext({ sampleRate: SR })
        src = ctx.createMediaStreamSource(stream)
        proc = ctx.createScriptProcessor(FRAME, 1, 1)
        proc.onaudioprocess = (e) => {
          onFrame(new Float32Array(e.inputBuffer.getChannelData(0)))
          e.outputBuffer.getChannelData(0).fill(0)
        }
        src.connect(proc)
        proc.connect(ctx.destination)
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
        setError('')
        setStatus('listening')
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Microphone permission denied' : e.message)
        setStatus('error')
      }
    }
    start()

    // Chrome may start the AudioContext suspended until the first key press / click.
    const resume = () => ctx && ctx.state === 'suspended' && ctx.resume().catch(() => {})
    window.addEventListener('keydown', resume)
    window.addEventListener('pointerdown', resume)

    return () => {
      cancelled = true
      window.removeEventListener('keydown', resume)
      window.removeEventListener('pointerdown', resume)
      proc?.disconnect()
      src?.disconnect()
      ctx?.close().catch(() => {})
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])

  return { status, level, error }
}

function encodeWav(frames, sampleRate) {
  const n = frames.reduce((a, f) => a + f.length, 0)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, n * 2, true)
  let o = 44
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}
