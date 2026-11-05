import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePrefs } from '../../lib/prefs'
import { DEMO_EDGES, DEMO_NODES, KIND_LABEL } from '../../lib/demoTopology'

const Scene = lazy(() => import('./NetworkScene'))

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/** Flat projection of the same demo topology, used when WebGL is unavailable or while the 3D bundle loads. */
function StaticMap({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const P = (n: (typeof DEMO_NODES)[number]) => ({ x: 50 + n.pos[0] * 11.5, y: 50 + n.pos[1] * 12.5 })
  const by = new Map(DEMO_NODES.map((n) => [n.id, n]))
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Demonstration topology: data sources on the left feed the AegisSOC core, which connects to hosts, identities and controls on the right.">
      {DEMO_EDGES.map(([a, b]) => { const A = P(by.get(a)!), B = P(by.get(b)!); return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--line)" strokeWidth="0.35" /> })}
      {DEMO_NODES.map((n) => { const p = P(n); return (
        <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: 'pointer' }}>
          <circle cx={p.x} cy={p.y} r={n.kind === 'core' ? 5 : 2.8} fill={n.status === 'planned' ? 'none' : 'var(--accent)'} stroke="var(--accent)" strokeWidth={selected === n.id ? 1.2 : 0.5} strokeDasharray={n.status === 'planned' ? '1.2 1' : undefined} />
        </g>
      ) })}
    </svg>
  )
}

export function NetworkHero() {
  const { theme } = usePrefs()
  const [selected, setSelected] = useState<string | null>(null)
  const [gl] = useState(webglAvailable)
  const [visible, setVisible] = useState(true)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [manualStatic, setManualStatic] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    const el = box.current
    const io = el ? new IntersectionObserver(([e]) => setVisible(e.isIntersecting && !document.hidden), { threshold: 0.05 }) : null
    if (el && io) io.observe(el)
    const vis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => { mq.removeEventListener('change', on); io?.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const node = DEMO_NODES.find((n) => n.id === selected)
  const use3d = gl && !manualStatic
  const fallback = <StaticMap selected={selected} onSelect={setSelected} />

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div ref={box} className="relative aspect-[4/3] min-h-[320px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[radial-gradient(60%_60%_at_50%_45%,color-mix(in_srgb,var(--accent)_14%,transparent),transparent)]" data-testid="network-hero" data-mode={use3d ? '3d' : 'static'}>
        {use3d ? (
          <Boundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <Scene theme={theme} selected={selected} onSelect={setSelected} animate={!reduced} visible={visible} />
            </Suspense>
          </Boundary>
        ) : fallback}
        <span className="badge b-synthetic absolute left-3 top-3">Demonstration topology · not live</span>
        <button className="btn btn-sm absolute bottom-3 right-3" aria-pressed={!use3d} onClick={() => setManualStatic((s) => !s)}>{use3d ? 'Use flat view' : gl ? 'Use 3D view' : '3D unavailable'}</button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="glass p-4" aria-live="polite">
          {node ? (
            <>
              <div className="eyebrow">{KIND_LABEL[node.kind]} · {node.status === 'built' ? 'implemented' : 'planned'}</div>
              <h3 className="mt-1 text-lg font-semibold">{node.label}</h3>
              <p className="muted mt-2 text-sm">{node.blurb}</p>
            </>
          ) : (
            <p className="muted text-sm">Select a node, in the scene or from the list, to see what it represents. Solid shapes are implemented; wireframes are planned and disabled.</p>
          )}
        </div>
        <ul className="glass max-h-52 space-y-0.5 overflow-y-auto p-2" aria-label="Topology nodes">
          {DEMO_NODES.map((n) => (
            <li key={n.id}>
              <button className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]" aria-pressed={selected === n.id} onClick={() => setSelected(selected === n.id ? null : n.id)}>
                <span>{n.label}</span><span className="muted text-xs">{n.status === 'built' ? '' : 'planned'}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
