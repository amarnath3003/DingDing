'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const scenarios = [
  {
    id: 'morning',
    label: '7:05 AM — Morning Routine',
    context: 'Medication due at 8. Tea first?',
    offer: 'Good morning. Medicine at 8. Tea first?',
    accept: 'Kettle command sent to caregiver\'s phone. Bell glows "on my way".',
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'hot',
    label: '3:10 AM — Too Hot',
    context: 'Room 31°C, HR 92 (baseline 68)',
    offer: 'Too hot? Fan on?',
    accept: 'Fan on, light stays off, caregiver not woken.',
    color: 'from-red-500 to-rose-500',
  },
  {
    id: 'conversation',
    label: '9:30 AM — Neighbour Asks',
    context: 'Visitor: "How\'s the cricket?"',
    offer: 'Three replies in your voice → "Don\'t ask, we lost again."',
    accept: 'Neighbour laughs. Dwell auto-lengthens as timing slows.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    id: 'new-sentence',
    label: '4:20 PM — Novel Request',
    context: 'Want to say something new',
    offer: 'Zooms: Message? → Priya? → "Tell Priya…" → Letters pre-filled with likely words',
    accept: '12-word sentence in ~2 min vs 15+ without prediction.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    id: 'sos',
    label: '3:40 AM — Emergency',
    context: '5 rapid rings + HR spike',
    offer: 'No menus. Alerts everyone. Asks "Pain?"',
    accept: 'Human wakes in seconds. AI whispers "Help is coming".',
    color: 'from-rose-500 to-red-600',
  },
  {
    id: 'creative',
    label: '8:45 PM — Bell Instrument',
    context: 'Play rhythms on the bell',
    offer: 'AI adds bass loop that follows your tempo',
    accept: 'A person who can\'t speak can perform. Jam partner mode.',
    color: 'from-pink-500 to-fuchsia-500',
  },
]

export function Demo() {
  const [activeScenario, setActiveScenario] = useState(null)
  const [demoStep, setDemoStep] = useState(0)
  const [particles, setParticles] = useState([])
  const containerRef = useRef(null)
  const bellRef = useRef(null)

  const startDemo = (scenario) => {
    setActiveScenario(scenario)
    setDemoStep(0)
    createRingParticles()
    setTimeout(() => setDemoStep(1), 800)
    setTimeout(() => setDemoStep(2), 2000)
  }

  const createRingParticles = () => {
    const newParticles = []
    for (let i = 0; i < 20; i++) {
      newParticles.push({
        id: Date.now() + i,
        x: 50 + (Math.random() - 0.5) * 20,
        y: 50 + (Math.random() - 0.5) * 20,
        size: 4 + Math.random() * 8,
        opacity: 1,
        delay: Math.random() * 200,
      })
    }
    setParticles(newParticles)
    setTimeout(() => setParticles([]), 1500)
  }

  const resetDemo = () => {
    setDemoStep(0)
    setTimeout(() => setActiveScenario(null), 300)
  }

  return (
    <section className="relative max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="text-center mb-16"
      >
        <p className="text-tio-gold text-sm font-medium tracking-widest uppercase mb-4">Interactive Demo</p>
        <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-tio-cream mb-6">
          Try the <span className="text-gradient-gold">loop</span> yourself
        </h2>
        <p className="text-tio-muted text-lg max-w-2xl mx-auto leading-relaxed">
          Click a scenario to see how TÍO handles it. Each follows: Context → Offer → Ring → Action → Learn.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {scenarios.map((scenario) => (
          <motion.button
            key={scenario.id}
            onClick={() => startDemo(scenario)}
            disabled={!!activeScenario}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group card-glass p-6 text-left transition-all duration-300 hover:border-tio-gold/30"
            style={{ borderLeft: `3px solid transparent`, background: `linear-gradient(90deg, transparent, ${scenario.color.replace('from-', '').replace('to-', '')}20)` }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${scenario.color} flex items-center justify-center text-tio-dark`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-tio-gold text-xs font-medium tracking-wider uppercase">{scenario.label.split('—')[0].trim()}</p>
                <p className="text-tio-muted text-sm">{scenario.label.split('—')[1]?.trim() || ''}</p>
              </div>
            </div>
            <p className="text-tio-cream text-sm leading-relaxed">{scenario.context}</p>
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeScenario && (
          <motion.div
            key={activeScenario.id}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative"
          >
            <div className="card-glass p-8 md:p-12 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-tio-gold/5 to-transparent" />
              
              <div className="relative z-10 grid lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activeScenario.color} flex items-center justify-center text-tio-dark`}>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-tio-gold text-xs font-medium tracking-wider uppercase">Scenario</p>
                      <p className="font-serif text-xl text-tio-cream">{activeScenario.label}</p>
                    </div>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: demoStep >= 1 ? 1 : 0, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="p-6 bg-tio-darker/50 rounded-xl border border-tio-gold/10"
                  >
                    <p className="text-tio-gold/70 text-xs font-medium tracking-wider uppercase mb-2">Context</p>
                    <p className="text-tio-cream">{activeScenario.context}</p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: demoStep >= 1 ? 1 : 0, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="p-6 bg-gradient-to-br from-tio-gold/10 to-tio-goldDark/5 rounded-xl border border-tio-gold/20"
                  >
                    <p className="text-tio-gold text-xs font-medium tracking-wider uppercase mb-2">AI Offer (Private)</p>
                    <p className="font-serif text-lg text-tio-cream">"{activeScenario.offer}"</p>
                    <div className="mt-4 flex items-center gap-3">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setDemoStep(2); createRingParticles(); }}
                        className="btn-primary px-6 py-2 text-sm"
                      >
                        <span>🔔 Ring to Accept</span>
                      </motion.button>
                      <span className="text-tio-muted text-sm">or wait for next guess</span>
                    </div>
                  </motion.div>

                  <AnimatePresence mode="wait">
                    {demoStep >= 2 && (
                      <motion.div
                        key="result"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4 }}
                        className="p-6 bg-tio-darker/50 rounded-xl border border-tio-gold/20 shimmer"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-full bg-tio-gold/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-tio-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <p className="text-tio-gold text-xs font-medium tracking-wider uppercase">Action Executed</p>
                        </div>
                        <p className="text-tio-cream">{activeScenario.accept}</p>
                        <p className="text-tio-muted text-sm mt-4">System learns: this context → this offer ranks higher next time.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative">
                  <div className="aspect-square max-w-xs mx-auto relative">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-tio-gold/10 to-transparent blur-2xl" />
                    <div className="relative aspect-square rounded-2xl border border-tio-gold/20 bg-gradient-to-br from-tio-gray/50 to-tio-darker flex items-center justify-center p-8">
                      <div className="text-center">
                        <motion.div
                          animate={{ scale: demoStep >= 1 ? 1.1 : 1 }}
                          transition={{ duration: 0.3, repeat: demoStep >= 1 ? Infinity : 0, repeatType: "reverse" }}
                          className="w-32 h-32 mx-auto mb-6 relative"
                        >
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-tio-gold to-tio-goldDark opacity-20 blur-xl" />
                          <div className="relative w-full h-full rounded-full border-4 border-tio-gold/30 flex items-center justify-center">
                            <svg className="w-16 h-16 text-tio-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </motion.div>
                        <p className="font-serif text-2xl text-tio-cream mb-2">
                          {demoStep >= 1 ? '🔔 Ring!' : 'Tap a scenario'}
                        </p>
                        <p className="text-tio-muted text-sm">
                          {demoStep === 0 ? 'Choose a moment to simulate' : demoStep === 1 ? 'Waiting for your ring...' : 'Action complete. System learning...'}
                        </p>
                      </div>
                    </div>

                    {particles.map(p => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                        animate={{ 
                          opacity: 0, 
                          scale: 1, 
                          x: (Math.random() - 0.5) * 100,
                          y: (Math.random() - 0.5) * 100 - 50
                        }}
                        transition={{ duration: 1, delay: p.delay / 1000, ease: "easeOut" }}
                        className="absolute rounded-full bg-gradient-to-r from-tio-gold to-tio-goldDark pointer-events-none"
                        style={{
                          width: p.size,
                          height: p.size,
                          left: `${p.x}%`,
                          top: `${p.y}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <motion.button
                onClick={resetDemo}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="relative z-10 mt-8 mx-auto btn-primary px-8 py-3"
              >
                <span>Try Another Scenario</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!activeScenario && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center p-8 card-glass"
        >
          <p className="text-tio-gold text-sm font-medium tracking-widest uppercase mb-4">The Loop Visualized</p>
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 mb-8">
            {[
              { label: 'Perceive', icon: '👁️', color: 'from-blue-500 to-cyan-500' },
              { label: 'Predict', icon: '🧠', color: 'from-purple-500 to-violet-500' },
              { label: 'Offer', icon: '💬', color: 'from-amber-500 to-orange-500' },
              { label: 'Ring', icon: '🔔', color: 'from-yellow-500 to-amber-500' },
              { label: 'Act', icon: '⚡', color: 'from-green-500 to-emerald-500' },
              { label: 'Learn', icon: '📈', color: 'from-pink-500 to-rose-500' },
            ].map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 * i }}
                className="flex flex-col items-center gap-2"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-3xl`}>
                  {step.icon}
                </div>
                <span className="text-tio-cream font-medium text-sm">{step.label}</span>
                {i < 5 && (
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                    className="w-8 h-1 bg-gradient-to-r from-tio-gold/30 to-tio-gold mx-2 -mt-4"
                  />
                )}
              </motion.div>
            ))}
          </div>
          <p className="text-tio-muted text-sm max-w-xl mx-auto">
            This loop runs continuously. The "Offer" step uses a warm candidate cache refreshed every few seconds—so when you ring, the first guess is often already prepared.
          </p>
        </motion.div>
      )}
    </section>
  )
}