import { Link } from 'react-router-dom'
import { ArrowRight, Bot, ClipboardCheck, Database, FlaskConical, GitBranch, Lock, Radar, Search, Shield, ShieldCheck, Siren, Swords, Sun, Moon } from 'lucide-react'
import { usePrefs } from '../lib/prefs'

const FEATURES = [
  { icon: Database, t: 'Telemetry you can trace', d: 'Events are stored with their raw original, parser version, source and a SYNTHETIC flag. Every alert links to the exact records behind it.' },
  { icon: Radar, t: 'Detections that explain themselves', d: 'A small, regex-free rule language runs without any AI. Each alert states the rule, its version, its conditions and its inputs.' },
  { icon: ClipboardCheck, t: 'Real case management', d: 'Triage, cases, tasks, notes, an audited timeline, reopen/close rules, and Markdown/JSON reports built from stored records.' },
  { icon: Search, t: 'Hunting with guard rails', d: 'Bounded, allow-listed search with pivots, saved searches and hunt notebooks. There is deliberately no free-form query box.' },
  { icon: Bot, t: 'AI that assists, never decides', d: 'Optional and off by default. Output must cite real event ids, cannot claim actions, and falls back to a deterministic analysis on any doubt.' },
  { icon: Swords, t: 'Response without side effects', d: 'Proposals are simulated, scoped and approved by a second person. Approving never executes anything on a real system.' },
]

const STEPS = [
  { n: '1', t: 'Collect', d: 'Replay labelled synthetic scenarios, import a Suricata EVE file, or post JSON events. Network connectors stay disabled until you authorise them.' },
  { n: '2', t: 'Normalize', d: 'Timestamps become UTC, vendor fields become a common shape, duplicates are dropped, bad rows are reported one by one.' },
  { n: '3', t: 'Detect', d: 'Versioned rules produce alerts with evidence, confidence and an honest list of what is uncertain.' },
  { n: '4', t: 'Investigate', d: 'Triage, pivot, open a case, document, propose a simulated response, and measure whether it was verified.' },
  { n: '5', t: 'Improve', d: 'Test rule changes against labelled positives and negatives before approving them, and compare before/after.' },
]

export function Landing() {
  const { theme, toggleTheme } = usePrefs()
  return (
    <div className="hero-bg min-h-dvh">
      <a href="#content" className="skip-link">Skip to content</a>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5 font-bold no-underline" aria-label="AegisSOC home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]"><Shield size={20} aria-hidden="true" /></span>
          <span className="text-lg">AegisSOC</span>
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {[['Features', '#features'], ['How it works', '#how'], ['Demo', '#demo'], ['Architecture', '#architecture'], ['Documentation', '#docs'], ['About', '#about']].map(([l, h]) => (
            <a key={h} href={h} className="nav-link !py-1.5">{l}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}</button>
          <Link to="/login" className="btn btn-primary">Open the app</Link>
        </div>
      </header>

      <main id="content">
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pt-16">
          <p className="badge b-synthetic mb-4"><FlaskConical size={12} aria-hidden="true" /> Local-first · demo data clearly labelled</p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">Turn noisy security events into evidence-backed investigations.</h1>
          <p className="muted mt-5 max-w-2xl text-lg">
            AegisSOC is a security operations platform you can run on one machine. It collects permitted telemetry, detects suspicious behaviour with transparent rules,
            and helps people investigate, respond and improve. AI assists the analyst; it never bypasses human authority.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="btn btn-primary">Open the app <ArrowRight size={17} aria-hidden="true" /></Link>
            <a href="#how" className="btn">See how it works</a>
          </div>
          <dl className="mt-12 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[['9', 'built-in detections'], ['7', 'replayable scenarios'], ['0', 'live connectors enabled'], ['0', 'actions on real systems']].map(([n, l]) => (
              <div key={l}><dt className="muted text-sm">{l}</dt><dd className="text-3xl font-bold tabular-nums">{n}</dd></div>
            ))}
          </dl>
          <p className="muted mt-3 text-xs">Figures describe this build&apos;s shipped content, not customers or results.</p>
        </section>

        <section id="features" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-3xl font-bold">Features</h2>
            <p className="muted mt-2 max-w-2xl">Built workflow-first: each capability below is implemented and covered by automated tests in this repository.</p>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.t} className="card card-pad">
                  <f.icon className="text-[var(--accent)]" size={24} aria-hidden="true" />
                  <h3 className="h-section mt-3">{f.t}</h3>
                  <p className="muted mt-1 text-sm">{f.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-bold">How it works</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-5">
            {STEPS.map((s) => (
              <li key={s.n} className="card card-pad">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent-soft)] font-bold">{s.n}</span>
                <h3 className="h-section mt-3">{s.t}</h3>
                <p className="muted mt-1 text-sm">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="demo" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Try the demo</h2>
              <p className="muted mt-3">Sign in to your local instance and press <strong>Run safe demo</strong>. It replays deterministic, labelled scenarios, so you always get the same events and the same alerts:</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-2"><Siren size={17} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" /> A burst of failed sign-ins, followed by a success (and a benign look-alike that must not alert).</li>
                <li className="flex gap-2"><Siren size={17} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" /> A privilege change, a stopped security agent, and an encoded script launched from a document.</li>
                <li className="flex gap-2"><Siren size={17} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" /> An IDS alert followed by a sign-in from the same address: shown as a hypothesis, not a finding.</li>
                <li className="flex gap-2"><Siren size={17} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" /> A sensor that goes silent, to show why “no alerts” is not “no threats”.</li>
              </ul>
              <Link to="/login" className="btn btn-primary mt-6">Open the app</Link>
            </div>
            <figure className="card overflow-hidden" aria-label="Illustrative example of an alert explanation">
              <div className="border-b border-[var(--line)] px-5 py-3"><span className="badge b-high">High</span> <span className="badge b-synthetic">SYNTHETIC</span> <span className="font-semibold">Repeated failed sign-ins, then a success</span></div>
              <div className="space-y-3 px-5 py-4 text-sm">
                <p><strong>What happened:</strong> Account <span className="mono">jdoe</span> had 7 failed sign-ins from <span className="mono">198.51.100.23</span> within 300 seconds, and then a success.</p>
                <p><strong>How sure are we?</strong> Medium. This pattern fits password guessing, but a person who forgot a password can look similar.</p>
                <p><strong>Evidence:</strong> 8 stored events (#1–#8), rule AEG-AUTH-001 v1.</p>
                <p><strong>Next:</strong> Ask the account owner whether they signed in from that address.</p>
              </div>
              <figcaption className="muted border-t border-[var(--line)] px-5 py-2 text-xs">Illustration of the app&apos;s output using the shipped synthetic fixture.</figcaption>
            </figure>
          </div>
        </section>

        <section id="architecture" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-bold">Architecture</h2>
          <p className="muted mt-2 max-w-3xl">One small deployment: a React front end, a Spring Boot API and PostgreSQL. No message bus, no search cluster, no GPU requirement.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-4" role="list">
            {[['Sources', 'Synthetic fixtures · EVE JSON files · JSON API · (optional, disabled) Wazuh, cloud, AegisAI, NetShield'], ['Pipeline', 'Validate · normalize · dedupe · store raw + normalized'], ['Detection & case work', 'Deterministic rules → alerts → cases → reports'], ['Optional AI', 'Local model only · reads evidence · cannot act · validated output']].map(([t, d], i) => (
              <div key={t} role="listitem" className="card card-pad relative">
                <GitBranch size={20} className="text-[var(--accent)]" aria-hidden="true" />
                <h3 className="h-section mt-2">{t}</h3>
                <p className="muted mt-1 text-sm">{d}</p>
                {i < 3 && <ArrowRight className="muted absolute -right-4 top-1/2 hidden -translate-y-1/2 md:block" size={20} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <div className="card card-pad mt-6 flex gap-3">
            <Lock className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p className="text-sm"><strong>Safety boundary.</strong> External integrations and any response execution are disabled by default and enforced on the server. Logs and alert text are treated as untrusted data, rendered as text and never as markup or instructions.</p>
          </div>
        </section>

        <section id="docs" className="border-y border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-3xl font-bold">Documentation</h2>
            <p className="muted mt-2">Everything lives in the repository&apos;s <span className="mono">docs/</span> folder.</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              {[['Local setup', 'docs/runbooks/LOCAL_SETUP.md'], ['Demo scenarios', 'docs/runbooks/DEMO_SCENARIOS.md'], ['System overview', 'docs/architecture/SYSTEM_OVERVIEW.md'], ['Data model', 'docs/architecture/DATA_MODEL.md'], ['Threat model', 'docs/security/THREAT_MODEL.md'], ['Safety boundaries', 'docs/security/SAFETY_BOUNDARIES.md'], ['Feature matrix (honest status)', 'docs/ai/FEATURE_MATRIX.md'], ['Test results', 'docs/evidence/TEST_RESULTS.md']].map(([t, p]) => (
                <li key={p} className="card card-pad"><div className="font-semibold">{t}</div><div className="mono muted mt-1">{p}</div></li>
              ))}
            </ul>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-bold">About &amp; contact</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <p className="muted">AegisSOC is an independent defensive engineering project for learning and demonstrating security operations workflows. It is not a commercial product, has no customers, and makes no compliance or certification claims.</p>
            <div className="card card-pad flex gap-3"><ShieldCheck className="shrink-0 text-[var(--accent)]" aria-hidden="true" /><p className="text-sm"><strong>Related projects stay separate.</strong> AegisAI (authorised security validation) and NetShield (household network protection) can send optional, versioned data in the future; AegisSOC works fully without them. Contact: use the repository&apos;s issue tracker.</p></div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[var(--line)] py-6 text-center text-sm muted">AegisSOC · local build · demo data is synthetic</footer>
    </div>
  )
}
