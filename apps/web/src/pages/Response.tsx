import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, EmptyState, Field, KeyValue, Modal, PageHeader, StatusBadge, SyntheticBadge, Time, AbsTime, useToast, errMessage, Spinner } from '../components/ui'

interface Row { id: number; incidentId: number; incidentTitle: string; actionType: string; target: string; status: string; requestedBy: string; createdAt: string; expiresAt: string; synthetic: boolean; mode: string }
interface Detail extends Row {
  reason: string; expectedImpact: string; rollback: string; banner: string
  simulation: Record<string, unknown> & { warnings?: string[]; note?: string }
  approvals: { approver: string; decision: string; comment?: string; at: string }[]
  verifications: { check: string; status: string; detail: string; recordedBy: string; at: string }[]
}
interface Caps { mode: string; liveExecutionFlag: boolean; connectors: { id: string; status: string; reason: string }[]; guarantees: string[] }

export function Response() {
  const [sp, setSp] = useSearchParams()
  const { can, me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [dlg, setDlg] = useState<null | 'approve' | 'reject' | 'attest'>(null)
  const [text, setText] = useState('')
  const open = sp.get('open') ? Number(sp.get('open')) : null

  const list = useQuery({ queryKey: ['proposals'], queryFn: () => api<Row[]>('/api/response/proposals') })
  const caps = useQuery({ queryKey: ['response-caps'], queryFn: () => api<Caps>('/api/response/capabilities') })
  const detail = useQuery({ queryKey: ['proposal', open], queryFn: () => api<Detail>(`/api/response/proposals/${open}`), enabled: open !== null })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['proposals'] }); void qc.invalidateQueries({ queryKey: ['proposal'] }); void qc.invalidateQueries({ queryKey: ['overview'] }); void qc.invalidateQueries({ queryKey: ['incident'] }) }
  const post = useMutation({
    mutationFn: (p: { path: string; body?: unknown }) => api(`/api/response/proposals/${open}${p.path}`, { method: 'POST', body: p.body }),
    onSuccess: () => { refresh(); setDlg(null); setText('') }, onError: (e) => toast.push('danger', errMessage(e)),
  })

  return (
    <>
      <PageHeader title="Response center" subtitle="Plan, simulate, approve and verify containment — without AegisSOC ever changing a real system." />
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Banner kind="warn" title="Simulation only"><span className="block">No live response connector exists in this build. Approving a proposal records a decision; it does not block, isolate, disable or delete anything. Carrying the action out is a manual step you perform elsewhere, then record as “user-attested”.</span></Banner>
        <Card title={<span className="inline-flex items-center gap-1.5"><Lock size={14} aria-hidden="true" /> Execution connectors</span>} id="caps">
          <Async q={caps} rows={2}>{(c) => (
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{c.connectors.map((k) => <li key={k.id} className="flex items-center justify-between gap-2" title={k.reason}><span className="mono">{k.id}</span><StatusBadge status="DISABLED" /></li>)}</ul>
          )}</Async>
          <p className="muted mt-2 text-xs">Enabling any connector would require explicit authorization, an allow-list, expiry, rate limits, dry-run, kill switch and rollback plan. Enforced by the server, not this screen.</p>
        </Card>
      </div>
      <Card pad={false}>
        <Async q={list} empty={(d) => d.length === 0 ? <EmptyState title="No response proposals">Draft one from a case&apos;s “Response proposals” panel.</EmptyState> : null}>
          {(d) => (
            <div className="table-wrap"><table className="table"><caption className="sr-only">Response proposals</caption>
              <thead><tr><th scope="col">Proposal</th><th scope="col">Case</th><th scope="col">Status</th><th scope="col">Requested</th><th scope="col">Expires</th></tr></thead>
              <tbody>{d.map((p) => (
                <tr key={p.id}>
                  <td><button className="row-link text-left" onClick={() => setSp({ open: String(p.id) })}>#{p.id} {p.actionType.replace(/_/g, ' ').toLowerCase()}</button><div className="mono muted text-xs">{p.target}</div>{p.synthetic && <SyntheticBadge />}</td>
                  <td><Link className="underline" to={`/app/incidents/${p.incidentId}`}>#{p.incidentId} {p.incidentTitle}</Link></td>
                  <td><StatusBadge status={p.status} /><div className="muted mt-1 text-xs">simulation</div></td>
                  <td className="text-sm">{p.requestedBy}<div className="muted text-xs"><Time value={p.createdAt} /></div></td>
                  <td className="text-sm"><Time value={p.expiresAt} /></td>
                </tr>))}</tbody></table></div>
          )}
        </Async>
      </Card>

      <Modal open={open !== null} onClose={() => setSp({})} drawer title={`Proposal #${open ?? ''}`}>
        <Async q={detail} rows={5}>
          {(p) => (
            <div className="space-y-5">
              <Banner kind={p.status === 'APPROVED' || p.status === 'VERIFIED' ? 'ok' : p.status === 'REJECTED' || p.status === 'EXPIRED' ? 'info' : 'warn'}>{p.banner}</Banner>
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={p.status} /><span className="badge b-synthetic">SIMULATION</span>{p.synthetic && <SyntheticBadge />}</div>
              <KeyValue rows={[{ k: 'Action', v: p.actionType.replace(/_/g, ' ').toLowerCase() }, { k: 'Target', v: <span className="mono">{p.target}</span> }, { k: 'Case', v: <Link className="underline" to={`/app/incidents/${p.incidentId}`}>#{p.incidentId}</Link> }, { k: 'Requested by', v: p.requestedBy }, { k: 'Expires', v: <AbsTime value={p.expiresAt} /> }]} />
              <div><h3 className="card-title mb-1">Why</h3><p className="text-sm">{p.reason}</p></div>
              <div><h3 className="card-title mb-1">Expected impact if someone did this for real</h3><p className="text-sm">{p.expectedImpact}</p></div>
              <div><h3 className="card-title mb-1">Rollback guidance</h3><p className="text-sm">{p.rollback}</p></div>
              <div><h3 className="card-title mb-1">Simulated against stored data</h3>
                <KeyValue rows={Object.entries(p.simulation).filter(([k]) => !['mode', 'note', 'warnings'].includes(k)).map(([k, v]) => ({ k: k.replace(/([A-Z])/g, ' $1').toLowerCase(), v: String(v) }))} />
                {(p.simulation.warnings ?? []).map((w, i) => <Banner key={i} kind="warn">{w}</Banner>)}
                <p className="muted mt-2 text-xs">{p.simulation.note}</p></div>
              {p.approvals.length > 0 && <div><h3 className="card-title mb-1">Decisions</h3><ul className="text-sm">{p.approvals.map((a, i) => <li key={i}>{a.decision} by <strong>{a.approver}</strong> <Time value={a.at} />{a.comment && <> — {a.comment}</>}</li>)}</ul></div>}
              {p.verifications.length > 0 && <div><h3 className="card-title mb-1">Verification record</h3><ul className="space-y-2 text-sm">{p.verifications.map((v, i) => <li key={i} className="rounded-lg border border-[var(--line)] p-2.5"><span className={`badge ${v.status === 'PASSED' ? 'b-ok' : v.status === 'FAILED' ? 'b-critical' : 'b-low'}`}>{v.status === 'USER_ATTESTED' ? 'User-attested (not verified)' : v.status === 'PASSED' ? 'Measured: passed' : v.status.toLowerCase()}</span> <span className="mono text-xs">{v.check}</span><p className="mt-1">{v.detail}</p><span className="muted text-xs">{v.recordedBy} · <Time value={v.at} /></span></li>)}</ul></div>}

              <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                {p.status === 'PENDING' && can('INCIDENT_LEAD') && <>
                  <button className="btn btn-primary" disabled={p.requestedBy === me?.username} title={p.requestedBy === me?.username ? 'You requested this: a different person must decide' : ''} onClick={() => { setText(''); setDlg('approve') }}>Approve (simulated)</button>
                  <button className="btn" onClick={() => { setText(''); setDlg('reject') }}>Reject</button></>}
                {p.status === 'PENDING' && !can('INCIDENT_LEAD') && <p className="muted text-sm">An incident lead must review this proposal.</p>}
                {p.status === 'APPROVED' && can('ANALYST') && <button className="btn btn-primary" onClick={() => { setText(''); setDlg('attest') }}>Record that the action was done manually</button>}
                {p.status === 'ATTESTED' && can('ANALYST') && <button className="btn btn-primary" disabled={post.isPending} onClick={() => post.mutate({ path: '/verify' })}>{post.isPending ? <Spinner /> : null} Run measured check</button>}
              </div>
            </div>
          )}
        </Async>
      </Modal>
      <Modal open={dlg === 'approve'} onClose={() => setDlg(null)} title="Approve in simulation" footer={<><button className="btn" onClick={() => setDlg(null)}>Cancel</button><button className="btn btn-primary" disabled={post.isPending} onClick={() => post.mutate({ path: '/decision', body: { decision: 'APPROVED', comment: text || undefined } })}>Approve</button></>}>
        <div className="space-y-3"><Banner kind="info">Approving records your decision and notes that the impact and rollback were reviewed. Nothing will be executed.</Banner><Field label="Comment (optional)" htmlFor="ap-c"><textarea id="ap-c" className="textarea" value={text} onChange={(e) => setText(e.target.value)} /></Field></div>
      </Modal>
      <Modal open={dlg === 'reject'} onClose={() => setDlg(null)} title="Reject proposal" footer={<><button className="btn" onClick={() => setDlg(null)}>Cancel</button><button className="btn btn-danger" disabled={!text.trim() || post.isPending} onClick={() => post.mutate({ path: '/decision', body: { decision: 'REJECTED', comment: text } })}>Reject</button></>}>
        <Field label="Reason (required)" htmlFor="rj-c"><textarea id="rj-c" className="textarea" value={text} onChange={(e) => setText(e.target.value)} /></Field>
      </Modal>
      <Modal open={dlg === 'attest'} onClose={() => setDlg(null)} title="Record a manual action" footer={<><button className="btn" onClick={() => setDlg(null)}>Cancel</button><button className="btn btn-primary" disabled={!text.trim() || post.isPending} onClick={() => post.mutate({ path: '/attest', body: { detail: text } })}>Record</button></>}>
        <div className="space-y-3"><Banner kind="warn">This is your statement that you performed the action in another tool. AegisSOC cannot confirm it and labels it “user-attested”.</Banner><Field label="What did you do, and where?" htmlFor="at-c"><textarea id="at-c" className="textarea" value={text} onChange={(e) => setText(e.target.value)} /></Field></div>
      </Modal>
    </>
  )
}
