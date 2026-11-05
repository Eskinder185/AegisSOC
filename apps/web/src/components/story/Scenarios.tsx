import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SCENARIOS } from '../../lib/story'

export function Scenarios({ analyst }: { analyst: boolean }) {
  const [id, setId] = useState(SCENARIOS[0].id)
  const s = SCENARIOS.find((x) => x.id === id)!
  const blocks: [string, string][] = [
    ['What AegisSOC can see', s.observes],
    ['Why it may be suspicious', s.suspicious],
    ['How an analyst investigates', s.investigate],
    ['What a defensive response might involve', s.response],
    ['Evidence needed to confirm it', s.evidence],
  ]
  return (
    <div>
      <div role="tablist" aria-label="Security examples" className="flex flex-wrap gap-1 border-b border-[var(--line)]">
        {SCENARIOS.map((x) => (
          <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={x.id === id} aria-controls={`panel-${x.id}`} tabIndex={x.id === id ? 0 : -1} className="tab"
            onClick={() => setId(x.id)}
            onKeyDown={(e) => {
              const i = SCENARIOS.findIndex((y) => y.id === x.id)
              const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? SCENARIOS.length - 1 : null
              if (to === null) return
              e.preventDefault()
              const next = SCENARIOS[(to + SCENARIOS.length) % SCENARIOS.length].id
              setId(next)
              requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus())
            }}>
            {x.title}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${s.id}`} aria-labelledby={`tab-${s.id}`} className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
          <p className="mt-2 text-lg">{s.summary}</p>
          <p className="badge b-synthetic mt-4">Practice data · nothing here really happened</p>
          <ol className="mt-6 space-y-0 border-l-2 border-[var(--line)] pl-6" aria-label="What happens, in order">
            {s.steps.map((st, i) => (
              <li key={i} className="relative pb-6 last:pb-0">
                <span className="absolute -left-[33px] top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--accent)] bg-[var(--bg)]" aria-hidden="true" />
                <div className="mono muted">{st.t}</div>
                <div className="text-base">{st.what}</div>
              </li>
            ))}
          </ol>
          <p className="muted mt-6 text-sm">{s.support}{analyst ? ' See docs/runbooks/DEMO_SCENARIOS.md for the exact fixture.' : ''}</p>
          <Link to="/login" className="btn mt-4">Try it in the app</Link>
        </div>
        <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {blocks.map(([h, b]) => (<div key={h}><dt className="card-title">{h}</dt><dd className="mt-1.5 text-base leading-relaxed">{b}</dd></div>))}
        </dl>
      </div>
    </div>
  )
}
