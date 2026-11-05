import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export const GLOSSARY = {
  alert: 'A flag that says something needs a person to look. It says which check matched, how sure it is, and which records back it up.',
  rule: 'A written check for a suspicious pattern, such as "many failed sign-ins, then a success". Rules here explain themselves and never need AI.',
  investigation: 'Looking at the records around an alert to work out what really happened, and whether it matters.',
  telemetry: 'The activity records that computers, servers and network equipment produce: who signed in, what started, what changed.',
  incident: 'A confirmed or likely security problem that a team tracks from first look to being resolved. In AegisSOC it is called a case.',
  sensor: 'Something that gathers activity records and passes them to AegisSOC, such as a file import or an event feed.',
} as const
export type TermKey = keyof typeof GLOSSARY

/** A word with an optional plain-language explanation. Works with mouse, touch and keyboard; Esc closes it. */
export function Term({ k, children }: { k: TermKey; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onDoc)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDoc) }
  }, [open])
  return (
    <span ref={ref} className="relative inline">
      <button type="button" className="term" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>{children}</button>
      {open && <span id={id} role="note" className="glass absolute left-0 top-full z-20 mt-2 block w-72 max-w-[80vw] p-3 text-left text-sm font-normal normal-case tracking-normal text-[var(--ink)]">{GLOSSARY[k]}</span>}
    </span>
  )
}
