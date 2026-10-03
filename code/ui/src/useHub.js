import { useCallback, useEffect, useRef, useState } from 'react'

// One WebSocket to the hub. `state` is the merged hub state (the hub sends
// partial {type:"state", data:{...}} updates); other messages (bell, speak,
// error) go to onEvent listeners.
export function useHub() {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const listeners = useRef(new Set())

  useEffect(() => {
    let stopped = false
    let retry
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!stopped) retry = setTimeout(connect, 1000)
      }
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'state') setState((s) => ({ ...(s || {}), ...msg.data }))
        else listeners.current.forEach((fn) => fn(msg))
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [])

  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  const onEvent = useCallback((fn) => {
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [])

  return { state, connected, send, onEvent }
}
