import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Minus, Plus, RotateCcw, Table2, Waypoints } from 'lucide-react'
import { api } from '../api/client'
import { Card, EmptyState, ErrorState, Field, LoadingRows, PageHeader, SyntheticBadge, Time } from '../components/ui'
import { FilterBar } from '../components/domain'

interface AssetRow { id: number; hostname: string; os?: string; environment?: string; criticality?: string; lastSeen: string; eventCount: number; synthetic: boolean; openAlerts: number; openIncidents: number }
interface AssetDetail { hostname: string; sources: { name: string; sourceType: string; count: number; lastSeen: string }[] }

const W = 720
const ROW = 74

/** Lane layout: data sources on the left, hosts grouped into environment zones on the right. */
function layout(assets: AssetRow[], sources: string[]) {
  const envs = Array.from(new Set(assets.map((a) => a.environment || 'unassigned'))).sort()
  const hostPos = new Map<string, { x: number; y: number; env: string }>()
  const zones: { env: string; y0: number; y1: number }[] = []
  let y = 70
  for (const env of envs) {
    const hs = assets.filter((a) => (a.environment || 'unassigned') === env)
    const cols = Math.min(3, Math.max(1, hs.length))
    const rows = Math.ceil(hs.length / cols)
    const y0 = y - 34
    hs.forEach((a, i) => hostPos.set(a.hostname, { x: 330 + (i % cols) * 140, y: y + Math.floor(i / cols) * ROW, env }))
    y += rows * ROW + 40
    zones.push({ env, y0, y1: y - 52 })
  }
  const srcPos = new Map(sources.map((s, i) => [s, { x: 85, y: 70 + i * ROW }]))
  return { hostPos, srcPos, zones, height: Math.max(y, 70 + sources.length * ROW + 20) }
}

const CRIT_R: Record<string, number> = { CRITICAL: 17, HIGH: 15, MEDIUM: 13, LOW: 11 }

export function Topology() {
  const [env, setEnv] = useState('')
  const [onlyAlerts, setOnlyAlerts] = useState(false)
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [view, setView] = useState<'map' | 'table'>('map')
  const [t, setT] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const assets = useQuery({ queryKey: ['assets'], queryFn: () => api<AssetRow[]>('/api/assets') })
  const details = useQueries({ queries: (assets.data ?? []).map((a) => ({ queryKey: ['asset', a.hostname], queryFn: () => api<AssetDetail>(`/api/assets/${encodeURIComponent(a.hostname)}`) })) })

  const all = assets.data ?? []
  const visible = all.filter((a) => (!env || (a.environment || 'unassigned') === env) && (!onlyAlerts || a.openAlerts > 0) && (!search || a.hostname.toLowerCase().includes(search.toLowerCase())))
  const links = useMemo(() => {
    const out: { src: string; host: string; count: number; lastSeen: string }[] = []
    details.forEach((d) => d.data?.sources.forEach((s) => out.push({ src: s.name, host: d.data!.hostname, count: s.count, lastSeen: s.lastSeen })))
    return out
  }, [details])
  const visibleHosts = new Set(visible.map((a) => a.hostname))
  const shownLinks = links.filter((l) => visibleHosts.has(l.host))
  const sourceNames = Array.from(new Set(shownLinks.map((l) => l.src))).sort()
  const L = useMemo(() => layout(visible, sourceNames), [visible, sourceNames.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const loadingLinks = details.some((d) => d.isPending)
  const selected = all.find((a) => a.hostname === sel)
  const selLinks = shownLinks.filter((l) => l.host === sel)
  const envs = Array.from(new Set(all.map((a) => a.environment || 'unassigned'))).sort()
  const matches = search ? visible.length : null

  const zoom = (f: number) => setT((s) => ({ ...s, k: Math.min(3, Math.max(0.5, s.k * f)) }))
  const H = L.height

  return (
    <>
      <PageHeader title="Topology" subtitle="Hosts the telemetry has mentioned, grouped by environment, and the data sources that actually reported on them. A line exists only where stored events link a source to a host." />
      <Card pad={false}>
        <FilterBar>
          <div className="min-w-[180px] flex-1"><Field label="Find a host" htmlFor="t-q"><input id="t-q" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hostname" /></Field></div>
          <Field label="Environment" htmlFor="t-env"><select id="t-env" className="select" value={env} onChange={(e) => setEnv(e.target.value)}><option value="">All</option>{envs.map((e) => <option key={e}>{e}</option>)}</select></Field>
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} /> Only hosts with open alerts</label>
          <div className="ml-auto flex gap-1" role="group" aria-label="View">
            <button className="btn btn-sm" aria-pressed={view === 'map'} onClick={() => setView('map')}><Waypoints size={15} aria-hidden="true" /> Map</button>
            <button className="btn btn-sm" aria-pressed={view === 'table'} onClick={() => setView('table')}><Table2 size={15} aria-hidden="true" /> Table</button>
          </div>
        </FilterBar>

        {assets.isError ? <ErrorState error={assets.error} onRetry={() => void assets.refetch()} /> : assets.isPending ? <div className="p-5"><LoadingRows label="Loading assets" rows={4} /></div> : all.length === 0 ? (
          <EmptyState title="No hosts observed yet">The topology is built from ingested events. Run the safe demo from the Overview, or ingest data on Data sources. No data is not the same as a quiet network.</EmptyState>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 border-t border-[var(--line)]">
              {view === 'map' ? (
                <div className="relative">
                  <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
                    <button className="btn btn-sm btn-icon" aria-label="Zoom in" onClick={() => zoom(1.25)}><Plus size={16} aria-hidden="true" /></button>
                    <button className="btn btn-sm btn-icon" aria-label="Zoom out" onClick={() => zoom(0.8)}><Minus size={16} aria-hidden="true" /></button>
                    <button className="btn btn-sm btn-icon" aria-label="Reset view" onClick={() => setT({ k: 1, x: 0, y: 0 })}><RotateCcw size={16} aria-hidden="true" /></button>
                  </div>
                  {visible.length === 0 ? <EmptyState title="No hosts match these filters" /> : (
                    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none select-none" style={{ maxHeight: '70dvh', cursor: drag.current ? 'grabbing' : 'grab' }} role="group" aria-label="Topology map. A table view with the same information is available."
                      onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 0.9) } }}
                      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false } }}
                      onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y
                        if (!d.moved && Math.hypot(dx, dy) < 5) return
                        if (!d.moved) { d.moved = true; (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId) }
                        d.x = e.clientX; d.y = e.clientY; const sc = W / (e.currentTarget as SVGSVGElement).clientWidth; setT((s) => ({ ...s, x: s.x + dx * sc, y: s.y + dy * sc })) }}
                      onPointerUp={() => { drag.current = null }}>
                      <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
                        {L.zones.map((z) => (
                          <g key={z.env}>
                            <rect x={235} y={z.y0} width={470} height={z.y1 - z.y0 + 22} rx={14} fill="var(--surface-2)" stroke="var(--line)" strokeDasharray="4 4" opacity={0.7} />
                            <text x={252} y={z.y0 + 18} fontSize={12} fontWeight={700} fill="var(--muted)" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{z.env}</text>
                          </g>
                        ))}
                        <text x={85} y={34} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--muted)">DATA SOURCES</text>
                        {shownLinks.map((l) => { const a = L.srcPos.get(l.src), b = L.hostPos.get(l.host); if (!a || !b) return null
                          const on = sel === l.host
                          return <path key={l.src + l.host} d={`M${a.x + 65} ${a.y} C ${a.x + 150} ${a.y}, ${b.x - 110} ${b.y}, ${b.x - 20} ${b.y}`} fill="none" stroke={on ? 'var(--accent)' : 'var(--line)'} strokeWidth={on ? 2.4 : 1.2} opacity={sel && !on ? 0.35 : 0.9} /> })}
                        {sourceNames.map((s) => { const p = L.srcPos.get(s)!; return (
                          <g key={s}><rect x={p.x - 65} y={p.y - 18} width={130} height={36} rx={9} fill="var(--surface)" stroke="var(--line)" /><text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11.5} fill="var(--ink)">{s.length > 17 ? s.slice(0, 16) + '…' : s}</text></g>
                        ) })}
                        {visible.map((a) => { const p = L.hostPos.get(a.hostname)!; const r = CRIT_R[a.criticality ?? ''] ?? 12; const isSel = sel === a.hostname
                          const ring = a.openIncidents > 0 ? 'var(--crit-fg)' : a.openAlerts > 0 ? 'var(--med-fg)' : 'var(--line)'
                          return (
                            <g key={a.hostname} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-pressed={isSel} aria-label={`${a.hostname}, ${a.openAlerts} open alerts, ${a.openIncidents} open cases`}
                              style={{ cursor: 'pointer', outline: 'none' }} onClick={() => setSel(isSel ? null : a.hostname)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(isSel ? null : a.hostname) } }}>
                              <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={5} fill="var(--surface)" stroke={ring} strokeWidth={isSel ? 3.5 : a.openAlerts ? 2.5 : 1.5} />
                              <rect x={-r + 4} y={-r + 4} width={r * 2 - 8} height={r * 2 - 8} rx={3} fill="var(--accent)" opacity={a.openAlerts ? 0.9 : 0.35} />
                              {a.openAlerts > 0 && <text y={4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--accent-ink)">{a.openAlerts}</text>}
                              <text y={r + 15} textAnchor="middle" fontSize={11.5} fill="var(--ink)">{a.hostname}</text>
                            </g>
                          ) })}
                      </g>
                    </svg>
                  )}
                  <p className="muted border-t border-[var(--line)] px-5 py-3 text-xs">
                    Square size = criticality. Number = open alerts. Red outline = open case, amber = open alerts only. Drag to pan; Ctrl + scroll or the buttons to zoom. {loadingLinks ? 'Loading source links…' : `${shownLinks.length} source-to-host link(s) from stored events.`}
                    {matches !== null && ` ${matches} host(s) match.`} Network paths and segments are not known to AegisSOC, so none are drawn.
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">Hosts, environments and the sources that reported on them</caption>
                    <thead><tr><th scope="col">Host</th><th scope="col">Environment</th><th scope="col">Criticality</th><th scope="col">Open alerts</th><th scope="col">Open cases</th><th scope="col">Sources</th><th scope="col">Last seen</th></tr></thead>
                    <tbody>{visible.map((a) => (
                      <tr key={a.hostname}>
                        <td><button className="row-link" onClick={() => setSel(a.hostname)}>{a.hostname}</button>{a.synthetic && <> <SyntheticBadge /></>}</td>
                        <td>{a.environment || 'unassigned'}</td><td>{a.criticality ?? 'unknown'}</td><td>{a.openAlerts}</td><td>{a.openIncidents}</td>
                        <td>{links.filter((l) => l.host === a.hostname).map((l) => l.src).join(', ') || <span className="muted">none yet</span>}</td>
                        <td><Time value={a.lastSeen} /></td>
                      </tr>))}</tbody>
                  </table>
                </div>
              )}
            </div>

            <aside className="border-t border-[var(--line)] p-5 lg:border-l" aria-label="Selection details" aria-live="polite">
              {selected ? (
                <div className="space-y-3">
                  <div className="eyebrow">Host</div>
                  <h2 className="text-lg font-semibold">{selected.hostname}</h2>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="muted">Environment</dt><dd>{selected.environment || 'unassigned'}</dd></div>
                    <div><dt className="muted">Criticality</dt><dd>{selected.criticality ?? 'unknown'}</dd></div>
                    <div><dt className="muted">Open alerts</dt><dd>{selected.openAlerts}</dd></div>
                    <div><dt className="muted">Open cases</dt><dd>{selected.openIncidents}</dd></div>
                    <div><dt className="muted">OS</dt><dd>{selected.os ?? 'not reported'}</dd></div>
                    <div><dt className="muted">Events</dt><dd>{selected.eventCount}</dd></div>
                  </dl>
                  <p className="muted text-xs">Last event <Time value={selected.lastSeen} />. This is when telemetry last mentioned the host, not proof that it is online now.</p>
                  <div><div className="card-title mb-1">Reported by</div>
                    {selLinks.length === 0 ? <p className="muted text-sm">No source links loaded.</p> : <ul className="space-y-1 text-sm">{selLinks.map((l) => <li key={l.src}>{l.src} <span className="muted">· {l.count} events</span></li>)}</ul>}
                  </div>
                  <div className="flex flex-wrap gap-2"><Link className="btn btn-sm" to={`/app/assets?host=${encodeURIComponent(selected.hostname)}`}>Asset page</Link><Link className="btn btn-sm" to={`/app/alerts?q=${encodeURIComponent(selected.hostname)}`}>Alerts</Link><Link className="btn btn-sm" to={`/app/hunt?host=${encodeURIComponent(selected.hostname)}`}>Hunt</Link></div>
                </div>
              ) : <p className="muted text-sm">Select a host to see its alerts, cases and the sources that reported on it. Everything here comes from stored records; nothing is simulated.</p>}
            </aside>
          </div>
        )}
      </Card>
    </>
  )
}
