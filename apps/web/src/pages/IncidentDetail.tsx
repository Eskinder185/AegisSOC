import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, FileText, ListChecks, MessageSquarePlus, Radio, ScrollText, Swords } from 'lucide-react'
import { api, download } from '../api/client'
import type { IncidentDetail as Detail } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, ClassBadge, Field, Modal, PageHeader, SeverityBadge, StatusBadge, SyntheticBadge, Time, AbsTime, useToast, errMessage, Spinner } from '../components/ui'
import { AiPanel, EventDrawer, EvidenceTable } from '../components/domain'
import { statusLabel } from '../lib/format'

const STAGES = ['NEW', 'TRIAGE', 'INVESTIGATING', 'CONTAINMENT_PROPOSED', 'CONTAINED', 'RECOVERY', 'RESOLVED', 'CLOSED']
const NEXT: Record<string, string[]> = {
  NEW: ['TRIAGE', 'INVESTIGATING', 'RESOLVED'], TRIAGE: ['INVESTIGATING', 'RESOLVED'], INVESTIGATING: ['CONTAINMENT_PROPOSED', 'RESOLVED'],
  CONTAINMENT_PROPOSED: ['CONTAINED', 'INVESTIGATING'], CONTAINED: ['RECOVERY', 'INVESTIGATING'], RECOVERY: ['RESOLVED', 'INVESTIGATING'], RESOLVED: ['CLOSED', 'INVESTIGATING'], CLOSED: ['INVESTIGATING'],
}
const RESOLUTIONS = [
  ['CONFIRMED_INCIDENT_REMEDIATED', 'Confirmed incident, remediated'], ['FALSE_POSITIVE', 'False positive'], ['BENIGN_ADMIN_ACTIVITY', 'Benign administrator activity'],
  ['TEST_ACTIVITY', 'Expected test / lab activity'], ['INCONCLUSIVE', 'Inconclusive'], ['DUPLICATE', 'Duplicate of another case'],
]
const ACTIONS = [
  ['COLLECT_EVIDENCE', 'Collect evidence (read-only)', 'host'], ['ISOLATE_HOST', 'Isolate a host', 'host'], ['BLOCK_IP', 'Block an IP address', 'ip'],
  ['DISABLE_ACCOUNT', 'Disable an account', 'user'], ['RESET_CREDENTIALS', 'Reset credentials', 'user'],
] as const
const PI_FIELDS: [string, string][] = [
  ['rootCauseHypothesis', 'Root-cause hypothesis (unproven)'], ['verifiedCause', 'Verified cause (only if evidence proves it)'], ['responseSteps', 'Response steps taken'],
  ['lessonsLearned', 'Lessons learned'], ['ruleImprovements', 'Detection / rule improvements'], ['unresolvedQuestions', 'Unresolved questions'],
]

export function IncidentDetail() {
  const { id } = useParams()
  const incId = Number(id)
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [eventId, setEventId] = useState<number | null>(null)
  const [dialog, setDialog] = useState<null | 'status' | 'note' | 'task' | 'proposal' | 'report'>(null)
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState('FALSE_POSITIVE')
  const [force, setForce] = useState(false)
  const [kind, setKind] = useState('OBSERVATION')
  const [taskTitle, setTaskTitle] = useState('')
  const [action, setAction] = useState<(typeof ACTIONS)[number][0]>('COLLECT_EVIDENCE')
  const [target, setTarget] = useState('')
  const [redact, setRedact] = useState(true)
  const [review, setReview] = useState<Record<string, string> | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['incident', incId], queryFn: () => api<Detail>(`/api/incidents/${incId}`), enabled: Number.isFinite(incId) })
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ username: string; displayName: string; enabled: boolean }[]>('/api/users') })

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['incident', incId] }); void qc.invalidateQueries({ queryKey: ['incidents'] }); void qc.invalidateQueries({ queryKey: ['overview'] }); void qc.invalidateQueries({ queryKey: ['alerts'] }) }
  const mut = useMutation({
    mutationFn: (p: { path: string; method?: 'POST' | 'PATCH' | 'PUT'; body: unknown; base?: string }) => api(`${p.base ?? '/api/incidents'}${p.base ? '' : '/' + incId}${p.path}`, { method: p.method ?? 'POST', body: p.body }),
    onSuccess: () => { refresh(); setDialog(null); setNote(''); setTaskTitle(''); setForce(false) },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  const proposal = useMutation({
    mutationFn: () => api(`/api/response/incidents/${incId}/proposals`, { method: 'POST', body: { actionType: action, target, reason: note } }),
    onSuccess: () => { refresh(); setDialog(null); setNote(''); toast.push('ok', 'Simulated proposal drafted. A different person must review it; nothing is executed.') },
    onError: (e) => toast.push('danger', errMessage(e)),
  })

  async function exportReport(format: 'md' | 'json') {
    setExporting(format)
    try {
      const r = await download(`/api/incidents/${incId}/report?format=${format}&redact=${redact}`, `incident-${incId}.${format}`)
      toast.push('ok', `Report downloaded (${r.name}). SHA-256 ${r.sha256?.slice(0, 12)}… recorded in the export log.`)
      refresh()
    } catch (e) { toast.push('danger', errMessage(e)) } finally { setExporting(null) }
  }

  return (
    <>
      <Link to="/app/incidents" className="btn btn-ghost btn-sm mb-3"><ArrowLeft size={15} aria-hidden="true" /> All cases</Link>
      <Async q={q} rows={8}>
        {(d) => {
          const idx = STAGES.indexOf(d.status)
          const entityOptions = (kindName: string) => kindName === 'host' ? d.entities.hosts : kindName === 'ip' ? d.entities.ips : d.entities.users
          const needKind = ACTIONS.find((a) => a[0] === action)![2]
          const reviewValues = review ?? d.postIncident
          return (
            <div className="space-y-6">
              <PageHeader
                title={`#${d.id} ${d.title}`}
                subtitle={<span className="flex flex-wrap items-center gap-2"><SeverityBadge severity={d.severity} /><StatusBadge status={d.status} /><ClassBadge value={d.classification} />{d.synthetic && <SyntheticBadge />}<span className="badge b-info">P{d.priority}</span><span className="muted text-sm">opened <Time value={d.createdAt} /> by {d.createdBy}</span></span>}
                actions={<>
                  {can('ANALYST') && NEXT[d.status]?.filter((s) => !(s === 'CLOSED' && !can('INCIDENT_LEAD'))).map((s) => (
                    <button key={s} className={`btn ${s === 'RESOLVED' || s === 'CLOSED' ? '' : 'btn-primary'}`} onClick={() => { setTo(s); setNote(''); setDialog('status') }}>
                      {s === 'INVESTIGATING' && (d.status === 'RESOLVED' || d.status === 'CLOSED') ? 'Reopen' : '→ ' + statusLabel(s)}
                    </button>
                  ))}
                  <button className="btn" onClick={() => setDialog('report')}><Download size={16} aria-hidden="true" /> Export report</button>
                </>}
              />

              <nav aria-label="Case stage" className="card card-pad overflow-x-auto">
                <ol className="flex min-w-[640px] items-center gap-1">
                  {STAGES.map((s, i) => (
                    <li key={s} className="flex flex-1 items-center gap-1" aria-current={i === idx ? 'step' : undefined}>
                      <span className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold ${i < idx ? 'bg-[var(--ok-bg)] text-[var(--ok-fg)]' : i === idx ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-2)] muted'}`}>{i + 1}</span>
                      <span className={`text-xs ${i === idx ? 'font-bold' : 'muted'}`}>{statusLabel(s)}</span>
                      {i < STAGES.length - 1 && <span className="mx-1 h-px flex-1 bg-[var(--line)]" aria-hidden="true" />}
                    </li>
                  ))}
                </ol>
                {d.status !== 'CONTAINED' && d.status !== 'CONTAINMENT_PROPOSED' && <p className="muted mt-2 text-xs">“Contained” is only reachable after a passed, system-measured verification — never from approval or a person&apos;s say-so alone.</p>}
              </nav>

              <Card title="Guided investigation" id="guide">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {([['1 · What we know', d.guide.know], ['2 · Why we care', d.guide.why], ['3 · What is uncertain', d.guide.uncertain], ['4 · What to check next (read-only)', d.guide.next], ['5 · Recommended action (needs permission)', d.guide.recommended], ['6 · How to verify', d.guide.verify]] as [string, string[]][]).map(([h, items]) => (
                    <div key={h}><h3 className="card-title mb-1.5">{h}</h3><ul className="list-disc space-y-1 pl-5 text-sm">{items.length ? items.map((t, i) => <li key={i}>{t}</li>) : <li className="muted list-none">Nothing recorded.</li>}</ul></div>
                  ))}
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <div className="min-w-0 space-y-6">
                  <Card title={<span className="inline-flex items-center gap-1.5"><Radio size={14} aria-hidden="true" /> Timeline</span>} id="timeline" actions={<span className="muted text-xs">telemetry · analyst · action</span>}>
                    <ol className="space-y-0">
                      {d.timeline.map((t, i) => (
                        <li key={i} className="relative border-l-2 border-[var(--line)] pb-4 pl-6 last:pb-0">
                          <span className={`tl-dot absolute -left-[7px] top-1 ${t.type === 'TELEMETRY' ? 'bg-[var(--low-fg)]' : t.type === 'ANALYST' ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]'}`} aria-hidden="true" />
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`badge ${t.type === 'TELEMETRY' ? 'b-low' : t.type === 'ANALYST' ? 'b-ok' : 'b-info'}`}>{t.type === 'TELEMETRY' ? 'Observed (sensor)' : t.type === 'ANALYST' ? 'Analyst statement' : 'Action'}</span>
                            <span className="muted"><AbsTime value={t.at} /> · {t.actor}</span>
                          </div>
                          <p className="mt-1 text-sm">{t.type === 'TELEMETRY' ? <button className="mono mr-1.5 underline" onClick={() => setEventId(Number(t.ref.split(':')[1]))}>{t.ref.replace('event:', '#')}</button> : null}{t.text}</p>
                        </li>
                      ))}
                    </ol>
                  </Card>
                  <Card title={`Evidence · ${d.evidence.length} events`} id="evidence" pad={false}>
                    <EvidenceTable events={d.evidence} onOpen={setEventId} caption="Events linked to this case" />
                  </Card>
                  <Card title="Post-incident review" id="pir" actions={can('ANALYST') && <button className="btn btn-sm" onClick={() => mut.mutate({ path: '/post-incident', method: 'PUT', body: reviewValues })} disabled={mut.isPending || review === null}>Save review</button>}>
                    <p className="muted mb-3 text-sm">A root cause stays a <strong>hypothesis</strong> until you can cite evidence that verifies it.</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {PI_FIELDS.map(([k, l]) => (
                        <Field key={k} label={l} htmlFor={`pi-${k}`}><textarea id={`pi-${k}`} className="textarea !min-h-[76px]" disabled={!can('ANALYST')} value={reviewValues[k] ?? ''} onChange={(e) => setReview({ ...reviewValues, [k]: e.target.value })} /></Field>
                      ))}
                    </div>
                  </Card>
                </div>

                <div className="min-w-0 space-y-6">
                  <Card title="Ownership & entities" id="entities">
                    <Field label="Case owner" htmlFor="inc-owner">
                      <select id="inc-owner" className="select" disabled={!can('ANALYST')} value={d.assignee ?? ''} onChange={(e) => mut.mutate({ path: '', method: 'PATCH', body: { assignee: e.target.value } })}>
                        <option value="">Unassigned</option>{users.data?.filter((u) => u.enabled).map((u) => <option key={u.username} value={u.username}>{u.displayName}</option>)}
                      </select>
                    </Field>
                    <div className="mt-4 space-y-3 text-sm">
                      {([['Hosts', d.entities.hosts, 'host'], ['Accounts', d.entities.users, 'user'], ['IP addresses', d.entities.ips, 'ip'], ['Domains', d.entities.domains, 'domain']] as [string, string[], string][]).filter(([, v]) => v.length).map(([l, v, t]) => (
                        <div key={l}><div className="card-title mb-1">{l}</div><div className="flex flex-wrap gap-1.5">{v.map((x) => <Link key={x} className="mono rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-xs no-underline hover:border-[var(--accent)]" to={`/app/hunt?pivotType=${t}&pivotValue=${encodeURIComponent(x)}`} title="Pivot in Hunt">{x}</Link>)}</div></div>
                      ))}
                    </div>
                  </Card>

                  <Card title={<span className="inline-flex items-center gap-1.5"><ListChecks size={14} aria-hidden="true" /> Tasks</span>} id="tasks" actions={can('ANALYST') && <button className="btn btn-sm" onClick={() => setDialog('task')}>Add task</button>}>
                    {d.tasks.length === 0 ? <p className="muted text-sm">No tasks yet. Add review steps so the next person knows what is left.</p> : (
                      <ul className="space-y-2">
                        {d.tasks.map((t) => (
                          <li key={t.id}><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={t.done} disabled={!can('ANALYST')} onChange={(e) => mut.mutate({ path: `/tasks/${t.id}`, method: 'PATCH', body: { done: e.target.checked } })} /><span className={t.done ? 'muted line-through' : ''}>{t.title}</span></label></li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  <Card title={<span className="inline-flex items-center gap-1.5"><ScrollText size={14} aria-hidden="true" /> Notes</span>} id="notes" actions={can('ANALYST') && <button className="btn btn-sm" onClick={() => { setKind('OBSERVATION'); setNote(''); setDialog('note') }}><MessageSquarePlus size={14} aria-hidden="true" /> Add note</button>}>
                    {d.notes.length === 0 ? <p className="muted text-sm">No notes yet. Record what you observed separately from what you think.</p> : (
                      <ul className="space-y-3">{d.notes.map((n) => (
                        <li key={n.id} className="rounded-lg border border-[var(--line)] p-3 text-sm">
                          <div className="mb-1 flex items-center gap-2"><span className={`badge ${n.kind === 'OBSERVATION' ? 'b-low' : n.kind === 'HYPOTHESIS' ? 'b-medium' : 'b-ok'}`}>{n.kind.replace('_', ' ').toLowerCase()}</span><span className="muted text-xs">{n.author} · <Time value={n.at} /></span></div>
                          <p className="whitespace-pre-wrap break-words">{n.body}</p>
                        </li>))}</ul>
                    )}
                  </Card>

                  <Card title={<span className="inline-flex items-center gap-1.5"><Swords size={14} aria-hidden="true" /> Response proposals</span>} id="proposals" actions={can('ANALYST') && !['RESOLVED', 'CLOSED'].includes(d.status) && <button className="btn btn-sm" onClick={() => { setAction('COLLECT_EVIDENCE'); setTarget(''); setNote(''); setDialog('proposal') }}>Draft proposal</button>}>
                    <Banner kind="info">Simulation only. Proposals describe impact and rollback, need a different person to approve, and are never executed by AegisSOC.</Banner>
                    {d.proposals.length === 0 ? <p className="muted mt-3 text-sm">None yet.</p> : (
                      <ul className="mt-3 space-y-2">{d.proposals.map((p) => <li key={p.id} className="flex items-center justify-between gap-2 text-sm"><Link className="row-link" to={`/app/response?open=${p.id}`}>#{p.id} {p.actionType.replace(/_/g, ' ').toLowerCase()} · {p.target}</Link><StatusBadge status={p.status} /></li>)}</ul>
                    )}
                  </Card>

                  <Card title="Alerts in this case" id="case-alerts" pad={false}>
                    <ul>{d.alerts.length === 0 ? <li className="muted px-5 py-4 text-sm">Created manually from events.</li> : d.alerts.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3 last:border-0"><Link className="row-link" to={`/app/alerts/${a.id}`}>{a.title}</Link><SeverityBadge severity={a.severity} /></li>)}</ul>
                  </Card>
                </div>
              </div>

              <AiPanel subjectType="incident" subjectId={d.id} onOpenEvent={setEventId} />

              <Card title="Activity log (audited)" id="activity" pad={false}>
                <ol className="max-h-72 divide-y divide-[var(--line)] overflow-y-auto">
                  {[...d.activity].reverse().map((a) => <li key={a.id} className="px-5 py-2.5 text-sm"><span className="badge b-info mr-2">{a.kind.toLowerCase()}</span>{a.detail}<span className="muted ml-2 text-xs">{a.actor} · <Time value={a.at} /></span></li>)}
                </ol>
              </Card>

              {/* dialogs */}
              <Modal open={dialog === 'status'} onClose={() => setDialog(null)} title={`Move to “${statusLabel(to)}”`}
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={mut.isPending || ((to === 'RESOLVED' || d.status === 'RESOLVED' || d.status === 'CLOSED') && !note.trim())} onClick={() => mut.mutate({ path: '/transition', body: { to, note: note || undefined, resolution: to === 'RESOLVED' ? resolution : undefined, force } })}>{mut.isPending ? <Spinner /> : null} Confirm</button></>}>
                <div className="space-y-4">
                  {to === 'RESOLVED' && (<>
                    <Field label="Resolution" htmlFor="inc-res"><select id="inc-res" className="select" value={resolution} onChange={(e) => setResolution(e.target.value)}>{RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                    {d.tasks.some((t) => !t.done) && <label className="flex gap-2 text-sm"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Resolve even though {d.tasks.filter((t) => !t.done).length} task(s) are open (override is recorded)</label>}
                  </>)}
                  {(d.status === 'RESOLVED' || d.status === 'CLOSED') && <Banner kind="info">Reopening records your reason in the case and audit log.</Banner>}
                  <Field label={to === 'RESOLVED' || d.status === 'RESOLVED' || d.status === 'CLOSED' ? 'Note (required)' : 'Note (optional)'} htmlFor="inc-note"><textarea id="inc-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  {d.synthetic && to === 'RESOLVED' && <p className="muted text-sm">This case is built from synthetic data. “Expected test activity” is usually the honest resolution.</p>}
                </div>
              </Modal>
              <Modal open={dialog === 'note'} onClose={() => setDialog(null)} title="Add a note"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!note.trim() || mut.isPending} onClick={() => mut.mutate({ path: '/notes', body: { kind, body: note } })}>Add note</button></>}>
                <div className="space-y-4">
                  <Field label="Type" htmlFor="nk" hint="Keeping facts, opinions and hypotheses apart makes the case trustworthy."><select id="nk" className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="OBSERVATION">Observation — something I saw in the data</option><option value="ANALYST_NOTE">Analyst note — a decision or comment</option><option value="HYPOTHESIS">Hypothesis — a theory I have not proven</option></select></Field>
                  <Field label="Note" htmlFor="nb"><textarea id="nb" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} /></Field>
                </div>
              </Modal>
              <Modal open={dialog === 'task'} onClose={() => setDialog(null)} title="Add a task"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!taskTitle.trim() || mut.isPending} onClick={() => mut.mutate({ path: '/tasks', body: { title: taskTitle } })}>Add task</button></>}>
                <Field label="What needs doing?" htmlFor="tt"><input id="tt" className="input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} maxLength={300} /></Field>
              </Modal>
              <Modal open={dialog === 'proposal'} onClose={() => setDialog(null)} title="Draft a simulated response proposal"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={!target || !note.trim() || proposal.isPending} onClick={() => proposal.mutate()}>Create simulated proposal</button></>}>
                <div className="space-y-4">
                  <Banner kind="warn" title="Nothing will be executed">AegisSOC records the proposal, simulates its effect on stored data, and asks a different person to approve. Carrying it out is a manual step outside AegisSOC.</Banner>
                  <Field label="Action" htmlFor="pa"><select id="pa" className="select" value={action} onChange={(e) => { setAction(e.target.value as typeof action); setTarget('') }}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label={`Target (${needKind}s seen in this case)`} htmlFor="pt"><select id="pt" className="select" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose…</option>{entityOptions(needKind).map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Why is this needed?" htmlFor="pr"><textarea id="pr" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                </div>
              </Modal>
              <Modal open={dialog === 'report'} onClose={() => setDialog(null)} title="Export case report"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Close</button><button className="btn" disabled={!!exporting} onClick={() => exportReport('json')}>{exporting === 'json' ? <Spinner /> : <FileText size={15} aria-hidden="true" />} JSON</button><button className="btn btn-primary" disabled={!!exporting} onClick={() => exportReport('md')}>{exporting === 'md' ? <Spinner /> : <Download size={15} aria-hidden="true" />} Markdown</button></>}>
                <div className="space-y-4">
                  <p className="text-sm">The report is generated from the stored case, evidence and audit records. It lists synthetic provenance and caveats.</p>
                  <label className="flex gap-2 text-sm"><input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} /><span><strong>Redact identities</strong> — mask IPs to /24 and pseudonymize users and hosts (recommended before sharing).</span></label>
                  <p className="muted text-xs">Each export is logged with its SHA-256.</p>
                </div>
              </Modal>
            </div>
          )
        }}
      </Async>
      <EventDrawer id={eventId} onClose={() => setEventId(null)} incidentId={incId} />
    </>
  )
}
