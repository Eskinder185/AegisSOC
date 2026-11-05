import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Compass, Laptop, Pause, Play, Radar, RotateCcw, Router, Server, ShieldCheck, TriangleAlert, UserRound, X, Box, LayoutList } from 'lucide-react'
import { usePrefs } from '../../lib/prefs'
import { CONNECTIONS, ENTITIES, REALITY_LABEL, STAGES, type Connection, type Entity, type EntityId } from '../../lib/story'
import { LoadingRows } from '../ui'

const Scene = lazy(() => import('../three/StoryScene'))

const ICON: Record<EntityId, typeof Laptop> = { laptop: Laptop, server: Server, router: Router, sensor: Radar, aegis: ShieldCheck, alert: TriangleAlert, analyst: UserRound }
const STAGE_MS = 7500

function webglOk(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

class Boundary extends Component<{ fallback: ReactNode; onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFail() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function RealityBadge({ r }: { r: Entity['reality'] }) {
  const cls = r === 'built' ? 'b-ok' : r === 'simulated' ? 'b-synthetic' : 'b-info'
  return <span className={`badge ${cls}`}>{REALITY_LABEL[r]}</span>
}

/** Flat, fully accessible version of the same story. Also the default on small screens. */
function FlatDiagram({ stage, selected, onEntity, analyst, explore }: { stage: number; selected: EntityId | null; onEntity: (id: EntityId) => void; analyst: boolean; explore: boolean }) {
  const st = STAGES[stage]
  const Cell = ({ id }: { id: EntityId }) => {
    const e = ENTITIES.find((x) => x.id === id)!
    const Icon = ICON[id]
    const shown = explore || st.visible.includes(id)
    const on = !explore && st.focus.includes(id)
    return (
      <button type="button" onClick={() => onEntity(id)} aria-pressed={selected === id} disabled={!shown}
        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'} ${shown ? '' : 'opacity-35'} ${selected === id ? 'ring-2 ring-[var(--accent)]' : ''}`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)]"><Icon size={22} className={on ? 'text-[var(--accent)]' : ''} aria-hidden="true" /></span>
        <span className="min-w-0"><span className="block font-semibold">{analyst ? e.technical : e.label}</span><span className="muted block truncate text-xs">{analyst ? e.label : REALITY_LABEL[e.reality]}</span></span>
      </button>
    )
  }
  const arrow = (ids: string[], label: string) => {
    const on = explore || ids.some((i) => st.flow.includes(i))
    return <div className={`flex items-center justify-center gap-1 py-1 text-xs font-medium ${on ? 'text-[var(--accent)]' : 'muted'}`} aria-hidden="true"><ArrowRight size={18} className="rotate-90 md:rotate-0" /><span className="hidden lg:inline">{label}</span></div>
  }
  return (
    <div className="grid items-center gap-2 p-4 md:grid-cols-[1.1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:p-6" role="group" aria-label="The same story as a simple diagram">
      <div className="space-y-2"><Cell id="laptop" /><Cell id="server" /><Cell id="router" /></div>
      {arrow(['c1', 'c2', 'c3'], 'Collected')}<Cell id="sensor" />{arrow(['c4'], 'Analysed')}<Cell id="aegis" />
      {arrow(['c5'], 'Flagged')}<Cell id="alert" />{arrow(['c6'], 'Investigate')}<Cell id="analyst" />
    </div>
  )
}

function Detail({ e, analyst }: { e: Entity; analyst: boolean }) {
  return (
    <div className="space-y-4" data-testid="entity-detail">
      <div><div className="eyebrow">{analyst ? e.label : 'Selected'}</div><h3 className="mt-1 text-2xl font-semibold tracking-tight">{analyst ? e.technical : e.label}</h3><div className="mt-2"><RealityBadge r={e.reality} /></div></div>
      <section><h4 className="card-title">What is this?</h4><p className="mt-1 text-base">{e.what}</p></section>
      <section><h4 className="card-title">Why does it matter?</h4><p className="mt-1 text-base">{e.why}</p></section>
      <section><h4 className="card-title">Real-world example</h4><p className="mt-1 text-base">{e.example}</p></section>
      <p className="muted text-sm">{e.realityNote}</p>
      <details className="well p-3" open={analyst}>
        <summary className="cursor-pointer font-semibold">Learn more: technical details</summary>
        <dl className="mt-3 space-y-2 text-sm">{e.details.map((d) => <div key={d.k}><dt className="muted">{d.k}</dt><dd>{d.v}</dd></div>)}</dl>
      </details>
    </div>
  )
}

function ConnDetail({ c, analyst }: { c: Connection; analyst: boolean }) {
  const f = ENTITIES.find((e) => e.id === c.from)!, t = ENTITIES.find((e) => e.id === c.to)!
  return (
    <div className="space-y-4" data-testid="connection-detail">
      <div><div className="eyebrow">Connection</div><h3 className="mt-1 text-2xl font-semibold tracking-tight">{c.label}</h3><p className="muted mt-1">{f.label} → {t.label}</p><div className="mt-2"><RealityBadge r={c.reality} /></div></div>
      <section><h4 className="card-title">What is exchanged?</h4><p className="mt-1 text-base">{c.carries}</p></section>
      <section><h4 className="card-title">Why does it matter?</h4><p className="mt-1 text-base">{c.why}</p></section>
      <details className="well p-3" open={analyst}><summary className="cursor-pointer font-semibold">Learn more: technical details</summary><p className="mt-2 text-sm">{c.technical}</p></details>
    </div>
  )
}

export function HowItWorks({ analyst }: { analyst: boolean }) {
  const { theme } = usePrefs()
  const [stage, setStage] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [explore, setExplore] = useState(false)
  const [sel, setSel] = useState<EntityId | null>(null)
  const [conn, setConn] = useState<string | null>(null)
  const [gl] = useState(webglOk)
  const [view, setView] = useState<'3d' | 'flat'>(() => (webglOk() && !window.matchMedia('(max-width: 700px)').matches ? '3d' : 'flat'))
  const [visible, setVisible] = useState(true)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const box = useRef<HTMLDivElement>(null)
  const labelEls = useRef<Record<string, HTMLElement | null>>({})
  const started = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    const el = box.current
    const io = el ? new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting && !document.hidden)
      if (e.isIntersecting && !started.current && !mq.matches) { started.current = true; setPlaying(true) }
    }, { threshold: 0.2 }) : null
    if (el && io) io.observe(el)
    const vis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => { mq.removeEventListener('change', on); io?.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])

  useEffect(() => {
    if (!playing || explore || !visible) return
    const t = setTimeout(() => { if (stage >= STAGES.length - 1) setPlaying(false); else setStage((s) => s + 1) }, STAGE_MS)
    return () => clearTimeout(t)
  }, [playing, stage, explore, visible])

  const go = (n: number) => { setStage(Math.max(0, Math.min(STAGES.length - 1, n))); setSel(null); setConn(null) }
  const st = STAGES[stage]
  const atEnd = stage === STAGES.length - 1 && !playing
  const selEntity = ENTITIES.find((e) => e.id === sel)
  const selConn = CONNECTIONS.find((c) => c.id === conn)
  const pickEntity = (id: EntityId | null) => { setSel(id); if (id) setConn(null); if (id) setPlaying(false) }
  const pickConn = (id: string | null) => { setConn(id); if (id) setSel(null); if (id) setPlaying(false) }
  const use3d = view === '3d' && gl

  const listEntities = explore ? ENTITIES : ENTITIES.filter((e) => st.focus.includes(e.id))
  const listConns = explore ? CONNECTIONS : CONNECTIONS.filter((c) => st.flow.includes(c.id))

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]" ref={box}>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold" aria-live="polite" data-testid="step-status">
            {explore ? 'Exploring the 3D network' : `Step ${stage + 1} of ${STAGES.length} — ${st.title}`}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="View">
            <button className="btn btn-sm" aria-pressed={view === '3d'} disabled={!gl} onClick={() => setView('3d')} title={gl ? undefined : '3D is not available in this browser'}><Box size={15} aria-hidden="true" /> 3D scene</button>
            <button className="btn btn-sm" aria-pressed={view === 'flat'} onClick={() => setView('flat')}><LayoutList size={15} aria-hidden="true" /> Simple diagram</button>
          </div>
        </div>

        {!explore && (
          <ol className="mb-3 grid grid-cols-5 gap-1.5" aria-label="Story steps">
            {STAGES.map((s, i) => (
              <li key={s.n}>
                <button type="button" onClick={() => go(i)} aria-current={i === stage ? 'step' : undefined} className={`group w-full text-left`}>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-[var(--line)]">{i < stage ? <span className="block h-full w-full rounded-full bg-[var(--accent)]" /> : i === stage ? <span key={stage} className="story-fill block h-full rounded-full bg-[var(--accent)]" style={{ animationDuration: `${STAGE_MS}ms`, animationPlayState: playing ? 'running' : 'paused', animationFillMode: 'both', width: playing || started.current ? undefined : '100%' }} /> : null}</span>
                  <span className={`mt-1.5 hidden text-xs font-semibold sm:block ${i === stage ? '' : 'muted'}`}>{s.n}. {s.short}</span>
                  <span className="sr-only sm:hidden">Step {s.n}: {s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="card relative overflow-hidden" data-testid="story-stage" data-mode={use3d ? '3d' : 'flat'}>
          {use3d ? (
            <div className="relative aspect-[16/10] min-h-[340px] bg-[radial-gradient(70%_70%_at_50%_40%,color-mix(in_srgb,var(--accent)_13%,transparent),transparent)] xl:aspect-[16/9.5]">
              <Boundary onFail={() => setView('flat')} fallback={<FlatDiagram stage={stage} selected={sel} onEntity={pickEntity} analyst={analyst} explore={explore} />}>
                <Suspense fallback={<div className="p-6"><LoadingRows label="Loading the 3D scene" rows={4} /></div>}>
                  <Scene theme={theme} stage={stage} explore={explore} paused={!playing && !explore} animate={!reduced} visible={visible} analyst={analyst}
                    selectedEntity={sel} selectedConn={conn} onSelectEntity={pickEntity} onSelectConn={pickConn} labelEls={labelEls} />
                </Suspense>
              </Boundary>
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                {ENTITIES.filter((e) => explore || st.visible.includes(e.id)).map((e) => {
                  const on = !explore && st.focus.includes(e.id)
                  const dim = !explore && !on
                  return <span key={e.id} ref={(el) => { labelEls.current['e:' + e.id] = el }} className={`story-label absolute left-0 top-0 ${on || sel === e.id ? 'story-label-on' : ''} ${dim ? 'story-label-dim' : ''}`} style={{ visibility: 'hidden' }}>{analyst ? e.technical : e.label}</span>
                })}
                {(() => {
                  const seen = new Set<string>()
                  return CONNECTIONS.filter((c) => (conn === c.id) || (!explore && st.flow.includes(c.id))).filter((c) => { if (conn === c.id) return true; if (seen.has(c.label)) return false; seen.add(c.label); return true })
                    .map((c) => <span key={c.id} ref={(el) => { labelEls.current['c:' + c.id] = el }} className="story-conn-label absolute left-0 top-0" style={{ visibility: 'hidden' }}>{c.label}</span>)
                })()}
              </div>
              <span className="badge b-synthetic absolute left-3 top-3">Illustration · practice data · not live</span>
            </div>
          ) : (
            <FlatDiagram stage={stage} selected={sel} onEntity={pickEntity} analyst={analyst} explore={explore} />
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] p-3">
            {!explore ? (
              <>
                <button className="btn btn-sm" onClick={() => go(stage - 1)} disabled={stage === 0}><ChevronLeft size={16} aria-hidden="true" /> Back</button>
                {atEnd ? (
                  <button className="btn btn-sm btn-primary" onClick={() => { go(0); setPlaying(true) }}><RotateCcw size={15} aria-hidden="true" /> Replay</button>
                ) : (
                  <button className="btn btn-sm btn-primary" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? <><Pause size={15} aria-hidden="true" /> Pause</> : <><Play size={15} aria-hidden="true" /> {stage === 0 && !started.current ? 'Start the tour' : 'Play'}</>}</button>
                )}
                <button className="btn btn-sm" onClick={() => go(stage + 1)} disabled={stage === STAGES.length - 1}>Next <ChevronRight size={16} aria-hidden="true" /></button>
                <button className="btn btn-sm ml-auto" onClick={() => { setExplore(true); setPlaying(false); setSel(null); setConn(null) }}><Compass size={15} aria-hidden="true" /> Explore the 3D Network</button>
              </>
            ) : (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => { setExplore(false); setSel(null); setConn(null) }}><X size={15} aria-hidden="true" /> Back to the guided tour</button>
                <span className="muted text-sm">{use3d ? 'Drag to turn the scene. Click any object or arrow to learn about it.' : 'Select any item to learn about it.'}</span>
              </>
            )}
          </div>
        </div>
        <p className="muted mt-3 text-sm">{reduced ? 'Animations are reduced to match your system setting. ' : ''}Everything shown is an illustration. No real network is connected and no live activity is displayed.</p>
      </div>

      <aside className="card p-6 xl:sticky xl:top-24 xl:self-start" aria-label="Explanation" aria-live="polite">
        {selEntity ? (
          <>
            <button className="btn btn-ghost btn-sm mb-3 -ml-2" onClick={() => pickEntity(null)}><ChevronLeft size={15} aria-hidden="true" /> Back to this step</button>
            <Detail e={selEntity} analyst={analyst} />
          </>
        ) : selConn ? (
          <>
            <button className="btn btn-ghost btn-sm mb-3 -ml-2" onClick={() => pickConn(null)}><ChevronLeft size={15} aria-hidden="true" /> Back to this step</button>
            <ConnDetail c={selConn} analyst={analyst} />
          </>
        ) : (
          <div className="space-y-5">
            {!explore ? (
              <>
                <div><div className="eyebrow">Step {st.n}</div><h3 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{st.title}</h3></div>
                <p className="text-lg leading-relaxed">{st.caption}</p>
              </>
            ) : (
              <div><div className="eyebrow">Free exploration</div><h3 className="mt-1 text-2xl font-semibold tracking-tight">Pick anything</h3><p className="muted mt-2">Every object and every arrow explains itself in plain language, with technical details underneath.</p></div>
            )}
            <div>
              <h4 className="card-title mb-2">{explore ? 'Objects' : 'In this step'}</h4>
              <ul className="space-y-1.5">
                {listEntities.map((e) => { const Icon = ICON[e.id]; return (
                  <li key={e.id}><button className="flex w-full items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-left hover:bg-[var(--surface-2)]" onClick={() => pickEntity(e.id)}><Icon size={18} className="text-[var(--accent)]" aria-hidden="true" /><span className="font-medium">{analyst ? e.technical : e.label}</span><ChevronRight size={15} className="muted ml-auto" aria-hidden="true" /></button></li>
                ) })}
              </ul>
            </div>
            {listConns.length > 0 && (
              <div>
                <h4 className="card-title mb-2">{explore ? 'Connections' : 'What moves'}</h4>
                <ul className="space-y-1.5">
                  {listConns.map((c) => (
                    <li key={c.id}><button className="flex w-full items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]" onClick={() => pickConn(c.id)}>
                      <span className="font-medium">{c.label}</span><span className="muted ml-auto whitespace-nowrap text-xs">{ENTITIES.find((e) => e.id === c.from)!.label} → {ENTITIES.find((e) => e.id === c.to)!.label}</span></button></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
