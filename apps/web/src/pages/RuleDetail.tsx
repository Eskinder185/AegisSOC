import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FlaskConical, GitCompare, Pencil, ShieldCheck } from 'lucide-react'
import { api } from '../api/client'
import type { RuleVersion, TestResult } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, Field, Modal, PageHeader, SeverityBadge, Spinner, StatusBadge, Time, useToast, errMessage } from '../components/ui'

interface RuleFull {
  id: string; name: string; purpose: string; severity: string; confidence: string; enabled: boolean; currentVersion: number; fingerprint: string
  attackTechniques: string[]; attackJustification: string; definition: Record<string, unknown>; conditions: string[]; versions: RuleVersion[]
  testRuns: { id: number; version: number; tp: number; fp: number; fn: number; tn: number; runBy: string; runAt: string }[]
}
const TUNABLE: [string, string, number, number][] = [['threshold', 'Count threshold', 1, 10000], ['window_seconds', 'Time window (seconds)', 1, 86400], ['silence_minutes', 'Silence (minutes)', 1, 10080], ['min_history', 'Minimum prior events', 1, 1000]]

function ScoreTable({ r }: { r: TestResult }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Caught (true positives)', r.truePositives, 'ok'], ['False alarms', r.falsePositives, r.falsePositives ? 'danger' : 'ok'], ['Missed attacks', r.missed, r.missed ? 'danger' : 'ok'], ['Correctly quiet', r.trueNegatives, 'ok']].map(([l, v, t]) => (
          <div key={l as string} className="rounded-xl border border-[var(--line)] p-3"><div className="card-title">{l}</div><div className={`text-2xl font-bold tabular-nums ${t === 'danger' ? 'text-[var(--crit-fg)]' : ''}`}>{v}</div></div>
        ))}
      </div>
      <p className="text-sm">Sensitivity {r.sensitivity != null ? Math.round(r.sensitivity * 100) + '%' : 'n/a'} · Precision {r.precision != null ? Math.round(r.precision * 100) + '%' : 'n/a'} · version {r.version} · fingerprint <span className="mono">{r.fingerprint}</span></p>
      <ul className="space-y-1 text-sm">
        {r.details.scenarios.map((s) => (
          <li key={s.scenario} className="rounded-lg border border-[var(--line)] p-2.5"><strong>{s.title}</strong>
            {s.truePositives.length > 0 && <div>✔ caught: <span className="mono">{s.truePositives.join(', ')}</span></div>}
            {s.falsePositives.length > 0 && <div className="text-[var(--crit-fg)]">✖ false alarm: <span className="mono">{s.falsePositives.join(', ')}</span></div>}
            {s.missed.length > 0 && <div className="text-[var(--crit-fg)]">✖ missed: <span className="mono">{s.missed.join(', ')}</span></div>}
            {s.trueNegatives.length > 0 && <div className="muted">✔ correctly ignored: <span className="mono">{s.trueNegatives.join(', ')}</span></div>}</li>))}
      </ul>
      <p className="muted text-xs">{r.caveat}</p>
    </div>
  )
}

export function RuleDetail() {
  const { id = '' } = useParams()
  const { can, me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [edit, setEdit] = useState<Record<string, number> | null>(null)
  const [json, setJson] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [note, setNote] = useState('')
  const [dialog, setDialog] = useState<null | 'draft' | 'disable'>(null)
  const [result, setResult] = useState<TestResult | null>(null)
  const [compare, setCompare] = useState<{ a: TestResult; b: TestResult } | null>(null)
  const [reason, setReason] = useState('')

  const q = useQuery({ queryKey: ['rule', id], queryFn: () => api<RuleFull>(`/api/rules/${id}`) })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rule', id] }); void qc.invalidateQueries({ queryKey: ['rules'] }) }
  const onError = (e: unknown) => toast.push('danger', errMessage(e))

  const draft = useMutation({
    mutationFn: (body: { definition: unknown; changeNote: string }) => api<{ version: number }>(`/api/rules/${id}/versions`, { method: 'POST', body }),
    onSuccess: (r) => { toast.push('ok', `Draft v${r.version} saved. Run the labelled tests next.`); setDialog(null); setNote(''); setEdit(null); refresh() }, onError,
  })
  const test = useMutation({ mutationFn: (v: number) => api<TestResult>(`/api/rules/${id}/versions/${v}/test`, { method: 'POST' }), onSuccess: (r) => { setResult(r); refresh() }, onError })
  const approve = useMutation({ mutationFn: (v: number) => api(`/api/rules/${id}/versions/${v}/approve`, { method: 'POST', body: { comment: 'Approved after reviewing labelled test results' } }), onSuccess: () => { toast.push('ok', 'Version approved and now active in AegisSOC. It was NOT deployed to any external system.'); refresh() }, onError })
  const reject = useMutation({ mutationFn: (v: number) => api(`/api/rules/${id}/versions/${v}/reject`, { method: 'POST', body: { comment: 'Rejected' } }), onSuccess: () => { toast.push('info', 'Draft rejected.'); refresh() }, onError })
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api(`/api/rules/${id}`, { method: 'PATCH', body: { enabled, reason } }), onSuccess: () => { setDialog(null); setReason(''); refresh() }, onError })
  const cmp = useMutation({ mutationFn: (v: number) => api<{ a: TestResult; b: TestResult }>(`/api/rules/${id}/compare?a=${q.data!.currentVersion}&b=${v}`), onSuccess: setCompare, onError })

  return (
    <>
      <Link to="/app/detections" className="btn btn-ghost btn-sm mb-3"><ArrowLeft size={15} aria-hidden="true" /> All detections</Link>
      <Async q={q} rows={8}>
        {(r) => {
          const def = r.definition as Record<string, unknown>
          const tunables = TUNABLE.filter(([k]) => typeof def[k] === 'number')
          const startEdit = () => { setEdit(Object.fromEntries(tunables.map(([k]) => [k, def[k] as number]))); setJson(JSON.stringify(def, null, 2)); setAdvanced(false); setNote(''); setDialog('draft') }
          const submitDraft = () => {
            let definition: unknown
            try { definition = advanced ? JSON.parse(json) : { ...def, ...edit } } catch { toast.push('danger', 'The definition is not valid JSON.'); return }
            draft.mutate({ definition, changeNote: note })
          }
          return (
            <div className="space-y-6">
              <PageHeader title={r.name} subtitle={<span className="flex flex-wrap items-center gap-2"><span className="mono">{r.id}</span><SeverityBadge severity={r.severity} /><span className="badge b-info">{r.confidence.toLowerCase()} confidence</span>{r.enabled ? <span className="badge b-ok">Enabled</span> : <span className="badge b-info">Disabled</span>}<span className="muted text-sm">active v{r.currentVersion}</span></span>}
                actions={<>
                  {can('DETECTION_ENGINEER') && <button className="btn btn-primary" onClick={startEdit}><Pencil size={16} aria-hidden="true" /> Draft a change</button>}
                  {can('DETECTION_ENGINEER') && <button className="btn" onClick={() => r.enabled ? setDialog('disable') : toggle.mutate(true)}>{r.enabled ? 'Disable…' : 'Enable'}</button>}
                </>} />
              <p className="max-w-3xl">{r.purpose}</p>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Exactly what this rule evaluates" id="logic">
                  <ul className="list-disc space-y-1.5 pl-5 text-sm">{r.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  <h3 className="card-title mb-1 mt-4">ATT&amp;CK mapping</h3>
                  <p className="text-sm">{r.attackTechniques.length ? r.attackTechniques.join(', ') : 'No technique asserted.'} {r.attackJustification}</p>
                  <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Definition (JSON)</summary><pre className="mono mt-2 max-h-72 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs" tabIndex={0}>{JSON.stringify(def, null, 2)}</pre></details>
                </Card>
                <Card title="Version history & review" id="versions" pad={false}>
                  <ul>{r.versions.map((v) => (
                    <li key={v.version} className="border-b border-[var(--line)] px-5 py-3 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>v{v.version}</strong> <StatusBadge status={v.status} /> <span className="mono muted text-xs">{v.fingerprint}</span></div>
                        <div className="flex gap-1.5">
                          {can('DETECTION_ENGINEER') && <button className="btn btn-sm" disabled={test.isPending} onClick={() => test.mutate(v.version)}><FlaskConical size={14} aria-hidden="true" /> Run tests</button>}
                          {v.version !== r.currentVersion && <button className="btn btn-sm" disabled={cmp.isPending} onClick={() => cmp.mutate(v.version)}><GitCompare size={14} aria-hidden="true" /> Compare with active</button>}
                          {v.status === 'DRAFT' && can('DETECTION_ENGINEER') && <>
                            <button className="btn btn-sm btn-primary" disabled={approve.isPending || v.createdBy === me?.username} title={v.createdBy === me?.username ? 'A different person must review your change' : ''} onClick={() => approve.mutate(v.version)}><ShieldCheck size={14} aria-hidden="true" /> Approve</button>
                            <button className="btn btn-sm" onClick={() => reject.mutate(v.version)}>Reject</button></>}
                        </div></div>
                      <p className="muted mt-1 text-xs">{v.changeNote || 'No note'} · by {v.createdBy} <Time value={v.createdAt} />{v.approvedBy && <> · reviewed by {v.approvedBy}</>}</p>
                      {v.status === 'DRAFT' && v.createdBy === me?.username && <p className="muted text-xs">You wrote this draft: ask someone else to approve it after running the tests.</p>}
                    </li>))}</ul>
                </Card>
              </div>
              {(test.isPending || cmp.isPending) && <p role="status"><Spinner label="Running labelled tests" /> Running the labelled suite…</p>}
              {result && <Card title={`Test result · ${r.id} v${result.version}`} id="test-result"><ScoreTable r={result} /></Card>}
              {compare && (
                <Card title="Before / after on the same labelled suite" id="compare">
                  <div className="grid gap-6 lg:grid-cols-2"><div><h3 className="h-section mb-2">Active (v{compare.a.version})</h3><ScoreTable r={compare.a} /></div><div><h3 className="h-section mb-2">Candidate (v{compare.b.version})</h3><ScoreTable r={compare.b} /></div></div>
                  <p className="mt-3 text-sm font-semibold">{compare.b.falsePositives > compare.a.falsePositives ? 'The candidate creates more false alarms.' : ''} {compare.b.missed > compare.a.missed ? 'The candidate misses attacks the active version catches.' : ''} {compare.b.falsePositives <= compare.a.falsePositives && compare.b.missed <= compare.a.missed ? 'The candidate is no worse on this suite.' : ''}</p>
                </Card>
              )}
              {r.testRuns.length > 0 && <Card title="Test run history" id="runs" pad={false}><ul>{r.testRuns.map((t) => <li key={t.id} className="flex justify-between border-b border-[var(--line)] px-5 py-2.5 text-sm last:border-0"><span>v{t.version} · TP {t.tp} · FP {t.fp} · missed {t.fn} · quiet {t.tn}</span><span className="muted">{t.runBy} · <Time value={t.runAt} /></span></li>)}</ul></Card>}

              <Modal open={dialog === 'draft'} onClose={() => setDialog(null)} title="Draft a new rule version"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={draft.isPending} onClick={submitDraft}>Save draft</button></>}>
                <div className="space-y-4">
                  <Banner kind="info">Saving creates a DRAFT. It is inactive until tested and approved by someone else.</Banner>
                  {!advanced && tunables.map(([k, l, min, max]) => (
                    <Field key={k} label={l} htmlFor={`t-${k}`} hint={`Allowed ${min}–${max}. Current: ${def[k] as number}`}><input id={`t-${k}`} className="input" type="number" min={min} max={max} value={edit?.[k] ?? 0} onChange={(e) => setEdit({ ...edit, [k]: Number(e.target.value) })} /></Field>
                  ))}
                  {!advanced && tunables.length === 0 && <p className="muted text-sm">This rule has no simple numeric parameters. Use the advanced editor.</p>}
                  <label className="flex gap-2 text-sm"><input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Advanced: edit the full definition</label>
                  {advanced && <Field label="Definition (validated by the server against a closed schema)" htmlFor="t-json"><textarea id="t-json" className="textarea mono !min-h-[240px]" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} /></Field>}
                  <Field label="What are you changing and why?" htmlFor="t-note"><input id="t-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} /></Field>
                </div>
              </Modal>
              <Modal open={dialog === 'disable'} onClose={() => setDialog(null)} title="Disable this detection?"
                footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-danger" disabled={!reason.trim() || toggle.isPending} onClick={() => toggle.mutate(false)}>Disable detection</button></>}>
                <div className="space-y-3"><Banner kind="warn">While disabled, this rule produces no alerts. That is a blind spot, so it is audited.</Banner><Field label="Reason (required)" htmlFor="dis-r"><input id="dis-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
              </Modal>
            </div>
          )
        }}
      </Async>
    </>
  )
}
