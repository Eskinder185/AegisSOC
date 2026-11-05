import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, UserPlus } from 'lucide-react'
import { api, qs } from '../api/client'
import type { AlertRow, Page } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Card, EmptyState, Field, Modal, PageHeader, Pagination, SeverityBadge, StatusBadge, SyntheticBadge, Time, useToast, errMessage } from '../components/ui'
import { FilterBar } from '../components/domain'

export const RESOLUTIONS = [
  ['TRUE_POSITIVE', 'True positive: real malicious or policy-violating activity'],
  ['FALSE_POSITIVE', 'False positive: the rule fired on benign activity'],
  ['BENIGN_ADMIN_ACTIVITY', 'Benign: expected administrator activity'],
  ['TEST_ACTIVITY', 'Expected test or lab activity'],
  ['INCONCLUSIVE', 'Inconclusive: not enough evidence either way'],
] as const

const STATUSES = ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED', 'SUPPRESSED', 'CLOSED']

export function Alerts() {
  const [sp, setSp] = useSearchParams()
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<number[]>([])
  const [closeOpen, setCloseOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [resolution, setResolution] = useState('FALSE_POSITIVE')
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState('')

  const page = Number(sp.get('page') ?? 0)
  const filters = { status: sp.get('status') ?? '', severity: sp.get('severity') ?? '', rule: sp.get('rule') ?? '', assignee: sp.get('assignee') ?? '', q: sp.get('q') ?? '', openOnly: sp.get('openOnly') ?? '' }
  const q = useQuery({ queryKey: ['alerts', filters, page], queryFn: () => api<Page<AlertRow>>('/api/alerts' + qs({ ...filters, page, size: 25 })), placeholderData: (p) => p })
  const rules = useQuery({ queryKey: ['rules-min'], queryFn: () => api<{ id: string; name: string }[]>('/api/rules') })
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ username: string; displayName: string; enabled: boolean }[]>('/api/users') })

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    if (k !== 'page') n.delete('page')
    setSp(n, { replace: true })
    setSelected([])
  }

  const bulk = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ updated: number; skipped: { id: number; reason: string }[] }>('/api/alerts/bulk', { method: 'POST', body: { ids: selected, ...body } }),
    onSuccess: (r) => {
      toast.push(r.skipped.length ? 'info' : 'ok', `${r.updated} alert(s) updated.${r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped[0].reason}` : ''}`)
      setSelected([]); setCloseOpen(false); setAssignOpen(false); setNote('')
      void qc.invalidateQueries({ queryKey: ['alerts'] }); void qc.invalidateQueries({ queryKey: ['overview'] })
    },
    onError: (e) => toast.push('danger', errMessage(e)),
  })

  const items = q.data?.items ?? []
  const allOnPage = items.length > 0 && items.every((a) => selected.includes(a.id))

  return (
    <>
      <PageHeader title="Alerts" subtitle="Detections waiting for a human decision. Open one to see exactly why it fired and which stored events back it." />
      <Card pad={false}>
        <FilterBar>
          <div className="min-w-[200px] flex-1"><Field label="Search" htmlFor="f-q"><input id="f-q" className="input" placeholder="Title, host, user or IP" defaultValue={filters.q} onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value) }} onBlur={(e) => { if (e.target.value !== filters.q) set('q', e.target.value) }} /></Field></div>
          <Field label="Status" htmlFor="f-status">
            <select id="f-status" className="select" value={filters.openOnly ? 'OPEN' : filters.status} onChange={(e) => { const v = e.target.value; const n = new URLSearchParams(sp); n.delete('page'); n.delete('status'); n.delete('openOnly'); if (v === 'OPEN') n.set('openOnly', 'true'); else if (v) n.set('status', v); setSp(n, { replace: true }); setSelected([]) }}>
              <option value="">All</option><option value="OPEN">Open (needs work)</option>{STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
            </select>
          </Field>
          <Field label="Severity" htmlFor="f-sev">
            <select id="f-sev" className="select" value={filters.severity} onChange={(e) => set('severity', e.target.value)}><option value="">All</option>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Rule" htmlFor="f-rule">
            <select id="f-rule" className="select" value={filters.rule} onChange={(e) => set('rule', e.target.value)}><option value="">All rules</option>{rules.data?.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}</select>
          </Field>
          <Field label="Owner" htmlFor="f-owner">
            <select id="f-owner" className="select" value={filters.assignee} onChange={(e) => set('assignee', e.target.value)}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{users.data?.filter((u) => u.enabled).map((u) => <option key={u.username} value={u.username}>{u.username}</option>)}</select>
          </Field>
          {(sp.toString() !== '') && <button className="btn btn-ghost" onClick={() => { setSp({}, { replace: true }); setSelected([]) }}>Clear filters</button>}
        </FilterBar>

        {selected.length > 0 && can('ANALYST') && (
          <div className="flex flex-wrap items-center gap-2 border-y border-[var(--line)] bg-[var(--accent-soft)] px-5 py-2.5" role="region" aria-label="Bulk actions">
            <strong className="text-sm">{selected.length} selected</strong>
            <button className="btn btn-sm" onClick={() => bulk.mutate({ action: 'acknowledge', note: 'Bulk acknowledge' })}><CheckCheck size={15} aria-hidden="true" /> Acknowledge</button>
            <button className="btn btn-sm" onClick={() => setAssignOpen(true)}><UserPlus size={15} aria-hidden="true" /> Assign</button>
            <button className="btn btn-sm" onClick={() => setCloseOpen(true)}>Close…</button>
            <span className="muted text-xs">Closing high or critical alerts in bulk requires an incident lead.</span>
          </div>
        )}

        <Async q={q} rows={8} empty={(d) => d.items.length === 0 ? <EmptyState title="No alerts match" action={sp.toString() ? <button className="btn" onClick={() => setSp({}, { replace: true })}>Clear filters</button> : undefined}>{sp.toString() ? 'Try widening the filters.' : 'Run the safe demo from the Overview, or ingest data on the Data sources page, to generate alerts.'}</EmptyState> : null}>
          {(d) => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Alerts, sorted by need for attention</caption>
                  <thead>
                    <tr>
                      {can('ANALYST') && <th scope="col" className="w-10"><input type="checkbox" aria-label="Select all alerts on this page" checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? items.map((a) => a.id) : [])} /></th>}
                      <th scope="col">Alert</th><th scope="col">Severity</th><th scope="col">Status</th><th scope="col">Entity</th><th scope="col">Last event</th><th scope="col">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((a) => (
                      <tr key={a.id}>
                        {can('ANALYST') && <td><input type="checkbox" aria-label={`Select alert ${a.id}`} checked={selected.includes(a.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id))} /></td>}
                        <td className="max-w-[360px]">
                          <Link className="row-link" to={`/app/alerts/${a.id}`}>{a.title}</Link>
                          <div className="muted mt-0.5 text-xs">{a.ruleId} v{a.ruleVersion} · {a.eventCount} events</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">{a.hypothesis && <span className="badge b-medium">Hypothesis</span>}{a.synthetic && <SyntheticBadge />}{a.incidentId && <Link to={`/app/incidents/${a.incidentId}`} className="badge b-info no-underline">Case #{a.incidentId}</Link>}</div>
                        </td>
                        <td><SeverityBadge severity={a.severity} /><div className="muted mt-1 text-xs">{a.confidence.toLowerCase()} confidence</div></td>
                        <td><StatusBadge status={a.status} />{a.status === 'SUPPRESSED' && a.suppressedUntil && <div className="muted mt-1 text-xs">until <Time value={a.suppressedUntil} /></div>}</td>
                        <td className="text-sm">{a.host ?? '—'}<div className="muted text-xs">{[a.username, a.ip].filter(Boolean).join(' · ')}</div></td>
                        <td className="whitespace-nowrap"><Time value={a.lastEventAt} /></td>
                        <td className="text-sm">{a.assignee ?? <span className="muted">unassigned</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={d.page} size={d.size} total={d.total} onPage={(p) => set('page', String(p))} />
            </>
          )}
        </Async>
      </Card>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title={`Close ${selected.length} alert(s)`}
        footer={<><button className="btn" onClick={() => setCloseOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!note.trim() || bulk.isPending} onClick={() => bulk.mutate({ action: 'close', resolution, note })}>Close alerts</button></>}>
        <div className="space-y-4">
          <Field label="Resolution" htmlFor="b-res"><select id="b-res" className="select" value={resolution} onChange={(e) => setResolution(e.target.value)}>{RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Why? (required, kept in the audit trail)" htmlFor="b-note"><textarea id="b-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Modal>
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={`Assign ${selected.length} alert(s)`}
        footer={<><button className="btn" onClick={() => setAssignOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!assignee || bulk.isPending} onClick={() => bulk.mutate({ action: 'assign', assignee })}>Assign</button></>}>
        <Field label="Assign to" htmlFor="b-as"><select id="b-as" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Choose a person</option>{users.data?.filter((u) => u.enabled).map((u) => <option key={u.username} value={u.username}>{u.displayName}</option>)}</select></Field>
      </Modal>
    </>
  )
}
