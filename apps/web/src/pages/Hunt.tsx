import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Download, Save, Search, Crosshair } from 'lucide-react'
import { api, download, qs } from '../api/client'
import type { EventRow } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Banner, Bars, Card, EmptyState, Field, Modal, PageHeader, Pagination, SeverityBadge, SyntheticBadge, Tabs, Time, useToast, errMessage, AbsTime } from '../components/ui'
import { EventChip, EventDrawer } from '../components/domain'

interface SearchRes { items: EventRow[]; total: number; page: number; size: number; histogram: { bucket: number; count: number }[]; rangeFrom: string; rangeTo: string; elapsedMs: number }
type Facets = Record<string, { value: string; count: number }[]>
interface Notebook { id: number; title: string; hypothesis: string; steps: { query?: Record<string, string>; finding?: string }[]; outcome?: string; owner: string; incidentId?: number; updatedAt: string }
interface Pivot { type: string; value: string; center: string; windowMinutes: number; events: EventRow[]; alerts: { id: number; title: string; severity: string; status: string }[]; truncated: boolean }

const RANGES: [string, string, number][] = [['1h', 'Last hour', 3600], ['24h', 'Last 24 hours', 86400], ['7d', 'Last 7 days', 7 * 86400], ['31d', 'Last 31 days (max)', 31 * 86400 - 3600]]
const FILTER_KEYS = ['q', 'host', 'user', 'ip', 'domain', 'eventClass', 'outcome', 'severityMin', 'range'] as const

export function Hunt() {
  const [sp, setSp] = useSearchParams()
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [tab, setTab] = useState<'search' | 'saved' | 'notebooks'>('search')
  const [eventId, setEventId] = useState<number | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [nbOpen, setNbOpen] = useState(false)
  const [nb, setNb] = useState({ title: '', hypothesis: '', outcome: '', incidentId: '' })
  const [steps, setSteps] = useState<{ query: Record<string, string>; finding: string }[]>([])
  const [redact, setRedact] = useState(true)

  const f: Record<string, string> = {}
  FILTER_KEYS.forEach((k) => { const v = sp.get(k); if (v) f[k] = v })
  const range = RANGES.find((r) => r[0] === (f.range ?? '7d')) ?? RANGES[2]
  const page = Number(sp.get('page') ?? 0)
  const pivotType = sp.get('pivotType'), pivotValue = sp.get('pivotValue')
  const [draft, setDraft] = useState<Record<string, string>>(f)

  const apiParams = useMemo(() => {
    const { range: _r, ...rest } = f
    void _r
    const now = Date.now()
    return { ...rest, from: new Date(now - range[2] * 1000).toISOString(), to: new Date(now + 3600_000).toISOString() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp])

  const res = useQuery({ queryKey: ['events', apiParams, page], queryFn: () => api<SearchRes>('/api/events' + qs({ ...apiParams, page, size: 50 })), placeholderData: (p) => p })
  const facets = useQuery({ queryKey: ['facets', apiParams], queryFn: () => api<Facets>('/api/events/facets' + qs(apiParams)) })
  const saved = useQuery({ queryKey: ['saved-searches'], queryFn: () => api<{ id: number; name: string; filter: Record<string, string>; owner: string; createdAt: string }[]>('/api/hunt/searches'), enabled: tab === 'saved' })
  const nbs = useQuery({ queryKey: ['notebooks'], queryFn: () => api<Notebook[]>('/api/hunt/notebooks'), enabled: tab === 'notebooks' })
  const pivot = useQuery({ queryKey: ['pivot', pivotType, pivotValue], queryFn: () => api<Pivot>('/api/pivot' + qs({ type: pivotType, value: pivotValue, minutes: 60 })), enabled: !!pivotType && !!pivotValue })

  const apply = (next: Record<string, string>) => {
    const n = new URLSearchParams()
    Object.entries(next).forEach(([k, v]) => { if (v) n.set(k, v) })
    setSp(n, { replace: true })
  }
  const addFacet = (k: string, v: string) => { const next = { ...f, [k]: v }; setDraft(next); apply(next) }

  const saveSearch = useMutation({
    mutationFn: () => api('/api/hunt/searches', { method: 'POST', body: { name: saveName, filter: Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'range')) } }),
    onSuccess: () => { toast.push('ok', 'Search saved.'); setSaveOpen(false); setSaveName(''); void qc.invalidateQueries({ queryKey: ['saved-searches'] }) },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  const saveNb = useMutation({
    mutationFn: () => api('/api/hunt/notebooks', { method: 'POST', body: { title: nb.title, hypothesis: nb.hypothesis, outcome: nb.outcome || undefined, steps, incidentId: nb.incidentId ? Number(nb.incidentId) : undefined } }),
    onSuccess: () => { toast.push('ok', 'Notebook saved.'); setNbOpen(false); setSteps([]); setNb({ title: '', hypothesis: '', outcome: '', incidentId: '' }); void qc.invalidateQueries({ queryKey: ['notebooks'] }); setTab('notebooks') },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  async function exportCsv() {
    try {
      const r = await download('/api/events/export' + qs({ ...apiParams, redact }), 'events-export.csv')
      toast.push('ok', `Exported ${r.name} (${redact ? 'redacted' : 'unredacted'}). The export is audited.`)
    } catch (e) { toast.push('danger', errMessage(e)) }
  }

  const activeCount = Object.keys(f).filter((k) => k !== 'range').length

  return (
    <>
      <PageHeader title="Hunt" subtitle="Search stored security events with guard rails: every filter is allow-listed, results are paginated, and the time range is capped at 31 days. There is no free-form query box by design." />
      <Tabs label="Hunt views" value={tab} onChange={(t) => setTab(t as typeof tab)} tabs={[{ id: 'search', label: 'Search & pivot' }, { id: 'saved', label: 'Saved searches' }, { id: 'notebooks', label: 'Hunt notebooks' }]} />
      <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'search' && (
          <div className="space-y-6">
            {pivotType && pivotValue && (
              <Card title={<span className="inline-flex items-center gap-1.5"><Crosshair size={14} aria-hidden="true" /> Pivot: {pivotType} = <span className="mono">{pivotValue}</span></span>} id="pivot" actions={<button className="btn btn-sm" onClick={() => { const n = new URLSearchParams(sp); n.delete('pivotType'); n.delete('pivotValue'); setSp(n, { replace: true }) }}>Close pivot</button>}>
                <Async q={pivot} rows={3}>
                  {(p) => (
                    <div className="space-y-3">
                      <p className="muted text-sm">Showing activity within ±{p.windowMinutes} minutes of <AbsTime value={p.center} /> (that entity&apos;s newest event){p.truncated && ' — truncated to 500 rows'}.</p>
                      {p.alerts.length > 0 && <div className="flex flex-wrap gap-2 text-sm"><span className="muted">Related alerts:</span>{p.alerts.map((a) => <Link key={a.id} to={`/app/alerts/${a.id}`} className="inline-flex items-center gap-1.5 no-underline"><SeverityBadge severity={a.severity} /><span className="underline">#{a.id}</span></Link>)}</div>}
                      <div className="table-wrap max-h-[360px] overflow-y-auto">
                        <table className="table"><caption className="sr-only">Events around the pivot entity</caption>
                          <thead><tr><th scope="col">Event</th><th scope="col">Time</th><th scope="col">What</th><th scope="col">Host / user</th></tr></thead>
                          <tbody>{p.events.map((e) => <tr key={e.id}><td><EventChip id={e.id} onOpen={setEventId} /></td><td className="whitespace-nowrap"><Time value={e.ts} /></td><td>{e.message}</td><td className="text-sm">{e.host ?? '—'} <span className="muted">{e.username}</span></td></tr>)}</tbody></table>
                      </div>
                    </div>
                  )}
                </Async>
              </Card>
            )}

            <Card pad={false}>
              <form className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4" role="search" onSubmit={(e) => { e.preventDefault(); apply(draft) }}>
                <Field label="Text" htmlFor="h-q" hint="Words in message, user, host or command"><input id="h-q" className="input" maxLength={100} value={draft.q ?? ''} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></Field>
                <Field label="Host" htmlFor="h-host"><input id="h-host" className="input" value={draft.host ?? ''} onChange={(e) => setDraft({ ...draft, host: e.target.value })} /></Field>
                <Field label="User" htmlFor="h-user"><input id="h-user" className="input" value={draft.user ?? ''} onChange={(e) => setDraft({ ...draft, user: e.target.value })} /></Field>
                <Field label="IP address" htmlFor="h-ip"><input id="h-ip" className="input" value={draft.ip ?? ''} onChange={(e) => setDraft({ ...draft, ip: e.target.value })} /></Field>
                <Field label="Event type" htmlFor="h-cls"><select id="h-cls" className="select" value={draft.eventClass ?? ''} onChange={(e) => setDraft({ ...draft, eventClass: e.target.value })}><option value="">Any</option>{['authentication', 'process', 'network', 'dns', 'http', 'firewall', 'ids', 'privilege', 'service', 'system', 'audit'].map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Outcome" htmlFor="h-out"><select id="h-out" className="select" value={draft.outcome ?? ''} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}><option value="">Any</option><option>success</option><option>failure</option></select></Field>
                <Field label="Minimum severity (0–10)" htmlFor="h-sev"><input id="h-sev" className="input" type="number" min={0} max={10} value={draft.severityMin ?? ''} onChange={(e) => setDraft({ ...draft, severityMin: e.target.value })} /></Field>
                <Field label="Time range" htmlFor="h-range"><select id="h-range" className="select" value={draft.range ?? '7d'} onChange={(e) => setDraft({ ...draft, range: e.target.value })}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                  <button className="btn btn-primary" type="submit"><Search size={16} aria-hidden="true" /> Search</button>
                  <button className="btn" type="button" onClick={() => { setDraft({}); apply({}) }}>Reset</button>
                  {can('ANALYST') && <button className="btn" type="button" onClick={() => setSaveOpen(true)}><Save size={16} aria-hidden="true" /> Save search</button>}
                  {can('ANALYST') && <button className="btn" type="button" onClick={() => { setSteps([{ query: f, finding: '' }]); setNbOpen(true) }}><BookOpen size={16} aria-hidden="true" /> Start notebook from this</button>}
                  {can('ANALYST') && <div className="ml-auto flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} /> Redact</label><button className="btn" type="button" onClick={exportCsv}><Download size={16} aria-hidden="true" /> Export CSV</button></div>}
                </div>
              </form>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
              <Card title={res.data ? `${res.data.total.toLocaleString()} events${activeCount ? ' matching' : ''}` : 'Events'} id="results" pad={false}
                actions={res.data && <span className="muted text-xs">{range[1]} · {res.data.elapsedMs} ms</span>}>
                <Async q={res} rows={8} empty={(d) => d.total === 0 ? <EmptyState title="No events match">Widen the time range or remove a filter. Remember that demo data is only a few hours old by default.</EmptyState> : null}>
                  {(d) => (
                    <>
                      <div className="border-b border-[var(--line)] px-5 py-3">
                        <Bars label="Events over the selected range (24 buckets)" valueLabel="Events" height={60} data={Array.from({ length: 24 }, (_, i) => ({ label: `bucket ${i + 1}`, value: d.histogram.find((h) => h.bucket === i + 1)?.count ?? 0 }))} />
                      </div>
                      <div className="table-wrap">
                        <table className="table">
                          <caption className="sr-only">Matching events, newest first</caption>
                          <thead><tr><th scope="col">Event</th><th scope="col">Time</th><th scope="col">What was recorded</th><th scope="col">Host</th><th scope="col">User</th><th scope="col">IP</th></tr></thead>
                          <tbody>{d.items.map((e) => (
                            <tr key={e.id}>
                              <td><EventChip id={e.id} onOpen={setEventId} /></td>
                              <td className="whitespace-nowrap"><Time value={e.ts} /></td>
                              <td className="max-w-[360px]"><span className="break-words">{e.message}</span><div className="mt-1 flex gap-1.5"><span className="badge b-info">{e.eventClass}</span>{e.outcome === 'failure' && <span className="badge b-high">failure</span>}{e.synthetic && <SyntheticBadge />}</div></td>
                              <td className="text-sm">{e.host ? <Link to={`/app/hunt?pivotType=host&pivotValue=${encodeURIComponent(e.host)}`} className="underline">{e.host}</Link> : '—'}</td>
                              <td className="text-sm">{e.username ? <Link to={`/app/hunt?pivotType=user&pivotValue=${encodeURIComponent(e.username)}`} className="underline">{e.username}</Link> : '—'}</td>
                              <td className="text-sm">{e.srcIp ? <Link to={`/app/hunt?pivotType=ip&pivotValue=${encodeURIComponent(e.srcIp)}`} className="underline">{e.srcIp}</Link> : '—'}</td>
                            </tr>))}</tbody>
                        </table>
                      </div>
                      <Pagination page={d.page} size={d.size} total={d.total} onPage={(p) => { const n = new URLSearchParams(sp); n.set('page', String(p)); setSp(n, { replace: true }) }} />
                    </>
                  )}
                </Async>
              </Card>
              <aside aria-label="Filter by facet" className="space-y-4">
                {facets.data && Object.entries(facets.data).map(([k, rows]) => rows.length > 0 && (
                  <Card key={k} title={k === 'eventClass' ? 'Event type' : k} id={`facet-${k}`} pad={false}>
                    <ul className="py-1">{rows.map((r) => <li key={r.value}><button className="flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]" onClick={() => addFacet(k, r.value)}><span className="truncate">{r.value}</span><span className="muted tabular-nums">{r.count}</span></button></li>)}</ul>
                  </Card>
                ))}
              </aside>
            </div>
          </div>
        )}

        {tab === 'saved' && (
          <Card pad={false}>
            <Async q={saved} empty={(d) => d.length === 0 ? <EmptyState title="No saved searches">Run a search and press “Save search”. Saved searches store the filters only, never results.</EmptyState> : null}>
              {(d) => (
                <ul>{d.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0">
                    <div><div className="font-semibold">{s.name}</div><div className="muted text-xs">{Object.entries(s.filter).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' · ') || 'no filters'} · {s.owner}</div></div>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-primary" onClick={() => { setDraft(s.filter); apply(s.filter); setTab('search') }}>Run</button>
                      {can('ANALYST') && <button className="btn btn-sm" onClick={async () => { try { await api(`/api/hunt/searches/${s.id}`, { method: 'DELETE' }); void qc.invalidateQueries({ queryKey: ['saved-searches'] }) } catch (e) { toast.push('danger', errMessage(e)) } }}>Delete</button>}
                    </div>
                  </li>))}</ul>
              )}
            </Async>
          </Card>
        )}

        {tab === 'notebooks' && (
          <div className="space-y-4">
            <div className="flex justify-end">{can('ANALYST') && <button className="btn btn-primary" onClick={() => { setSteps([]); setNbOpen(true) }}><BookOpen size={16} aria-hidden="true" /> New notebook</button>}</div>
            <Async q={nbs} empty={(d) => d.length === 0 ? <Card><EmptyState title="No hunt notebooks yet">A notebook records a hypothesis, the searches you ran, what you found and the outcome, so a hunt can be repeated and reviewed.</EmptyState></Card> : null}>
              {(d) => d.map((n) => (
                <Card key={n.id} title={n.title} id={`nb-${n.id}`}>
                  <p className="text-sm"><strong>Hypothesis:</strong> {n.hypothesis}</p>
                  <ol className="mt-3 space-y-2 text-sm">{n.steps.map((s, i) => (
                    <li key={i} className="rounded-lg border border-[var(--line)] p-3"><span className="muted">Step {i + 1}:</span> <span className="mono">{Object.entries(s.query ?? {}).map(([k, v]) => `${k}=${v}`).join(' ') || 'all events'}</span>{s.finding && <p className="mt-1">→ {s.finding}</p>}
                      <div className="mt-2"><button className="btn btn-sm" onClick={() => { setDraft(s.query ?? {}); apply(s.query ?? {}); setTab('search') }}>Re-run</button></div></li>))}</ol>
                  {n.outcome && <p className="mt-3 text-sm"><strong>Outcome:</strong> {n.outcome}</p>}
                  <p className="muted mt-2 text-xs">{n.owner} · updated <Time value={n.updatedAt} />{n.incidentId && <> · linked to <Link className="underline" to={`/app/incidents/${n.incidentId}`}>case #{n.incidentId}</Link></>}</p>
                </Card>
              ))}
            </Async>
          </div>
        )}
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this search" footer={<><button className="btn" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!saveName.trim() || saveSearch.isPending} onClick={() => saveSearch.mutate()}>Save</button></>}>
        <Field label="Name" htmlFor="ss-name"><input id="ss-name" className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={100} /></Field>
      </Modal>
      <Modal open={nbOpen} onClose={() => setNbOpen(false)} title="Hunt notebook" footer={<><button className="btn" onClick={() => setNbOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!nb.title.trim() || !nb.hypothesis.trim() || saveNb.isPending} onClick={() => saveNb.mutate()}>Save notebook</button></>}>
        <div className="space-y-4">
          <Field label="Title" htmlFor="nb-t"><input id="nb-t" className="input" value={nb.title} onChange={(e) => setNb({ ...nb, title: e.target.value })} /></Field>
          <Field label="Hypothesis" htmlFor="nb-h" hint="What do you expect to find, and why?"><textarea id="nb-h" className="textarea" value={nb.hypothesis} onChange={(e) => setNb({ ...nb, hypothesis: e.target.value })} /></Field>
          {steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-[var(--line)] p-3 text-sm">
              <div className="muted mb-1">Step {i + 1}: <span className="mono">{Object.entries(s.query).map(([k, v]) => `${k}=${v}`).join(' ') || 'all events'}</span></div>
              <input aria-label={`Finding for step ${i + 1}`} className="input" placeholder="What did this show?" value={s.finding} onChange={(e) => setSteps(steps.map((x, j) => j === i ? { ...x, finding: e.target.value } : x))} />
            </div>
          ))}
          <button className="btn btn-sm" onClick={() => setSteps([...steps, { query: f, finding: '' }])}>Add current search as a step</button>
          <Field label="Outcome" htmlFor="nb-o"><textarea id="nb-o" className="textarea" value={nb.outcome} onChange={(e) => setNb({ ...nb, outcome: e.target.value })} /></Field>
          <Field label="Link to case # (optional)" htmlFor="nb-i"><input id="nb-i" className="input" type="number" value={nb.incidentId} onChange={(e) => setNb({ ...nb, incidentId: e.target.value })} /></Field>
        </div>
      </Modal>
      <EventDrawer id={eventId} onClose={() => setEventId(null)} />
      <div className="mt-6"><Banner kind="info">Searches only read stored data. Exports are limited to 1,000 rows, redacted by default, and recorded in the audit log.</Banner></div>
    </>
  )
}
