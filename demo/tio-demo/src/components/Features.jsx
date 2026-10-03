'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

const features = [
  {
    icon: 'bell',
    title: 'One Bell, Infinite Meaning',
    description: 'A single ding becomes water, a sentence, a smart-home command, a reply to a visitor—whatever the moment demands. The AI chooses granularity: action → sentence → word → letter.',
    gradient: 'from-tio-gold to-tio-goldDark',
  },
  {
    icon: 'brain',
    title: 'One Continuous AI Loop',
    description: 'No modes, no menus. Tío perceives bell rhythm, time, body sensors, room context, conversation, and home state—then offers its best guess. Ring to accept, silence for next.',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: 'voice',
    title: 'Your Voice, Your Style',
    description: 'Generated sentences sound like you—word choice, humour, formality per person. Optional voice banking lets the output speak in your own cloned voice.',
    gradient: 'from-yellow-500 to-amber-600',
  },
  {
    icon: 'zap',
    title: 'Rhythm Shortcuts That Learn',
    description: 'Frequent needs compress into custom rhythms (ding-ding-pause-ding for water). The AI proposes shortcuts; you accept with one ring. A personal language co-created over weeks.',
    gradient: 'from-orange-500 to-red-500',
  },
  {
    icon: 'heart',
    title: 'Health Awareness, Not Diagnosis',
    description: 'Personal baselines for heart rate, sleep, movement. Gentle prompts: "Reposition?" "Pain 0–10?" Clinician-friendly trend logs. Escalates to humans, never diagnoses.',
    gradient: 'from-rose-500 to-pink-500',
  },
  {
    icon: 'music',
    title: 'Creative Superpowers',
    description: 'Bell becomes a MIDI drum pad—Tío adds bass, harmony, loops that follow your tempo. Co-write poems, play quizzes, create. The device becomes yours, not medical.',
    gradient: 'from-purple-500 to-violet-500',
  },
]

const icons = {
  bell: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  brain: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.734-.988-2.386l-.548-.547z" />
    </svg>
  ),
  voice: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  ),
  zap: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  heart: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  music: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  ),
}

export function Features({ show }) {
  const [visibleFeatures, setVisibleFeatures] = useState(new Set())
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start end', 'end start'] })

  useEffect(() => {
    if (show) {
      features.forEach((_, i) => {
        setTimeout(() => setVisibleFeatures(prev => new Set([...prev, i])), i * 120)
      })
    }
  }, [show])

  return (
    <section ref={containerRef} className="relative max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="text-center mb-16"
      >
        <p className="text-tio-gold text-sm font-medium tracking-widest uppercase mb-4">Core Capabilities</p>
        <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-tio-cream mb-6">
          Everything flows from <span className="text-gradient-gold">one loop</span>
        </h2>
        <p className="text-tio-muted text-lg max-w-2xl mx-auto leading-relaxed">
          Six facets of the same continuous intelligence—each replacing a separate device or app.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: visibleFeatures.has(index) ? 1 : 0, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="group card-glass p-8 relative overflow-hidden"
            whileHover={{ y: -8, scale: 1.02 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-tio-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 text-tio-dark group-hover:scale-110 transition-transform duration-300`}>
                {icons[feature.icon]}
              </div>
              <h3 className="font-serif text-2xl font-medium text-tio-cream mb-4 group-hover:text-tio-gold transition-colors">
                {feature.title}
              </h3>
              <p className="text-tio-muted leading-relaxed text-base">
                {feature.description}
              </p>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: show ? 1 : 0, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="mt-16 text-center"
      >
        <p className="text-tio-muted mb-4">The loop in one line:</p>
        <p className="font-serif text-xl md:text-2xl text-tio-cream font-light max-w-3xl mx-auto">
          <span className="text-gradient-gold">AI offers → User rings → Action executes → System learns</span>
        </p>
      </motion.div>
    </section>
  )
}
