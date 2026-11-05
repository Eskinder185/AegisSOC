import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ClipboardPlus, EyeOff, RotateCcw, ShieldQuestion } from 'lucide-react'
import { api } from '../api/client'
import type { AlertDetail as Detail } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, ClassBadge, Field, KeyValue, Modal, PageHeader, SeverityBadge, StatusBadge, SyntheticBadge, Tabs, Time, AbsTime, useToast, errMessage } from '../components/ui'
import { AiPanel, EventDrawer, EvidenceTable } from '../components/domain'
import { RESOLUTIONS } from './Alerts'

export function AlertDetail() {
  const { id } = useParams()
  const alertId = Number(id)
  const { can, me } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const [view, setView] = useState<'simple' | 'analyst'>('simple')
  const [eventId, setEventId] = useState<number | null>(null)
  const [dialog, setDialog] = useState<null | 'close' | 'suppress' | 'case' | 'reopen' | 'comment'>(null)
  const [resolution, setResolution] = useState('FALSE_POSITIVE')
  const [note, setNote] = useState('')
  const [hours, setHours] = useState(24)
  const [caseTitle, setCaseTitle] = useState('')

  const q = useQuery({ queryKey: ['alert', alertId], queryFn: () => api<Detail>(`/api/alerts/${alertId}`), enabled: Number.isFinite(alertId) })
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ username: string; displayName: string; enabled: boolean }[]>('/api/users') })

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['alert', alertId] }); void qc.invalidateQueries({ queryKey: ['alerts'] }); void qc.invalidateQueries({ queryKey: ['overview'] }) }
  const act = useMutation({
    mutationFn: (p: { path: string; body: unknown }) => api<Detail>(`/api/alerts/${alertId}${p.path}`, { method: 'POST', body: p.body }),
    onSuccess: () => { refresh(); setDialog(null); setNote(''); toast.push('ok', 'Alert updated.') },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  const transition = (to: string, extra: Record<string, unknown> = {}) => act.mutate({ path: '/transition', body: { to, note: note || undefined, ...extra } })
  const createCase = useMutation({
    mutationFn: () => api<{ id: number }>('/api/incidents', { method: 'POST', body: { title: caseTitle, alertIds: [alertId], summary: note || undefined } }),
    onSuccess: (r) => { refresh(); toast.push('ok', `Case #${r.id} created.`); nav(`/app/incidents/${r.id}`) },
    onError: (e) => toast.push('danger', errMessage(e)),
  })

  return (
    <>
      <Link to="/app/alerts" className="btn btn-ghost btn-sm mb-3"><ArrowLeft size={15} aria-hidden="true" /> All alerts</Link>
      <Async q={q} rows={8}>
        {(a) => {
          const s = a.status
          const ex = a.explanation
          return (
            <div className="space-y-6">
              <PageHeader
                title={a.title}
                subtitle={<span className="flex flex-wrap items-center gap-2"><SeverityBadge severity={a.severity} /><StatusBadge status={a.status} /><ClassBadge value={a.classification} />{ex.hypothesis && <span className="badge b-medium">Hypothesis</span>}{a.synthetic && <SyntheticBadge />}<span className="muted text-sm">Alert #{a.id} · {a.ruleId} v{a.ruleVersion}</span></span>}
                actions={can('ANALYST') ? (
                  <>
                    {s === 'NEW' && <button className="btn" onClick={() => transition('ACKNOWLEDGED')} disabled={act.isPending}><CheckCircle2 size={16} aria-hidden="true" /> Acknowledge</button>}
                    {['NEW', 'ACKNOWLEDGED'].includes(s) && <button className="btn" onClick={() => transition('INVESTIGATING')} disabled={act.isPending}>Start investigating</button>}
                    {['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(s) && a.incidents.length === 0 && <button className="btn btn-primary" onClick={() => { setCaseTitle(a.title); setDialog('case') }}><ClipboardPlus size={16} aria-hidden="true" /> Create case</button>}
                    {['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(s) && a.severity !== 'CRITICAL' && <button className="btn" onClick={() => setDialog('suppress')}><EyeOff size={16} aria-hidden="true" /> Suppress…</button>}
                    {s === 'SUPPRESSED' && <button className="btn" onClick={() => transition('NEW', { note: 'Un-suppressed' })}>Un-suppress</button>}
                    {s !== 'CLOSED' && s !== 'ESCALATED' && <button className="btn" onClick={() => setDialog('close')}>Close…</button>}
                    {s === 'ESCALATED' && <button className="btn" onClick={() => setDialog('close')}>Close…</button>}
                    {s === 'CLOSED' && <button className="btn" onClick={() => setDialog('reopen')}><RotateCcw size={16} aria-hidden="true" /> Reopen</button>}
                  </>
                ) : undefined}
              />

              {a.status === 'SUPPRESSED' && <Banner kind="warn" title="Suppressed">Hidden from the work queue until <AbsTime value={a.suppressedUntil} />. Reason: {a.suppressionReason}. Critical alerts can never be suppressed.</Banner>}
              {a.incidents.length > 0 && <Banner kind="info">Part of {a.incidents.map((i) => <Link key={i.id} to={`/app/incidents/${i.id}`} className="font-semibold underline">case #{i.id} ({i.title})</Link>)}</Banner>}
              {a.synthetic && <Banner kind="syn" title="Synthetic data">Every event behind this alert was generated for demonstration. A “confirmed” outcome here means “the exercise was understood”, not that a real incident occurred.</Banner>}

              <Card title="Understand this alert" id="understand" actions={<div className="w-56"><Tabs label="Level of detail" value={view} onChange={(v) => setView(v as 'simple' | 'analyst')} tabs={[{ id: 'simple', label: 'Simple' }, { id: 'analyst', label: 'Analyst details' }]} /></div>}>
                <div id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`}>
                  {view === 'simple' ? (
                    <dl className="grid gap-5 md:grid-cols-2">
                      <div><dt className="card-title">1 · What happened?</dt><dd className="mt-1">{ex.simple.what}</dd></div>
                      <div><dt className="card-title">2 · Why does it matter?</dt><dd className="mt-1">{ex.simple.why}</dd></div>
                      <div><dt className="card-title">3 · How sure are we?</dt><dd className="mt-1">{ex.simple.howSure}</dd></div>
                      <div><dt className="card-title">4 · What evidence supports it?</dt><dd className="mt-1">{a.evidence.length} stored event(s) — listed below, each opens its original record.</dd></div>
                      <div><dt className="card-title">5 · What should someone do next?</dt><dd><ul className="mt-1 list-disc space-y-1 pl-5">{ex.simple.next.map((n, i) => <li key={i}>{n}</li>)}</ul></dd></div>
                      <div><dt className="card-title">6 · How will we know it is resolved?</dt><dd><ul className="mt-1 list-disc space-y-1 pl-5">{ex.simple.verify.map((n, i) => <li key={i}>{n}</li>)}</ul></dd></div>
                    </dl>
                  ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <h3 className="card-title mb-2">Exactly why the rule fired</h3>
                        <ul className="list-disc space-y-1 pl-5 text-sm">{ex.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                        <h3 className="card-title mb-2 mt-4">Inputs</h3>
                        <KeyValue rows={Object.entries(ex.inputs).map(([k, v]) => ({ k, v: <span className="mono">{String(v)}</span> }))} />
                      </div>
                      <div>
                        <KeyValue rows={[
                          { k: 'Rule', v: <Link className="underline" to={`/app/detections/${a.ruleId}`}>{a.ruleId} v{a.ruleVersion}</Link> },
                          { k: 'Rule fingerprint', v: <span className="mono">{ex.ruleFingerprint}</span> },
                          { k: 'Group key', v: <span className="mono">{ex.groupKey}</span> },
                          { k: 'Entity', v: <span className="mono">{Object.entries(ex.analyst.entity).map(([k, v]) => `${k}=${v}`).join(' ')}</span> },
                          { k: 'First / last event', v: <><AbsTime value={ex.analyst.firstEvent} /> → <AbsTime value={ex.analyst.lastEvent} /></> },
                          { k: 'Severity / confidence', v: `${a.severity} / ${a.confidence}` },
                          { k: 'ATT&CK', v: ex.analyst.attack.techniques.length ? ex.analyst.attack.techniques.join(', ') : 'none asserted' },
                        ]} />
                        <p className="muted mt-2 text-sm">{ex.analyst.attack.justification}</p>
                      </div>
                    </div>
                  )}
                  <div className="mt-5 grid gap-5 border-t border-[var(--line)] pt-4 md:grid-cols-2">
                    <div><h3 className="card-title mb-1 flex items-center gap-1.5"><ShieldQuestion size={14} aria-hidden="true" /> What is uncertain</h3><ul className="list-disc space-y-1 pl-5 text-sm">{ex.uncertainty.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
                    <div><h3 className="card-title mb-1">Other plausible explanations</h3><ul className="list-disc space-y-1 pl-5 text-sm">{ex.simple.alternatives.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
                  </div>
                </div>
              </Card>

              <Card title={`Evidence · ${a.evidence.length} stored events`} id="evidence" pad={false}>
                <EvidenceTable events={a.evidence} onOpen={setEventId} caption={`Events cited by alert ${a.id}`} />
              </Card>

              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <AiPanel subjectType="alert" subjectId={a.id} onOpenEvent={setEventId} />
                <div className="space-y-6">
                  <Card title="Ownership" id="owner">
                    <Field label="Assigned to" htmlFor="assignee">
                      <select id="assignee" className="select" disabled={!can('ANALYST') || act.isPending} value={a.assignee ?? ''}
                        onChange={(e) => act.mutate({ path: '/assign', body: { assignee: e.target.value || null } })}>
                        <option value="">Unassigned</option>
                        {users.data?.filter((u) => u.enabled).map((u) => <option key={u.username} value={u.username}>{u.displayName}{u.username === me?.username ? ' (you)' : ''}</option>)}
                      </select>
                    </Field>
                    {can('ANALYST') && <button className="btn btn-sm mt-3" onClick={() => setDialog('comment')}>Add a comment</button>}
                  </Card>
                  {a.related.length > 0 && (
                    <Card title="Related alerts (same entity, ±24h)" id="related" pad={false}>
                      <ul>{a.related.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3 last:border-0"><Link className="row-link" to={`/app/alerts/${r.id}`}>{r.title}</Link><SeverityBadge severity={r.severity} /></li>)}</ul>
                    </Card>
                  )}
                  <Card title="History" id="history" pad={false}>
                    <ol className="px-5 py-3">
                      {a.history.map((h, i) => (
                        <li key={i} className="relative border-l-2 border-[var(--line)] pb-4 pl-5 last:pb-0">
                          <span className="tl-dot absolute -left-[7px] top-1 bg-[var(--accent)]" aria-hidden="true" />
                          <div className="text-sm font-semibold">{h.toStatus ? <>{h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus}</> : 'Note'}</div>
                          {h.note && <div className="text-sm">{h.note}</div>}
                          <div className="muted text-xs">{h.actor} · <Time value={h.at} /></div>
                        </li>
                      ))}
                    </ol>
                  </Card>
                </div>
              </div>

              <Modal open={dialog === 'close'} onClose={() => setDialog(null)} title="Close alert"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!note.trim() || act.isPending} onClick={() => transition('CLOSED', { resolution })}>Close alert</button></>}>
                <div className="space-y-4">
                  <Field label="Resolution" htmlFor="res"><select id="res" className="select" value={resolution} onChange={(e) => setResolution(e.target.value)}>{RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label="Why did you decide this? (required)" htmlFor="why" hint="Kept in the alert history and audit log."><textarea id="why" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  {a.synthetic && <p className="muted text-sm">Because the data is synthetic, choose “Expected test or lab activity” unless you are practising a specific outcome.</p>}
                </div>
              </Modal>
              <Modal open={dialog === 'suppress'} onClose={() => setDialog(null)} title="Suppress this alert"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!note.trim() || act.isPending} onClick={() => transition('SUPPRESSED', { suppressHours: hours })}>Suppress</button></>}>
                <div className="space-y-4">
                  <Banner kind="warn">Suppression hides this alert from the queue for a limited time and is always visible in the history. It never changes the rule.</Banner>
                  <Field label="Reason (required)" htmlFor="sr"><textarea id="sr" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <Field label="Expires after (hours, max 720)" htmlFor="sh"><input id="sh" className="input" type="number" min={1} max={720} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
                </div>
              </Modal>
              <Modal open={dialog === 'reopen'} onClose={() => setDialog(null)} title="Reopen alert"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!note.trim() || act.isPending} onClick={() => transition('INVESTIGATING')}>Reopen</button></>}>
                <Field label="Why is it being reopened? (required)" htmlFor="ro"><textarea id="ro" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </Modal>
              <Modal open={dialog === 'comment'} onClose={() => setDialog(null)} title="Add a comment"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ path: '/comments', body: { note } })}>Add</button></>}>
                <Field label="Comment" htmlFor="cm"><textarea id="cm" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </Modal>
              <Modal open={dialog === 'case'} onClose={() => setDialog(null)} title="Create a case from this alert"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!caseTitle.trim() || createCase.isPending} onClick={() => createCase.mutate()}>Create case</button></>}>
                <div className="space-y-4">
                  <p className="muted text-sm">The alert&apos;s {a.evidence.length} events are linked to the case as evidence. The alert moves to “Escalated”.</p>
                  <Field label="Case title" htmlFor="ct"><input id="ct" className="input" value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} maxLength={200} /></Field>
                  <Field label="Initial summary (optional)" htmlFor="cs"><textarea id="cs" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                </div>
              </Modal>
            </div>
          )
        }}
      </Async>
      <EventDrawer id={eventId} onClose={() => setEventId(null)} />
    </>
  )
}
