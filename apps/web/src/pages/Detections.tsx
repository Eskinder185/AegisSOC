import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { RuleRow } from '../api/types'
import { Async, Banner, Card, EmptyState, PageHeader, SeverityBadge, Time } from '../components/ui'

export function Detections() {
  const q = useQuery({ queryKey: ['rules'], queryFn: () => api<RuleRow[]>('/api/rules') })
  return (
    <>
      <PageHeader title="Detections" subtitle="The rule catalog. Rules are small, declarative and regex-free; every change is versioned, tested on labelled cases and reviewed by a second person before it takes effect." />
      <div className="mb-5"><Banner kind="info" title="Local only">Approving a rule version changes AegisSOC&apos;s own detection. It is not deployed to Wazuh, Suricata or anything else.</Banner></div>
      <Card pad={false}>
        <Async q={q} rows={8} empty={(d) => d.length === 0 ? <EmptyState title="No rules" /> : null}>
          {(d) => (
            <div className="table-wrap"><table className="table"><caption className="sr-only">Detection rules</caption>
              <thead><tr><th scope="col">Rule</th><th scope="col">Severity</th><th scope="col">State</th><th scope="col">Version</th><th scope="col">Alerts</th><th scope="col">Last labelled test</th><th scope="col">ATT&amp;CK</th></tr></thead>
              <tbody>{d.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[340px]"><Link className="row-link" to={`/app/detections/${r.id}`}>{r.name}</Link><div className="muted mono text-xs">{r.id}</div><div className="muted mt-0.5 text-xs">{r.purpose}</div></td>
                  <td><SeverityBadge severity={r.severity} /><div className="muted mt-1 text-xs">{r.confidence.toLowerCase()} confidence</div></td>
                  <td>{r.enabled ? <span className="badge b-ok">Enabled</span> : <span className="badge b-info">Disabled</span>}{r.draftCount > 0 && <div className="mt-1"><span className="badge b-medium">{r.draftCount} draft</span></div>}</td>
                  <td>v{r.currentVersion}<div className="muted text-xs">reviewed <Time value={r.lastReviewedAt} /></div></td>
                  <td className="text-sm">{r.alertCount}{r.benignCount > 0 && <div className="muted text-xs">{r.benignCount} judged benign</div>}</td>
                  <td className="text-sm">{r.lastTest ? <>TP {r.lastTest.tp} · FP {r.lastTest.fp} · missed {r.lastTest.fn}<div className="muted text-xs">v{r.lastTest.version} · <Time value={r.lastTest.runAt} /></div></> : <span className="muted">never tested</span>}</td>
                  <td className="text-sm">{r.attackTechniques.length ? r.attackTechniques.join(', ') : <span className="muted">none asserted</span>}</td>
                </tr>))}</tbody></table></div>
          )}
        </Async>
      </Card>
    </>
  )
}
