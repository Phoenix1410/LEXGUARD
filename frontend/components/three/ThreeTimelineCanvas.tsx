"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

interface ThreeTimelineCanvasProps {
    className?: string
    discrepancyCount?: number
    active?: boolean
}

export default function ThreeTimelineCanvas({
    className = "w-full h-full",
    discrepancyCount = 0,
    active = false,
}: ThreeTimelineCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const width = container.clientWidth || 400
        const height = container.clientHeight || 260

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
        camera.position.set(0, 0, 6)

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(renderer.domElement)

        const group = new THREE.Group()
        scene.add(group)

        // 1. Dual Helical Timelines (Client in Blue/Cyan, Accused in Orange/Red)
        const curvePoints = 80
        const clientPoints: THREE.Vector3[] = []
        const accusedPoints: THREE.Vector3[] = []

        for (let i = 0; i <= curvePoints; i++) {
            const t = (i / curvePoints) * Math.PI * 4 - Math.PI * 2
            const x = (i / curvePoints - 0.5) * 6.5
            // Client wave
            clientPoints.push(new THREE.Vector3(x, Math.sin(t) * 0.7 + 0.6, Math.cos(t) * 0.5))
            // Accused wave
            accusedPoints.push(new THREE.Vector3(x, -Math.sin(t) * 0.7 - 0.6, -Math.cos(t) * 0.5))
        }

        const clientCurve = new THREE.CatmullRomCurve3(clientPoints)
        const accusedCurve = new THREE.CatmullRomCurve3(accusedPoints)

        const clientGeo = new THREE.TubeGeometry(clientCurve, 64, 0.04, 8, false)
        const clientMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.85,
        })
        const clientMesh = new THREE.Mesh(clientGeo, clientMat)
        group.add(clientMesh)

        const accusedGeo = new THREE.TubeGeometry(accusedCurve, 64, 0.04, 8, false)
        const accusedMat = new THREE.MeshBasicMaterial({
            color: 0xf97316,
            transparent: true,
            opacity: 0.85,
        })
        const accusedMesh = new THREE.Mesh(accusedGeo, accusedMat)
        group.add(accusedMesh)

        // 2. Discrepancy Anomaly Nodes connecting the streams
        const nodesCount = Math.max(discrepancyCount, 3)
        const nodesGroup = new THREE.Group()
        group.add(nodesGroup)

        const bridgeMat = new THREE.LineDashedMaterial({
            color: 0xef4444,
            dashSize: 0.1,
            gapSize: 0.05,
            linewidth: 1,
            transparent: true,
            opacity: 0.7,
        })

        const sphereGeo = new THREE.SphereGeometry(0.09, 16, 16)
        const alertMat = new THREE.MeshBasicMaterial({ color: 0xef4444 })

        for (let j = 0; j < nodesCount; j++) {
            const frac = (j + 1) / (nodesCount + 1)
            const p1 = clientCurve.getPoint(frac)
            const p2 = accusedCurve.getPoint(frac)

            const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2])
            const line = new THREE.Line(lineGeo, bridgeMat)
            line.computeLineDistances()
            nodesGroup.add(line)

            const m1 = new THREE.Mesh(sphereGeo, alertMat)
            m1.position.copy(p1)
            nodesGroup.add(m1)

            const m2 = new THREE.Mesh(sphereGeo, alertMat)
            m2.position.copy(p2)
            nodesGroup.add(m2)
        }

        // 3. Ambient Flowing Particles
        const count = 100
        const pGeo = new THREE.BufferGeometry()
        const pPos = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            pPos[i * 3] = (Math.random() - 0.5) * 7.5
            pPos[i * 3 + 1] = (Math.random() - 0.5) * 2.5
            pPos[i * 3 + 2] = (Math.random() - 0.5) * 2.0
        }
        pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3))
        const pMat = new THREE.PointsMaterial({
            size: 0.035,
            color: 0xa855f7,
            transparent: true,
            opacity: 0.6,
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

            // Smooth rotation & weaving
            group.rotation.y = Math.sin(t * 0.3) * 0.25
            group.rotation.x = Math.cos(t * 0.2) * 0.15

            const pulse = 1 + Math.sin(t * 2) * 0.04
            nodesGroup.scale.set(pulse, pulse, pulse)

            particles.rotation.x = t * 0.05

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
            clientGeo.dispose()
            clientMat.dispose()
            accusedGeo.dispose()
            accusedMat.dispose()
            bridgeMat.dispose()
            sphereGeo.dispose()
            alertMat.dispose()
            pGeo.dispose()
            pMat.dispose()
        }
    }, [discrepancyCount, active])

    return (
        <div ref={containerRef} className={`relative overflow-hidden pointer-events-none ${className}`}>
            <div className="absolute inset-0 bg-radial from-violet-500/10 via-transparent to-transparent" />
        </div>
    )
}
