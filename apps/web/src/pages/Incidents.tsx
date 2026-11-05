import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, qs } from '../api/client'
import type { IncidentRow, Page } from '../api/types'
import { Async, Card, EmptyState, Field, PageHeader, Pagination, SeverityBadge, StatusBadge, SyntheticBadge, Time } from '../components/ui'
import { FilterBar } from '../components/domain'

const STATUSES = ['NEW', 'TRIAGE', 'INVESTIGATING', 'CONTAINMENT_PROPOSED', 'CONTAINED', 'RECOVERY', 'RESOLVED', 'CLOSED']

export function Incidents() {
  const [sp, setSp] = useSearchParams()
  const page = Number(sp.get('page') ?? 0)
  const f = { status: sp.get('status') ?? '', assignee: sp.get('assignee') ?? '', q: sp.get('q') ?? '', openOnly: sp.get('openOnly') ?? '' }
  const q = useQuery({ queryKey: ['incidents', f, page], queryFn: () => api<Page<IncidentRow>>('/api/incidents' + qs({ ...f, page, size: 25 })), placeholderData: (p) => p })
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ username: string; enabled: boolean }[]>('/api/users') })
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }) }
  return (
    <>
      <PageHeader title="Cases" subtitle="Incidents under investigation. A case collects the alerts, evidence, notes and decisions for one problem, so anyone can pick it up." />
      <Card pad={false}>
        <FilterBar>
          <div className="min-w-[200px] flex-1"><Field label="Search" htmlFor="i-q"><input id="i-q" className="input" placeholder="Title or summary" defaultValue={f.q} onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value) }} onBlur={(e) => { if (e.target.value !== f.q) set('q', e.target.value) }} /></Field></div>
          <Field label="Stage" htmlFor="i-st">
            <select id="i-st" className="select" value={f.openOnly ? 'OPEN' : f.status} onChange={(e) => { const v = e.target.value; const n = new URLSearchParams(sp); n.delete('page'); n.delete('status'); n.delete('openOnly'); if (v === 'OPEN') n.set('openOnly', 'true'); else if (v) n.set('status', v); setSp(n, { replace: true }) }}>
              <option value="">All</option><option value="OPEN">Open</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}
            </select>
          </Field>
          <Field label="Owner" htmlFor="i-ow"><select id="i-ow" className="select" value={f.assignee} onChange={(e) => set('assignee', e.target.value)}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{users.data?.filter((u) => u.enabled).map((u) => <option key={u.username}>{u.username}</option>)}</select></Field>
          {sp.toString() && <button className="btn btn-ghost" onClick={() => setSp({}, { replace: true })}>Clear filters</button>}
        </FilterBar>
        <Async q={q} rows={6} empty={(d) => d.items.length === 0 ? <EmptyState title="No cases">Create one from an alert you want to investigate properly, or from events you found while hunting.</EmptyState> : null}>
          {(d) => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Cases</caption>
                  <thead><tr><th scope="col">Case</th><th scope="col">Severity</th><th scope="col">Stage</th><th scope="col">Owner</th><th scope="col">Work left</th><th scope="col">Updated</th></tr></thead>
                  <tbody>
                    {d.items.map((i) => (
                      <tr key={i.id}>
                        <td className="max-w-[380px]"><Link className="row-link" to={`/app/incidents/${i.id}`}>#{i.id} {i.title}</Link><div className="mt-1 flex gap-1.5">{i.synthetic && <SyntheticBadge />}<span className="badge b-info">P{i.priority}</span></div></td>
                        <td><SeverityBadge severity={i.severity} /></td>
                        <td><StatusBadge status={i.status} />{i.resolution && <div className="muted mt-1 text-xs">{i.resolution.replace(/_/g, ' ').toLowerCase()}</div>}</td>
                        <td className="text-sm">{i.assignee ?? <span className="muted">unassigned</span>}</td>
                        <td className="text-sm">{i.alertCount} alert(s)<div className="muted text-xs">{i.openTasks} open task(s)</div></td>
                        <td className="whitespace-nowrap"><Time value={i.updatedAt} /></td>
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
    </>
  )
}
