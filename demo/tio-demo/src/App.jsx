import { Component, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Hero } from './components/Hero'
import { Features } from './components/Features'
import { Philosophy } from './components/Philosophy'
import { Demo } from './components/Demo'
import { Footer } from './components/Footer'

class CanvasErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? null : this.props.children
  }
}

function App() {
  const [showFeatures, setShowFeatures] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleBellRing = () => {
    setShowFeatures(true)
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="relative min-h-screen bg-tio-dark">
      
      <header className="fixed top-0 left-0 right-0 z-40 px-6 py-6 transition-all duration-500">
        <nav className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-tio-gold to-tio-goldDark flex items-center justify-center">
              <svg className="w-6 h-6 text-tio-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-serif text-xl font-medium text-tio-cream hidden sm:block">TÍO</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-tio-muted hover:text-tio-gold transition-colors text-sm font-medium">Features</a>
            <a href="#philosophy" className="text-tio-muted hover:text-tio-gold transition-colors text-sm font-medium">Philosophy</a>
            <a href="#demo" className="text-tio-muted hover:text-tio-gold transition-colors text-sm font-medium">Demo</a>
          </div>
          <button 
            className="btn-primary text-sm px-6 py-2"
            onClick={handleBellRing}
          >
            <span>Experience TÍO</span>
          </button>
        </nav>
      </header>

      <main className="relative z-10">
        <section id="hero" className="relative min-h-screen flex items-center justify-center">
          <CanvasErrorBoundary>
            <Canvas
              className="absolute inset-0 w-full h-full -z-10"
              camera={{ position: [0, 0.5, 5], fov: 40 }}
              gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }}
              onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.setPixelRatio(Math.min(window.devicePixelRatio, 2)); }}
            >
              <Hero
                onRing={handleBellRing}
                showFeatures={showFeatures}
                scrollY={scrollY}
              />
            </Canvas>
          </CanvasErrorBoundary>
          
          <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-24">
            <div className="text-center max-w-4xl opacity-0 animate-fade-in-up animate-delay-300" style={{ animationFillMode: 'forwards' }}>
              <p className="text-tio-gold text-sm font-medium tracking-widest uppercase mb-6 animate-fade-in-up animate-delay-500" style={{ animationFillMode: 'forwards' }}>
                One Bell. One Mind. Every Voice.
              </p>
              <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-light leading-tight mb-8 animate-fade-in-up animate-delay-700" style={{ animationFillMode: 'forwards' }}>
                <span className="text-tio-cream">A single bell</span><br />
                <span className="text-gradient-gold">becomes infinite</span><br />
                <span className="text-tio-cream">expression</span>
              </h1>
              <p className="text-tio-muted text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-in-up animate-delay-1000" style={{ animationFillMode: 'forwards' }}>
                TÍO puts an AI behind a call bell that knows the person, the room, the hour, and the people around them—so one ding can mean anything.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up animate-delay-1000" style={{ animationFillMode: 'forwards' }}>
                <button 
                  className="btn-primary w-full sm:w-auto"
                  onClick={handleBellRing}
                >
                  <span>Ring the Bell</span>
                </button>
                <button className="card-glass px-8 py-4 rounded-full text-tio-cream font-medium transition-all duration-300 hover:bg-tio-gray/70 hover:border-tio-gold/30 w-full sm:w-auto">
                  Watch Demo
                </button>
              </div>
            </div>

            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-float opacity-0 animate-fade-in-up animate-delay-1000" style={{ animationFillMode: 'forwards' }}>
              <svg className="w-6 h-6 text-tio-gold/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>
        </section>

        <section id="features" className="relative py-24 md:py-32 px-6">
          <Features show={showFeatures} />
        </section>

        <section id="philosophy" className="relative py-24 md:py-32 px-6">
          <Philosophy />
        </section>

        <section id="demo" className="relative py-24 md:py-32 px-6">
          <Demo />
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default App
