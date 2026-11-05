import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, EmptyState, Field, Modal, PageHeader, SyntheticBadge, Time, useToast, errMessage } from '../components/ui'
import { EventChip, EventDrawer } from '../components/domain'

interface Indicator { id: number; type: string; value: string; classification: string; confidence: string; source: string; description: string; firstSeen: string; expiresAt?: string; synthetic: boolean; expired: boolean; ageDays: number; matchCount: number }
interface Matches { indicator: { type: string; value: string; classification: string; confidence: string; source: string }; events: { id: number; ts: string; host?: string; username?: string; message: string }[]; limitations: string[] }

export function Intel() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [add, setAdd] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [eventId, setEventId] = useState<number | null>(null)
  const [f, setF] = useState({ type: 'domain', value: '', classification: 'suspicious', confidence: 'LOW', source: '', description: '', expiresInDays: '90' })
  const q = useQuery({ queryKey: ['indicators'], queryFn: () => api<Indicator[]>('/api/intel/indicators') })
  const matches = useQuery({ queryKey: ['ioc-matches', open], queryFn: () => api<Matches>(`/api/intel/indicators/${open}/matches`), enabled: open !== null })
  const create = useMutation({
    mutationFn: () => api('/api/intel/indicators', { method: 'POST', body: { ...f, expiresInDays: f.expiresInDays ? Number(f.expiresInDays) : undefined, synthetic: false } }),
    onSuccess: () => { toast.push('ok', 'Indicator stored as inert data. AegisSOC never fetches or visits it.'); setAdd(false); setF({ ...f, value: '', description: '' }); void qc.invalidateQueries({ queryKey: ['indicators'] }) },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  const expire = useMutation({ mutationFn: (id: number) => api(`/api/intel/indicators/${id}/expire`, { method: 'POST' }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['indicators'] }), onError: (e) => toast.push('danger', errMessage(e)) })

  return (
    <>
      <PageHeader title="Threat intelligence" subtitle="A small local registry of indicators with provenance and age. Matching is context for an analyst, never a verdict." actions={can('ANALYST') && <button className="btn btn-primary" onClick={() => setAdd(true)}><Plus size={16} aria-hidden="true" /> Add indicator</button>} />
      <div className="mb-5"><Banner kind="warn" title="Read indicators carefully">Unknown does not mean safe, and a listed indicator does not prove a local compromise. Indicators go stale and are sometimes shared infrastructure. Values are shown as text and are never opened, resolved or fetched.</Banner></div>
      <Card pad={false}>
        <Async q={q} empty={(d) => d.length === 0 ? <EmptyState title="No indicators" /> : null}>
          {(d) => (
            <div className="table-wrap"><table className="table"><caption className="sr-only">Indicators</caption>
              <thead><tr><th scope="col">Indicator</th><th scope="col">Classification</th><th scope="col">Confidence</th><th scope="col">Source & age</th><th scope="col">Seen in</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{d.map((i) => (
                <tr key={i.id}>
                  <td className="max-w-[300px]"><span className="badge b-info mr-1.5">{i.type}</span><span className="mono break-all">{i.value}</span><div className="mt-1 flex gap-1.5">{i.synthetic && <SyntheticBadge title="Synthetic test indicator: not a real threat" />}{i.expired && <span className="badge b-medium">Expired</span>}</div><p className="muted mt-1 text-xs">{i.description}</p></td>
                  <td>{i.classification === 'benign-allowlist' ? <span className="badge b-ok">Allowlisted (ignored)</span> : <span className="badge b-high">{i.classification}</span>}</td>
                  <td>{i.confidence.toLowerCase()}</td>
                  <td className="text-sm">{i.source}<div className="muted text-xs">added {i.ageDays} day(s) ago{i.expiresAt && <> · expires <Time value={i.expiresAt} /></>}</div></td>
                  <td className="tabular-nums">{i.matchCount} event(s)</td>
                  <td className="whitespace-nowrap"><button className="btn btn-sm" onClick={() => setOpen(i.id)}>Matches</button>{can('ANALYST') && !i.expired && <button className="btn btn-sm ml-1" onClick={() => expire.mutate(i.id)}>Expire</button>}</td>
                </tr>))}</tbody></table></div>
          )}
        </Async>
      </Card>

      <Modal open={add} onClose={() => setAdd(false)} title="Add an indicator" footer={<><button className="btn" onClick={() => setAdd(false)}>Cancel</button><button className="btn btn-primary" disabled={!f.value || !f.source || create.isPending} onClick={() => create.mutate()}>Add</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="ioc-t"><select id="ioc-t" className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>domain</option><option>ip</option><option>hash</option><option>url</option></select></Field>
            <Field label="Confidence" htmlFor="ioc-c"><select id="ioc-c" className="select" value={f.confidence} onChange={(e) => setF({ ...f, confidence: e.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></Field>
          </div>
          <Field label="Value" htmlFor="ioc-v" hint="Canonicalized and validated. URLs must not contain credentials."><input id="ioc-v" className="input mono" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
          <Field label="Classification" htmlFor="ioc-cl" hint="Use “benign-allowlist” to tell AegisSOC to ignore matches (false-positive handling)."><input id="ioc-cl" className="input" value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value })} /></Field>
          <Field label="Source (provenance)" htmlFor="ioc-s"><input id="ioc-s" className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
          <Field label="Expires in (days)" htmlFor="ioc-e"><input id="ioc-e" className="input" type="number" min={1} max={3650} value={f.expiresInDays} onChange={(e) => setF({ ...f, expiresInDays: e.target.value })} /></Field>
          <Field label="Notes" htmlFor="ioc-d"><input id="ioc-d" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={open !== null} onClose={() => setOpen(null)} drawer title="Indicator matches">
        <Async q={matches} rows={3}>
          {(m) => (
            <div className="space-y-4">
              <p className="text-sm"><span className="badge b-info mr-1">{m.indicator.type}</span><span className="mono break-all">{m.indicator.value}</span> · from {m.indicator.source}</p>
              <Banner kind="info">{m.limitations.map((l, i) => <span key={i} className="block">{l}</span>)}</Banner>
              {m.events.length === 0 ? <p className="muted text-sm">No stored events contain this indicator.</p> : <ul className="space-y-2 text-sm">{m.events.map((e) => <li key={e.id} className="rounded-lg border border-[var(--line)] p-2.5"><EventChip id={e.id} onOpen={setEventId} /> <Time value={e.ts} /> · {e.host} {e.username} <p>{e.message}</p></li>)}</ul>}
            </div>
          )}
        </Async>
      </Modal>
      <EventDrawer id={eventId} onClose={() => setEventId(null)} />
    </>
  )
}
