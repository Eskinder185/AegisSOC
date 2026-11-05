import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ShieldAlert, Trash2 } from 'lucide-react'
import { api, qs } from '../api/client'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, EmptyState, Field, KeyValue, Modal, PageHeader, Pagination, Tabs, Time, useToast, errMessage, Spinner } from '../components/ui'
import { titleCase } from '../lib/format'

interface Sys { version: string; java: string; uptimeSeconds: number; heapUsedMb: number; heapMaxMb: number; databaseSizeMb: number; aiProvider: string; liveResponseExecution: string; externalConnectors: string; devResetAvailable: boolean }
interface User { username: string; displayName: string; role: string; enabled: boolean }
interface AuditPage { items: { id: number; at: string; actor: string; action: string; objectType?: string; objectId?: string; detail: string; hash: string }[]; total: number; page: number; size: number }

const ROLES = ['VIEWER', 'ANALYST', 'INCIDENT_LEAD', 'DETECTION_ENGINEER', 'ADMIN']
const ROLE_HELP: Record<string, string> = {
  VIEWER: 'Read-only. Cannot change anything or export.',
  ANALYST: 'Triage alerts, hunt, open and work cases, draft response proposals, import data.',
  INCIDENT_LEAD: 'Analyst + close/reopen cases, approve or reject response proposals, merge cases.',
  DETECTION_ENGINEER: 'Analyst + draft, test, review and enable/disable rules, create suppressions.',
  ADMIN: 'Everything, including users, audit log, retention and AI switch.',
}

export function SettingsPage() {
  const { can, me } = useAuth()
  const [tab, setTab] = useState<'access' | 'audit' | 'system' | 'privacy'>('access')
  return (
    <>
      <PageHeader title="Settings & audit" subtitle="Who can do what, what has been done, and how this installation is running." />
      <Tabs label="Settings sections" value={tab} onChange={(t) => setTab(t as typeof tab)} tabs={[{ id: 'access', label: 'Access & roles' }, { id: 'audit', label: 'Audit log' }, { id: 'system', label: 'System' }, { id: 'privacy', label: 'Data & privacy' }]} />
      <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'access' && <Access admin={can('ADMIN')} self={me?.username ?? ''} />}
        {tab === 'audit' && (can('ADMIN') ? <Audit /> : <Card><EmptyState title="Administrators only">The audit log is limited to administrators.</EmptyState></Card>)}
        {tab === 'system' && <System />}
        {tab === 'privacy' && <Privacy admin={can('ADMIN')} />}
      </div>
    </>
  )
}

function Access({ admin, self }: { admin: boolean; self: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users') })
  const patch = useMutation({
    mutationFn: (p: { u: string; role?: string; enabled?: boolean }) => api(`/api/admin/users/${p.u}`, { method: 'PATCH', body: { role: p.role, enabled: p.enabled } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }), onError: (e) => toast.push('danger', errMessage(e)),
  })
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card title="Users" id="users" pad={false}>
        <Async q={q} rows={4}>{(d) => (
          <div className="table-wrap"><table className="table"><caption className="sr-only">Users and roles</caption>
            <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Active</th></tr></thead>
            <tbody>{d.map((u) => (
              <tr key={u.username}>
                <td><strong>{u.displayName}</strong><div className="mono muted text-xs">{u.username}{u.username === self && ' (you)'}</div></td>
                <td>{admin ? <select aria-label={`Role for ${u.username}`} className="select !min-h-9 !py-1" value={u.role} disabled={u.username === self || patch.isPending} onChange={(e) => patch.mutate({ u: u.username, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</select> : titleCase(u.role)}</td>
                <td>{admin ? <input type="checkbox" aria-label={`${u.username} is active`} checked={u.enabled} disabled={u.username === self || patch.isPending} onChange={(e) => patch.mutate({ u: u.username, enabled: e.target.checked })} /> : u.enabled ? 'Yes' : 'No'}</td>
              </tr>))}</tbody></table></div>
        )}</Async>
        <p className="muted border-t border-[var(--line)] px-5 py-3 text-xs">Accounts are local to this installation. There are no default passwords: the seed password comes from your <span className="mono">.env</span>. You cannot demote or disable yourself.</p>
      </Card>
      <Card title="What each role can do" id="roles">
        <dl className="space-y-3 text-sm">{ROLES.map((r) => <div key={r}><dt className="font-semibold">{titleCase(r)}</dt><dd className="muted">{ROLE_HELP[r]}</dd></div>)}</dl>
        <p className="muted mt-4 text-xs">Sensitive actions need separation of duties: you cannot approve your own rule change or response proposal. The server enforces this, not the screen.</p>
      </Card>
    </div>
  )
}

function Audit() {
  const [page, setPage] = useState(0)
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const q = useQuery({ queryKey: ['audit', page, actor, action], queryFn: () => api<AuditPage>('/api/audit' + qs({ page, size: 25, actor, action })), placeholderData: (p) => p })
  const verify = useMutation({ mutationFn: () => api<{ valid: boolean; checked: number; brokenIds: number[] }>('/api/audit/verify', { method: 'GET' }) })
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <Field label="Actor" htmlFor="au-a"><input id="au-a" className="input" value={actor} onChange={(e) => { setActor(e.target.value); setPage(0) }} /></Field>
        <Field label="Action starts with" htmlFor="au-c"><input id="au-c" className="input" placeholder="e.g. incident." value={action} onChange={(e) => { setAction(e.target.value); setPage(0) }} /></Field>
        <button className="btn ml-auto" onClick={() => verify.mutate()} disabled={verify.isPending}>{verify.isPending ? <Spinner /> : <CheckCircle2 size={16} aria-hidden="true" />} Verify hash chain</button>
      </div>
      {verify.data && <div className="px-5 pb-3"><Banner kind={verify.data.valid ? 'ok' : 'danger'} title={verify.data.valid ? 'Chain intact' : 'TAMPERING DETECTED'}>{verify.data.valid ? `${verify.data.checked} audit records verified. Each record hashes the one before it.` : `Records ${verify.data.brokenIds.join(', ')} do not match their hashes.`}</Banner></div>}
      <Async q={q} rows={6}>{(d) => (<>
        <div className="table-wrap"><table className="table"><caption className="sr-only">Audit events, newest first</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Object</th><th scope="col">Detail</th></tr></thead>
          <tbody>{d.items.map((a) => <tr key={a.id}><td className="whitespace-nowrap"><Time value={a.at} /></td><td>{a.actor}</td><td className="mono">{a.action}</td><td className="text-sm">{a.objectType} {a.objectId}</td><td className="mono max-w-[320px] break-all text-xs">{a.detail === '{}' ? '' : a.detail}</td></tr>)}</tbody></table></div>
        <Pagination page={d.page} size={d.size} total={d.total} onPage={setPage} /></>)}
      </Async>
    </Card>
  )
}

function System() {
  const q = useQuery({ queryKey: ['system'], queryFn: () => api<Sys>('/api/system') })
  return (
    <Async q={q} rows={4}>{(s) => (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Runtime" id="rt"><KeyValue rows={[{ k: 'AegisSOC', v: s.version }, { k: 'Java', v: s.java }, { k: 'Uptime', v: `${Math.round(s.uptimeSeconds / 60)} min` }, { k: 'API heap', v: `${s.heapUsedMb} / ${s.heapMaxMb} MB` }, { k: 'Database size', v: `${s.databaseSizeMb} MB` }]} /><p className="muted mt-3 text-xs">Measured live from the running API. Performance benchmarks are recorded in docs/evidence/TEST_RESULTS.md.</p></Card>
        <Card title="Safety posture" id="safety">
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2"><ShieldAlert size={17} className="shrink-0 text-[var(--ok-fg)]" aria-hidden="true" /><span><strong>Live response execution:</strong> {s.liveResponseExecution}</span></li>
            <li className="flex gap-2"><ShieldAlert size={17} className="shrink-0 text-[var(--ok-fg)]" aria-hidden="true" /><span><strong>External connectors:</strong> {s.externalConnectors}</span></li>
            <li className="flex gap-2"><ShieldAlert size={17} className="shrink-0 text-[var(--ok-fg)]" aria-hidden="true" /><span><strong>AI provider:</strong> {s.aiProvider}</span></li>
          </ul>
        </Card>
      </div>)}
    </Async>
  )
}

function Privacy({ admin }: { admin: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [dlg, setDlg] = useState<null | 'retention' | 'reset'>(null)
  const [days, setDays] = useState(30)
  const [typed, setTyped] = useState('')
  const sys = useQuery({ queryKey: ['system'], queryFn: () => api<Sys>('/api/system') })
  const act = useMutation({
    mutationFn: async () => {
      const headers = { 'X-Confirm': dlg === 'retention' ? 'DELETE-OLD-EVENTS' : 'DELETE-DEV-DATA' }
      const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? '')
      const res = await fetch(dlg === 'retention' ? '/api/admin/retention/run' : '/api/admin/dev/reset', { method: 'POST', credentials: 'same-origin', headers: { ...headers, 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token }, body: dlg === 'retention' ? JSON.stringify({ days }) : undefined })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message ?? 'Failed')
      return body
    },
    onSuccess: (b) => { toast.push('ok', dlg === 'retention' ? `Deleted ${b.eventsDeleted} events not cited as evidence.` : 'Development data reset. Users, rules, sources and the audit log were kept.'); setDlg(null); setTyped(''); void qc.invalidateQueries() },
    onError: (e) => toast.push('danger', errMessage(e)),
  })
  const word = dlg === 'retention' ? 'DELETE' : 'RESET'
  return (
    <div className="space-y-6">
      <Card title="What AegisSOC stores" id="stores">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Normalized events and their immutable raw originals (flagged SYNTHETIC when generated).</li>
          <li>Alerts, cases, notes and the audit log. Reports are generated on demand and only their hash is logged.</li>
          <li>Nothing is sent to third parties: no telemetry, no external AI, no email/Slack/webhooks.</li>
          <li>Exports are redacted by default (IPs masked to /24; users and hosts pseudonymized).</li>
        </ul>
      </Card>
      <Card title="Retention" id="retention">
        <p className="text-sm">Retention removes aged events that no alert or case cites. Events used as evidence are never deleted. Shorter retention reduces what you can investigate later.</p>
        {admin ? <button className="btn mt-3" onClick={() => setDlg('retention')}><Trash2 size={15} aria-hidden="true" /> Run retention…</button> : <p className="muted mt-2 text-xs">Administrators only.</p>}
      </Card>
      {sys.data?.devResetAvailable && admin && (
        <Card title="Development reset" id="reset">
          <Banner kind="danger" title="Destructive — for development databases only">Wipes events, alerts, cases, hunts, proposals and notifications. Keeps users, rules, sources, indicators and the audit log (which records the reset).</Banner>
          <button className="btn btn-danger mt-3" onClick={() => setDlg('reset')}>Reset development data…</button>
        </Card>
      )}
      <Modal open={dlg !== null} onClose={() => { setDlg(null); setTyped('') }} title={dlg === 'retention' ? 'Run retention' : 'Reset development data'}
        footer={<><button className="btn" onClick={() => setDlg(null)}>Cancel</button><button className="btn btn-danger" disabled={typed !== word || act.isPending} onClick={() => act.mutate()}>{act.isPending ? <Spinner /> : null} Confirm</button></>}>
        <div className="space-y-4">
          {dlg === 'retention' && <Field label="Delete uncited events older than (days)" htmlFor="ret-d"><input id="ret-d" className="input" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>}
          <Field label={`Type ${word} to confirm`} htmlFor="confirm-t"><input id="confirm-t" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
        </div>
      </Modal>
    </div>
  )
}
