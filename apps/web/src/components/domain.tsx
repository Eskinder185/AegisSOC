import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bot, Link2, Search, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import type { AiResult, EventRow } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, CopyText, Modal, Spinner, SyntheticBadge, Time, AbsTime, useToast, errMessage, KeyValue } from './ui'

/* ------------------------------------------------------------------ event chip + drawer */
export function EventChip({ id, onOpen }: { id: number; onOpen: (id: number) => void }) {
  return (
    <button className="mono rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-xs font-semibold hover:border-[var(--accent)]" onClick={() => onOpen(id)} aria-label={`Open event ${id}`}>
      #{id}
    </button>
  )
}

interface EventDetail extends EventRow {
  originalTs?: string; parserVersion: string; ingestedAt: string; runId: number; sourceName: string; sourceType: string; raw: unknown; rawSha256: string; vendorRef?: string
  alerts: { id: number; title: string; severity: string }[]
}

export function EventDrawer({ id, onClose, incidentId }: { id: number | null; onClose: () => void; incidentId?: number }) {
  const q = useQuery({ queryKey: ['event', id], queryFn: () => api<EventDetail>(`/api/events/${id}`), enabled: id !== null })
  const { can } = useAuth()
  const toast = useToast()
  const [added, setAdded] = useState(false)
  const addEvidence = useMutation({
    mutationFn: () => api(`/api/incidents/${incidentId}/evidence`, { method: 'POST', body: { eventId: id, note: 'Added from event drawer' } }),
    onSuccess: () => { setAdded(true); toast.push('ok', `Event #${id} linked to the case.`) },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  const pivot = (k: string, v?: string) => (v ? <Link className="underline" to={`/app/hunt?pivotType=${k}&pivotValue=${encodeURIComponent(v)}`} onClick={onClose}>{v}</Link> : <span className="muted">—</span>)
  return (
    <Modal open={id !== null} onClose={onClose} drawer title={id ? `Event #${id}` : 'Event'} footer={incidentId && can('ANALYST') ? <button className="btn btn-primary" disabled={added || addEvidence.isPending} onClick={() => addEvidence.mutate()}><Link2 size={16} aria-hidden="true" />{added ? 'Linked' : 'Link to this case'}</button> : undefined}>
      <Async q={q}>
        {(e) => (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {e.synthetic ? <SyntheticBadge /> : <span className="badge b-info">Imported data</span>}
              <span className="badge b-info">{e.eventClass}</span>
              <span className="muted text-sm">from <strong>{e.sourceName}</strong> ({e.sourceType})</span>
            </div>
            <p className="rounded-lg bg-[var(--surface-2)] p-3 text-sm">{e.message}</p>
            <KeyValue rows={[
              { k: 'Time (UTC)', v: <AbsTime value={e.ts} /> },
              { k: 'Original timestamp', v: <span className="mono">{e.originalTs ?? '—'}</span> },
              { k: 'Action / outcome', v: `${e.action} / ${e.outcome ?? 'unknown'}` },
              { k: 'Host', v: pivot('host', e.host) },
              { k: 'User', v: pivot('user', e.username) },
              { k: 'Source IP', v: pivot('ip', e.srcIp) },
              { k: 'Destination', v: e.dstIp ? <>{pivot('ip', e.dstIp)}{e.dstPort ? `:${e.dstPort}` : ''}</> : '—' },
              { k: 'Domain', v: pivot('domain', e.domain) },
              { k: 'Process', v: e.processName ? <span className="mono">{e.parentProcess ? `${e.parentProcess} → ` : ''}{e.processName}</span> : '—' },
              { k: 'Command line', v: e.processCmdline ? <span className="mono break-all">{e.processCmdline}</span> : '—' },
              { k: 'Severity (0–10)', v: e.severity },
              { k: 'Ingested', v: <Time value={e.ingestedAt} /> },
              { k: 'Parser', v: <span className="mono">{e.parserVersion}</span> },
              { k: 'Ingestion run', v: `#${e.runId}` },
            ]} />
            {e.alerts.length > 0 && (
              <div><h3 className="card-title mb-1">Cited by alerts</h3>
                <ul className="space-y-1 text-sm">{e.alerts.map((a) => <li key={a.id}><Link className="underline" to={`/app/alerts/${a.id}`} onClick={onClose}>#{a.id} {a.title}</Link></li>)}</ul></div>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between"><h3 className="card-title">Original record (immutable)</h3><CopyText text={JSON.stringify(e.raw, null, 2)} /></div>
              <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs" tabIndex={0} aria-label="Raw event JSON">{JSON.stringify(e.raw, null, 2)}</pre>
              <p className="muted mt-1 text-xs">Shown as plain text. SHA-256 <span className="mono break-all">{e.rawSha256}</span></p>
            </div>
          </div>
        )}
      </Async>
    </Modal>
  )
}

export function EvidenceTable({ events, onOpen, caption }: { events: (EventRow & { role?: string; note?: string })[]; onOpen: (id: number) => void; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">Event</th><th scope="col">Time</th><th scope="col">What was recorded</th><th scope="col">Host / user</th><th scope="col">Address</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td><EventChip id={e.id} onOpen={onOpen} />{e.role === 'context' && <div className="muted mt-1 text-xs">follow-up</div>}</td>
              <td className="whitespace-nowrap"><Time value={e.ts} /></td>
              <td className="max-w-[420px]"><span className="break-words">{e.message}</span>{e.synthetic && <> <SyntheticBadge /></>}{e.note && <div className="muted text-xs">{e.note}</div>}</td>
              <td className="text-sm">{e.host ?? '—'}<div className="muted text-xs">{e.username ?? ''}</div></td>
              <td className="text-sm">{e.srcIp ?? '—'}{e.dstIp ? <span className="muted"> → {e.dstIp}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ AI analyst panel (deterministic first; AI optional) */
const TASKS: { id: string; label: string }[] = [
  { id: 'explain', label: 'Explain' }, { id: 'summary', label: 'Summarize' }, { id: 'next_steps', label: 'Next steps' }, { id: 'handoff', label: 'Handoff' },
  { id: 'attack', label: 'ATT&CK' }, { id: 'alternatives', label: 'Alternatives' }, { id: 'response_plan', label: 'Response draft' }, { id: 'rule_improvement', label: 'Rule ideas' },
]

export function AiPanel({ subjectType, subjectId, onOpenEvent }: { subjectType: 'alert' | 'incident'; subjectId: number; onOpenEvent: (id: number) => void }) {
  const { can } = useAuth()
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<{ effective: boolean; provider: string; enabledByAdmin: boolean; providerConfigured: boolean }>('/api/ai/status') })
  const [task, setTask] = useState('explain')
  const [useAi, setUseAi] = useState(false)
  const run = useMutation({
    mutationFn: () => api<AiResult>('/api/ai/analyze', { method: 'POST', body: { subjectType, subjectId, task, useAi } }),
  })
  const r = run.data
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Bot size={15} aria-hidden="true" /> AI analyst assistant</span>} id={`ai-${subjectType}`}>
      <p className="muted text-sm">Explanations below are built from stored evidence and rule metadata, so they work with no AI model at all.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose what to generate">
        {TASKS.map((t) => (
          <button key={t.id} className={`btn btn-sm ${task === t.id ? 'btn-primary' : ''}`} aria-pressed={task === t.id} onClick={() => setTask(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm" title={status.data?.effective ? '' : 'An administrator must configure and enable a model first'}>
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} disabled={!can('ANALYST')} />
          Also ask the AI model (opt-in){!status.data?.effective && <span className="muted"> — not available: {status.data?.providerConfigured ? 'disabled by admin' : 'no provider configured'}</span>}
        </label>
        <button className="btn btn-primary btn-sm" onClick={() => run.mutate()} disabled={run.isPending || !can('ANALYST')}>
          {run.isPending ? <Spinner label="Analyzing" /> : <Sparkles size={15} aria-hidden="true" />} Generate
        </button>
      </div>
      {run.isError && <div className="mt-4"><Banner kind="danger">{errMessage(run.error)}</Banner></div>}
      {r && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`badge ${r.mode === 'AI' ? 'b-medium' : r.mode === 'FALLBACK' ? 'b-high' : 'b-ok'}`}>{r.mode === 'AI' ? 'AI interpretation' : r.mode === 'FALLBACK' ? 'Fallback to deterministic' : 'Deterministic'}</span>
            <span className="muted">{r.label}</span>
          </div>
          {r.fallbackReason && <Banner kind="warn" title="AI was not used">{r.fallbackReason}</Banner>}
          {r.warnings.map((w, i) => <Banner key={i} kind="warn" title="Untrusted text detected">{w}</Banner>)}
          <div>
            <h3 className="h-section">{r.deterministic.title}</h3>
            {r.deterministic.sections.map((s) => (
              <div key={s.heading} className="mt-3">
                <h4 className="text-sm font-bold">{s.heading}</h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
                {s.eventIds.length > 0 && <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs"><span className="muted">Evidence:</span>{s.eventIds.slice(0, 12).map((id) => <EventChip key={id} id={id} onOpen={onOpenEvent} />)}</div>}
              </div>
            ))}
          </div>
          {r.ai && (
            <div className="rounded-xl border border-[var(--med-bd)] bg-[var(--med-bg)] p-4 text-[var(--med-fg)]">
              <div className="mb-2 flex items-center gap-2 font-bold"><Bot size={16} aria-hidden="true" /> AI generated — review before acting</div>
              <p className="text-sm">{r.ai.summary}</p>
              {r.ai.insufficientEvidence && <p className="mt-2 text-sm font-semibold">The model reports there is insufficient evidence to conclude.</p>}
              {r.ai.claims.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {r.ai.claims.map((c, i) => <li key={i}>{c.text} <span className="whitespace-nowrap">{c.eventIds.map((id) => <EventChip key={id} id={id} onOpen={onOpenEvent} />)}</span></li>)}
                </ul>
              )}
              {r.ai.nextSteps.length > 0 && <><h4 className="mt-3 text-sm font-bold">Suggested read-only steps</h4><ul className="list-disc pl-5 text-sm">{r.ai.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
              {r.ai.uncertainty.length > 0 && <><h4 className="mt-3 text-sm font-bold">Uncertainty</h4><ul className="list-disc pl-5 text-sm">{r.ai.uncertainty.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
              <p className="mt-3 text-xs">Provider {r.provider} · model {r.model} · {r.latencyMs} ms. Cited event numbers were verified against the evidence sent.</p>
            </div>
          )}
          <p className="muted text-xs">{r.deterministic.disclaimer}</p>
        </div>
      )}
    </Card>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 px-5 py-4" role="search">{children}</div>
}

export function HuntLink({ params, children }: { params: Record<string, string>; children: ReactNode }) {
  const qs = new URLSearchParams(params).toString()
  return <Link className="btn btn-sm" to={`/app/hunt?${qs}`}><Search size={14} aria-hidden="true" />{children}</Link>
}
