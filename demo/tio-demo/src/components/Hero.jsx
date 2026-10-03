'use client'

import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RingGeometry, MeshBasicMaterial, DoubleSide, AdditiveBlending, Vector3, Color, Mesh, SphereGeometry, CylinderGeometry, MeshStandardMaterial, MeshPhysicalMaterial, DirectionalLight, AmbientLight, PointLight, HemisphereLight } from 'three'
import { Html, Environment, ContactShadows } from '@react-three/drei'

export function Hero({ onRing, showFeatures, scrollY }) {
  const bellRef = useRef()
  const strikerRef = useRef()
  const groupRef = useRef()
  const glowRef = useRef()
  const particlesRef = useRef([])
  const [isRinging, setIsRinging] = useState(false)
  const [ringProgress, setRingProgress] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [particles, setParticles] = useState([])
  const [glowIntensity, setGlowIntensity] = useState(0)

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime()
    
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(time * 0.15) * 0.15
      groupRef.current.rotation.x = Math.cos(time * 0.12) * 0.08
      
      if (!isRinging) {
        groupRef.current.position.y = Math.sin(time * 0.8) * 0.15
      }
    }

    if (glowRef.current && glowRef.current.material) {
      glowRef.current.material.opacity = 0.15 + Math.sin(time * 2) * 0.1 + glowIntensity
      glowRef.current.scale.setScalar(1 + Math.sin(time * 1.5) * 0.05)
    }

    if (strikerRef.current && !isRinging) {
      strikerRef.current.rotation.x = Math.sin(time * 0.5) * 0.02
    }

    particlesRef.current.forEach((p, i) => {
      if (!p.active) return
      p.life -= delta
      if (p.life <= 0) {
        p.active = false
        return
      }
      p.position.addScaledVector(p.velocity, delta)
      p.velocity.y -= 2 * delta
      p.scale = Math.max(0, p.life / p.maxLife)
      p.mesh.position.copy(p.position)
      p.mesh.scale.setScalar(p.scale * 0.08)
      p.mesh.material.opacity = p.life / p.maxLife * 0.8
    })
    particlesRef.current = particlesRef.current.filter(p => p.active)
  })

  const createParticles = (position, count = 30) => {
    const newParticles = []
    for (let i = 0; i < count; i++) {
      const geometry = new RingGeometry(0.3, 1, 32)
      const material = new MeshBasicMaterial({
        color: new Color().setHSL(0.1 + Math.random() * 0.05, 1, 0.6),
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        blending: AdditiveBlending,
      })
      const mesh = new Mesh(geometry, material)
      mesh.rotation.x = -Math.PI / 2
      
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const speed = 2 + Math.random() * 3
      const velocity = new Vector3(
        Math.cos(angle) * speed,
        3 + Math.random() * 4,
        Math.sin(angle) * speed
      )
      
      newParticles.push({
        mesh,
        position: position.clone(),
        velocity,
        life: 1.5 + Math.random() * 1,
        maxLife: 1.5 + Math.random() * 1,
        active: true,
        scale: 1,
      })
    }
    particlesRef.current.push(...newParticles)
    newParticles.forEach(p => groupRef.current?.add(p.mesh))
  }

  const handleRing = () => {
    if (isRinging) return
    setIsRinging(true)
    setRingProgress(0)
    setGlowIntensity(1)
    
    const striker = strikerRef.current
    if (striker) {
      const duration = 150
      const start = Date.now()
      const animateStriker = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / duration, 1)
        const easeOut = 1 - Math.pow(1 - progress, 3)
        striker.rotation.x = -easeOut * 0.8
        if (progress < 1) requestAnimationFrame(animateStriker)
        else {
          const returnDuration = 300
          const returnStart = Date.now()
          const animateReturn = () => {
            const relapsed = Date.now() - returnStart
            const rprogress = Math.min(relapsed / returnDuration, 1)
            const rease = 1 - Math.pow(1 - rprogress, 3)
            striker.rotation.x = -0.8 + rease * 0.8
            if (rprogress < 1) requestAnimationFrame(animateReturn)
          }
          requestAnimationFrame(animateReturn)
        }
      }
      requestAnimationFrame(animateStriker)
    }

    if (bellRef.current) {
      const bell = bellRef.current
      const start = Date.now()
      const duration = 800
      const animateBell = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / duration, 1)
        setRingProgress(progress)
        const shake = Math.sin(progress * Math.PI * 8) * (1 - progress) * 0.05
        bell.rotation.z = shake
        bell.rotation.x = shake * 0.5
        if (progress < 1) requestAnimationFrame(animateBell)
        else {
          bell.rotation.z = 0
          bell.rotation.x = 0
          setIsRinging(false)
          setTimeout(() => setGlowIntensity(0), 500)
        }
      }
      requestAnimationFrame(animateBell)
    }

    createParticles(new Vector3(0, 1.5, 0), 40)
    onRing()
  }

  useEffect(() => {
    if (showFeatures) {
      setIsRinging(true)
      setTimeout(() => setIsRinging(false), 1000)
    }
  }, [showFeatures])

  const handleMouseMove = (e) => {
    if (groupRef.current && !isRinging) {
      const rect = e.target.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 0.3
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 0.3
      groupRef.current.rotation.y += (x - groupRef.current.rotation.y) * 0.05
      groupRef.current.rotation.x += (-y - groupRef.current.rotation.x) * 0.05
    }
  }

  const bellMaterial = (color, metalness = 0.6, roughness = 0.3) => ({
    color,
    metalness,
    roughness,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
  })

  return (
    <group ref={groupRef} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)} onClick={handleRing} onPointerMove={handleMouseMove}>
      <Environment
        preset="sunset"
        background={false}
      />
      
      <HemisphereLight intensity={0.8} color="#fffdf0" groundColor="#1a1a24" />
      <DirectionalLight position={[5, 10, 7]} intensity={2.5} color="#fffdf0" castShadow>
        <DirectionalLight.shadow mapSize={1024} cameraNear={0.1} cameraFar={20} cameraLeft={-5} cameraRight={5} cameraTop={5} cameraBottom={-5} />
      </DirectionalLight>
      <DirectionalLight position={[-5, 5, -5]} intensity={1} color="#d4a843" />
      <PointLight position={[3, 5, 3]} intensity={2} color="#ffd78a" decay={1.5} />
      <PointLight position={[-3, 3, -2]} intensity={1.5} color="#d4a843" decay={1.5} />
      <AmbientLight intensity={0.4} color="#fff8e7" />

      <ContactShadows position={[0, -0.13, 0]} opacity={0.3} scale={4} blur={2} far={2} />

      <mesh ref={glowRef} position={[0, 0.8, 0]} scale={1.8}>
        <SphereGeometry args={[0.8, 32, 32]} />
        <MeshBasicMaterial 
          color="#d4a843" 
          transparent 
          opacity={0.15}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={bellRef} position={[0, 0, 0]} castShadow receiveShadow>
        <CylinderGeometry args={[0.05, 0.4, 0.3, 32, 1, true]} />
        <MeshPhysicalMaterial 
          {...bellMaterial("#c9b078", 0.7, 0.25)}
        />
      </mesh>

      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <CylinderGeometry args={[0.4, 0.6, 0.4, 32, 1, true]} />
        <MeshPhysicalMaterial 
          {...bellMaterial("#b8965a", 0.65, 0.3)}
        />
      </mesh>

      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <SphereGeometry args={[0.6, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <MeshPhysicalMaterial 
          {...bellMaterial("#a6844a", 0.6, 0.35)}
        />
      </mesh>

      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <CylinderGeometry args={[0.15, 0.25, 0.25, 16]} />
        <MeshPhysicalMaterial 
          {...bellMaterial("#8b703a", 0.5, 0.4)}
        />
      </mesh>

      <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
        <SphereGeometry args={[0.12, 16, 16]} />
        <MeshPhysicalMaterial 
          {...bellMaterial("#d4a843", 0.4, 0.45)}
        />
      </mesh>

      <group ref={strikerRef} position={[0.55, 0.1, 0]}>
        <mesh castShadow receiveShadow>
          <CylinderGeometry args={[0.025, 0.025, 0.8, 8]} />
          <MeshStandardMaterial 
            color="#6b5b3a"
            metalness={0.3}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[0, -0.4, 0]} castShadow receiveShadow>
          <SphereGeometry args={[0.06, 12, 12]} />
          <MeshPhysicalMaterial 
            {...bellMaterial("#d4a843", 0.6, 0.3)}
          />
        </mesh>
      </group>

      <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
        <CylinderGeometry args={[0.08, 0.12, 0.08, 16]} />
        <MeshStandardMaterial 
          color="#5a4a2a"
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>

      <mesh position={[0, -0.13, 0]} castShadow receiveShadow>
        <CylinderGeometry args={[0.3, 0.3, 0.04, 32]} />
        <MeshStandardMaterial 
          color="#1a1a1a"
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>

      <Html
        transform
        position={[0, -1.5, 0]}
        style={{
          pointerEvents: 'none',
          transform: 'translate(-50%, -50%)',
          opacity: hovered || isRinging ? 1 : 0.7,
          transition: 'opacity 0.3s ease',
        }}
      >
        <div className="text-center">
          <p className="text-tio-gold text-xs font-medium tracking-widest uppercase mb-1">Click or press Space</p>
          <p className="text-tio-muted text-xs">to ring the bell</p>
        </div>
      </Html>

      <Html
        transform
        position={[0, 1.8, 0]}
        style={{
          pointerEvents: 'none',
          transform: 'translate(-50%, -50%)',
          opacity: ringProgress > 0 ? ringProgress : 0,
          transition: 'opacity 0.1s ease',
          filter: `blur(${ringProgress * 2}px)`,
        }}
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-tio-gold to-tio-goldDark animate-ring flex items-center justify-center">
            <svg className="w-8 h-8 text-tio-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </Html>

      {particlesRef.current.map((p, i) => (
        <primitive key={i} object={p.mesh} />
      ))}
    </group>
  )
}