'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'

const principles = [
  {
    number: '01',
    title: 'Autonomy Over Paternalism',
    description: 'The AI suggests; the user decides. Every feature can be muted. No mode locks the user into a workflow they didn\'t choose.',
    quote: '"The bell is the start of a conversation, not the end of one."',
  },
  {
    number: '02',
    title: 'Dignity in Every Detail',
    description: 'Respectful tone is baked into the system prompt and every UI string. No infantilising language. The device looks and sounds like theirs—painted bell, custom tones, LED "attitude".',
    quote: '"Nothing about us without us."',
  },
  {
    number: '03',
    title: 'Local-First Privacy',
    description: 'User owns their data. Memory is visible, editable, deletable. Health sensors, microphone, voice cloning, caregiver sharing—each separate, opt-in, revocable. No always-on camera.',
    quote: '"Your rhythm, your rules, your data."',
  },
  {
    number: '04',
    title: 'Fail-Safe by Design',
    description: 'Acoustic bell works with zero power. SOS and local phrase bank (water, pain, toilet, help) function offline. Low confidence → ask, don\'t act. User rules override AI. Always.',
    quote: '"When the AI fails, the bell still rings."',
  },
  {
    number: '05',
    title: 'Care for the Caregiver',
    description: 'False-alarm filtering with plausibility checks. Handover notes, not raw logs. "Quiet night digest" so exhausted caregivers sleep. Acknowledgement loop: when they tap "on my way", the bell glows—user knows they were heard.',
    quote: '"Erases the anxiety of calling into silence."',
  },
  {
    number: '06',
    title: 'Progression-Aware',
    description: 'Adaptive thresholds track tremor, fatigue, weakening movement. Alternate switch types (cheek EMG, sip-and-puff, eyebrow, foot pedal) use the same firmware. The system adapts before the user struggles.',
    quote: '"One movement. Any movement. Same loop."',
  },
]

export function Philosophy() {
  const sectionRef = useRef(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  return (
    <section ref={sectionRef} className="relative max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: isInView ? 1 : 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="text-center mb-16"
      >
        <p className="text-tio-gold text-sm font-medium tracking-widest uppercase mb-4">Design Principles</p>
        <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-tio-cream mb-6">
          Built on <span className="text-gradient-gold">six promises</span>
        </h2>
        <p className="text-tio-muted text-lg max-w-2xl mx-auto leading-relaxed">
          Every engineering choice traces back to these. They are not aspirations—they are acceptance criteria.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {principles.map((principle, index) => (
          <motion.div
            key={principle.title}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: isInView ? 1 : 0, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 + index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="group card-glass p-8 relative"
          >
            <div className="absolute top-6 right-6 text-tio-gold/10 font-serif text-6xl font-bold">
              {principle.number}
            </div>
            <div className="relative z-10">
              <h3 className="font-serif text-xl font-medium text-tio-cream mb-4 group-hover:text-tio-gold transition-colors">
                {principle.title}
              </h3>
              <p className="text-tio-muted leading-relaxed mb-6 text-sm">
                {principle.description}
              </p>
              <blockquote className="text-tio-gold/70 text-sm italic border-l-2 border-tio-gold/30 pl-4">
                {principle.quote}
              </blockquote>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isInView ? 1 : 0, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="mt-20 p-8 md:p-12 card-glass relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-tio-gold/5 via-transparent to-transparent" />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <p className="text-tio-gold text-sm font-medium tracking-widest uppercase mb-4">The Stance</p>
          <h3 className="font-serif text-3xl md:text-4xl font-light text-tio-cream mb-6">
            Co-design from <span className="text-gradient-gold">hour one</span>, not afterthought
          </h3>
          <p className="text-tio-muted leading-relaxed mb-8 max-w-xl mx-auto">
            Every feature gets tested by someone who\'d use it, even for ten minutes. Defaults—voice, sounds, colours, names, scan speed—are chosen by users. We report what we learned and what we got wrong.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            {[
              'Which movement is most reliable?',
              'What does a bell fail to convey?',
              'What feels like yours?',
              'What feels humiliating?',
              'What do caregivers dread?',
            ].map((q, i) => (
              <motion.span
                key={q}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: isInView ? 1 : 0, scale: 1 }}
                transition={{ duration: 0.4, delay: 1 + i * 0.1 }}
                className="card-glass px-4 py-2 text-tio-muted hover:text-tio-gold hover:border-tio-gold/30 transition-all cursor-default"
              >
                {q}
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  )
}