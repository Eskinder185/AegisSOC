import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Moon, Shield, Sun, Minus } from 'lucide-react'
import { usePrefs } from '../lib/prefs'
import { LoadingRows } from '../components/ui'

const NetworkHero = lazy(() => import('../components/three/NetworkHero').then((m) => ({ default: m.NetworkHero })))

const PIPELINE = [
  ['Collect', 'Synthetic fixtures, EVE JSON files, a JSON API. Network connectors stay disabled until you authorise them.'],
  ['Normalize', 'UTC timestamps, one common shape, duplicates dropped, bad rows reported individually.'],
  ['Detect', 'Versioned, regex-free rules with confidence and an honest list of what is uncertain.'],
  ['Investigate', 'Pivot, open a case, document findings, ask the optional AI analyst for cited explanations.'],
  ['Respond', 'Simulated proposals, second-person approval, then a measured verification. Nothing runs on a real system.'],
  ['Improve', 'Draft a rule change, test it on labelled cases, compare before and after, approve with a second person.'],
]

const PILLARS = [
  { eyebrow: 'Evidence first', t: 'Every alert links to the exact stored events behind it.', d: 'Events keep their raw original, parser version and a SYNTHETIC flag. An alert states its rule, version, conditions and inputs, so an analyst can disagree with it for a reason.' },
  { eyebrow: 'AI that cites', t: 'The analyst assistant is optional, local and checked.', d: 'Off by default and loopback-only. Its output must reference real event ids and cannot claim actions; anything else is discarded for a deterministic explanation.' },
  { eyebrow: 'Honest monitoring', t: '“No alerts” is never shown as “no threats”.', d: 'A silent sensor raises a coverage finding. The command center separates no data, failed sources and a quiet network.' },
]

const INTEGRATIONS: [string, string, 'built' | 'planned'][] = [
  ['Synthetic fixture replay', 'Seven labelled scenarios, deterministic per seed', 'built'],
  ['Suricata EVE JSON import', 'Files you provide; no live sensor connection', 'built'],
  ['JSON event API', 'Bounded batches, validated and deduplicated', 'built'],
  ['Wazuh manager', 'Read-only adapter, disabled by default', 'planned'],
  ['AegisAI / NetShield', 'Versioned optional exports', 'planned'],
  ['Cloud audit logs', 'Offline import of exported JSON', 'planned'],
]

export function Landing() {
  const { theme, toggleTheme } = usePrefs()
  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <a href="#content" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <Link to="/" className="flex items-center gap-2.5 font-semibold no-underline" aria-label="AegisSOC home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)]"><Shield size={18} aria-hidden="true" /></span>
            <span className="text-[1.05rem] tracking-tight">AegisSOC</span>
          </Link>
          <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
            {[['Platform', '#platform'], ['Pipeline', '#pipeline'], ['Integrations', '#integrations'], ['Trust', '#trust'], ['Docs', '#docs']].map(([l, h]) => (
              <a key={h} href={h} className="nav-link !py-1.5">{l}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}</button>
            <Link to="/login" className="btn btn-primary">Open the app</Link>
          </div>
        </div>
      </header>

      <main id="content">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_75%_-5%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_70%)]" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-10 sm:pt-14">
            <p className="eyebrow rise">Security operations, run on your own machine</p>
            <h1 className="display rise mt-4 max-w-3xl" style={{ animationDelay: '60ms' }}>Turn noisy security events into <span className="text-[var(--accent)]">evidence-backed</span> investigations.</h1>
            <p className="muted rise mt-6 max-w-2xl text-lg" style={{ animationDelay: '120ms' }}>
              AegisSOC collects permitted telemetry, detects suspicious behaviour with transparent rules, and helps analysts investigate, respond and improve. AI assists the analyst; it never bypasses human authority.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '180ms' }}>
              <Link to="/login" className="btn btn-primary">Open the app <ArrowRight size={17} aria-hidden="true" /></Link>
              <a href="#platform" className="btn">Explore the platform</a>
            </div>
            <div className="mt-9">
              <Suspense fallback={<div className="aspect-[4/3] min-h-[320px] max-h-[520px]"><LoadingRows label="Loading the topology visualization" rows={4} /></div>}>
                <NetworkHero />
              </Suspense>
            </div>
            <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {[['9', 'built-in detections'], ['7', 'replayable scenarios'], ['0', 'live connectors enabled'], ['0', 'actions on real systems']].map(([n, l]) => (
                <div key={l} className="border-l-2 border-[var(--accent)] pl-3"><dd className="stat-num">{n}</dd><dt className="muted mt-1 text-sm">{l}</dt></div>
              ))}
            </dl>
            <p className="muted mt-3 text-xs">Figures describe this build&apos;s shipped content, not customers or results.</p>
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-6xl px-5 py-20">
          <p className="eyebrow">Platform</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Built around the questions an analyst actually asks.</h2>
          <div className="mt-12 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {PILLARS.map((p) => (
              <div key={p.eyebrow} className="grid gap-4 py-8 md:grid-cols-[200px_1fr_1fr] md:gap-10">
                <div className="eyebrow !text-[var(--muted)]">{p.eyebrow}</div>
                <h3 className="text-xl font-semibold leading-snug tracking-tight">{p.t}</h3>
                <p className="muted">{p.d}</p>
              </div>
            ))}
          </div>

          <figure className="card mt-14 overflow-hidden" aria-label="Illustrative example of an alert explanation">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-5 py-3"><span className="badge b-high">High</span><span className="badge b-synthetic">SYNTHETIC</span><span className="font-semibold">Repeated failed sign-ins, then a success</span></div>
            <div className="grid gap-px bg-[var(--line)] text-sm md:grid-cols-4">
              {[['What happened', 'Account jdoe had 7 failed sign-ins from 198.51.100.23 within 300 seconds, then a success.'], ['How sure are we?', 'Medium. Fits password guessing, but a person who forgot a password can look similar.'], ['Evidence', '8 stored events (#1–#8) from rule AEG-AUTH-001 v1. Each opens as raw JSON.'], ['Next', 'Ask the account owner whether they signed in from that address, then check the host.']].map(([h, b]) => (
                <div key={h} className="bg-[var(--surface)] p-5"><div className="card-title">{h}</div><p className="mt-2">{b}</p></div>
              ))}
            </div>
            <figcaption className="muted border-t border-[var(--line)] px-5 py-2 text-xs">Illustration of the app&apos;s output using the shipped synthetic fixture.</figcaption>
          </figure>
        </section>

        <section id="pipeline" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <p className="eyebrow">Pipeline</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">From raw telemetry to a verified outcome.</h2>
            <ol className="mt-12 grid gap-y-8 md:grid-cols-3 lg:grid-cols-6">
              {PIPELINE.map(([t, d], i) => (
                <li key={t} className="relative pr-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--accent)] text-sm font-semibold text-[var(--accent)]">{i + 1}</span>
                    {i < PIPELINE.length - 1 && <span className="hidden h-px flex-1 bg-gradient-to-r from-[var(--accent)] to-transparent lg:block" aria-hidden="true" />}
                  </div>
                  <h3 className="mt-4 font-semibold">{t}</h3>
                  <p className="muted mt-1 text-sm">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="integrations" className="mx-auto max-w-6xl px-5 py-20">
          <p className="eyebrow">Integrations</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">What works today, and what does not yet.</h2>
          <div className="card mt-10 overflow-hidden">
            <table className="table">
              <caption className="sr-only">Integration status</caption>
              <thead><tr><th scope="col">Source</th><th scope="col">Scope</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {INTEGRATIONS.map(([n, d, s]) => (
                  <tr key={n}>
                    <th scope="row" className="!bg-transparent !text-[var(--ink)] !normal-case !tracking-normal !text-sm">{n}</th>
                    <td className="muted">{d}</td>
                    <td>{s === 'built' ? <span className="badge b-ok"><Check size={12} aria-hidden="true" /> Implemented</span> : <span className="badge b-info"><Minus size={12} aria-hidden="true" /> Planned · disabled</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="trust" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-2">
            <div>
              <p className="eyebrow">Security and trust</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Authority stays with people.</h2>
              <p className="muted mt-4">Safety limits are enforced on the server, not only hidden in the interface.</p>
            </div>
            <ul className="space-y-4 text-sm">
              {['External integrations and response execution are off by default.', 'Approving a response proposal never executes anything on a real system.', 'A case can be marked contained only after a measured verification.', 'Logs and alert text are untrusted: rendered as text, never as markup or instructions.', 'Every state change is written to a hash-chained audit log.', 'Exports are redacted by default.'].map((t) => (
                <li key={t} className="flex gap-3"><Check size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="docs" className="mx-auto max-w-6xl px-5 py-20">
          <p className="eyebrow">Documentation</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Everything lives in the repository&apos;s <span className="mono">docs/</span> folder.</h2>
          <ul className="mt-8 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {[['Local setup', 'docs/runbooks/LOCAL_SETUP.md'], ['Demo scenarios', 'docs/runbooks/DEMO_SCENARIOS.md'], ['System overview', 'docs/architecture/SYSTEM_OVERVIEW.md'], ['Threat model', 'docs/security/THREAT_MODEL.md'], ['Safety boundaries', 'docs/security/SAFETY_BOUNDARIES.md'], ['Feature matrix (honest status)', 'docs/ai/FEATURE_MATRIX.md'], ['Test results', 'docs/evidence/TEST_RESULTS.md']].map(([t, p]) => (
              <li key={p} className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-3"><span className="font-medium">{t}</span><span className="mono muted">{p}</span></li>
            ))}
          </ul>
        </section>

        <section className="border-t border-[var(--line)] bg-[radial-gradient(700px_300px_at_50%_100%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_70%)]">
          <div className="mx-auto max-w-3xl px-5 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See it work on safe, synthetic data.</h2>
            <p className="muted mt-4">Sign in to your local instance and press <strong>Run safe demo</strong>. You get the same events and the same alerts every time.</p>
            <Link to="/login" className="btn btn-primary mt-8">Open the app <ArrowRight size={17} aria-hidden="true" /></Link>
            <p className="muted mt-10 text-xs">AegisSOC is an independent defensive engineering project. It has no customers and makes no compliance or certification claims. AegisAI and NetShield stay separate projects; AegisSOC works fully without them.</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-[var(--line)] py-6 text-center text-sm muted">AegisSOC · local build · demo data is synthetic</footer>
    </div>
  )
}
