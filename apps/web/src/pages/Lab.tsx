import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Play, Wrench } from 'lucide-react'
import { api } from '../api/client'
import { useRunScenario } from '../api/hooks'
import type { RunRow, Scenario } from '../api/types'
import { useAuth } from '../lib/auth'
import { Async, Banner, Card, PageHeader, Spinner, StatusBadge, SyntheticBadge, useToast, errMessage } from '../components/ui'

export function Lab() {
  const { can } = useAuth()
  const toast = useToast()
  const run = useRunScenario()
  const [last, setLast] = useState<Record<string, RunRow>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['scenarios'], queryFn: () => api<Scenario[]>('/api/lab/scenarios') })

  async function go(id: string, opts: { repair?: boolean; mode?: 'paced' | 'instant' } = {}) {
    setBusy(id + (opts.repair ? ':fix' : ''))
    try {
      const r = await run.mutateAsync({ id, ...opts })
      setLast((l) => ({ ...l, [id]: r }))
      toast.push(r.status === 'FAILED' ? 'danger' : 'ok', `${id}: ${r.status.toLowerCase()} — ${r.eventsAccepted} stored, ${r.eventsDuplicate} duplicate, ${r.eventsRejected} rejected, ${r.alertsCreated} alert(s).`)
    } catch (e) { toast.push('danger', errMessage(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader title="Lab & demos" subtitle="Repeatable, clearly labelled synthetic scenarios. They generate events, store them in the database and run the real detection rules — nothing is mocked in the UI." />
      <Banner kind="syn" title="Everything here is synthetic">Addresses come from documentation ranges and domains use reserved names. Replaying a scenario within the same 10-minute window is idempotent: duplicates are skipped, not doubled.</Banner>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Async q={q} rows={6}>
          {(d) => d.map((s) => {
            const isFailure = s.id === 'corrupted_feed'
            const r = last[s.id]
            return (
              <Card key={s.id} id={`sc-${s.id}`} title={isFailure ? 'Failure drill' : 'Scenario'}>
                <h3 className="h-section flex flex-wrap items-center gap-2">{s.title} <SyntheticBadge /></h3>
                <p className="muted mt-1 text-sm">{s.description}</p>
                {s.exercisesRules.length > 0 && <p className="mt-2 text-xs"><span className="muted">Exercises:</span> {s.exercisesRules.map((r) => <Link key={r} to={`/app/detections/${r}`} className="mono mr-2 underline">{r}</Link>)}</p>}
                {can('ANALYST') && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => go(s.id)}>{busy === s.id ? <Spinner label="Running" /> : isFailure ? <FlaskConical size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} {isFailure ? 'Simulate the failure' : 'Replay now'}</button>
                    {!isFailure && <button className="btn btn-sm" disabled={busy !== null} onClick={() => go(s.id, { mode: 'paced' })}>Replay paced (live feel)</button>}
                    {isFailure && <button className="btn btn-sm" disabled={busy !== null} onClick={() => go(s.id, { repair: true })}>{busy === s.id + ':fix' ? <Spinner label="Repairing" /> : <Wrench size={14} aria-hidden="true" />} Replay repaired feed</button>}
                  </div>
                )}
                {r && <p className="mt-3 text-sm" role="status"><StatusBadge status={r.status} /> run #{r.id}: {r.eventsAccepted} stored · {r.eventsDuplicate} duplicates · {r.eventsRejected} rejected · {r.alertsCreated} alert(s). {isFailure && r.status === 'FAILED' && <Link className="underline" to="/app/sources">Open the troubleshooting view</Link>} {!isFailure && r.alertsCreated > 0 && <Link className="underline" to="/app/alerts">See alerts</Link>}</p>}
              </Card>
            )
          })}
        </Async>
      </div>
    </>
  )
}
