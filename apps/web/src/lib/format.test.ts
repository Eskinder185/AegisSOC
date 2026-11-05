import { describe, expect, it } from 'vitest'
import { can, classificationLabel, plural, relativeTime, statusLabel, titleCase } from './format'

describe('format helpers', () => {
  it('uses plain-language labels', () => {
    expect(statusLabel('CONTAINMENT_PROPOSED')).toBe('Containment proposed')
    expect(statusLabel('APPROVED')).toBe('Approved (simulated)')
    expect(classificationLabel('CONFIRMED_INCIDENT')).toContain('analyst')
    expect(titleCase('INCIDENT_LEAD')).toBe('Incident Lead')
  })
  it('formats relative time and handles bad input', () => {
    const now = Date.parse('2026-01-01T12:00:00Z')
    expect(relativeTime('2026-01-01T11:00:00Z', now)).toBe('1h ago')
    expect(relativeTime('2026-01-01T11:59:50Z', now)).toBe('just now')
    expect(relativeTime('nope', now)).toBe('—')
    expect(relativeTime(undefined, now)).toBe('—')
  })
  it('mirrors the role hierarchy', () => {
    expect(can('VIEWER', 'ANALYST')).toBe(false)
    expect(can('ANALYST', 'ANALYST')).toBe(true)
    expect(can('ANALYST', 'INCIDENT_LEAD')).toBe(false)
    expect(can('INCIDENT_LEAD', 'ANALYST')).toBe(true)
    expect(can('DETECTION_ENGINEER', 'INCIDENT_LEAD')).toBe(false)
    expect(can('ADMIN', 'DETECTION_ENGINEER')).toBe(true)
    expect(plural(1, 'event')).toBe('1 event')
    expect(plural(2, 'event')).toBe('2 events')
  })
})
