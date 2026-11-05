import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api, download, qs } from '../api/client'
import { useAuth } from '../lib/auth'
import { Async, Banner, Bars, Card, Field, KeyValue, PageHeader, Stat, StatusBadge, useToast, errMessage } from '../components/ui'

interface Metrics {
  period: { from: string; to: string; days: number; timezone: string; note: string }
  incidents: { created: number; open: number; bySeverity: { severity: string; count: number }[]; byStatus: { status: string; count: number }[]; timeToTriage: { definition: string; average: number | string; sampleSize: number }; timeToClose: { definition: string; average: number | string; sampleSize: number } }
  alerts: { created: number; bySeverity: { severity: string; count: number }[]; byStatus: { status: string; count: number }[]; closedByResolution: { resolution: string; count: number }[]; openUnassigned: number }
  ruleNoise: { ruleId: string; name: string; alerts: number; closed: number; judgedBenign: number; benignShareOfClosed: number | null }[]
  detectionQuality: { latestTestPerRule: { ruleId: string; version: number; tp: number; fp: number; fn: number; tn: number; sensitivity: number | null; precision: number | null }[]; rulesTested: number; rulesTotal: number; caveat: string }
  sources: { health: string; count: number }[]
  workload: { assignee: string; openIncidents: number; openAlerts: number }[]
  caveats: string[]
  provenance: { source: string; generatedAt: string; events: number; syntheticEvents: number }
  executiveSummary: string[]
}

export function Reports() {
  const { can } = useAuth()
  const toast = useToast()
  const [days, setDays] = useState(30)
  const [exec, setExec] = useState(false)
  const q = useQuery({ queryKey: ['metrics', days], queryFn: () => api<Metrics>('/api/reports/metrics' + qs({ days })) })
  async function exp(format: 'md' | 'json' | 'csv') {
    try { const r = await download('/api/reports/export' + qs({ days, format, audience: exec ? 'executive' : 'analyst' }), `aegissoc-report.${format}`); toast.push('ok', `Downloaded ${r.name}. SHA-256 ${r.sha256?.slice(0, 12)}… logged.`) } catch (e) { toast.push('danger', errMessage(e)) }
  }
  return (
    <>
      <PageHeader title="Reports & metrics" subtitle="Numbers come only from stored records, each with its definition and a link to the records behind it. Where there is no data it says “no data”, not zero." />
      <Card pad={false} className="mb-6">
        <div className="flex flex-wrap items-end gap-4 px-5 py-4">
          <Field label="Period" htmlFor="rp-d"><select id="rp-d" className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={exec} onChange={(e) => setExec(e.target.checked)} /> Executive wording for exports (no jargon, uncertainty kept)</label>
          {can('ANALYST') && <div className="ml-auto flex gap-2 pb-0.5"><button className="btn" onClick={() => exp('md')}><Download size={15} aria-hidden="true" /> Markdown</button><button className="btn" onClick={() => exp('csv')}><Download size={15} aria-hidden="true" /> CSV</button><button className="btn" onClick={() => exp('json')}><Download size={15} aria-hidden="true" /> JSON</button></div>}
        </div>
      </Card>
      <Async q={q} rows={8}>
        {(m) => (
          <div className="space-y-6">
            <Card title="Plain-language summary" id="exec">
              <ul className="list-disc space-y-1.5 pl-5">{m.executiveSummary.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Cases created" value={m.incidents.created} hint={`${m.incidents.open} open now`} to="/app/incidents" />
              <Stat label="Alerts created" value={m.alerts.created} hint={`${m.alerts.openUnassigned} open without an owner`} to="/app/alerts?openOnly=true&assignee=unassigned" tone={m.alerts.openUnassigned ? 'warn' : undefined} />
              <Stat label="Avg time to triage" value={typeof m.incidents.timeToTriage.average === 'number' ? `${m.incidents.timeToTriage.average} min` : 'no data'} hint={`sample ${m.incidents.timeToTriage.sampleSize}`} />
              <Stat label="Avg time to close" value={typeof m.incidents.timeToClose.average === 'number' ? `${m.incidents.timeToClose.average} min` : 'no data'} hint={`sample ${m.incidents.timeToClose.sampleSize}`} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Alerts by severity" id="sev"><Bars label="Alerts by severity" data={m.alerts.bySeverity.map((s) => ({ label: s.severity, value: s.count }))} /><div className="mt-2"><KeyValue rows={m.alerts.bySeverity.map((s) => ({ k: s.severity, v: <Link className="underline" to={`/app/alerts?severity=${s.severity}`}>{s.count}</Link> }))} /></div></Card>
              <Card title="How closed alerts were judged" id="res">{m.alerts.closedByResolution.length === 0 ? <p className="muted text-sm">No alerts have been closed yet.</p> : <KeyValue rows={m.alerts.closedByResolution.map((r) => ({ k: r.resolution.replace(/_/g, ' ').toLowerCase(), v: r.count }))} />}</Card>
            </div>
            <Card title="Rule noise (judged by analysts, not by the rule)" id="noise" pad={false}>
              <div className="table-wrap"><table className="table"><caption className="sr-only">Alerts per rule and how many closed alerts were judged benign</caption>
                <thead><tr><th scope="col">Rule</th><th scope="col">Alerts</th><th scope="col">Closed</th><th scope="col">Judged benign</th><th scope="col">Benign share of closed</th></tr></thead>
                <tbody>{m.ruleNoise.map((r) => <tr key={r.ruleId}><td><Link className="row-link" to={`/app/detections/${r.ruleId}`}>{r.name}</Link><div className="mono muted text-xs">{r.ruleId}</div></td><td><Link className="underline" to={`/app/alerts?rule=${r.ruleId}`}>{r.alerts}</Link></td><td>{r.closed}</td><td>{r.judgedBenign}</td><td>{r.benignShareOfClosed === null ? <span className="muted">no closed alerts</span> : `${r.benignShareOfClosed}%`}</td></tr>)}</tbody></table></div>
            </Card>
            <Card title={`Labelled test results (${m.detectionQuality.rulesTested} of ${m.detectionQuality.rulesTotal} rules tested)`} id="quality" pad={false}>
              {m.detectionQuality.latestTestPerRule.length === 0 ? <p className="muted p-5 text-sm">No rule has been run against the labelled suite yet. Open a rule on the Detections page and press “Run tests”.</p> : (
                <div className="table-wrap"><table className="table"><caption className="sr-only">Latest labelled test per rule</caption>
                  <thead><tr><th scope="col">Rule</th><th scope="col">Caught</th><th scope="col">False alarms</th><th scope="col">Missed</th><th scope="col">Sensitivity</th><th scope="col">Precision</th></tr></thead>
                  <tbody>{m.detectionQuality.latestTestPerRule.map((r) => <tr key={r.ruleId}><td className="mono">{r.ruleId} v{r.version}</td><td>{r.tp}</td><td>{r.fp}</td><td>{r.fn}</td><td>{r.sensitivity ?? 'n/a'}{r.sensitivity != null && '%'}</td><td>{r.precision ?? 'n/a'}{r.precision != null && '%'}</td></tr>)}</tbody></table></div>
              )}
              <p className="muted border-t border-[var(--line)] px-5 py-3 text-xs">{m.detectionQuality.caveat}</p>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Data source health" id="src">{<ul className="space-y-1.5">{m.sources.map((s) => <li key={s.health} className="flex items-center justify-between"><StatusBadge status={s.health} /><span className="tabular-nums">{s.count}</span></li>)}</ul>}</Card>
              <Card title="Open workload by owner" id="load">{m.workload.length === 0 ? <p className="muted text-sm">No open alerts.</p> : <KeyValue rows={m.workload.map((w) => ({ k: w.assignee, v: `${w.openAlerts} alert(s), ${w.openIncidents} case(s)` }))} />}</Card>
            </div>
            <Banner kind="warn" title="What these numbers cannot tell you">
              <ul className="list-disc pl-5">{m.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </Banner>
            <p className="muted text-xs">{m.period.note} Period {m.period.from.slice(0, 10)} → {m.period.to.slice(0, 10)} ({m.period.timezone}). Source: {m.provenance.source}; {m.provenance.events} events ({m.provenance.syntheticEvents} synthetic).</p>
          </div>
        )}
      </Async>
    </>
  )
}
