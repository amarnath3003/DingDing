// Hero: one ring becomes many sentences.
// A small physics stage. The bell is built, rings once and says only "Come here." (Hector's bell),
// then rings again and a burst of sentences flies out and settles around it on springs. The clay
// highlight walks them like the Bell Screen's scan; a ring sends the lit one into the speaker,
// spoken aloud, and the AI supplies a new one from behind the bell.
;(() => {
  const D = window.Ding
  const stage = document.getElementById('stage')
  if (!stage || !D) return

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const finePointer = matchMedia('(pointer: fine)').matches
  const q = (sel) => stage.querySelector(sel)
  const hero = document.getElementById('hero')
  const title = document.getElementById('heroTitle')
  const bellBtn = q('#stageBell')
  const bellSvg = bellBtn.querySelector('svg')
  const domeG = q('#bDome')
  const plungerG = q('#bPlunger')
  const plungerIn = q('#bPlungerIn')
  const baseG = q('#bBase')
  const shadowEl = q('#bShadow')
  const shine = q('#bShine')
  const domeLine = q('.dome-line')
  const domeRim = q('.dome-rim')
  const domeFills = [q('.dome-fill'), q('.dome-light')]
  const knob = q('.knob')
  const marks = [...stage.querySelectorAll('.b-mark')]
  const halo = q('#halo i')
  const ripples = q('#ripples')
  const layer = q('#bubbles')
  const speaker = q('#speaker')
  const spText = q('#spText')
  const spWave = q('#spWave')
  const live = q('#heroLive')
  const NS = 'http://www.w3.org/2000/svg'

  const PHRASES = [
    'Tea, please. Less sugar.', 'Call Meena, please.', 'What’s the score?', 'I’m in pain.',
    'Turn the TV on for the cricket.', 'Stay with me a little.', 'Terrible pun, Arjun.', 'Yes.',
    'Read me the headlines.', 'I need water, please.', 'Please move me.', 'Thank you, Lakshmi.',
    'Is there a match today?', 'Turn the light off, please.', 'Not now.', 'Let’s sit by the window.',
    'Wait, I want to say something.', 'Did Meena call today?', 'Can you adjust my pillow?', 'Haha!',
    'Goodnight. Thank you for today.', 'I’m too hot.',
  ]
  const idleText = () => (W < 520 ? 'Press the bell.' : 'Press the bell to say the lit sentence.')
  const SCAN_MS = 1200
  const AUTO_EVERY = 4        // with nobody ringing, the stage rings itself after this many steps
  const DT = 1 / 120          // fixed physics step
  const K = 30, C = 7.5       // spring to home, damping
  const GAP = 10
  // Home slots in scan order: [anchor x, y, which edge sits on the anchor, widest sentence allowed],
  // all as fractions of the stage. Rows of two never overlap, so sentences settle instead of shoving.
  const WIDE = [
    [0.03, 0.06, 'l', 0.54], [0.97, 0.09, 'r', 0.37],
    [0.1, 0.2, 'l', 0.38], [0.93, 0.21, 'r', 0.4],
    [0.0, 0.34, 'l', 0.5], [1.0, 0.35, 'r', 0.44],
    [0.5, 0.47, 'c', 0.56],
  ]
  const NARROW = [[0.45, 0.05, 'c', 0.96], [0.55, 0.16, 'c', 0.96], [0.46, 0.27, 'c', 0.96], [0.54, 0.38, 'c', 0.96]]

  const lerp = (a, b, t) => a + (b - a) * t
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

  /* ------------------------------ Geometry ------------------------------ */
  let W = 0, H = 0, G = null, slots = []
  const bubbles = []
  function measure() {
    const r = stage.getBoundingClientRect()
    W = r.width
    H = r.height
    const b = bellBtn.getBoundingClientRect()
    const s = b.width / 640
    const ox = b.left - r.left, oy = b.top - r.top
    const map = (x, y) => ({ x: ox + x * s, y: oy + y * s })
    const box = (x1, y1, x2, y2) => { const a = map(x1, y1), c = map(x2, y2); return { l: a.x, t: a.y, r: c.x, b: c.y } }
    G = {
      s,
      top: map(320, 90),
      center: map(320, 250),
      obstacles: [box(236, 80, 404, 196), box(132, 192, 508, 396)],
      floor: speaker.getBoundingClientRect().top - r.top - 12,
    }
    ripples.setAttribute('viewBox', `0 0 ${W} ${H}`)
    slots = (W < 520 ? NARROW : WIDE).map(([fx, fy, edge, max]) => ({ ax: fx * W, y: fy * H, edge, max: max * W }))
    for (const bub of bubbles) if (bub) size(bub)
    if (!spText.classList.contains('live')) spText.textContent = idleText()
  }
  function fit() {
    while (bubbles.length > slots.length) { const b = bubbles.pop(); if (b) b.el.remove() }
    if (hiSlot >= slots.length) hiSlot = -1
    if (ready) for (let i = 0; i < slots.length; i++) if (!bubbles[i]) emit(i)
  }

  /* ------------------------------ Sentences ------------------------------ */
  let pool = shuffle([...PHRASES])
  function nextPhrase(maxW) {
    const shown = new Set(bubbles.filter(Boolean).map((b) => b.text))
    if (pool.length < 6) pool.push(...shuffle(PHRASES.filter((p) => !pool.includes(p))))
    const i = pool.findIndex((p) => !shown.has(p) && widthOf(p) <= maxW)
    if (i >= 0) return pool.splice(i, 1)[0]
    return PHRASES.filter((p) => !shown.has(p)).sort((a, b) => a.length - b.length)[0]
  }
  function make(text, cls) {
    const el = document.createElement('div')
    el.className = cls ? `bub ${cls}` : 'bub'
    el.textContent = text
    layer.appendChild(el)
    return el
  }
  function size(b) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; if (slots[b.slot]) b.home = homeOf(slots[b.slot], b.w) }
  function homeOf(slot, w) {
    const x = slot.edge === 'l' ? slot.ax + w / 2 : slot.edge === 'r' ? slot.ax - w / 2 : slot.ax
    return { x, y: slot.y }
  }
  // Measure a sentence before it is placed, so each slot only gets one that fits
  const probe = make('', '')
  probe.style.visibility = 'hidden'
  const widthCache = new Map()
  function widthOf(text) {
    const key = text + '|' + W
    if (!widthCache.has(key)) { probe.textContent = text; widthCache.set(key, probe.offsetWidth) }
    return widthCache.get(key)
  }

  let now = performance.now()
  function emit(slot, instant = false) {
    if (bubbles[slot] || !slots[slot]) return
    const text = nextPhrase(slots[slot].max)
    const b = { el: make(text), text, slot, home: null, x: 0, y: 0, px: 0, py: 0, w: 0, h: 0, rx: 0, ry: 0, born: now, phase: Math.random() * Math.PI * 2, z: 0.5 + Math.random() * 0.5, state: 'live', isHi: false, hi: 0 }
    size(b)
    const home = b.home
    if (instant) {
      b.x = b.px = home.x
      b.y = b.py = home.y
      b.born = now - 2000
    } else {
      // out of the top of the bell, with a kick up and toward home
      b.x = G.top.x
      b.y = G.top.y - b.h / 2 - 6
      const vx = (home.x - b.x) * 1.5 + (Math.random() - 0.5) * 140
      const vy = -(360 + Math.random() * 200)
      b.px = b.x - vx * DT
      b.py = b.y - vy * DT
    }
    bubbles[slot] = b
  }

  /* ------------------------------ Physics ------------------------------ */
  function physics(dt) {
    for (const b of bubbles) {
      if (!b || b.state !== 'live') continue
      const home = b.home
      const vx = (b.x - b.px) / dt, vy = (b.y - b.py) / dt
      const ax = K * (home.x - b.x) - C * vx
      const ay = K * (home.y - b.y) - C * vy
      b.px = b.x
      b.py = b.y
      b.x += (vx + ax * dt) * dt
      b.y += (vy + ay * dt) * dt
    }
    constraints()
  }
  function constraints() {
    const list = bubbles.filter((b) => b && b.state === 'live')
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j]
          if (now - a.born < 240 || now - b.born < 240) continue // newborns pass through, then make room
          const dx = b.x - a.x, dy = b.y - a.y
          const ox = (a.w + b.w) / 2 + GAP - Math.abs(dx)
          const oy = (a.h + b.h) / 2 + GAP * 0.6 - Math.abs(dy)
          if (ox <= 0 || oy <= 0) continue
          if (ox < oy) { const p = ox * 0.25 * (dx < 0 ? -1 : 1); a.x -= p; b.x += p }
          else { const p = oy * 0.25 * (dy < 0 ? -1 : 1); a.y -= p; b.y += p }
        }
      }
      for (const b of list) {
        for (const o of G.obstacles) pushOut(b, o)
        const minX = b.w / 2 + 4, maxX = W - b.w / 2 - 4
        b.x = minX > maxX ? W / 2 : clamp(b.x, minX, maxX)
        b.y = clamp(b.y, b.h / 2 + 2, G.floor - b.h / 2)
      }
    }
  }
  function pushOut(b, o) {
    const l = b.x - b.w / 2, r = b.x + b.w / 2, t = b.y - b.h / 2, bt = b.y + b.h / 2
    if (r <= o.l || l >= o.r || bt <= o.t || t >= o.b) return
    const dl = r - o.l, dr = o.r - l, du = bt - o.t
    const m = Math.min(dl, dr, du) // never pushed down, into the speaker
    if (m === du) b.y -= du
    else if (m === dl) b.x -= dl
    else b.x += dr
  }

  /* ------------------------------ The bell ------------------------------ */
  // Dome: a damped rotational spring. Plunger: a stiff spring. Glow and shimmer decay.
  const bp = { th: 0, w: 0, y: 0, v: 0, glow: 0, shim: 0, held: false, hover: false }
  function bellStep(dt) {
    bp.w += (-420 * bp.th - 5.5 * bp.w) * dt
    bp.th += bp.w * dt
    const target = bp.held ? 13 : bp.hover ? 3 : 0
    bp.v += (-1400 * (bp.y - target) - 48 * bp.v) * dt
    bp.y += bp.v * dt
    bp.glow *= Math.exp(-dt * 1.8)
    bp.shim *= Math.exp(-dt * 3.2)
  }
  function ring(strength = 1, { user = false, old = false } = {}) {
    bp.w += (Math.random() < 0.5 ? -1 : 1) * 70 * strength
    if (!bp.held) bp.v += 520 * strength
    bp.glow = Math.min(1.5, bp.glow + strength)
    bp.shim = Math.min(1, bp.shim + strength)
    if (user) D.ding(0.45 + 0.55 * strength)
    if (reduce) return
    ripple(strength, old)
    pulseMarks(strength, old)
  }
  function ripple(strength, old) {
    const n = old ? 1 : 3
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS(NS, 'circle')
      c.setAttribute('cx', G.center.x)
      c.setAttribute('cy', G.center.y)
      c.setAttribute('r', 196 * G.s)
      c.setAttribute('class', 'rip' + (old ? ' old' : '') + (i ? ' soft' : ''))
      ripples.appendChild(c)
      const peak = (old ? 0.4 : 0.6) * Math.min(1, strength) * (1 - i * 0.22)
      const a = c.animate([
        { transform: 'scale(.9)', opacity: 0 },
        { transform: 'scale(1.05)', opacity: peak, offset: 0.1 },
        { transform: `scale(${old ? 1.7 : 2.5 + i * 0.45})`, opacity: 0 },
      ], { duration: (old ? 1500 : 2000) + i * 320, delay: i * 160, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' })
      a.onfinish = () => c.remove()
    }
  }
  function pulseMarks(strength, old) {
    for (const m of marks) {
      const dir = m.classList.contains('l') ? -1 : 1
      const far = m.classList.contains('far')
      const peak = (old ? 0.35 : 0.95) * (far ? 0.55 : 1) * Math.min(1, strength)
      m.animate([
        { opacity: 0, transform: 'translateX(0) scale(.8)' },
        { opacity: peak, transform: `translateX(${dir * 6}px) scale(1)`, offset: 0.22 },
        { opacity: 0, transform: `translateX(${dir * (far ? 30 : 18)}px) scale(1.06)` },
      ], { duration: 950, delay: far ? 90 : 0, easing: 'cubic-bezier(.2,.7,.2,1)' })
    }
  }

  // The bell assembles itself: base rises, the dome is drawn as a line and filled, the plunger drops in.
  function buildBell() {
    stage.classList.add('shown')
    if (reduce) return
    const ease = 'cubic-bezier(.16,1,.3,1)'
    const A = (el, kf, o) => el.animate(kf, { easing: ease, fill: 'backwards', ...o })
    A(shadowEl, [{ opacity: 0, transform: 'scaleX(.2)' }, { opacity: getComputedStyle(shadowEl).opacity, transform: 'scaleX(1)' }], { duration: 1000, delay: 80 })
    A(baseG, [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }], { duration: 850 })
    domeRim.style.strokeDasharray = '1'
    domeLine.style.strokeDasharray = '1'
    A(domeRim, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay: 180, fill: 'both' })
    A(domeLine, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1100, delay: 260, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' })
    for (const f of domeFills) A(f, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 820 })
    A(shine, [{ opacity: 0 }, { opacity: 0.9 }], { duration: 700, delay: 1100 })
    A(knob, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1150 })
    plungerIn.animate([
      { transform: 'translateY(-110px)', opacity: 0 },
      { transform: 'translateY(7px)', opacity: 1, offset: 0.55 },
      { transform: 'translateY(-3px)', offset: 0.78 },
      { transform: 'translateY(0)' },
    ], { duration: 760, delay: 1020, easing: 'cubic-bezier(.3,0,.4,1)', fill: 'backwards' })
  }

  /* ------------------------------ Scanning and choosing ------------------------------ */
  let hiSlot = -1, scanAcc = 0, steps = 0, lastUser = -1e9, busy = false, ready = false
  function setHi(slot) {
    const prev = bubbles[hiSlot]
    if (prev) { prev.isHi = false; prev.el.classList.remove('is-hi'); prev.el.querySelector('.dw')?.remove() }
    hiSlot = slot
    scanAcc = 0
    const b = bubbles[slot]
    if (!b) return
    b.isHi = true
    b.el.classList.add('is-hi')
    const dw = document.createElement('i')
    dw.className = 'dw'
    dw.style.animationDuration = `${SCAN_MS}ms`
    b.el.appendChild(dw)
  }
  function advance() {
    const n = slots.length
    for (let k = 1; k <= n; k++) {
      const j = (((hiSlot + k) % n) + n) % n
      const b = bubbles[j]
      if (b && b.state === 'live' && now - b.born > 700) { setHi(j); steps++; return }
    }
  }
  function scanStep(dt) {
    if (!ready || busy) return
    scanAcc += dt * 1000
    if (scanAcc < SCAN_MS) return
    scanAcc = 0
    const lit = bubbles[hiSlot]
    if (steps >= AUTO_EVERY && now - lastUser > 9000 && lit && lit.isHi) choose(false)
    else advance()
  }
  function choose(byUser) {
    const b = bubbles[hiSlot]
    if (!ready || busy || !b || b.state !== 'live' || !b.isHi) { ring(byUser ? 0.8 : 0.5, { user: byUser }); return }
    busy = true
    steps = 0
    ring(1, { user: byUser })
    b.isHi = false
    b.el.querySelector('.dw')?.remove()
    b.el.classList.remove('is-hi')
    b.el.classList.add('is-flash')
    setTimeout(() => launch(b, byUser), reduce ? 0 : 260)
  }
  // The chosen sentence flies into the speaker, shrinking to the speaker's type size on the way.
  function launch(b, byUser) {
    const r = stage.getBoundingClientRect()
    const t = spText.getBoundingClientRect()
    const ts = parseFloat(getComputedStyle(spText).fontSize) / parseFloat(getComputedStyle(b.el).fontSize)
    const pad = parseFloat(getComputedStyle(b.el).paddingLeft)
    const ty = t.top - r.top + t.height / 2
    b.state = 'flying'
    b.fly = {
      t0: performance.now(), dur: reduce ? 1 : 820, fx: b.rx, fy: b.ry,
      tx: t.left - r.left - pad * ts + (b.w * ts) / 2, ty, ts,
      arc: clamp((ty - b.ry) * 0.22, 24, 80), byUser, swapped: false,
    }
  }

  let speakingNow = false, idleTimer = 0
  function say(text, byUser) {
    clearTimeout(idleTimer)
    spText.textContent = text
    spText.classList.add('live')
    speaker.classList.add('speaking')
    speakingNow = true
    if (!reduce) spText.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' })
    if (byUser) live.textContent = `Said: ${text}`
    const done = () => {
      speakingNow = false
      speaker.classList.remove('speaking')
      busy = false
      idleTimer = setTimeout(() => {
        spText.textContent = idleText()
        spText.classList.remove('live')
        if (!reduce) spText.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420 })
      }, 1500)
    }
    if (byUser) D.speak(text, done)
    else setTimeout(done, 1700)
  }

  /* ------------------------------ Rendering ------------------------------ */
  const bars = Array.from({ length: 14 }, () => spWave.appendChild(document.createElement('i')))
  let amp = 0, ptx = 0, pty = 0, pvx = 0, pvy = 0
  function draw(t) {
    const ts = t / 1000
    for (const b of bubbles) {
      if (!b) continue
      let x, y, s = 1, o = 1
      if (b.state === 'live') {
        const age = (t - b.born) / 1000
        b.hi += ((b.isHi ? 1 : 0) - b.hi) * 0.15
        const depth = 0.9 + 0.1 * b.z + (1 - (0.9 + 0.1 * b.z)) * b.hi // farther ones sit a touch smaller; the lit one comes forward
        s = (reduce ? 1 : 0.4 + 0.6 * easeOutBack(Math.min(1, age / 0.6))) * depth
        o = reduce ? 1 : Math.min(1, age / 0.22)
        const bob = reduce ? 0 : 1 - b.hi // the lit sentence holds still
        x = b.x + Math.cos(ts * 0.55 + b.phase) * 3 * bob + pvx * 18 * b.z
        y = b.y + Math.sin(ts * 0.8 + b.phase * 1.3) * 4 * bob + pvy * 12 * b.z
      } else {
        const f = b.fly
        const p = Math.min(1, (t - f.t0) / f.dur)
        const e = easeInOut(p)
        x = lerp(f.fx, f.tx, e)
        y = lerp(f.fy, f.ty, e) - Math.sin(Math.PI * e) * f.arc
        s = lerp(1, f.ts, e)
        o = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3
        if (p >= 0.62 && !f.swapped) { f.swapped = true; say(b.text, f.byUser) }
        if (p >= 1) {
          b.el.remove()
          bubbles[b.slot] = null
          const slot = b.slot
          setTimeout(() => { if (ready) { emit(slot); bp.glow = Math.min(1.5, bp.glow + 0.3) } }, 650)
          continue
        }
      }
      b.rx = x
      b.ry = y
      b.el.style.transform = `translate3d(${(x - b.w / 2).toFixed(2)}px, ${(y - b.h / 2).toFixed(2)}px, 0) scale(${s.toFixed(4)})`
      b.el.style.opacity = o.toFixed(3)
    }

    const sx = 1 + Math.sin(t * 0.09) * 0.007 * bp.shim // the dome's high, fast shiver
    domeG.style.transform = `rotate(${bp.th.toFixed(3)}deg) scale(${sx.toFixed(4)}, ${(2 - sx).toFixed(4)})`
    plungerG.style.transform = `translateY(${bp.y.toFixed(2)}px)`
    shadowEl.style.transform = `scaleX(${(1 + bp.y * 0.003 + Math.abs(bp.th) * 0.012).toFixed(4)})`
    halo.style.opacity = (0.62 + bp.glow * 0.3).toFixed(3)
    halo.style.transform = `scale(${(1 + bp.glow * 0.07).toFixed(4)})`
    if (!reduce && finePointer) {
      bellSvg.style.transform = `perspective(1100px) rotateY(${(pvx * 9).toFixed(2)}deg) rotateX(${(-pvy * 5).toFixed(2)}deg)`
      shine.style.transform = `translate(${(pvx * 12).toFixed(2)}px, ${(pvy * 7).toFixed(2)}px)`
    }

    amp += ((speakingNow ? 1 : 0) - amp) * 0.12
    if (amp > 0.005) {
      bars.forEach((el, i) => {
        const n = Math.abs(Math.sin(t * 0.011 + i * 1.9) * Math.sin(t * 0.0047 + i * 0.7))
        el.style.transform = `scaleY(${(0.12 + amp * (0.18 + n * 0.82)).toFixed(3)})`
      })
    }
  }

  let last = performance.now(), acc = 0, raf = 0
  function frame(t) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(1 / 30, Math.max(0, (t - last) / 1000))
    last = t
    now = t
    acc += dt
    while (acc >= DT) { physics(DT); acc -= DT }
    bellStep(dt)
    scanStep(dt)
    const k = 1 - Math.exp(-dt * 5)
    pvx += (ptx - pvx) * k
    pvy += (pty - pvy) * k
    draw(t)
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } }
  function stop() { cancelAnimationFrame(raf); raf = 0 }

  /* ------------------------------ Input ------------------------------ */
  function userRing() { lastUser = performance.now(); choose(true) }
  bellBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    bp.held = true
    userRing()
  })
  addEventListener('pointerup', () => { bp.held = false })
  addEventListener('pointercancel', () => { bp.held = false })
  bellBtn.addEventListener('pointerenter', () => { bp.hover = true })
  bellBtn.addEventListener('pointerleave', () => { bp.hover = false })
  bellBtn.addEventListener('contextmenu', (e) => e.preventDefault())
  bellBtn.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (!e.repeat) { bp.held = true; userRing() }
  })
  bellBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') bp.held = false })
  // Space rings the hero bell while the hero is on screen (the demo takes it once the demo is in view).
  let heroOn = false
  addEventListener('keydown', (e) => {
    if (e.key !== ' ' || e.repeat || !heroOn || D.demoActive()) return
    if (e.target !== document.body && e.target !== document.documentElement) return
    e.preventDefault()
    bp.held = true
    userRing()
  })
  addEventListener('keyup', (e) => { if (e.key === ' ') bp.held = false })
  if (finePointer && !reduce) {
    hero.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect()
      ptx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.2, 1.2)
      pty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1.2, 1.2)
    })
    hero.addEventListener('pointerleave', () => { ptx = 0; pty = 0 })
  }

  new IntersectionObserver(([en]) => { heroOn = en.isIntersecting; heroOn ? start() : stop() }, { threshold: 0.12 }).observe(stage)
  let resizeRaf = 0
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(() => { measure(); fit() })
  }).observe(stage)

  /* ------------------------------ The opening ------------------------------ */
  function splitTitle() {
    for (const line of title.querySelectorAll(':scope > span')) {
      const words = line.textContent.trim().split(/\s+/)
      line.textContent = ''
      words.forEach((word, i) => {
        const outer = document.createElement('span')
        const inner = document.createElement('span')
        outer.className = 'w'
        inner.textContent = word
        inner.style.setProperty('--i', i)
        outer.appendChild(inner)
        line.appendChild(outer)
        if (i < words.length - 1) line.appendChild(document.createTextNode(' '))
      })
    }
    title.classList.add('split')
  }

  // Hector's bell: one ring, one dull sentence, and it fades.
  function sayOld() {
    const el = make('Come here.', 'old')
    const w = el.offsetWidth, h = el.offsetHeight
    const x0 = G.top.x - w / 2, y0 = G.top.y - h - 4
    const x1 = W * 0.5 - w / 2, y1 = H * 0.24
    const k = (x, y, s, o, blur, offset) => ({ transform: `translate3d(${x}px, ${y}px, 0) scale(${s})`, opacity: o, filter: `blur(${blur}px)`, offset })
    el.animate([
      k(x0, y0, 0.4, 0, 0, 0),
      k(x1, y1, 1, 1, 0, 0.3),
      k(x1, y1 + 5, 1, 1, 0, 0.7),
      k(x1, y1 + 34, 0.95, 0, 6, 1),
    ], { duration: 2400, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' }).onfinish = () => el.remove()
  }

  async function intro() {
    splitTitle()
    measure()
    const [then, nowLine] = title.querySelectorAll(':scope > span')
    if (reduce) {
      then.classList.add('in', 'past')
      nowLine.classList.add('in')
      stage.classList.add('shown', 'ready')
      now = performance.now()
      for (let i = 0; i < slots.length; i++) emit(i, true)
      for (let n = 0; n < 600; n++) physics(DT)
      ready = true
      advance()
      return
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    then.classList.add('in')
    buildBell()
    await wait(1700)
    ring(0.55, { old: true })
    sayOld()
    await wait(1250)
    nowLine.classList.add('in')
    then.classList.add('past')
    await wait(480)
    ring(1.15)
    now = performance.now()
    for (let i = 0; i < slots.length; i++) { emit(i); await wait(95); now = performance.now() }
    await wait(700)
    stage.classList.add('ready')
    ready = true
    await wait(400)
    advance()
  }

  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(500)]).then(intro)
})()
