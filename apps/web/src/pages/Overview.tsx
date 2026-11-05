import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play, Search, FlaskConical, ArrowRight, CheckCircle2 } from 'lucide-react'
import { api } from '../api/client'
import { DEMO_ORDER, useRunScenario } from '../api/hooks'
import { useAuth } from '../lib/auth'
import { plural } from '../lib/format'
import { Async, Banner, Bars, Card, EmptyState, PageHeader, SeverityBadge, Stat, StatusBadge, SyntheticBadge, Time, useToast, errMessage, Spinner } from '../components/ui'
import { useState } from 'react'

interface OverviewData {
  asOf: string
  source: string
  counts: { events: number; syntheticEvents: number; openAlerts: number; newAlerts: number; highAlerts: number; openIncidents: number; unassignedIncidents: number; assets: number; pendingApprovals: number }
  dataState: { mode: string; text: string; staleSources: number; failedSources: number; lastSuccessfulIngest: string; lastRun: { scenario?: string; eventsAccepted?: number; finishedAt?: string } }
  alertsBySeverity: { severity: string; count: number }[]
  priorityAlerts: { id: number; title: string; severity: string; confidence: string; status: string; assignee?: string; host?: string; lastEventAt: string; synthetic: boolean; hypothesis?: boolean }[]
  priorityIncidents: { id: number; title: string; severity: string; status: string; assignee?: string; priority: number; synthetic: boolean }[]
  sources: { id: number; name: string; sourceType: string; enabled: boolean; integrationStatus: string; lastSuccessAt?: string; health: string }[]
  alertTrend: { hour: string; count: number }[]
  recentRuns: { id: number; sourceName: string; scenario?: string; status: string; finishedAt?: string; eventsAccepted: number; eventsRejected: number; alertsCreated: number; synthetic: boolean }[]
}

function Onboarding({ onRun, busy }: { onRun: () => void; busy: boolean }) {
  const steps = [
    { n: 1, t: 'Everything starts in Demo mode', d: 'No live source is connected and nothing touches your network. The demo uses clearly labelled SYNTHETIC events.' },
    { n: 2, t: 'Replay a safe scenario', d: 'It generates a repeatable data set, stores it in the database, and runs the detection rules over it.' },
    { n: 3, t: 'Inspect what it found', d: 'Open an alert to see the plain-English explanation, the exact rule and the stored events behind it.' },
  ]
  return (
    <Card title="Welcome — start here" id="welcome">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] font-bold">{s.n}</span>
              <div><div className="font-semibold">{s.t}</div><p className="muted text-sm">{s.d}</p></div>
            </li>
          ))}
        </ol>
        <button className="btn btn-primary" onClick={onRun} disabled={busy}>
          {busy ? <Spinner label="Running demo" /> : <Play size={17} aria-hidden="true" />} Run safe demo
        </button>
      </div>
    </Card>
  )
}

export function Overview() {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api<OverviewData>('/api/overview'), refetchInterval: 20_000 })
  const run = useRunScenario()
  const toast = useToast()
  const { can } = useAuth()
  const nav = useNavigate()
  const [busyAll, setBusyAll] = useState(false)

  async function runDemo() {
    setBusyAll(true)
    try {
      let events = 0, alerts = 0
      for (const id of DEMO_ORDER) {
        const r = await run.mutateAsync({ id })
        events += r.eventsAccepted; alerts += r.alertsCreated
      }
      toast.push('ok', `Demo replayed: ${events} new synthetic events stored, ${alerts} alerts raised by the rules.`)
    } catch (e) {
      toast.push('danger', errMessage(e))
    } finally {
      setBusyAll(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Command center"
        subtitle="What needs attention now, where the data comes from, and how fresh it is."
        actions={
          <>
            {can('ANALYST') && (
              <button className="btn" onClick={runDemo} disabled={busyAll}>
                {busyAll ? <Spinner label="Running demo" /> : <FlaskConical size={17} aria-hidden="true" />} Run safe demo scenarios
              </button>
            )}
            <button className="btn btn-primary" disabled={!q.data?.priorityAlerts.length} onClick={() => q.data?.priorityAlerts[0] && nav(`/app/alerts/${q.data.priorityAlerts[0].id}`)}>
              <Search size={17} aria-hidden="true" /> Investigate top alert
            </button>
          </>
        }
      />
      <Async q={q} rows={6}>
        {(d) => {
          const mode = d.dataState.mode
          const kind = mode === 'DEMO' ? 'syn' : mode === 'FAILED' ? 'danger' : mode === 'DISCONNECTED' ? 'info' : 'info'
          const synShare = d.counts.events ? Math.round((100 * d.counts.syntheticEvents) / d.counts.events) : 0
          return (
            <div className="space-y-6">
              <Banner kind={kind} title={mode === 'DEMO' ? 'Demo mode' : mode === 'FAILED' ? 'Data source problem' : mode === 'DISCONNECTED' ? 'No data yet' : 'Local data'}>
                {d.dataState.text.replace(/^Demo mode: /, '')}{' '}
                {d.dataState.lastSuccessfulIngest && <>Last successful ingest <Time value={d.dataState.lastSuccessfulIngest} />.</>}{' '}
                {(d.dataState.failedSources > 0 || d.dataState.staleSources > 0) && <Link to="/app/sources" className="font-semibold underline">Review data sources</Link>}
              </Banner>

              {d.counts.events === 0 && can('ANALYST') && <Onboarding onRun={runDemo} busy={busyAll} />}
              {d.counts.events === 0 && !can('ANALYST') && <EmptyState title="No data has been ingested yet">Ask an analyst or administrator to run the safe demo.</EmptyState>}

              <section aria-label="Key figures" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Stat label="Open alerts" value={d.counts.openAlerts} hint={`${d.counts.highAlerts} high or critical · ${d.counts.newAlerts} not yet looked at`} to="/app/alerts?openOnly=true" tone={d.counts.highAlerts ? 'danger' : undefined} />
                <Stat label="Open cases" value={d.counts.openIncidents} hint={`${d.counts.unassignedIncidents} without an owner`} to="/app/incidents?openOnly=true" tone={d.counts.unassignedIncidents ? 'warn' : undefined} />
                <Stat label="Events stored" value={d.counts.events.toLocaleString()} hint={d.counts.events ? `${synShare}% synthetic` : 'nothing ingested'} to="/app/hunt" />
                <Stat label="Assets seen" value={d.counts.assets} hint="derived from telemetry only" to="/app/assets" />
                <Stat label="Awaiting approval" value={d.counts.pendingApprovals} hint="simulated response proposals" to="/app/response" />
              </section>

              <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                <Card title="Priority alerts" id="prio-alerts" pad={false} actions={<Link to="/app/alerts" className="btn btn-sm btn-ghost">All alerts <ArrowRight size={14} aria-hidden="true" /></Link>}>
                  {d.priorityAlerts.length === 0 ? (
                    <EmptyState title="No open alerts">{d.counts.events === 0 ? 'Ingest data to see detections here.' : 'Nothing needs attention. That reflects the data and rules we have, not a guarantee of safety.'}</EmptyState>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <caption className="sr-only">Highest priority open alerts</caption>
                        <thead><tr><th scope="col">Alert</th><th scope="col">Severity</th><th scope="col">Status</th><th scope="col">Last event</th></tr></thead>
                        <tbody>
                          {d.priorityAlerts.map((a) => (
                            <tr key={a.id}>
                              <td>
                                <Link className="row-link" to={`/app/alerts/${a.id}`}>{a.title}</Link>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {a.hypothesis && <span className="badge b-medium" title="Built from linked events; not a finding">Hypothesis</span>}
                                  {a.synthetic && <SyntheticBadge />}
                                </div>
                              </td>
                              <td><SeverityBadge severity={a.severity} /><div className="muted mt-1 text-xs">{a.confidence.toLowerCase()} confidence</div></td>
                              <td><StatusBadge status={a.status} /><div className="muted mt-1 text-xs">{a.assignee ?? 'unassigned'}</div></td>
                              <td><Time value={a.lastEventAt} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <div className="space-y-6">
                  <Card title="Alerts raised, last 24h" id="trend">
                    {d.alertTrend.length === 0 ? <p className="muted text-sm">No alerts with events in the last 24 hours. (Synthetic data older than that is not shown here.)</p> : (
                      <Bars label="Alerts per hour over the last 24 hours" valueLabel="Alerts" data={d.alertTrend.map((t) => ({ label: new Date(t.hour).toISOString().slice(11, 16) + ' UTC', value: t.count }))} />
                    )}
                    <p className="muted mt-2 text-xs">Source: alerts table, by first event time.</p>
                  </Card>
                  <Card title="Open cases" id="prio-inc" pad={false} actions={<Link to="/app/incidents" className="btn btn-sm btn-ghost">All cases</Link>}>
                    {d.priorityIncidents.length === 0 ? <EmptyState title="No open cases" /> : (
                      <ul>
                        {d.priorityIncidents.map((i) => (
                          <li key={i.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0">
                            <div className="min-w-0"><Link className="row-link block truncate" to={`/app/incidents/${i.id}`}>#{i.id} {i.title}</Link><span className="muted text-xs">{i.assignee ?? 'unassigned'} · P{i.priority}</span></div>
                            <div className="flex shrink-0 flex-col items-end gap-1"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Data sources" id="sources" pad={false} actions={<Link to="/app/sources" className="btn btn-sm btn-ghost">Manage</Link>}>
                  <ul>
                    {d.sources.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{s.name}</div>
                          <div className="muted text-xs">{s.integrationStatus === 'LOCAL_FIXTURE' ? 'Local' : s.integrationStatus.replace(/_/g, ' ').toLowerCase()} · last ingest {s.lastSuccessAt ? <Time value={s.lastSuccessAt} /> : 'never'}</div>
                        </div>
                        <StatusBadge status={s.health} />
                      </li>
                    ))}
                  </ul>
                  <p className="muted border-t border-[var(--line)] px-5 py-3 text-xs">Coverage gaps are shown explicitly on <Link to="/app/assets">Assets &amp; coverage</Link>. “Disabled” means never connected, which is different from “healthy”.</p>
                </Card>
                <Card title="Recent ingestion" id="runs" pad={false}>
                  {d.recentRuns.length === 0 ? <EmptyState title="No ingestion yet" /> : (
                    <ul>
                      {d.recentRuns.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.scenario ?? r.sourceName} {r.synthetic && <SyntheticBadge />}</div>
                            <div className="muted text-xs">{plural(r.eventsAccepted, 'event')} stored{r.eventsRejected ? `, ${r.eventsRejected} rejected` : ''}, {plural(r.alertsCreated, 'alert')} · <Time value={r.finishedAt} /></div>
                          </div>
                          <StatusBadge status={r.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <p className="muted flex items-center gap-1.5 text-xs"><CheckCircle2 size={13} aria-hidden="true" /> {d.source} As of <Time value={d.asOf} />.</p>
            </div>
          )
        }}
      </Async>
    </>
  )
}
