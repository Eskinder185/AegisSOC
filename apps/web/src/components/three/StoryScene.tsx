import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { CONNECTIONS, ENTITIES, STAGES, type EntityId } from '../../lib/story'

type Theme = 'dark' | 'light'
const P = {
  dark: { body: '#7f93b3', dark: '#24324b', screen: '#38d0e8', accent: '#38d0e8', shield: '#2aa8c4', alert: '#f5a524', line: '#4a6491', person: '#a9b8d3', floor: '#101b30' },
  light: { body: '#94a3b8', dark: '#475569', screen: '#0e7490', accent: '#0e7490', shield: '#0e7490', alert: '#d97706', line: '#64748b', person: '#64748b', floor: '#dfe5ee' },
} as const

const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => ({ color, metalness: 0.35, roughness: 0.4, ...o })

/* ------------------------------ recognisable objects ------------------------------ */
function Laptop({ c }: { c: (typeof P)[Theme] }) {
  return (
    <group scale={1.15} rotation={[0, 0.35, 0]}>
      <mesh position={[0, 0.04, 0.1]}><boxGeometry args={[1.2, 0.07, 0.8]} /><meshStandardMaterial {...mat(c.body)} /></mesh>
      <mesh position={[0, 0.09, 0.2]}><boxGeometry args={[0.9, 0.01, 0.35]} /><meshStandardMaterial {...mat(c.dark)} /></mesh>
      <group position={[0, 0.07, -0.3]} rotation={[-0.3, 0, 0]}>
        <mesh position={[0, 0.38, 0]}><boxGeometry args={[1.2, 0.76, 0.05]} /><meshStandardMaterial {...mat(c.body)} /></mesh>
        <mesh position={[0, 0.38, 0.03]}><planeGeometry args={[1.08, 0.64]} /><meshStandardMaterial color={c.screen} emissive={c.screen} emissiveIntensity={0.55} /></mesh>
      </group>
    </group>
  )
}

function Server({ c }: { c: (typeof P)[Theme] }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <group key={i} position={[0, 0.2 + i * 0.34, 0]}>
          <mesh><boxGeometry args={[1, 0.3, 0.75]} /><meshStandardMaterial {...mat(c.body)} /></mesh>
          <mesh position={[0, 0, 0.38]}><boxGeometry args={[0.86, 0.18, 0.02]} /><meshStandardMaterial {...mat(c.dark)} /></mesh>
          {[0, 1, 2].map((j) => <mesh key={j} position={[-0.3 + j * 0.12, 0, 0.4]}><boxGeometry args={[0.06, 0.06, 0.02]} /><meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={0.9} /></mesh>)}
        </group>
      ))}
    </group>
  )
}

function Router({ c }: { c: (typeof P)[Theme] }) {
  return (
    <group rotation={[0, 0.25, 0]}>
      <mesh position={[0, 0.12, 0]}><boxGeometry args={[1.3, 0.22, 0.7]} /><meshStandardMaterial {...mat(c.body)} /></mesh>
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 0.55, -0.15]} rotation={[0, 0, x * 0.25]}><cylinderGeometry args={[0.03, 0.03, 0.7, 10]} /><meshStandardMaterial {...mat(c.dark)} /></mesh>
      ))}
      {[0, 1, 2, 3].map((i) => <mesh key={i} position={[-0.4 + i * 0.2, 0.13, 0.36]}><boxGeometry args={[0.08, 0.06, 0.02]} /><meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={0.9} /></mesh>)}
    </group>
  )
}

function Sensor({ c, tRef }: { c: (typeof P)[Theme]; tRef: MutableRefObject<number> }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame(() => { if (ring.current) ring.current.rotation.z = tRef.current * 0.9 })
  return (
    <group>
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.55, 0.65, 0.2, 28]} /><meshStandardMaterial {...mat(c.dark)} /></mesh>
      <mesh position={[0, 0.2, 0]}><sphereGeometry args={[0.5, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial {...mat(c.body, { metalness: 0.6, roughness: 0.2 })} /></mesh>
      <mesh position={[0, 0.42, 0.3]}><sphereGeometry args={[0.16, 18, 18]} /><meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={1} /></mesh>
      <mesh ref={ring} position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.85, 0.02, 8, 64]} /><meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={0.8} transparent opacity={0.7} /></mesh>
    </group>
  )
}

function shieldShape() {
  const s = new THREE.Shape()
  s.moveTo(0, 1.05)
  s.quadraticCurveTo(0.45, 0.92, 0.85, 0.9)
  s.lineTo(0.85, 0.15)
  s.quadraticCurveTo(0.8, -0.6, 0, -1.1)
  s.quadraticCurveTo(-0.8, -0.6, -0.85, 0.15)
  s.lineTo(-0.85, 0.9)
  s.quadraticCurveTo(-0.45, 0.92, 0, 1.05)
  return s
}

function Shield({ c, tRef }: { c: (typeof P)[Theme]; tRef: MutableRefObject<number> }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.28, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 4, curveSegments: 24 }), [])
  const scan = useRef<THREE.Mesh>(null)
  useFrame(() => { if (scan.current) { const k = (tRef.current * 0.5) % 1; scan.current.position.y = 0.95 - k * 1.9; (scan.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.sin(k * Math.PI) } })
  return (
    <group position={[0, 1.1, 0]}>
      <mesh geometry={geo} position={[0, 0, -0.14]}><meshStandardMaterial {...mat(c.shield, { metalness: 0.55, roughness: 0.25 })} /></mesh>
      {/* check mark */}
      <mesh position={[-0.2, -0.05, 0.24]} rotation={[0, 0, 0.78]}><boxGeometry args={[0.14, 0.4, 0.06]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} /></mesh>
      <mesh position={[0.15, 0.1, 0.24]} rotation={[0, 0, -0.78]}><boxGeometry args={[0.14, 0.78, 0.06]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} /></mesh>
      <mesh ref={scan} position={[0, 0, 0.3]}><planeGeometry args={[1.6, 0.06]} /><meshBasicMaterial color={c.accent} transparent opacity={0.4} /></mesh>
    </group>
  )
}

function triShape() {
  const s = new THREE.Shape(); const r = 0.1
  s.moveTo(-0.6 + r, -0.5); s.lineTo(0.6 - r, -0.5); s.quadraticCurveTo(0.6, -0.5, 0.55, -0.42); s.lineTo(0.05, 0.5); s.quadraticCurveTo(0, 0.58, -0.05, 0.5); s.lineTo(-0.55, -0.42); s.quadraticCurveTo(-0.6, -0.5, -0.6 + r, -0.5)
  return s
}
function Warning({ c }: { c: (typeof P)[Theme] }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(triShape(), { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 3 }), [])
  return (
    <group position={[0, 0.8, 0]}>
      <mesh geometry={geo} position={[0, 0, -0.06]}><meshStandardMaterial {...mat(c.alert, { metalness: 0.2, roughness: 0.4 })} emissive={c.alert} emissiveIntensity={0.25} /></mesh>
      <mesh position={[0, -0.02, 0.1]}><boxGeometry args={[0.1, 0.34, 0.04]} /><meshStandardMaterial color="#1b1305" /></mesh>
      <mesh position={[0, -0.3, 0.1]}><sphereGeometry args={[0.06, 14, 14]} /><meshStandardMaterial color="#1b1305" /></mesh>
    </group>
  )
}

function Analyst({ c }: { c: (typeof P)[Theme] }) {
  return (
    <group>
      <mesh position={[0, 0.8, -0.35]}><boxGeometry args={[1.5, 0.9, 0.06]} /><meshStandardMaterial {...mat(c.dark)} /></mesh>
      <mesh position={[0, 0.8, -0.31]}><planeGeometry args={[1.38, 0.78]} /><meshStandardMaterial color={c.screen} emissive={c.screen} emissiveIntensity={0.4} /></mesh>
      {[-0.4, -0.05, 0.3].map((x, i) => <mesh key={i} position={[x, 0.8 + (i === 1 ? 0.1 : -0.05), -0.29]}><planeGeometry args={[0.3, 0.2 + i * 0.1]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.28} /></mesh>)}
      <mesh position={[0, 0.2, -0.35]}><boxGeometry args={[0.12, 0.4, 0.12]} /><meshStandardMaterial {...mat(c.dark)} /></mesh>
      <mesh position={[0, 0.02, -0.2]}><boxGeometry args={[1.0, 0.05, 0.5]} /><meshStandardMaterial {...mat(c.body)} /></mesh>
      <mesh position={[0.1, 0.5, 0.5]}><capsuleGeometry args={[0.28, 0.5, 6, 16]} /><meshStandardMaterial {...mat(c.person, { roughness: 0.6 })} /></mesh>
      <mesh position={[0.1, 1.12, 0.5]}><sphereGeometry args={[0.22, 20, 20]} /><meshStandardMaterial {...mat(c.person, { roughness: 0.5 })} /></mesh>
    </group>
  )
}

function Body({ id, c, tRef }: { id: EntityId; c: (typeof P)[Theme]; tRef: MutableRefObject<number> }) {
  switch (id) {
    case 'laptop': return <Laptop c={c} />
    case 'server': return <Server c={c} />
    case 'router': return <Router c={c} />
    case 'sensor': return <Sensor c={c} tRef={tRef} />
    case 'aegis': return <Shield c={c} tRef={tRef} />
    case 'alert': return <Warning c={c} />
    default: return <Analyst c={c} />
  }
}

/* ------------------------------ object wrapper: visibility, focus, labels ------------------------------ */
interface Common { theme: Theme; animate: boolean; tRef: MutableRefObject<number> }

function Item({ id, shown, focused, selected, onSelect, c, tRef, animate }: { id: EntityId; shown: boolean; focused: boolean; selected: boolean; onSelect: () => void; c: (typeof P)[Theme] } & Common) {
  const e = ENTITIES.find((x) => x.id === id)!
  const g = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (!g.current) return
    const target = shown ? (focused || selected ? 1.12 : 1) : 0.001
    const f = animate ? Math.min(1, dt * 5) : 1
    const s = g.current.scale.x + (target - g.current.scale.x) * f
    g.current.scale.setScalar(s)
    g.current.visible = s > 0.02
    g.current.position.y = e.pos[1] + (id === 'alert' && animate ? Math.sin(tRef.current * 1.6) * 0.07 : 0)
    if (ring.current) { ring.current.visible = focused || selected }
  })
  return (
    <group ref={g} position={e.pos}>
      <mesh position={[0, 0.0, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(ev) => { ev.stopPropagation(); onSelect() }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <circleGeometry args={[1.05, 40]} /><meshStandardMaterial color={c.floor} metalness={0.2} roughness={0.8} transparent opacity={0.9} />
      </mesh>
      <mesh ref={ring} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.05, 1.14, 56]} /><meshBasicMaterial color={c.accent} /></mesh>
      <group onClick={(ev) => { ev.stopPropagation(); onSelect() }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <Body id={id} c={c} tRef={tRef} />
      </group>
    </group>
  )
}

/* ------------------------------ connections ------------------------------ */
function Connection({ id, active, dim, selected, onSelect, c, tRef, animate }: { id: string; active: boolean; dim: boolean; selected: boolean; onSelect: () => void; c: (typeof P)[Theme] } & Common) {
  const conn = CONNECTIONS.find((x) => x.id === id)!
  const A = ENTITIES.find((e) => e.id === conn.from)!.pos, B = ENTITIES.find((e) => e.id === conn.to)!.pos
  const a = useMemo(() => new THREE.Vector3(A[0], A[1] + 0.9, A[2]), [A])
  const b = useMemo(() => new THREE.Vector3(B[0], B[1] + 0.9, B[2]), [B])
  const dir = useMemo(() => b.clone().sub(a), [a, b])
    const curve = useMemo(() => new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.9, 0)), b), [a, b])
  const pts = useMemo(() => curve.getPoints(32), [curve])
  const pkt = useRef<THREE.Mesh>(null)
  const pkt2 = useRef<THREE.Mesh>(null)
  const arrow = useRef<THREE.Mesh>(null)
  useEffect(() => {
    if (!arrow.current) return
    const tan = curve.getTangent(0.52).normalize()
    arrow.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
  }, [curve])
  useFrame(() => {
    const flow = active && animate
    for (const [m, off] of [[pkt.current, 0], [pkt2.current, 0.5]] as const) {
      if (!m) continue
      m.visible = flow
      if (flow) m.position.copy(curve.getPoint((tRef.current * 0.28 + off) % 1))
    }
  })
  void dir
  const color = active || selected ? c.accent : c.line
  return (
    <group>
      <Line points={pts} color={color} lineWidth={active || selected ? 3 : 1.4} transparent opacity={dim ? 0.18 : active || selected ? 1 : 0.55} dashed={conn.reality !== 'built'} dashSize={0.18} gapSize={0.12} />
      <mesh ref={arrow} position={curve.getPoint(0.52)} onClick={(e) => { e.stopPropagation(); onSelect() }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <coneGeometry args={[active || selected ? 0.17 : 0.12, 0.34, 14]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active || selected ? 0.8 : 0.1} transparent opacity={dim ? 0.3 : 1} />
      </mesh>
      <mesh ref={pkt} visible={false}><sphereGeometry args={[0.09, 12, 12]} /><meshBasicMaterial color={c.accent} /></mesh>
      <mesh ref={pkt2} visible={false}><sphereGeometry args={[0.09, 12, 12]} /><meshBasicMaterial color={c.accent} /></mesh>
    </group>
  )
}

/* ------------------------------ DOM label projection (no per-label React roots) ------------------------------ */
export function labelAnchor(key: string): THREE.Vector3 | null {
  if (key.startsWith('e:')) { const e = ENTITIES.find((x) => x.id === key.slice(2)); return e ? new THREE.Vector3(e.pos[0], e.pos[1] - 0.5, e.pos[2] + 0.9) : null }
  const cn = CONNECTIONS.find((x) => x.id === key.slice(2))
  if (!cn) return null
  const A = ENTITIES.find((e) => e.id === cn.from)!.pos, B = ENTITIES.find((e) => e.id === cn.to)!.pos
  const a = new THREE.Vector3(A[0], A[1] + 0.9, A[2]), b = new THREE.Vector3(B[0], B[1] + 0.9, B[2])
  return new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.9, 0)), b).getPoint(0.5).add(new THREE.Vector3(0, 0.55, 0.6))
}

function Labels({ els }: { els: MutableRefObject<Record<string, HTMLElement | null>> }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const [key, el] of Object.entries(els.current)) {
      if (!el) continue
      const w = labelAnchor(key)
      if (!w) continue
      v.copy(w).project(camera)
      const hide = v.z > 1
      el.style.visibility = hide ? 'hidden' : 'visible'
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

/* ------------------------------ camera ------------------------------ */
function Rig({ focus, explore, animate }: { focus: EntityId[]; explore: boolean; animate: boolean }) {
  const { camera, pointer, size } = useThree()
  const look = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    if (explore) return
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const th = 2 * Math.tan((cam.fov * Math.PI) / 360)
    const base = Math.max(9, 15 / (th * aspect), 8.4 / th)
    const pts = focus.map((id) => ENTITIES.find((e) => e.id === id)!.pos)
    const cx = pts.length ? pts.reduce((s, p) => s + p[0], 0) / pts.length : 0
    const tx = cx * 0.06 + (animate ? pointer.x * 0.7 : 0), ty = 0.9 + (animate ? pointer.y * 0.4 : 0), tz = base
    const f = animate ? Math.min(1, dt * 2.2) : 1
    camera.position.x += (tx - camera.position.x) * f
    camera.position.y += (ty + 1.6 - camera.position.y) * f
    camera.position.z += (tz - camera.position.z) * f
    look.current.x += (cx * 0.06 - look.current.x) * f
    look.current.y += (0.3 - look.current.y) * f
    camera.lookAt(look.current)
  })
  return null
}

function Clock({ tRef, paused, animate }: { tRef: MutableRefObject<number>; paused: boolean; animate: boolean }) {
  useFrame((_, dt) => { if (!paused && animate) tRef.current += Math.min(dt, 0.1) })
  return null
}

function Gate({ visible, animate, deps }: { visible: boolean; animate: boolean; deps: unknown[] }) {
  const { set, invalidate } = useThree()
  useEffect(() => { set({ frameloop: !visible ? 'never' : animate ? 'always' : 'demand' }); invalidate() }, [visible, animate, set, invalidate])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { invalidate() }, deps)
  return null
}

export interface StorySceneProps {
  theme: Theme
  stage: number
  explore: boolean
  paused: boolean
  animate: boolean
  visible: boolean
  analyst: boolean
  selectedEntity: EntityId | null
  selectedConn: string | null
  onSelectEntity: (id: EntityId | null) => void
  onSelectConn: (id: string | null) => void
  labelEls: MutableRefObject<Record<string, HTMLElement | null>>
}

export default function StoryScene(p: StorySceneProps): ReactNode {
  const c = P[p.theme]
  const tRef = useRef(0)
  const stage = STAGES[p.stage]
  const shown = (id: EntityId) => p.explore || stage.visible.includes(id)
  const focused = (id: EntityId) => !p.explore && stage.focus.includes(id)
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 3, 12], fov: 38 }} gl={{ antialias: true, powerPreference: 'low-power' }} frameloop="always" onPointerMissed={() => { p.onSelectEntity(null); p.onSelectConn(null) }}>
      <Gate visible={p.visible} animate={p.animate} deps={[p.stage, p.explore, p.theme, p.selectedEntity, p.selectedConn, p.analyst]} />
      <Clock tRef={tRef} paused={p.paused} animate={p.animate} />
      <Labels els={p.labelEls} />
      <Rig focus={stage.focus} explore={p.explore} animate={p.animate} />
      {p.explore && <OrbitControls enablePan={false} enableDamping={p.animate} minDistance={6} maxDistance={20} minPolarAngle={0.5} maxPolarAngle={1.55} minAzimuthAngle={-0.9} maxAzimuthAngle={0.9} target={[0, 0.8, 0]} />}
      <ambientLight intensity={p.theme === 'dark' ? 0.75 : 1.1} />
      <directionalLight position={[4, 8, 7]} intensity={2.2} />
      <pointLight position={[-6, 3, 4]} intensity={1.2} color={c.accent} />
      <hemisphereLight args={[p.theme === 'dark' ? '#8fb2ff' : '#ffffff', '#0a1020', 0.5]} />
      {ENTITIES.map((e) => (
        <Item key={e.id} id={e.id} c={c} tRef={tRef} animate={p.animate} theme={p.theme}
          shown={shown(e.id)} focused={focused(e.id)} selected={p.selectedEntity === e.id} onSelect={() => { p.onSelectConn(null); p.onSelectEntity(e.id) }} />
      ))}
      {CONNECTIONS.filter((cn) => shown(cn.from) && shown(cn.to)).map((cn) => (
        <Connection key={cn.id} id={cn.id} c={c} tRef={tRef} animate={p.animate} theme={p.theme}
          active={p.explore ? true : stage.flow.includes(cn.id)} dim={!p.explore && !stage.flow.includes(cn.id)} selected={p.selectedConn === cn.id}
          onSelect={() => { p.onSelectEntity(null); p.onSelectConn(cn.id) }} />
      ))}
    </Canvas>
  )
}
