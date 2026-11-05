import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, CircleHelp, Clock3, Info } from 'lucide-react'
import { api } from '../api/client'
import { Async, Banner, Card, EmptyState, KeyValue, Modal, PageHeader, StatusBadge, SyntheticBadge, Tabs, Time, AbsTime } from '../components/ui'

interface Coverage {
  asOf: string
  expectations: { eventClass: string; maxSilenceMinutes: number; description: string }[]
  matrix: { host: string; cells: Record<string, { state: string; count?: number; lastSeen?: string; detail: string }> }[]
  sources: { id: number; name: string; sourceType: string; state: string; enabled: boolean; lastSuccessAt?: string }[]
  summary: { assetCount: number; cells: number; observedHealthy: number; temporarilyUnavailable: number; notObserved: number; observedHealthyShare: number | null; inputs: string }
  caveats: string[]
}
interface Asset { id: number; hostname: string; os?: string; ownerTag?: string; environment: string; criticality: string; firstSeen?: string; lastSeen?: string; eventCount: number; synthetic: boolean; openAlerts: number; openIncidents: number }
interface AssetDetail extends Asset { classes: { eventClass: string; count: number; lastSeen: string }[]; sources: { name: string; sourceType: string; count: number }[]; alerts: { id: number; title: string; severity: string; status: string }[]; recentEvents: { id: number; ts: string; message: string }[] }

const STATE: Record<string, { label: string; Icon: typeof Info; cls: string; word: string }> = {
  OBSERVED_HEALTHY: { label: 'Observed', Icon: CheckCircle2, cls: 'b-ok', word: 'Observed healthy' },
  TEMPORARILY_UNAVAILABLE: { label: 'Silent', Icon: Clock3, cls: 'b-medium', word: 'Temporarily unavailable' },
  NOT_OBSERVED: { label: 'Not seen', Icon: CircleHelp, cls: 'b-info', word: 'Not observed' },
}

export function Assets() {
  const [tab, setTab] = useState<'coverage' | 'assets'>('coverage')
  const [open, setOpen] = useState<string | null>(null)
  const cov = useQuery({ queryKey: ['coverage'], queryFn: () => api<Coverage>('/api/coverage'), refetchInterval: 30_000 })
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => api<Asset[]>('/api/assets') })
  const detail = useQuery({ queryKey: ['asset', open], queryFn: () => api<AssetDetail>(`/api/assets/${open}`), enabled: !!open })

  return (
    <>
      <PageHeader title="Assets & coverage" subtitle="Hosts appear here only because telemetry named them. Coverage shows which expected signals were actually seen, and keeps “unknown” separate from “fine”." />
      <Tabs label="Assets views" value={tab} onChange={(t) => setTab(t as typeof tab)} tabs={[{ id: 'coverage', label: 'Coverage matrix' }, { id: 'assets', label: 'Asset inventory' }]} />
      <div className="mt-5 space-y-6" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'coverage' && (
          <Async q={cov} rows={6} empty={(d) => d.matrix.length === 0 ? <Card><EmptyState title="Nothing to cover yet">No telemetry has named a host. That is “unknown”, not “secure”. Run the demo scenarios or ingest events.</EmptyState></Card> : null}>
            {(d) => (
              <>
                <div className="grid gap-4 sm:grid-cols-4">
                  {[['Assets seen', d.summary.assetCount], ['Observed healthy', d.summary.observedHealthy], ['Silent (was seen)', d.summary.temporarilyUnavailable], ['Never seen', d.summary.notObserved]].map(([l, v]) => (
                    <div key={l as string} className="card card-pad"><div className="card-title">{l}</div><div className="mt-1 text-3xl font-bold tabular-nums">{v}</div></div>
                  ))}
                </div>
                <Banner kind="info" title="How to read this">
                  {d.summary.observedHealthyShare !== null && <>{d.summary.observedHealthyShare}% of expected host × signal cells were recently observed. </>}
                  {d.caveats.map((c, i) => <span key={i}>{c} </span>)}
                </Banner>
                <Card title="Host × expected signal" id="matrix" pad={false}>
                  <div className="table-wrap">
                    <table className="table">
                      <caption className="sr-only">Coverage of expected event classes per host, as of {d.asOf}</caption>
                      <thead><tr><th scope="col">Host</th>{d.expectations.map((e) => <th key={e.eventClass} scope="col" title={e.description}>{e.eventClass}<div className="font-normal normal-case">≤ {e.maxSilenceMinutes} min</div></th>)}</tr></thead>
                      <tbody>
                        {d.matrix.map((r) => (
                          <tr key={r.host}>
                            <th scope="row" className="!static whitespace-nowrap !bg-transparent !text-[var(--ink)] !normal-case !tracking-normal"><button className="row-link text-left" onClick={() => setOpen(r.host)}>{r.host}</button></th>
                            {d.expectations.map((e) => {
                              const c = r.cells[e.eventClass]; const s = STATE[c.state]
                              return <td key={e.eventClass}><span className={`badge ${s.cls}`} title={c.detail}><s.Icon size={13} aria-hidden="true" />{s.label}<span className="sr-only">: {s.word}. {c.detail}</span></span>{c.count !== undefined && <div className="muted mt-1 text-xs">{c.count} events{c.lastSeen && <> · <Time value={c.lastSeen} /></>}</div>}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted border-t border-[var(--line)] px-5 py-3 text-xs">Judged against the wall clock at <AbsTime value={d.asOf} />. Synthetic data ages, so cells turn “Silent” after their window, exactly as a real stopped sensor would.</p>
                </Card>
                <Card title="Data sources (configuration state)" id="src-state" pad={false}>
                  <ul>{d.sources.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0">
                      <div><div className="font-semibold">{s.name}</div><div className="muted text-xs">{s.sourceType} · last success {s.lastSuccessAt ? <Time value={s.lastSuccessAt} /> : 'never'}</div></div>
                      <StatusBadge status={s.state} />
                    </li>))}</ul>
                  <p className="muted border-t border-[var(--line)] px-5 py-3 text-xs">“Never configured” means no connection was ever set up (not “healthy”). Network connectors stay disabled until authorised.</p>
                </Card>
              </>
            )}
          </Async>
        )}
        {tab === 'assets' && (
          <Card pad={false}>
            <Async q={assets} empty={(d) => d.length === 0 ? <EmptyState title="No assets yet">Assets are created from telemetry. Nothing is discovered or scanned.</EmptyState> : null}>
              {(d) => (
                <div className="table-wrap"><table className="table"><caption className="sr-only">Assets derived from telemetry</caption>
                  <thead><tr><th scope="col">Host</th><th scope="col">OS</th><th scope="col">Environment</th><th scope="col">Events</th><th scope="col">Last seen</th><th scope="col">Open work</th></tr></thead>
                  <tbody>{d.map((a) => (
                    <tr key={a.id}>
                      <td><button className="row-link text-left" onClick={() => setOpen(a.hostname)}>{a.hostname}</button> {a.synthetic && <SyntheticBadge />}</td>
                      <td>{a.os ?? <span className="muted">unknown</span>}</td><td>{a.environment} · {a.criticality.toLowerCase()}</td><td className="tabular-nums">{a.eventCount}</td><td><Time value={a.lastSeen} /></td>
                      <td className="text-sm">{a.openAlerts} alert(s) · {a.openIncidents} case(s)</td>
                    </tr>))}</tbody></table></div>
              )}
            </Async>
          </Card>
        )}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} drawer title={open ?? 'Asset'}>
        <Async q={detail} rows={4}>
          {(a) => (
            <div className="space-y-5">
              {a.synthetic && <SyntheticBadge />}
              <KeyValue rows={[{ k: 'Operating system', v: a.os ?? 'unknown' }, { k: 'Environment', v: a.environment }, { k: 'Criticality', v: a.criticality }, { k: 'First seen', v: <AbsTime value={a.firstSeen} /> }, { k: 'Last seen', v: <AbsTime value={a.lastSeen} /> }, { k: 'Events', v: a.eventCount }]} />
              <div><h3 className="card-title mb-1">Signals seen</h3><ul className="text-sm">{a.classes.map((c) => <li key={c.eventClass} className="flex justify-between border-b border-[var(--line)] py-1.5"><span>{c.eventClass}</span><span className="muted">{c.count} · <Time value={c.lastSeen} /></span></li>)}</ul></div>
              <div><h3 className="card-title mb-1">Reported by</h3><ul className="text-sm">{a.sources.map((s) => <li key={s.name}>{s.name} ({s.count})</li>)}</ul></div>
              {a.alerts.length > 0 && <div><h3 className="card-title mb-1">Alerts</h3><ul className="space-y-1 text-sm">{a.alerts.map((x) => <li key={x.id}><Link className="underline" to={`/app/alerts/${x.id}`}>#{x.id} {x.title}</Link></li>)}</ul></div>}
              <Link className="btn" to={`/app/hunt?pivotType=host&pivotValue=${encodeURIComponent(a.hostname)}`}>Pivot in Hunt</Link>
            </div>
          )}
        </Async>
      </Modal>
    </>
  )
}
