import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Plug, PlugZap } from 'lucide-react'
import { api } from '../api/client'
import type { RunRow, SourceRow } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, Modal, PageHeader, StatusBadge, SyntheticBadge, Time, KeyValue, useToast, errMessage, Spinner } from '../components/ui'

const STATUS_TEXT: Record<string, string> = {
  LOCAL_FIXTURE: 'Local — works offline', HISTORICALLY_REPORTED: 'Historically reported (unverified)', PLANNED: 'Planned — not implemented', UNCERTAIN: 'Uncertain / conflicting', VERIFIED_LIVE: 'Verified live', RETIRED: 'Retired',
}

export function Sources() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [synthetic, setSynthetic] = useState(true)
  const [runId, setRunId] = useState<number | null>(null)
  const [testing, setTesting] = useState<number | null>(null)
  const q = useQuery({ queryKey: ['sources'], queryFn: () => api<SourceRow[]>('/api/sources'), refetchInterval: 15_000 })
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api<RunRow[]>('/api/ingestion/runs?limit=15'), refetchInterval: 8_000 })
  const run = useQuery({ queryKey: ['run', runId], queryFn: () => api<RunRow>(`/api/ingestion/runs/${runId}`), enabled: runId !== null })
  const refresh = () => void qc.invalidateQueries()

  const upload = useMutation({
    mutationFn: async (f: File) => { const fd = new FormData(); fd.append('file', f); fd.append('synthetic', String(synthetic)); return api<RunRow>('/api/ingest/suricata', { method: 'POST', body: fd }) },
    onSuccess: (r) => { toast.push(r.status === 'SUCCEEDED' ? 'ok' : 'info', `Import ${r.status.toLowerCase()}: ${r.eventsAccepted} stored, ${r.eventsRejected} rejected, ${r.alertsCreated} alert(s).`); setRunId(r.id); refresh(); if (file.current) file.current.value = '' },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  const setEnabled = useMutation({ mutationFn: (p: { id: number; enabled: boolean }) => api(`/api/sources/${p.id}`, { method: 'PATCH', body: { enabled: p.enabled } }), onSuccess: refresh, onError: (e) => toast.push('danger', errMessage(e)) })
  async function test(id: number) {
    setTesting(id)
    try { const r = await api<{ result: string; networkAttempted: boolean }>(`/api/sources/${id}/test`, { method: 'POST' }); toast.push('info', r.result); refresh() } catch (e) { toast.push('danger', errMessage(e)) } finally { setTesting(null) }
  }

  return (
    <>
      <PageHeader title="Data sources" subtitle="Where telemetry comes from, whether it is healthy, and what is — and is not — connected. A source becomes healthy only after a successful ingestion, never because a setting says so." />
      <Banner kind="info" title="Nothing here connects to your network">Wazuh, cloud, AegisAI and NetShield adapters are defined but disabled. Their cards say exactly what is missing. Local files and the built-in synthetic fixtures work with no external service.</Banner>
      <div className="mt-6 space-y-4">
        <Async q={q} rows={5}>
          {(d) => d.map((s) => (
            <Card key={s.id} id={`src-${s.id}`} title={s.sourceType.replace(/_/g, ' ')} actions={<StatusBadge status={s.health} />}>
              <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <h3 className="h-section flex flex-wrap items-center gap-2">{s.name} {s.synthetic && <SyntheticBadge />}</h3>
                  <p className="muted mt-1 text-sm">{s.description}</p>
                  {s.lastError && <div className="mt-3"><Banner kind="danger" title="Last problem">{s.lastError}</Banner></div>}
                </div>
                <KeyValue rows={[
                  { k: 'Integration status', v: STATUS_TEXT[s.integrationStatus] ?? s.integrationStatus },
                  { k: 'Direction', v: s.direction.replace('_', ' ').toLowerCase() },
                  { k: 'Last successful ingest', v: s.lastSuccessAt ? <Time value={s.lastSuccessAt} /> : 'never' },
                  { k: 'Events stored', v: s.eventCount.toLocaleString() },
                  { k: 'Expected every', v: s.expectedIntervalSec >= 3600 ? `${Math.round(s.expectedIntervalSec / 3600)} h` : `${Math.round(s.expectedIntervalSec / 60)} min` },
                  { k: 'Data sensitivity', v: s.sensitivity.toLowerCase() },
                ]} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                {can('ANALYST') && <button className="btn btn-sm" onClick={() => test(s.id)} disabled={testing === s.id}>{testing === s.id ? <Spinner label="Testing" /> : <Plug size={14} aria-hidden="true" />} Test configuration</button>}
                {can('ADMIN') && (s.sourceType === 'wazuh' ? <span className="muted text-xs">Cannot be enabled in this build.</span> : <button className="btn btn-sm" onClick={() => setEnabled.mutate({ id: s.id, enabled: !s.enabled })}>{s.enabled ? 'Disable' : 'Enable'}</button>)}
                {s.sourceType === 'suricata_eve' && s.enabled && can('ANALYST') && (
                  <div className="ml-auto flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} /> This file is synthetic test data</label>
                    <input ref={file} type="file" accept=".json,.jsonl,.ndjson,.log" className="sr-only" id="eve-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f) }} />
                    <label htmlFor="eve-file" className={`btn btn-sm btn-primary cursor-pointer ${upload.isPending ? 'opacity-60' : ''}`}>{upload.isPending ? <Spinner label="Uploading" /> : <Upload size={14} aria-hidden="true" />} Import EVE JSON file</label>
                  </div>)}
                {!s.enabled && s.sourceType !== 'wazuh' && <span className="muted flex items-center gap-1 text-xs"><PlugZap size={13} aria-hidden="true" /> Disabled · no connection configured</span>}
              </div>
              {s.sourceType === 'suricata_eve' && <p className="muted mt-2 text-xs">Limits: 2 MB, 5,000 events, nesting depth 12. Unsupported or malformed lines are rejected individually and reported below.</p>}
            </Card>
          ))}
        </Async>
      </div>

      <Card title="Ingestion runs" id="runs" pad={false} className="mt-8">
        <Async q={runs} rows={4} empty={(d) => d.length === 0 ? <p className="muted p-5 text-sm">No runs yet.</p> : null}>
          {(d) => (
            <div className="table-wrap"><table className="table"><caption className="sr-only">Recent ingestion runs</caption>
              <thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col">Stored</th><th scope="col">Duplicates</th><th scope="col">Rejected</th><th scope="col">Alerts</th><th scope="col">When</th></tr></thead>
              <tbody>{d.map((r) => (
                <tr key={r.id}>
                  <td><button className="row-link text-left" onClick={() => setRunId(r.id)}>#{r.id} {r.scenario ?? r.sourceName}</button> {r.synthetic && <SyntheticBadge />}</td>
                  <td><StatusBadge status={r.status} />{r.errorSummary && <div className="muted mt-1 max-w-[220px] text-xs">{r.errorSummary}</div>}</td>
                  <td className="tabular-nums">{r.eventsAccepted}</td><td className="tabular-nums">{r.eventsDuplicate}</td><td className={`tabular-nums ${r.eventsRejected ? 'font-bold text-[var(--crit-fg)]' : ''}`}>{r.eventsRejected}</td><td className="tabular-nums">{r.alertsCreated}</td><td><Time value={r.finishedAt ?? r.startedAt} /></td>
                </tr>))}</tbody></table></div>
          )}
        </Async>
      </Card>

      <Modal open={runId !== null} onClose={() => setRunId(null)} drawer title={`Run #${runId ?? ''}`}>
        <Async q={run} rows={3}>
          {(r) => (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} />{r.synthetic && <SyntheticBadge />}</div>
              <KeyValue rows={[{ k: 'Source', v: r.sourceName }, { k: 'Scenario / file', v: r.scenario ?? '—' }, { k: 'Received', v: r.eventsReceived }, { k: 'Stored', v: r.eventsAccepted }, { k: 'Duplicates skipped', v: r.eventsDuplicate }, { k: 'Rejected', v: r.eventsRejected }, { k: 'Alerts raised', v: r.alertsCreated }]} />
              {r.errorSummary && <Banner kind="danger" title="Problem">{r.errorSummary}</Banner>}
              {r.errors && r.errors.length > 0 && (
                <div><h3 className="card-title mb-1">Row-level errors</h3>
                  <p className="muted mb-2 text-sm"><strong>What to do:</strong> fix or remove the listed rows in the source file, then import again. Rows that were stored will be skipped as duplicates. The source returns to healthy only after a run succeeds.</p>
                  <table className="table"><caption className="sr-only">Rows that were rejected</caption><thead><tr><th scope="col">Row</th><th scope="col">Reason</th></tr></thead><tbody>{r.errors.map((e) => <tr key={e.rowNo}><td className="tabular-nums">{e.rowNo}</td><td>{e.message}</td></tr>)}</tbody></table></div>
              )}
            </div>
          )}
        </Async>
      </Modal>
    </>
  )
}
