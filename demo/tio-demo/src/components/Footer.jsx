'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'

export function Footer() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <footer ref={ref} className="relative border-t border-tio-gold/10 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: isInView ? 1 : 0, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-center mb-12 relative"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-tio-gold to-tio-goldDark flex items-center justify-center">
            <svg className="w-10 h-10 text-tio-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-serif text-3xl md:text-4xl font-light text-tio-cream mb-4">
            One Bell. <span className="text-gradient-gold">One Mind.</span> Every Voice.
          </h3>
          <p className="text-tio-muted max-w-xl mx-auto leading-relaxed">
            TÍO is a hackathon prototype for <strong>Hacking Human Ability — Claude Community × Superhuman Labs</strong>.
            Not a medical device. An upgrade.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isInView ? 1 : 0, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid md:grid-cols-4 gap-8 mb-12"
        >
          <div>
            <h4 className="text-tio-gold text-xs font-medium tracking-widest uppercase mb-4">The Loop</h4>
            <ul className="space-y-2 text-tio-muted text-sm">
              <li>Perceive → Predict → Offer</li>
              <li>Ring → Act → Learn</li>
              <li>Zoom: Action → Word → Letter</li>
              <li>Rhythm shortcuts compress</li>
            </ul>
          </div>
          <div>
            <h4 className="text-tio-gold text-xs font-medium tracking-widest uppercase mb-4">Inputs</h4>
            <ul className="space-y-2 text-tio-muted text-sm">
              <li>Bell: contact, hold, force</li>
              <li>Body: HR, HRV, SpO₂, temp</li>
              <li>Room: temp, humidity, light, CO₂</li>
              <li>People: BLE beacons, partner STT</li>
            </ul>
          </div>
          <div>
            <h4 className="text-tio-gold text-xs font-medium tracking-widest uppercase mb-4">Outputs</h4>
            <ul className="space-y-2 text-tio-muted text-sm">
              <li>Private/public voice</li>
              <li>Generative display</li>
              <li>Smart-home actions</li>
              <li>Messages & escalation</li>
            </ul>
          </div>
          <div>
            <h4 className="text-tio-gold text-xs font-medium tracking-widest uppercase mb-4">Guardrails</h4>
            <ul className="space-y-2 text-tio-muted text-sm">
              <li>No diagnosis, no dosing</li>
              <li>Fail-safe acoustic bell</li>
              <li>User rules override AI</li>
              <li>Local-first, opt-in sensors</li>
            </ul>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isInView ? 1 : 0, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="pt-8 border-t border-tio-gold/10"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <a href="#" className="text-tio-muted hover:text-tio-gold transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
              </a>
              <a href="#" className="text-tio-muted hover:text-tio-gold transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="#" className="text-tio-muted hover:text-tio-gold transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.155 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
              </a>
            </div>
            <p className="text-tio-muted text-xs text-center md:text-left">
              Built with React, Three.js, Tailwind & Vite · Open source · Co-designed with users
            </p>
          </div>
        </motion.div>
      </div>
    </footer>
  )
}