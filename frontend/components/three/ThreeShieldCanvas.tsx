"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

interface ThreeShieldCanvasProps {
    className?: string
    interactive?: boolean
    intensity?: "subtle" | "vibrant"
    pulse?: boolean
}

export default function ThreeShieldCanvas({
    className = "w-full h-full",
    interactive = true,
    intensity = "vibrant",
    pulse = false,
}: ThreeShieldCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const width = container.clientWidth || 300
        const height = container.clientHeight || 300

        // Scene, Camera, Renderer
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
        camera.position.z = 7

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(renderer.domElement)

        // Core Group
        const coreGroup = new THREE.Group()
        scene.add(coreGroup)

        // 1. Central Icosahedron Wireframe / Core
        const icosaGeo = new THREE.IcosahedronGeometry(1.6, 1)
        const icosaMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x38bdf8), // Vibrant cyan
            wireframe: true,
            transparent: true,
            opacity: intensity === "vibrant" ? 0.75 : 0.4,
        })
        const icosaMesh = new THREE.Mesh(icosaGeo, icosaMat)
        coreGroup.add(icosaMesh)

        // Inner glowing core
        const innerGeo = new THREE.SphereGeometry(0.8, 24, 24)
        const innerMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x6366f1), // Indigo/blue
            wireframe: true,
            transparent: true,
            opacity: 0.35,
        })
        const innerMesh = new THREE.Mesh(innerGeo, innerMat)
        coreGroup.add(innerMesh)

        // 2. Orbital Rings
        const ringGeo1 = new THREE.TorusGeometry(2.4, 0.02, 16, 100)
        const ringMat1 = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x06b6d4),
            transparent: true,
            opacity: 0.5,
        })
        const ring1 = new THREE.Mesh(ringGeo1, ringMat1)
        ring1.rotation.x = Math.PI / 3
        coreGroup.add(ring1)

        const ringGeo2 = new THREE.TorusGeometry(2.7, 0.015, 16, 100)
        const ringMat2 = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x818cf8),
            transparent: true,
            opacity: 0.4,
        })
        const ring2 = new THREE.Mesh(ringGeo2, ringMat2)
        ring2.rotation.y = Math.PI / 4
        coreGroup.add(ring2)

        // 3. Floating Particle Cloud
        const particleCount = 200
        const particleGeo = new THREE.BufferGeometry()
        const positions = new Float32Array(particleCount * 3)
        const colors = new Float32Array(particleCount * 3)

        const color1 = new THREE.Color(0x38bdf8) // cyan
        const color2 = new THREE.Color(0x818cf8) // purple-blue

        for (let i = 0; i < particleCount; i++) {
            const r = 2.0 + Math.random() * 2.2
            const theta = Math.random() * Math.PI * 2
            const phi = Math.acos((Math.random() * 2) - 1)

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
            positions[i * 3 + 2] = r * Math.cos(phi)

            const mixedColor = color1.clone().lerp(color2, Math.random())
            colors[i * 3] = mixedColor.r
            colors[i * 3 + 1] = mixedColor.g
            colors[i * 3 + 2] = mixedColor.b
        }

        particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
        particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3))

        const particleMat = new THREE.PointsMaterial({
            size: 0.06,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
        })

        const particles = new THREE.Points(particleGeo, particleMat)
        coreGroup.add(particles)

        // Mouse interaction
        let mouseX = 0
        let mouseY = 0
        let targetX = 0
        let targetY = 0

        const handleMouseMove = (e: MouseEvent) => {
            if (!interactive) return
            const rect = container.getBoundingClientRect()
            const x = (e.clientX - rect.left) / rect.width - 0.5
            const y = (e.clientY - rect.top) / rect.height - 0.5
            targetX = x * 1.5
            targetY = y * 1.5
        }

        window.addEventListener("mousemove", handleMouseMove)

        // Resize handler
        const handleResize = () => {
            if (!container) return
            const w = container.clientWidth
            const h = container.clientHeight
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            renderer.setSize(w, h)
        }

        window.addEventListener("resize", handleResize)

        // Animation Loop
        let animationFrameId: number
        let clock = new THREE.Clock()

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate)

            const elapsedTime = clock.getElapsedTime()

            // Smooth mouse follow
            mouseX += (targetX - mouseX) * 0.05
            mouseY += (targetY - mouseY) * 0.05

            coreGroup.rotation.y = elapsedTime * 0.3 + mouseX
            coreGroup.rotation.x = Math.sin(elapsedTime * 0.2) * 0.2 + mouseY * 0.5

            ring1.rotation.z = elapsedTime * 0.4
            ring2.rotation.x = elapsedTime * -0.3

            // Pulse effect
            const pulseFactor = pulse ? 1 + Math.sin(elapsedTime * 3) * 0.08 : 1 + Math.sin(elapsedTime * 1.5) * 0.03
            coreGroup.scale.set(pulseFactor, pulseFactor, pulseFactor)

            particles.rotation.y = elapsedTime * -0.15

            renderer.render(scene, camera)
        }

        animate()

        return () => {
            cancelAnimationFrame(animationFrameId)
            window.removeEventListener("mousemove", handleMouseMove)
            window.removeEventListener("resize", handleResize)
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement)
            }
            renderer.dispose()
            icosaGeo.dispose()
            icosaMat.dispose()
            innerGeo.dispose()
            innerMat.dispose()
            ringGeo1.dispose()
            ringMat1.dispose()
            ringGeo2.dispose()
            ringMat2.dispose()
            particleGeo.dispose()
            particleMat.dispose()
        }
    }, [interactive, intensity, pulse])

    return (
        <div ref={containerRef} className={`relative overflow-hidden pointer-events-none ${className}`}>
            <div className="absolute inset-0 bg-radial from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
        </div>
    )
}
