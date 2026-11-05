import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Minus, Moon, Shield, Sun } from 'lucide-react'
import { usePrefs } from '../lib/prefs'
import { HowItWorks } from '../components/story/HowItWorks'
import { Scenarios } from '../components/story/Scenarios'
import { Term } from '../components/story/Term'

const PILLARS = [
  { eyebrow: 'See the proof', t: 'Every alert shows the records behind it.', d: 'Nothing is a black box. An alert names the check that matched and lists the exact activity records, so a person can agree or disagree for a reason.' },
  { eyebrow: 'AI that shows its work', t: 'The optional assistant is local, off by default, and checked.', d: 'If you turn it on, its explanations must point to real records. Anything it cannot back up is thrown away and replaced by a plain, rule-based explanation.' },
  { eyebrow: 'Honest about gaps', t: '"No alerts" is never presented as "no threats".', d: 'If a source goes quiet or was never connected, AegisSOC says so. Silence is reported as missing information, not as safety.' },
]

const SOURCES: { plain: string; tech: string; scope: string; state: 'built' | 'planned' }[] = [
  { plain: 'Practice Security Events', tech: 'Synthetic fixture replay', scope: 'Seven labelled examples you can replay any time. The data behind every demo.', state: 'built' },
  { plain: 'Import Network Security Alerts', tech: 'Suricata EVE JSON import', scope: 'Load alert files that a network monitor saved. No live connection.', state: 'built' },
  { plain: 'Connect Security Event Data', tech: 'JSON event API', scope: 'Send batches of events from a trusted program. They are checked and de-duplicated on arrival.', state: 'built' },
  { plain: 'Wazuh monitoring', tech: 'Wazuh manager, read-only adapter', scope: 'Planned. Switched off, and this build never contacts a Wazuh server.', state: 'planned' },
  { plain: 'Cloud activity logs', tech: 'Cloud audit logs, offline JSON import', scope: 'Planned. Not built yet.', state: 'planned' },
  { plain: 'Companion projects', tech: 'AegisAI and NetShield exports', scope: 'Planned optional links. AegisSOC works fully without them.', state: 'planned' },
]

export function Landing() {
  const { theme, toggleTheme } = usePrefs()
  const [analyst, setAnalyst] = useState(() => { try { return localStorage.getItem('aegis.landingMode') === 'analyst' } catch { return false } })
  const setMode = (a: boolean) => { setAnalyst(a); try { localStorage.setItem('aegis.landingMode', a ? 'analyst' : 'basic') } catch { /* ignore */ } }

  const stats: [string, string, string, string][] = [
    ['9', 'Security checks included', 'Each one looks for a specific suspicious pattern and explains itself.', 'built-in detection rules'],
    ['7', 'Interactive security examples', 'Practice situations you can replay to see how an alert is raised.', 'replayable synthetic scenarios'],
    ['Not connected', 'Live monitoring', 'No real network or system is being watched by this build.', 'live connectors enabled: 0'],
    ['Disabled', 'Actions on real systems', 'AegisSOC recommends and records. People act in their own tools.', 'response execution: off, enforced server-side'],
  ]

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <a href="#content" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-3 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 font-semibold no-underline" aria-label="AegisSOC home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)]"><Shield size={18} aria-hidden="true" /></span>
            <span className="text-[1.05rem] tracking-tight">AegisSOC</span>
          </Link>
          <nav aria-label="Site" className="hidden items-center gap-1 lg:flex">
            {[['How it works', '#how'], ['Examples', '#examples'], ['Connect data', '#sources'], ['Trust', '#trust'], ['Docs', '#docs']].map(([l, h]) => (<a key={h} href={h} className="nav-link !py-1.5">{l}</a>))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-lg border border-[var(--line)] p-0.5 sm:flex" role="group" aria-label="Explanation level">
              <button className={`btn btn-sm !min-h-8 border-0 ${!analyst ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={!analyst} onClick={() => setMode(false)}>Basic</button>
              <button className={`btn btn-sm !min-h-8 border-0 ${analyst ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={analyst} onClick={() => setMode(true)}>Analyst</button>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}</button>
            <Link to="/login" className="btn btn-primary">Open the app</Link>
          </div>
        </div>
      </header>

      <main id="content">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_460px_at_70%_-10%,color-mix(in_srgb,var(--accent)_17%,transparent),transparent_70%)]" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1360px] px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
            <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div>
                <p className="eyebrow rise">Security monitoring, explained</p>
                <h1 className="display rise mt-4" style={{ animationDelay: '60ms' }}>Know what is happening on your computers, and what to do about it.</h1>
              </div>
              <div className="rise" style={{ animationDelay: '120ms' }}>
                <p className="text-lg leading-relaxed sm:text-xl">
                  AegisSOC watches the activity records your computers produce (<Term k="telemetry">telemetry</Term>), flags suspicious patterns as an <Term k="alert">alert</Term>, and guides a person through the <Term k="investigation">investigation</Term>. People stay in charge.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#how" className="btn btn-primary">See how it works <ArrowRight size={17} aria-hidden="true" /></a>
                  <Link to="/login" className="btn">Open the app</Link>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-2 sm:hidden" role="group" aria-label="Explanation level">
              <span className="muted text-sm">Explanations:</span>
              <button className={`btn btn-sm ${!analyst ? 'btn-primary' : ''}`} aria-pressed={!analyst} onClick={() => setMode(false)}>Basic</button>
              <button className={`btn btn-sm ${analyst ? 'btn-primary' : ''}`} aria-pressed={analyst} onClick={() => setMode(true)}>Analyst</button>
            </div>

            <div id="how" className="mt-10 scroll-mt-24">
              <h2 className="sr-only">How AegisSOC works</h2>
              <HowItWorks analyst={analyst} />
            </div>

            <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
              {stats.map(([n, l, d, tech]) => (
                <div key={l} className="border-l-2 border-[var(--accent)] pl-4">
                  <dd className="stat-num !text-[1.7rem] sm:!text-[2rem]">{n}</dd>
                  <dt className="mt-1.5 font-semibold">{l}</dt>
                  <dd className="muted mt-1 text-sm">{analyst ? tech : d}</dd>
                </div>
              ))}
            </dl>
            <p className="muted mt-4 text-xs">These describe what this build ships with. They are not customer numbers, and no sample data is live.</p>
          </div>
        </section>

        <section id="examples" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-[1360px] px-5 py-20 sm:px-8">
            <p className="eyebrow">Examples</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Four everyday situations, and how an analyst works through each.</h2>
            <p className="muted mt-3 max-w-2xl text-lg">All four use practice data. They show what AegisSOC can see and how a <Term k="rule">rule</Term> turns it into an alert, not real attacks.</p>
            <div className="mt-10"><Scenarios analyst={analyst} /></div>
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-[1360px] px-5 py-20 sm:px-8">
          <p className="eyebrow">Why it is different</p>
          <div className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {PILLARS.map((p) => (
              <div key={p.eyebrow} className="grid gap-4 py-9 md:grid-cols-[220px_1fr_1fr] md:gap-12">
                <div className="eyebrow !text-[var(--muted)]">{p.eyebrow}</div>
                <h3 className="text-2xl font-semibold leading-snug tracking-tight">{p.t}</h3>
                <p className="muted text-lg">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="sources" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-[1360px] px-5 py-20 sm:px-8">
            <p className="eyebrow">Connect your data</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">What works today, and what does not yet.</h2>
            <div className="card mt-10 overflow-hidden">
              <table className="table text-base">
                <caption className="sr-only">Where security information can come from</caption>
                <thead><tr><th scope="col">Source</th><th scope="col">What it does</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {SOURCES.map((s) => (
                    <tr key={s.plain}>
                      <th scope="row" className="!bg-transparent !text-[var(--ink)] !normal-case !tracking-normal !text-base">{s.plain}{analyst && <div className="mono muted mt-0.5 !text-xs font-normal">{s.tech}</div>}</th>
                      <td className="muted">{s.scope}</td>
                      <td>{s.state === 'built' ? <span className="badge b-ok"><Check size={12} aria-hidden="true" /> Works today</span> : <span className="badge b-info"><Minus size={12} aria-hidden="true" /> Planned · off</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="trust" className="mx-auto grid max-w-[1360px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Security and trust</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">People stay in charge.</h2>
            <p className="muted mt-4 text-lg">These limits are enforced by the server, not just hidden in the interface.</p>
          </div>
          <ul className="space-y-4 text-base">
            {['Connections to outside systems are off by default.', 'Approving a response never changes a real system; it is recorded and simulated.', 'A case can only be marked contained after a measured check.', 'Log text is treated as untrusted: shown as plain text, never run.', 'Every change is written to a tamper-evident audit log.', 'Exports hide sensitive values by default.'].map((t) => (
              <li key={t} className="flex gap-3"><Check size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />{t}</li>
            ))}
          </ul>
        </section>

        <section id="docs" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-[1360px] px-5 py-16 sm:px-8">
            <p className="eyebrow">Documentation</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Everything is written down in the <span className="mono">docs/</span> folder.</h2>
            <ul className="mt-8 grid gap-x-10 gap-y-1 text-sm sm:grid-cols-2">
              {[['Local setup', 'docs/runbooks/LOCAL_SETUP.md'], ['Demo scenarios', 'docs/runbooks/DEMO_SCENARIOS.md'], ['System overview', 'docs/architecture/SYSTEM_OVERVIEW.md'], ['Threat model', 'docs/security/THREAT_MODEL.md'], ['Safety boundaries', 'docs/security/SAFETY_BOUNDARIES.md'], ['What is and is not done', 'docs/ai/FEATURE_MATRIX.md'], ['Test results', 'docs/evidence/TEST_RESULTS.md']].map(([t, p]) => (
                <li key={p} className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-3"><span className="font-medium">{t}</span><span className="mono muted">{p}</span></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-[radial-gradient(800px_320px_at_50%_100%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_70%)]">
          <div className="mx-auto max-w-3xl px-5 py-24 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See it work on safe practice data.</h2>
            <p className="muted mt-4 text-lg">Sign in to your own copy and press <strong>Run safe demo</strong>. You get the same events and the same alerts every time.</p>
            <Link to="/login" className="btn btn-primary mt-8">Open the app <ArrowRight size={17} aria-hidden="true" /></Link>
            <p className="muted mt-10 text-xs">AegisSOC is an independent defensive engineering project. It has no customers and makes no compliance or certification claims.</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-[var(--line)] py-6 text-center text-sm muted">AegisSOC · local build · demo data is practice data</footer>
    </div>
  )
}
