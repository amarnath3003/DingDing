// Ding.AI landing page: theme, small figures, and a working one-button Bell Screen.

/* ------------------------------ Theme ------------------------------ */
const root = document.documentElement
const themeBtn = document.getElementById('themeBtn')
const themeLabel = document.getElementById('themeLabel')
const THEME_NAMES = { auto: 'Auto', light: 'Day', dark: 'Night' }
const THEME_HINT = { auto: 'follows the time of day', light: 'day', dark: 'night' }

function applyTheme(pick) {
  const h = new Date().getHours()
  root.dataset.theme = pick === 'auto' ? (h >= 21 || h < 5 ? 'dark' : 'light') : pick
  root.dataset.pick = pick
  themeLabel.textContent = THEME_NAMES[pick]
  themeBtn.setAttribute('aria-label', `Theme: ${THEME_HINT[pick]}`)
  document.querySelector('meta[name=theme-color]').content = root.dataset.theme === 'dark' ? '#262624' : '#faf9f5'
}
applyTheme(root.dataset.pick || 'auto')
themeBtn.addEventListener('click', () => {
  const order = ['auto', 'light', 'dark']
  const next = order[(order.indexOf(root.dataset.pick) + 1) % order.length]
  localStorage.setItem('ding-theme', next)
  applyTheme(next)
})

const nav = document.querySelector('.nav')
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true })

/* ------------------------------ Letter grid ------------------------------ */
// Row-column scanning: reaching a letter costs (row + column) steps and two presses.
const GRID = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', 'YZ␣.,?']
const WORD = 'WATER'
const lgrid = document.getElementById('lgrid')
GRID.forEach((row, r) => [...row].forEach((ch, c) => {
  const cell = document.createElement('span')
  cell.textContent = ch
  const order = WORD.indexOf(ch)
  if (order >= 0) {
    cell.className = 'hit'
    cell.innerHTML = `${ch}<b>${order + 1}</b><small>${r + 1 + c + 1} steps</small>`
  }
  lgrid.appendChild(cell)
}))

/* ------------------------------ Copy ------------------------------ */
const copyBtn = document.getElementById('copyBtn')
copyBtn.addEventListener('click', async () => {
  const text = document.getElementById('runCode').innerText.replace(/\s+#.*$/gm, '')
  try {
    await navigator.clipboard.writeText(text)
    copyBtn.querySelector('span').textContent = 'Copied'
  } catch {
    copyBtn.querySelector('span').textContent = 'Select and copy'
  }
  setTimeout(() => { copyBtn.querySelector('span').textContent = 'Copy' }, 1800)
})

/* ------------------------------ Sound (shared by the hero and the demo) ------------------------------ */
// Sound only ever plays in answer to a ring the visitor made: a synthesized desk bell, then the chosen words.
const Sound = {
  on: localStorage.getItem('ding-sound') !== 'off',
  set(on) {
    this.on = on
    localStorage.setItem('ding-sound', on ? 'on' : 'off')
    if (!on && 'speechSynthesis' in window) speechSynthesis.cancel()
    syncSoundButtons()
  },
}
function syncSoundButtons() {
  document.querySelectorAll('[data-sound]').forEach((b) => {
    b.setAttribute('aria-pressed', String(Sound.on))
    b.querySelector('.lbl').textContent = Sound.on ? 'Sound on' : 'Sound off'
  })
}
document.querySelectorAll('[data-sound]').forEach((b) => b.addEventListener('click', () => Sound.set(!Sound.on)))
syncSoundButtons()

let voices = []
function loadVoices() { voices = speechSynthesis.getVoices() }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices }
function speak(text, onEnd) {
  if (!Sound.on || !('speechSynthesis' in window)) { setTimeout(onEnd, 1500); return }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voices.find((v) => v.lang === 'en-IN') || voices.find((v) => v.lang === 'en-GB') || voices.find((v) => v.lang.startsWith('en')) || null
  u.rate = 0.98
  let done = false
  const finish = () => { if (!done) { done = true; onEnd() } }
  u.onend = finish
  u.onerror = finish
  setTimeout(finish, 6000) // some browsers never fire onend
  speechSynthesis.speak(u)
}

// A desk bell, synthesized: a bright strike, four inharmonic partials that decay at their own
// rates, and a slightly detuned twin of the fundamental for the shimmer of a real dome.
let actx = null
function ding(strength = 1) {
  if (!Sound.on) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  actx = actx || new AC()
  if (actx.state === 'suspended') actx.resume()
  const t = actx.currentTime + 0.005
  const out = actx.createGain()
  out.gain.value = 0.16 * strength
  const comp = actx.createDynamicsCompressor()
  out.connect(comp).connect(actx.destination)
  const f0 = 2093 // C7, the ring of a small service bell
  const partials = [[1, 1, 2.8], [1.0035, 0.55, 2.4], [2.76, 0.42, 1.1], [5.4, 0.2, 0.55], [8.93, 0.1, 0.3]]
  for (const [ratio, amp, decay] of partials) {
    const o = actx.createOscillator()
    const g = actx.createGain()
    o.type = 'sine'
    o.frequency.value = f0 * ratio
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(amp, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + decay + 0.05)
  }
  // the strike: a few milliseconds of bright noise
  const len = Math.floor(actx.sampleRate * 0.03)
  const buf = actx.createBuffer(1, len, actx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4)
  const noise = actx.createBufferSource()
  const bp = actx.createBiquadFilter()
  const ng = actx.createGain()
  noise.buffer = buf
  bp.type = 'bandpass'
  bp.frequency.value = 5200
  bp.Q.value = 1.2
  ng.gain.value = 0.5
  noise.connect(bp).connect(ng).connect(out)
  noise.start(t)
}

/* ------------------------------ The demo ------------------------------ */
// A scripted morning-to-evening for the illustrative persona. Same rules as the real
// Bell Screen: the clay highlight walks the options, its line fills over the dwell,
// and the highlight freezes the moment the bell goes down.
const SCAN_MS = 1200
const HOLD_MS = 1000
const TAP_GAP_MS = 420

const MOMENTS = [
  {
    clock: '07:40', title: 'Sunday morning with Lakshmi', people: 'Lakshmi', face: 'neutral',
    who: 'Lakshmi', said: 'Do you want tea or coffee?',
    guesses: [
      { text: 'Tea, please. Less sugar than usual.' },
      { text: 'Coffee, strong. I need the kick this morning.' },
      { text: 'Half tea, half coffee. Why not both?' },
      { text: 'Tea, and turn the light on when you bring it.', does: { device: 'light', to: true } },
    ],
    other: [
      { text: 'Water first, then tea.' },
      { text: 'Nothing for now, thank you.' },
      { text: 'Ask me again in ten minutes.' },
      { text: 'Has Meena called yet?' },
    ],
  },
  {
    clock: '18:10', title: 'Sunday evening with Arjun', people: 'Arjun, Lakshmi', face: 'smiling',
    who: 'Arjun', said: 'Thatha, can we watch cricket?',
    guesses: [
      { text: 'Only if you tell me the score first.' },
      { text: 'Yes. Put the TV on, champion.', does: { device: 'tv', to: true } },
      { text: 'After your homework, Arjun.' },
      { text: 'Sit with me. We’ll watch together.' },
    ],
    other: [
      { text: 'Who is batting?' },
      { text: 'Not tonight. I’m tired.' },
      { text: 'Ask Ajji first.' },
      { text: 'Only the last ten overs.' },
    ],
  },
  {
    clock: '18:45', title: 'Sunday evening, Dr. Rao visiting', people: 'Dr. Rao, Lakshmi', face: 'tired',
    who: 'Dr. Rao', said: 'Any pain today, Ravi?',
    guesses: [
      { text: 'No pain. Just stiff. Please move me.' },
      { text: 'A little, in my lower back.' },
      { text: 'No. Mostly bored of this ceiling.' },
      { text: 'Yes. I’d like to talk about it.' },
    ],
    other: [
      { text: 'Worse at night than in the day.' },
      { text: 'The new medicine makes me sleepy.' },
      { text: 'Can we talk without the TV on?', does: { device: 'tv', to: false } },
      { text: 'Please explain that again, slowly.' },
    ],
  },
]

const $ = (id) => document.getElementById(id)
const demoEl = $('demo')
const dBody = $('dBody')
const dActions = $('dActions')
const dTranscript = $('dTranscript')
const dSaid = $('dSaid')
const dFx = $('dFx')
const ringBtn = $('ring')

const ICON = (id, size = 18) => `<svg class="ic" width="${size}" height="${size}"><use href="#i-${id}"/></svg>`
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const state = {
  moment: 0,
  set: 'guesses',      // 'guesses' | 'other'
  mode: 'scan',        // 'scan' | 'thinking' | 'help'
  hi: 0,
  devices: { light: false, tv: false },
  lines: [],           // { who, text, me }
  note: null,          // { kind, text }
  history: [],         // snapshots for undo
  visible: false,
}

function targets() {
  if (state.mode === 'help') return [{ kind: 'cancel', text: 'I’m OK now. Cancel help.' }]
  if (state.mode !== 'scan') return []
  const m = MOMENTS[state.moment]
  const list = m[state.set].map((g) => ({ kind: 'guess', ...g }))
  list.push({ kind: 'action', id: 'other', label: state.set === 'other' ? 'First ideas' : 'Other ideas', icon: 'shuffle' })
  list.push({ kind: 'action', id: 'help', label: 'Help', icon: 'help' })
  return list
}

/* Rendering */
function renderSide() {
  const m = MOMENTS[state.moment]
  $('dClock').textContent = m.clock
  $('dTitle').textContent = m.title
  $('dPeople').textContent = m.people
  $('dFace').textContent = m.face
  const light = $('dLight'), tv = $('dTv')
  light.textContent = state.devices.light ? 'On' : 'Off'
  light.classList.toggle('on', state.devices.light)
  tv.textContent = state.devices.tv ? 'On' : 'Off'
  tv.classList.toggle('on', state.devices.tv)
}

function renderTranscript() {
  const recent = state.lines.slice(-3)
  dTranscript.innerHTML = recent.map((l, i) => {
    const old = i < recent.length - 1 && recent.length > 2 ? ' old' : ''
    return l.me
      ? `<div class="line me${old}${l.speaking ? ' speaking' : ''}">${esc(l.text)}</div>`
      : `<div class="line them${old}"><span class="who">${esc(l.who)}</span>${esc(l.text)}</div>`
  }).join('') + (state.note ? `<div class="note ${state.note.kind}">${ICON(state.note.kind === 'done' ? 'check' : 'undo', 15)}${esc(state.note.text)}</div>` : '')
}

function renderOptions() {
  const list = targets()
  if (state.mode === 'thinking') {
    dBody.innerHTML = `<div class="d-head"><span class="breathe">${ICON('bell', 16)}</span>Thinking about what ${esc(MOMENTS[state.moment].who)} said…</div>`
    dActions.innerHTML = ''
    return
  }
  if (state.mode === 'help') {
    dBody.innerHTML = `<div class="callout help">${ICON('help', 20)}<div><span class="title">Help is on its way.</span><span class="sub">Lakshmi has been alerted. <span class="sim-tag">Simulated</span></span></div></div>
      <div class="guesses"><div class="opt guess cancel" data-i="0">${ICON('check', 20)}<span class="text">${esc(list[0].text)}</span></div></div>`
    dActions.innerHTML = ''
    return
  }
  const head = state.set === 'other' ? 'Other ideas' : `Replies to ${esc(MOMENTS[state.moment].who)}`
  dBody.innerHTML = `<div class="d-head">${head}</div><div class="guesses">` + list.map((t, i) => t.kind !== 'guess' ? '' :
    `<div class="opt guess" data-i="${i}"><span class="text">${esc(t.text)}</span>${t.does ? `<em class="does">${ICON(t.does.device === 'tv' ? 'tv' : 'light', 15)}${t.does.to ? 'Turns on' : 'Turns off'}</em>` : ''}</div>`
  ).join('') + '</div>'
  dActions.innerHTML = list.map((t, i) => t.kind !== 'action' ? '' :
    `<div class="opt action${t.id === 'help' ? ' help' : ''}" data-i="${i}">${ICON(t.icon)}${t.label}</div>`
  ).join('')
}

function el(i) { return demoEl.querySelector(`.opt[data-i="${i}"]`) }

function paintHighlight() {
  demoEl.querySelectorAll('.opt.is-hi').forEach((n) => n.classList.remove('is-hi'))
  demoEl.querySelectorAll('.dwell').forEach((n) => n.remove())
  const node = el(state.hi)
  if (!node) return
  node.classList.add('is-hi')
  if (!bell.down && !bell.pending) {
    const line = document.createElement('i')
    line.className = 'dwell'
    line.style.animationDuration = `${SCAN_MS}ms`
    node.appendChild(line)
  }
}

function render() {
  renderSide()
  renderTranscript()
  renderOptions()
  paintHighlight()
}

/* Scanning */
let scanTimer = null
function scanning() { return state.visible && !document.hidden && (state.mode === 'scan' || state.mode === 'help') }
function startScan(reset) {
  clearInterval(scanTimer)
  if (reset) state.hi = 0
  paintHighlight()
  if (!scanning()) return
  scanTimer = setInterval(() => {
    if (bell.down || bell.pending) return
    const n = targets().length
    if (!n) return
    state.hi = (state.hi + 1) % n
    paintHighlight()
  }, SCAN_MS)
}
function stopScan() { clearInterval(scanTimer); scanTimer = null }

/* Choosing */
function snapshot() {
  return JSON.stringify({ moment: state.moment, set: state.set, devices: state.devices, lines: state.lines })
}

function flash(i, then) {
  const node = el(i)
  if (node) { node.classList.remove('is-hi'); node.classList.add('is-flash') }
  setTimeout(then, 380)
}

function choose(i) {
  const t = targets()[i]
  if (!t) return
  stopScan()
  flash(i, () => {
    if (t.kind === 'cancel') {
      state.mode = 'scan'
      state.note = { kind: 'done', text: 'Help cancelled' }
      render(); startScan(true)
      return
    }
    if (t.kind === 'action' && t.id === 'help') return callHelp()
    if (t.kind === 'action' && t.id === 'other') {
      state.set = state.set === 'other' ? 'guesses' : 'other'
      state.note = null
      render(); startScan(true)
      return
    }
    say(t)
  })
}

function say(t) {
  state.history.push(snapshot())
  if (t.does) state.devices[t.does.device] = t.does.to
  const line = { me: true, text: t.text, speaking: true }
  state.lines.push(line)
  state.note = null
  state.mode = 'thinking'
  dSaid.textContent = `Speaking: “${t.text}”`
  dSaid.classList.add('live')
  render()
  speak(t.text, () => {
    if (state.mode !== 'thinking' || !state.lines.includes(line)) return // undone, or help called, while speaking
    line.speaking = false
    dSaid.textContent = 'Ring to choose. It’s spoken aloud.'
    dSaid.classList.remove('live')
    state.note = { kind: 'done', text: t.does ? (t.does.to ? `Said, and turned the ${t.does.device === 'tv' ? 'TV' : 'light'} on` : 'Said, and turned the TV off') : 'Said' }
    renderTranscript()
    setTimeout(nextMoment, 1100)
  })
}

function nextMoment() {
  if (state.mode !== 'thinking') return
  state.moment = (state.moment + 1) % MOMENTS.length
  if (state.moment === 0) { state.devices = { light: false, tv: false }; state.lines = []; state.history = [] }
  const m = MOMENTS[state.moment]
  state.lines.push({ who: m.who, text: m.said })
  state.set = 'guesses'
  state.note = null
  state.mode = 'scan'
  render(); startScan(true)
}

function undo() {
  stopScan()
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  const prev = state.history.pop()
  if (!prev) {
    state.note = { kind: 'undone', text: 'Nothing to undo' }
  } else {
    Object.assign(state, JSON.parse(prev))
    state.note = { kind: 'undone', text: 'Undone. Hold the bell again to undo more.' }
  }
  state.mode = 'scan'
  dSaid.textContent = 'Ring to choose. It’s spoken aloud.'
  dSaid.classList.remove('live')
  render(); startScan(true)
}

function callHelp() {
  stopScan()
  state.lines.forEach((l) => { l.speaking = false })
  dSaid.textContent = 'Ring to choose. It’s spoken aloud.'
  dSaid.classList.remove('live')
  state.mode = 'help'
  state.note = null
  render(); startScan(true)
  if (Sound.on && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance('Help. Lakshmi, please come.'))
  }
}

/* The bell: press, hold, three quick taps */
const bell = { down: false, downAt: 0, frozen: 0, taps: 0, pending: null, holdTimer: null }

function bellDown() {
  if (bell.down) return
  // While the voice speaks there is nothing to choose, but holding still undoes and three taps still call for help
  bell.down = true
  bell.downAt = performance.now()
  if (!bell.pending) bell.frozen = state.hi
  clearTimeout(bell.pending); bell.pending = null
  ringBtn.classList.add('down')
  ringBtn.classList.remove('dinged'); void ringBtn.offsetWidth; ringBtn.classList.add('dinged')
  ding(0.7)
  paintHighlight() // freeze: drop the dwell line
  const node = el(bell.frozen)
  if (node) {
    const hold = document.createElement('i')
    hold.className = 'holdbar'
    hold.style.animationDuration = `${HOLD_MS - 250}ms`
    node.appendChild(hold)
  }
  bell.holdTimer = setTimeout(() => { dFx.textContent = 'Let go to undo'; dFx.className = 'bell-fx' }, HOLD_MS)
}

function bellUp() {
  if (!bell.down) return
  bell.down = false
  ringBtn.classList.remove('down')
  clearTimeout(bell.holdTimer)
  demoEl.querySelectorAll('.holdbar').forEach((n) => n.remove())
  const held = performance.now() - bell.downAt
  if (held >= HOLD_MS) {
    bell.taps = 0
    dFx.textContent = ''
    return undo()
  }
  bell.taps += 1
  if (bell.taps >= 3) {
    bell.taps = 0
    dFx.textContent = ''
    return callHelp()
  }
  if (bell.taps === 2) { dFx.textContent = '2 taps'; dFx.className = 'bell-fx taps' }
  bell.pending = setTimeout(() => {
    bell.pending = null
    bell.taps = 0
    dFx.textContent = ''
    choose(bell.frozen)
  }, TAP_GAP_MS)
}

ringBtn.addEventListener('pointerdown', (e) => { if (e.button === 0) { ringBtn.setPointerCapture(e.pointerId); bellDown() } })
ringBtn.addEventListener('pointerup', bellUp)
ringBtn.addEventListener('pointercancel', bellUp)
ringBtn.addEventListener('contextmenu', (e) => e.preventDefault())

// Space or Enter rings the bell while the demo is on screen.
function keyIsBell(e) {
  if (e.key !== ' ' && e.key !== 'Enter') return false
  if (!state.visible) return false
  const t = e.target
  if (t === ringBtn || t === document.body || t === document.documentElement) return true
  return false
}
addEventListener('keydown', (e) => {
  if (!keyIsBell(e)) return
  e.preventDefault()
  if (!e.repeat) bellDown()
})
addEventListener('keyup', (e) => {
  if (!keyIsBell(e)) return
  e.preventDefault()
  bellUp()
})

/* Only scan while the demo is on screen */
new IntersectionObserver(([entry]) => {
  state.visible = entry.isIntersecting
  if (state.visible) startScan(false); else stopScan()
}, { threshold: 0.45 }).observe(demoEl)
document.addEventListener('visibilitychange', () => (document.hidden ? stopScan() : startScan(false)))

state.lines.push({ who: MOMENTS[0].who, text: MOMENTS[0].said })
render()

window.Ding = { Sound, speak, ding, demoActive: () => state.visible }
