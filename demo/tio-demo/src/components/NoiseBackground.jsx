'use client'

import { useEffect, useRef } from 'react'

export function NoiseBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    
    resize()
    window.addEventListener('resize', resize)

    let animationId
    const noiseCache = new Map()
    
    const generateNoise = (w, h, scale = 1) => {
      const key = `${w}x${h}x${scale}`
      if (noiseCache.has(key)) return noiseCache.get(key)
      
      const offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      const octx = offscreen.getContext('2d')
      const imageData = octx.createImageData(w, h)
      const data = imageData.data
      
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255
        data[i] = value
        data[i + 1] = value
        data[i + 2] = value
        data[i + 3] = Math.random() * 30 + 10
      }
      
      octx.putImageData(imageData, 0, 0)
      noiseCache.set(key, offscreen)
      return offscreen
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      const noise1 = generateNoise(512, 512)
      const noise2 = generateNoise(256, 256)
      
      ctx.globalAlpha = 0.02
      const pattern1 = ctx.createPattern(noise1, 'repeat')
      ctx.fillStyle = pattern1
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      ctx.globalAlpha = 0.015
      const pattern2 = ctx.createPattern(noise2, 'repeat')
      ctx.fillStyle = pattern2
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      ctx.globalAlpha = 1
      
      // Subtle vignette
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 1.5
      )
      gradient.addColorStop(0, 'rgba(10, 10, 15, 0)')
      gradient.addColorStop(1, 'rgba(10, 10, 15, 0.3)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      animationId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ opacity: 0.4 }}
      aria-hidden="true"
    />
  )
}