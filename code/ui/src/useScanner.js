import { useCallback, useEffect, useReducer, useRef } from 'react'

// Single-switch auto-scanner (Hawking / ACAT style).
//
// `root` is a tree of nodes: { id, label, children?, onSelect?, after? }.
//   - a node with children is a group: selecting it scans inside it
//   - after: 'root' (default) | 'stay' | 'none' | () => ({path, index})
//            where the highlight goes after an item is selected
//
// The highlight advances every `dwellMs` (first item of a level gets 1.5x).
// A group that is scanned twice with no ring closes back to its parent.
//
// press(msSinceDown) picks the option that was highlighted when the bell
// contact was MADE, not when the gesture was recognised (a PRESS is only known
// ~500 ms later, after the repeat gap). If the contact came within GRACE_MS of
// the highlight moving, the user was reacting to the previous option.
// peek(msSinceDown) returns that option without choosing it (a HOLD acts on it).
const GRACE_MS = 250

const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

// First index at or after `from` (wrapping) whose node isn't marked skip (e.g. an empty row).
function nextUsable(nodes, from) {
  for (let k = 0; k < nodes.length; k++) {
    const i = (from + k) % nodes.length
    if (!nodes[i].skip) return i
  }
  return 0
}

export function useScanner({ root, dwellMs, active, paused, idleCycles = Infinity, onIdle, onRootBack, onCycleStart }) {
  const rootRef = useRef(root)
  rootRef.current = root
  const cbs = useRef({})
  cbs.current = { onIdle, onRootBack, onCycleStart }
  const s = useRef({ path: [], index: 0, cycles: 0, history: [], flash: null })
  const [version, bump] = useReducer((x) => x + 1, 0)

  const nodesAt = useCallback((path) => {
    let nodes = rootRef.current
    for (const id of path) {
      const g = nodes.find((n) => n.id === id)
      if (!g || !g.children) return null
      nodes = g.children
    }
    return nodes
  }, [])

  // jump: the highlight was moved by a choice or a reset, not by the scan clock. The grace
  // window only covers clock moves: after a jump the old position may not even exist any more.
  const mark = useCallback((jump = false) => {
    const st = s.current
    st.history.push({ path: [...st.path], index: st.index, t: performance.now(), jump })
    if (st.history.length > 40) st.history.shift()
    bump()
  }, [])

  const goto = useCallback((path, index = 0) => {
    const st = s.current
    st.path = path
    st.index = nextUsable(nodesAt(path) || [], index)
    st.cycles = 0
    mark(true)
  }, [mark, nodesAt])

  const closeGroup = useCallback(() => {
    const st = s.current
    const id = st.path[st.path.length - 1]
    const parentPath = st.path.slice(0, -1)
    const parent = nodesAt(parentPath) || []
    goto(parentPath, Math.max(0, parent.findIndex((n) => n.id === id)))
  }, [goto, nodesAt])

  const advance = useCallback(() => {
    const st = s.current
    const nodes = nodesAt(st.path)
    if (!nodes || !nodes.some((n) => !n.skip)) return goto([], 0)
    let steps = 0
    do {
      st.index += 1
      if (st.index >= nodes.length) {
        st.index = 0
        st.cycles += 1
        if (st.path.length > 0 && st.cycles >= 2) return closeGroup()
        if (st.path.length === 0) {
          if (st.cycles >= idleCycles) {
            st.cycles = 0
            cbs.current.onIdle?.()
            return bump()
          }
          cbs.current.onCycleStart?.()
        }
      }
    } while (nodes[st.index]?.skip && ++steps < nodes.length)
    mark()
  }, [nodesAt, goto, closeGroup, mark, idleCycles])

  // Keep the current position valid if the tree changed under us
  // (a group vanished, a row emptied out, the list got shorter).
  const st0 = s.current
  const current = nodesAt(st0.path)
  if (!current) {
    st0.path = []
    st0.index = nextUsable(rootRef.current, 0)
  } else if (st0.index >= current.length || current[st0.index]?.skip) {
    const fixed = nextUsable(current, st0.index >= current.length ? 0 : st0.index)
    if (fixed !== st0.index) {
      st0.index = fixed
      st0.history.push({ path: [...st0.path], index: fixed, t: performance.now(), jump: true })
    }
  }

  // One timer per highlight; re-armed on every move, stopped while paused/inactive.
  useEffect(() => {
    if (!active || paused) return
    const dwell = dwellMs * (s.current.index === 0 ? 1.5 : 1)
    const t = setTimeout(advance, dwell)
    return () => clearTimeout(t)
  }, [active, paused, dwellMs, version, advance])

  const select = useCallback((node, path) => {
    const st = s.current
    st.flash = { id: node.id, t: performance.now() }
    if (node.children) return goto([...path, node.id], 0)
    node.onSelect?.()
    const after = node.after || 'root'
    if (after === 'none') return bump()
    if (after === 'stay') return goto(path, 0)
    if (typeof after === 'function') {
      const { path: p = [], index = 0 } = after() || {}
      return goto(p, index)
    }
    goto([], 0)
  }, [goto])

  // The option that was highlighted when the bell contact was made.
  const resolve = useCallback((msSinceDown = 0) => {
    const st = s.current
    const tDown = performance.now() - msSinceDown
    const h = st.history
    let i = h.length - 1
    while (i > 0 && h[i].t > tDown) i--
    let pick = h[i] || { path: st.path, index: st.index, t: 0 }
    if (i > 0 && !pick.jump && tDown - pick.t < GRACE_MS && samePath(h[i - 1].path, pick.path)) pick = h[i - 1]
    let node = nodesAt(pick.path)?.[pick.index]
    let path = pick.path
    if (!node) {
      node = nodesAt(st.path)?.[st.index]
      path = st.path
    }
    return node && !node.skip ? { node, path } : null
  }, [nodesAt])

  const press = useCallback((msSinceDown = 0) => {
    const hit = resolve(msSinceDown)
    if (hit) select(hit.node, hit.path)
  }, [resolve, select])

  const peek = useCallback((msSinceDown = 0) => resolve(msSinceDown)?.node || null, [resolve])

  const back = useCallback(() => {
    if (s.current.path.length) closeGroup()
    else cbs.current.onRootBack?.()
  }, [closeGroup])

  const reset = useCallback((index = 0) => goto([], index), [goto])

  const st = s.current
  const nodes = nodesAt(st.path) || []
  return {
    path: st.path,
    index: st.index,
    tick: version,                                        // changes on every highlight move
    dwellNow: dwellMs * (st.index === 0 ? 1.5 : 1),       // how long the current highlight stays
    highlightedId: active ? nodes[st.index]?.id : null,
    flashId: st.flash && performance.now() - st.flash.t < 600 ? st.flash.id : null,
    highlighted: active ? nodes[st.index] || null : null,
    press,
    peek,
    back,
    reset,
  }
}
