import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { DEMO_EDGES, DEMO_NODES, type DemoNode } from '../../lib/demoTopology'

const PALETTE = {
  dark: { core: '#38d0e8', source: '#7aa7ff', host: '#9fb6d8', identity: '#c4b5fd', control: '#5eead4', line: '#3b5278', planned: '#64748b', bg: '#060b16' },
  light: { core: '#0e7490', source: '#2563eb', host: '#475569', identity: '#6d28d9', control: '#0f766e', line: '#94a3b8', planned: '#94a3b8', bg: '#eef1f6' },
} as const

type Theme = keyof typeof PALETTE

function shape(kind: DemoNode['kind']) {
  switch (kind) {
    case 'core': return <icosahedronGeometry args={[0.62, 1]} />
    case 'source': return <octahedronGeometry args={[0.34]} />
    case 'host': return <boxGeometry args={[0.46, 0.46, 0.46]} />
    case 'identity': return <dodecahedronGeometry args={[0.32]} />
    default: return <torusGeometry args={[0.26, 0.09, 12, 28]} />
  }
}

function Node({ n, theme, selected, onSelect, animate }: { n: DemoNode; theme: Theme; selected: boolean; onSelect: (id: string) => void; animate: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const p = PALETTE[theme]
  const color = n.status === 'planned' ? p.planned : p[n.kind]
  useFrame((_, dt) => {
    if (!ref.current || !animate) return
    ref.current.rotation.y += dt * (n.kind === 'core' ? 0.35 : 0.2)
    ref.current.rotation.x += dt * 0.08
  })
  return (
    <mesh ref={ref} position={n.pos} onClick={(e) => { e.stopPropagation(); onSelect(n.id) }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }} scale={selected ? 1.35 : 1}>
      {shape(n.kind)}
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.28} emissive={color} emissiveIntensity={selected ? 0.55 : n.status === 'planned' ? 0.02 : 0.18} wireframe={n.status === 'planned'} />
    </mesh>
  )
}

function Edges({ theme, selected }: { theme: Theme; selected: string | null }) {
  const geo = useMemo(() => {
    const byId = new Map(DEMO_NODES.map((n) => [n.id, n]))
    const pts: number[] = []
    for (const [a, b] of DEMO_EDGES) pts.push(...byId.get(a)!.pos, ...byId.get(b)!.pos)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  const hi = useMemo(() => {
    const byId = new Map(DEMO_NODES.map((n) => [n.id, n]))
    const pts: number[] = []
    for (const [a, b] of DEMO_EDGES) if (a === selected || b === selected) pts.push(...byId.get(a)!.pos, ...byId.get(b)!.pos)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [selected])
  return (
    <>
      <lineSegments geometry={geo}><lineBasicMaterial color={PALETTE[theme].line} transparent opacity={0.55} /></lineSegments>
      {selected && <lineSegments geometry={hi}><lineBasicMaterial color={PALETTE[theme].core} /></lineSegments>}
    </>
  )
}

/** Small packets drifting along links. Purely illustrative of the data path in the demo topology. */
function Pulses({ theme }: { theme: Theme }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const byId = useMemo(() => new Map(DEMO_NODES.map((n) => [n.id, n])), [])
  const live = useMemo(() => DEMO_EDGES.filter(([a, b]) => byId.get(a)!.status === 'built' && byId.get(b)!.status === 'built'), [byId])
  useFrame(({ clock }) => {
    live.forEach(([a, b], i) => {
      const m = refs.current[i]
      if (!m) return
      const t = (clock.elapsedTime * 0.12 + i * 0.37) % 1
      const A = byId.get(a)!.pos, B = byId.get(b)!.pos
      m.position.set(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
    })
  })
  return <>{live.map(([a, b], i) => (
    <mesh key={a + b} ref={(el) => { refs.current[i] = el }}><sphereGeometry args={[0.045, 10, 10]} /><meshBasicMaterial color={PALETTE[theme].core} /></mesh>
  ))}</>
}

function Rig({ animate, focus }: { animate: boolean; focus: THREE.Vector3 | null }) {
  const { camera, pointer } = useThree()
  const target = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const k = animate ? 1 : 0
    const tx = pointer.x * 1.1 * k + (focus?.x ?? 0) * 0.25
    const ty = pointer.y * 0.7 * k + (focus?.y ?? 0) * 0.25
    const f = animate ? Math.min(1, dt * 2) : 1
    camera.position.x += (tx - camera.position.x) * f
    camera.position.y += (ty - camera.position.y) * f
    camera.lookAt(target.current)
  })
  return null
}

function Drift({ animate, children }: { animate: boolean; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (g.current && animate) g.current.rotation.y += dt * 0.05 })
  return <group ref={g}>{children}</group>
}

/** Pauses rendering while off screen or in a hidden tab. */
function VisibilityGate({ visible, animate, selected, theme }: { visible: boolean; animate: boolean; selected: string | null; theme: Theme }) {
  const { set, invalidate } = useThree()
  useEffect(() => { set({ frameloop: !visible ? 'never' : animate ? 'always' : 'demand' }); invalidate() }, [visible, animate, set, invalidate])
  useEffect(() => { invalidate() }, [selected, theme, invalidate])
  return null
}

export default function NetworkScene({ theme, selected, onSelect, animate, visible }: { theme: Theme; selected: string | null; onSelect: (id: string | null) => void; animate: boolean; visible: boolean }) {
  const focus = useMemo(() => { const n = DEMO_NODES.find((x) => x.id === selected); return n ? new THREE.Vector3(...n.pos) : null }, [selected])
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 9], fov: 42 }} gl={{ antialias: true, powerPreference: 'low-power' }} frameloop="always" onPointerMissed={() => onSelect(null)} aria-hidden="true">
      <VisibilityGate visible={visible} animate={animate} selected={selected} theme={theme} />
      <ambientLight intensity={theme === 'dark' ? 0.5 : 0.9} />
      <directionalLight position={[4, 5, 6]} intensity={1.6} />
      <pointLight position={[-5, -3, 3]} intensity={0.8} color={PALETTE[theme].core} />
      <Rig animate={animate} focus={focus} />
      <Drift animate={animate}>
        <Edges theme={theme} selected={selected} />
        {animate && <Pulses theme={theme} />}
        {DEMO_NODES.map((n) => <Node key={n.id} n={n} theme={theme} selected={selected === n.id} onSelect={onSelect} animate={animate} />)}
      </Drift>
    </Canvas>
  )
}
