import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bot, FlaskConical, ShieldCheck } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, Field, KeyValue, PageHeader, Spinner, StatusBadge, Time, useToast, errMessage } from '../components/ui'

interface Status { provider: string; providerConfigured: boolean; model: string; enabledByAdmin: boolean; effective: boolean; mockBehavior?: string; mockBehaviors: string[]; timeoutSeconds: number; maxContextEvents: number; fallback: string; privacy: string[]; resources: string; permissions: string }
interface Evaluation { cases: number; passed: number; accuracy: number; caveat: string; results: { case: string; category: string; expected: string; actual: string; reason?: string; passed: boolean }[] }
interface RunRow { id: number; subjectType: string; subjectId: number; provider: string; mode: string; status: string; fallbackReason?: string; latencyMs: number; createdBy: string; createdAt: string }

export function AiAnalyst() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const st = useQuery({ queryKey: ['ai-status'], queryFn: () => api<Status>('/api/ai/status') })
  const runs = useQuery({ queryKey: ['ai-runs'], queryFn: () => api<RunRow[]>('/api/ai/runs') })
  const evalM = useMutation({ mutationFn: () => api<Evaluation>('/api/ai/evaluate', { method: 'POST' }), onError: (e) => toast.push('danger', errMessage(e)) })
  const set = useMutation({
    mutationFn: (b: { enabled?: boolean; mockBehavior?: string }) => api('/api/ai/settings', { method: 'PUT', body: b }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-status'] }), onError: (e) => toast.push('danger', errMessage(e)),
  })
  return (
    <>
      <PageHeader title="AI analyst" subtitle="AI is optional, off by default, and cannot act. Every workflow works without it; the assistant only adds a labelled interpretation that must pass safety checks." />
      <Async q={st} rows={5}>
        {(s) => (
          <div className="space-y-6">
            <Banner kind={s.effective ? 'warn' : 'ok'} title={s.effective ? 'AI is ON (opt-in per analysis)' : 'AI is OFF — deterministic explanations are in use'}>
              {s.effective ? 'A model on this machine can be asked to add an interpretation when an analyst ticks the opt-in box. It never runs on its own.' : s.providerConfigured ? 'A provider is configured but an administrator has not enabled it.' : 'No provider is configured. Nothing is sent anywhere. This is the default and the recommended state for real data.'}
            </Banner>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Opt-in checklist" id="optin">
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3"><StatusBadge status={s.providerConfigured ? 'HEALTHY' : 'DISABLED'} label={s.providerConfigured ? 'Done' : 'Not set'} /><div><strong>1 · Operator configures a provider</strong> in the environment (<span className="mono">AEGIS_AI_PROVIDER=ollama</span> and <span className="mono">AEGIS_AI_MODEL</span>). Currently: <span className="mono">{s.provider}</span>{s.model && <> / <span className="mono">{s.model}</span></>}. Only loopback endpoints are accepted, so no cloud provider exists in this build.</div></li>
                  <li className="flex gap-3"><StatusBadge status={s.enabledByAdmin ? 'HEALTHY' : 'DISABLED'} label={s.enabledByAdmin ? 'On' : 'Off'} /><div><strong>2 · An administrator enables AI</strong> here.</div></li>
                  <li className="flex gap-3"><StatusBadge status="PENDING" label="Per use" /><div><strong>3 · An analyst opts in for each analysis</strong> with the checkbox on an alert or case.</div></li>
                </ol>
                {can('ADMIN') && (
                  <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={s.enabledByAdmin} disabled={!s.providerConfigured || set.isPending} onChange={(e) => set.mutate({ enabled: e.target.checked })} /> Allow analysts to use the configured model</label>
                    {s.provider === 'mock' && (
                      <Field label="Mock model behaviour (demonstrates the guard rails with no real model)" htmlFor="mock-b">
                        <select id="mock-b" className="select" value={s.mockBehavior} onChange={(e) => set.mutate({ mockBehavior: e.target.value })}>{s.mockBehaviors.map((b) => <option key={b}>{b}</option>)}</select>
                      </Field>)}
                  </div>)}
              </Card>
              <Card title="Privacy, resources & permissions" id="privacy">
                <ul className="list-disc space-y-2 pl-5 text-sm">{s.privacy.map((p, i) => <li key={i}>{p}</li>)}</ul>
                <KeyValue rows={[{ k: 'Resources', v: s.resources }, { k: 'Permissions', v: s.permissions }, { k: 'Fallback', v: s.fallback }]} />
              </Card>
            </div>

            <Card title="Safety evaluation" id="eval" actions={can('DETECTION_ENGINEER') && <button className="btn btn-sm btn-primary" onClick={() => evalM.mutate()} disabled={evalM.isPending}>{evalM.isPending ? <Spinner /> : <FlaskConical size={14} aria-hidden="true" />} Run evaluation</button>}>
              <p className="muted text-sm">Feeds hostile and broken model outputs (invented evidence, overconfidence, prompt injection, secrets, unsafe advice, malformed JSON, “no evidence” cases) through the same validator used in production and checks each is handled correctly.</p>
              {evalM.data && (
                <div className="mt-4 space-y-3">
                  <p className="font-semibold"><ShieldCheck className="mr-1 inline" size={16} aria-hidden="true" />{evalM.data.passed} of {evalM.data.cases} cases handled correctly ({evalM.data.accuracy}%)</p>
                  <div className="table-wrap"><table className="table"><caption className="sr-only">Evaluation cases</caption>
                    <thead><tr><th scope="col">Case</th><th scope="col">Category</th><th scope="col">Expected</th><th scope="col">Actual</th><th scope="col">Result</th></tr></thead>
                    <tbody>{evalM.data.results.map((r) => <tr key={r.case}><td className="mono">{r.case}</td><td>{r.category}</td><td>{r.expected}</td><td>{r.actual}{r.reason && <div className="muted max-w-[260px] text-xs">{r.reason}</div>}</td><td><span className={`badge ${r.passed ? 'b-ok' : 'b-critical'}`}>{r.passed ? 'Pass' : 'FAIL'}</span></td></tr>)}</tbody></table></div>
                  <p className="muted text-xs">{evalM.data.caveat}</p>
                </div>)}
            </Card>

            <Card title={<span className="inline-flex items-center gap-1.5"><Bot size={14} aria-hidden="true" /> Recent analyses</span>} id="runs" pad={false}>
              <Async q={runs} rows={3} empty={(d) => d.length === 0 ? <p className="muted p-5 text-sm">No analyses yet. Open an <Link className="underline" to="/app/alerts">alert</Link> or <Link className="underline" to="/app/incidents">case</Link> and use the assistant panel.</p> : null}>
                {(d) => <div className="table-wrap"><table className="table"><caption className="sr-only">AI analysis log</caption><thead><tr><th scope="col">Subject</th><th scope="col">Mode</th><th scope="col">Provider</th><th scope="col">Latency</th><th scope="col">Why fallback</th><th scope="col">By</th></tr></thead>
                  <tbody>{d.map((r) => <tr key={r.id}><td>{r.subjectType} #{r.subjectId}</td><td><span className={`badge ${r.mode === 'AI' ? 'b-medium' : r.mode === 'FALLBACK' ? 'b-high' : 'b-ok'}`}>{r.mode.toLowerCase()}</span></td><td>{r.provider}</td><td>{r.latencyMs} ms</td><td className="max-w-[280px] text-xs">{r.fallbackReason ?? '—'}</td><td className="text-sm">{r.createdBy} <Time value={r.createdAt} /></td></tr>)}</tbody></table></div>}
              </Async>
            </Card>
          </div>
        )}
      </Async>
    </>
  )
}
