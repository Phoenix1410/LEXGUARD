"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

interface ThreeScannerCanvasProps {
    className?: string
    isScanning?: boolean
    hasResults?: boolean
}

export default function ThreeScannerCanvas({
    className = "w-full h-full",
    isScanning = false,
    hasResults = false,
}: ThreeScannerCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const width = container.clientWidth || 400
        const height = container.clientHeight || 250

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
        camera.position.set(0, 1.5, 4.5)
        camera.lookAt(0, 0, 0)

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(renderer.domElement)

        const group = new THREE.Group()
        scene.add(group)

        // 1. Holographic Document Mesh (Grid Plane)
        const docWidth = 3.2
        const docHeight = 4.2
        const gridHelper = new THREE.GridHelper(docWidth, 16, 0x00ffff, 0x1e293b)
        gridHelper.rotation.x = Math.PI / 3.2
        gridHelper.position.y = -0.3
        group.add(gridHelper)

        // Document Bounding Frame
        const planeGeo = new THREE.PlaneGeometry(docWidth, docHeight)
        const edges = new THREE.EdgesGeometry(planeGeo)
        const lineMat = new THREE.LineBasicMaterial({
            color: hasResults ? 0x22c55e : (isScanning ? 0x38bdf8 : 0x64748b),
            linewidth: 2,
            transparent: true,
            opacity: 0.8,
        })
        const docOutline = new THREE.LineSegments(edges, lineMat)
        docOutline.rotation.x = -Math.PI / 4
        docOutline.position.y = -0.2
        group.add(docOutline)

        // 2. Sweeping Laser Beam (Plane with additive glow)
        const laserGeo = new THREE.PlaneGeometry(docWidth * 1.1, 0.08)
        const laserMat = new THREE.MeshBasicMaterial({
            color: hasResults ? 0x22c55e : (isScanning ? 0x00f7ff : 0x38bdf8),
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        })
        const laserMesh = new THREE.Mesh(laserGeo, laserMat)
        laserMesh.rotation.x = -Math.PI / 4
        laserMesh.position.y = -0.2
        group.add(laserMesh)

        // 3. Floating Data Particles
        const particleCount = 120
        const pGeo = new THREE.BufferGeometry()
        const pPositions = new Float32Array(particleCount * 3)
        const pColors = new Float32Array(particleCount * 3)

        const colorNormal = new THREE.Color(0x38bdf8)
        const colorActive = new THREE.Color(0x22c55e)
        const colorAlert = new THREE.Color(0xf43f5e)

        for (let i = 0; i < particleCount; i++) {
            pPositions[i * 3] = (Math.random() - 0.5) * 3.8
            pPositions[i * 3 + 1] = (Math.random() - 0.5) * 3.5
            pPositions[i * 3 + 2] = (Math.random() - 0.5) * 2.0

            const c = hasResults ? (i % 3 === 0 ? colorAlert : colorActive) : colorNormal
            pColors[i * 3] = c.r
            pColors[i * 3 + 1] = c.g
            pColors[i * 3 + 2] = c.b
        }

        pGeo.setAttribute("position", new THREE.BufferAttribute(pPositions, 3))
        pGeo.setAttribute("color", new THREE.BufferAttribute(pColors, 3))

        const pMat = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
        })
        const particles = new THREE.Points(pGeo, pMat)
        group.add(particles)

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

        let animId: number
        let clock = new THREE.Clock()

        const animate = () => {
            animId = requestAnimationFrame(animate)
            const t = clock.getElapsedTime()

            // Subtle tilting oscillation
            group.rotation.y = Math.sin(t * 0.5) * 0.15
            group.rotation.x = Math.cos(t * 0.4) * 0.05

            // Laser scan movement
            const scanSpeed = isScanning ? 2.5 : 0.8
            const scanRange = 1.4
            const scanOffset = Math.sin(t * scanSpeed) * scanRange

            // Transform laser along tilted plane
            laserMesh.position.y = -0.2 + scanOffset * Math.cos(-Math.PI / 4)
            laserMesh.position.z = scanOffset * Math.sin(-Math.PI / 4)

            // Particles float gently
            const pos = pGeo.attributes.position.array as Float32Array
            for (let i = 0; i < particleCount; i++) {
                pos[i * 3 + 1] += Math.sin(t * 2 + i) * 0.002
            }
            pGeo.attributes.position.needsUpdate = true

            renderer.render(scene, camera)
        }

        animate()

        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener("resize", handleResize)
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement)
            }
            renderer.dispose()
            planeGeo.dispose()
            edges.dispose()
            lineMat.dispose()
            laserGeo.dispose()
            laserMat.dispose()
            pGeo.dispose()
            pMat.dispose()
        }
    }, [isScanning, hasResults])

    return (
        <div ref={containerRef} className={`relative overflow-hidden pointer-events-none ${className}`}>
            <div className="absolute inset-0 bg-radial from-primary/10 via-transparent to-transparent" />
        </div>
    )
}
