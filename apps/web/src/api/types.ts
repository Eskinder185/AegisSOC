export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type Role = 'VIEWER' | 'ANALYST' | 'INCIDENT_LEAD' | 'DETECTION_ENGINEER' | 'ADMIN'

export interface Me { username: string; displayName: string; role: Role }
export interface Page<T> { items: T[]; total: number; page: number; size: number }

export interface AlertRow {
  id: number; title: string; ruleId: string; ruleVersion: number; ruleName: string; severity: Severity; confidence: string; status: string
  classification: string; resolution?: string; host?: string; username?: string; ip?: string; firstEventAt: string; lastEventAt: string
  eventCount: number; assignee?: string; synthetic: boolean; createdAt: string; suppressedUntil?: string; suppressionReason?: string
  hypothesis?: boolean; incidentId?: number
}

export interface EventRow {
  id: number; ts: string; eventClass: string; action: string; outcome?: string; severity: number; host?: string; username?: string
  srcIp?: string; dstIp?: string; dstPort?: number; domain?: string; processName?: string; processCmdline?: string; parentProcess?: string
  message: string; vendor?: string; synthetic: boolean; role?: string; sourceName?: string
}

export interface Explanation {
  ruleId: string; ruleName: string; ruleVersion: number; ruleFingerprint: string; hypothesis: boolean; conditions: string[]; groupKey: string
  inputs: Record<string, unknown>; matchedEventIds: number[]; contextEventIds: number[]
  simple: { what: string; why: string; howSure: string; next: string[]; verify: string[]; alternatives: string[] }
  analyst: { entity: Record<string, string>; attack: { techniques: string[]; justification: string }; firstEvent: string; lastEvent: string }
  uncertainty: string[]; synthetic: boolean
}

export interface AlertDetail extends AlertRow {
  explanation: Explanation
  evidence: EventRow[]
  history: { at: string; actor: string; fromStatus?: string; toStatus?: string; note?: string }[]
  related: { id: number; title: string; severity: Severity; status: string; ruleId: string }[]
  incidents: { id: number; title: string; status: string }[]
}

export interface IncidentRow {
  id: number; title: string; severity: Severity; priority: number; status: string; classification: string; resolution?: string
  assignee?: string; createdBy: string; synthetic: boolean; createdAt: string; updatedAt: string; closedAt?: string; alertCount: number; openTasks: number
}

export interface Guide { know: string[]; why: string[]; uncertain: string[]; next: string[]; recommended: string[]; verify: string[] }

export interface IncidentDetail extends IncidentRow {
  summary: string
  postIncident: Record<string, string>
  containmentVerified: boolean
  alerts: { id: number; title: string; severity: Severity; confidence: string; status: string; ruleId: string; ruleVersion: number; hypothesis: boolean }[]
  evidence: (EventRow & { note?: string; addedBy: string })[]
  notes: { id: number; kind: string; body: string; author: string; at: string }[]
  tasks: { id: number; title: string; done: boolean; assignee?: string; createdBy: string }[]
  activity: { id: number; at: string; actor: string; kind: string; detail: string }[]
  timeline: { at: string; type: 'TELEMETRY' | 'ANALYST' | 'ACTION'; text: string; ref: string; actor: string }[]
  entities: { hosts: string[]; users: string[]; ips: string[]; domains: string[]; processes: string[] }
  guide: Guide
  proposals: { id: number; actionType: string; target: string; status: string; mode: string; requestedBy: string; createdAt: string; expiresAt: string }[]
}

export interface SourceRow {
  id: number; name: string; sourceType: string; description: string; synthetic: boolean; enabled: boolean; direction: string; sensitivity: string
  owner: string; integrationStatus: string; expectedIntervalSec: number; lastTestAt?: string; lastSuccessAt?: string; lastError?: string
  health: string; eventCount: number
}

export interface RunRow {
  id: number; sourceName: string; scenario?: string; status: string; startedAt: string; finishedAt?: string; eventsReceived: number
  eventsAccepted: number; eventsDuplicate: number; eventsRejected: number; alertsCreated: number; synthetic: boolean; errorSummary?: string
  errors?: { rowNo: number; message: string }[]
}

export interface Scenario { id: string; title: string; description: string; exercisesRules: string[]; synthetic: boolean }

export interface RuleRow {
  id: string; name: string; purpose: string; severity: Severity; confidence: string; enabled: boolean; owner: string; currentVersion: number
  lastReviewedAt?: string; attackTechniques: string[]; alertCount: number; benignCount: number; draftCount: number
  lastTest?: { tp: number; fp: number; fn: number; tn: number; runAt: string; version: number }
}

export interface RuleVersion {
  version: number; status: string; fingerprint: string; changeNote?: string; createdBy: string; createdAt: string
  approvedBy?: string; approvedAt?: string; definition: Record<string, unknown>
}

export interface TestResult {
  id: number; ruleId: string; version: number; fingerprint: string; suite: string; truePositives: number; falsePositives: number
  missed: number; trueNegatives: number; sensitivity?: number; precision?: number; caveat: string
  details: { scenarios: { scenario: string; title: string; truePositives: string[]; falsePositives: string[]; missed: string[]; trueNegatives: string[] }[] }
}

export interface AiResult {
  mode: 'DETERMINISTIC' | 'AI' | 'FALLBACK'; label: string; fallbackReason?: string; provider: string; model: string; latencyMs: number
  deterministic: { title: string; disclaimer: string; sections: { heading: string; items: string[]; eventIds: number[] }[] }
  ai?: { summary: string; claims: { text: string; eventIds: number[] }[]; nextSteps: string[]; uncertainty: string[]; insufficientEvidence: boolean }
  evidence: { id: number; ts: string; text: string }[]
  warnings: string[]
}
