/**
 * Semantic model for the homepage explanation. The 3D scene, the 2D alternative, the information panel and the tests
 * are all driven from this one description, so they cannot disagree.
 *
 * Everything here is an ILLUSTRATION. Nothing is generated from, or connected to, a real network.
 */
export type EntityId = 'laptop' | 'server' | 'router' | 'sensor' | 'aegis' | 'alert' | 'analyst'
export type Reality = 'built' | 'simulated' | 'planned'

export interface Entity {
  id: EntityId
  label: string
  /** Name used in Analyst mode. */
  technical: string
  pos: [number, number, number]
  what: string
  why: string
  example: string
  details: { k: string; v: string }[]
  reality: Reality
  realityNote: string
}

export const ENTITIES: Entity[] = [
  {
    id: 'laptop', label: 'Computer', technical: 'Endpoint (workstation)', pos: [-5.2, 2.35, 0], reality: 'built',
    realityNote: 'Computers appear in AegisSOC as assets once their activity records arrive. Here the activity is practice data.',
    what: 'A computer that people use every day. As it is used, it creates activity records: sign-ins, programs started, files changed.',
    why: 'These records are the raw material for spotting trouble. If nobody looks at them, a problem can go unnoticed for weeks.',
    example: 'Someone types a wrong password seven times in two minutes, then gets it right. The computer records every attempt.',
    details: [{ k: 'Record type', v: 'Authentication, process and service events' }, { k: 'Appears in AegisSOC as', v: 'An asset with open alerts and cases attached' }, { k: 'Online status', v: 'Never assumed: "last seen" only means it was last mentioned in a record' }],
  },
  {
    id: 'server', label: 'Server', technical: 'Server (application / file)', pos: [-5.4, 0, 0.2], reality: 'built',
    realityNote: 'Servers are modelled like computers, with a criticality label so important systems are triaged first.',
    what: 'A computer that other computers rely on, such as one that stores files or runs a business application.',
    why: 'Servers hold what matters most, so unusual activity on them deserves attention sooner.',
    example: 'A new account is quietly added to the group that can change everything on a file server.',
    details: [{ k: 'Record type', v: 'Account, service and file-access events' }, { k: 'Criticality', v: 'Set per asset (low to critical) and used to rank alerts' }],
  },
  {
    id: 'router', label: 'Network equipment', technical: 'Firewall / router / IDS', pos: [-5.2, -2.1, 0], reality: 'built',
    realityNote: 'Network alert files (Suricata EVE JSON) can be imported. No live network device is contacted.',
    what: 'The firewall and router that connect your computers to each other and to the internet. Some can also warn about suspicious traffic.',
    why: 'They see traffic that individual computers never notice, such as one machine suddenly talking to many others.',
    example: 'A warning that a computer tried to contact a known-bad address, followed by a sign-in from that same address.',
    details: [{ k: 'Supported import', v: 'Suricata EVE JSON files (offline)' }, { k: 'Not connected', v: 'No live firewall or router connection exists in this build' }],
  },
  {
    id: 'sensor', label: 'Security sensor', technical: 'Data source / collector', pos: [-2.5, 0, 0], reality: 'built',
    realityNote: 'In this build the "sensors" are an import of practice events, a file import and a JSON event API. Live agents such as Wazuh are planned and switched off.',
    what: 'A watcher that gathers activity records from computers, servers and network equipment and passes them on.',
    why: 'It is the difference between guessing and knowing. Without a sensor reporting in, silence means nothing.',
    example: 'If a sensor goes quiet, AegisSOC says so. "No alerts" is never shown as "no threats".',
    details: [{ k: 'Sources today', v: 'Practice security events, Suricata EVE import, JSON event API' }, { k: 'Planned (off by default)', v: 'Wazuh read-only adapter, cloud audit-log import' }, { k: 'Checks on arrival', v: 'Time normalised to UTC, duplicates dropped, bad rows reported one by one' }],
  },
  {
    id: 'aegis', label: 'AegisSOC', technical: 'Ingestion + rule engine', pos: [0.4, 0, 0], reality: 'built',
    realityNote: 'This is the real application: it runs on one machine with a database.',
    what: 'The monitoring engine. It stores what the sensors send and checks it against a list of rules that describe suspicious patterns.',
    why: 'People cannot read millions of records. The rules do the first pass, and they explain themselves so a person can disagree.',
    example: 'Rule: "five or more failed sign-ins in five minutes, then a success" raises an alert and lists the exact records that matched.',
    details: [{ k: 'Built-in checks', v: '9 detection rules in a small, regex-free rule language' }, { k: 'Each alert shows', v: 'Rule name and version, matched conditions, evidence event ids' }, { k: 'Storage', v: 'Raw record (immutable, SHA-256) plus a normalised copy' }],
  },
  {
    id: 'alert', label: 'Security alert', technical: 'Alert (rule match)', pos: [3.1, 1.3, 0.2], reality: 'simulated',
    realityNote: 'The alert in this story is an example built from practice data.',
    what: 'A flag that says "something here needs a human to look". It says what matched, how sure the rule is, and what is uncertain.',
    why: 'Alerts turn a flood of records into a short list of things to check first.',
    example: 'High: repeated failed sign-ins, then a success. Medium confidence: a person who forgot their password can look similar.',
    details: [{ k: 'Fields', v: 'Severity, confidence, rule id and version, entity, evidence count' }, { k: 'Marked', v: 'Hypothesis alerts are labelled as such' }],
  },
  {
    id: 'analyst', label: 'Security analyst', technical: 'Analyst workstation', pos: [5.3, -0.2, 0], reality: 'built',
    realityNote: 'People stay in charge: AegisSOC never performs a real response action.',
    what: 'The person who looks into the alert: reads the evidence, checks related events, and decides what is really going on.',
    why: 'Software finds patterns; people understand context. Every decision stays with a person.',
    example: 'They ask the account owner whether they signed in from that address, then check the computer for anything odd.',
    details: [{ k: 'Tools', v: 'Evidence view, hunt and pivot, notes, optional AI explanation that must cite real events' }, { k: 'Response', v: 'Simulated proposal, second-person approval, then a measured check. Nothing runs on a real system.' }],
  },
]

export interface Connection {
  id: string
  from: EntityId
  to: EntityId
  label: string
  /** What travels along this link. */
  carries: string
  why: string
  reality: Reality
  technical: string
}

export const CONNECTIONS: Connection[] = [
  { id: 'c1', from: 'laptop', to: 'sensor', label: 'Activity is collected', carries: 'Sign-ins, programs started, settings changed', why: 'The sensor can only help with what it can see.', reality: 'built', technical: 'Events delivered via file import or JSON API; normalised on arrival' },
  { id: 'c2', from: 'server', to: 'sensor', label: 'Activity is collected', carries: 'Account changes, service stops, file access', why: 'Servers matter most, so their records are collected too.', reality: 'built', technical: 'Same ingestion path as endpoints; criticality attached from asset records' },
  { id: 'c3', from: 'router', to: 'sensor', label: 'Network warnings are collected', carries: 'Alerts about suspicious traffic', why: 'Network equipment sees traffic computers never notice.', reality: 'built', technical: 'Suricata EVE JSON import (offline file)' },
  { id: 'c4', from: 'sensor', to: 'aegis', label: 'Security information is analysed', carries: 'Checked, de-duplicated records with their original attached', why: 'Clean, trustworthy input is what makes the rules reliable.', reality: 'built', technical: 'Raw event (SHA-256) + normalised event; unique per source and fingerprint' },
  { id: 'c5', from: 'aegis', to: 'alert', label: 'Suspicious activity is flagged', carries: 'The rule that matched and the records that matched it', why: 'Turns thousands of records into a short list to check first.', reality: 'simulated', technical: 'Deterministic rule evaluation over the run plus a one-hour look-back' },
  { id: 'c6', from: 'alert', to: 'analyst', label: 'An investigation can begin', carries: 'The alert, its evidence and a plain explanation', why: 'A person decides what it means.', reality: 'built', technical: 'Alert detail: explanation, evidence events, related alerts, cases' },
  { id: 'c7', from: 'analyst', to: 'aegis', label: 'The response is recorded and checked', carries: 'Notes, decisions and a measured follow-up check', why: 'Shows whether a fix actually worked, and improves the rules.', reality: 'built', technical: 'Case notes, simulated response proposal, verification result, rule test and approval' },
]

export interface Stage {
  n: number
  title: string
  short: string
  caption: string
  focus: EntityId[]
  flow: string[]
  /** Entities that exist at this point in the story. */
  visible: EntityId[]
}

const ALL: EntityId[] = ['laptop', 'server', 'router', 'sensor', 'aegis', 'alert', 'analyst']
export const STAGES: Stage[] = [
  { n: 1, title: 'Your systems', short: 'Systems', caption: 'Your computers and services create activity records that can help identify security problems.', focus: ['laptop', 'server', 'router'], flow: [], visible: ['laptop', 'server', 'router', 'sensor', 'aegis', 'analyst'] },
  { n: 2, title: 'Collect security information', short: 'Collect', caption: 'AegisSOC receives security information from connected sources.', focus: ['sensor', 'aegis'], flow: ['c1', 'c2', 'c3', 'c4'], visible: ['laptop', 'server', 'router', 'sensor', 'aegis', 'analyst'] },
  { n: 3, title: 'Detect suspicious activity', short: 'Detect', caption: 'AegisSOC checks activity for patterns that might indicate a problem.', focus: ['aegis', 'alert'], flow: ['c5'], visible: ALL },
  { n: 4, title: 'Investigate the evidence', short: 'Investigate', caption: 'Security analysts can examine related events to understand what happened.', focus: ['alert', 'analyst'], flow: ['c6'], visible: ALL },
  { n: 5, title: 'Respond and improve', short: 'Respond', caption: 'AegisSOC helps analysts decide what action to take and measure whether security improvements worked.', focus: ['analyst', 'aegis'], flow: ['c7'], visible: ALL },
]

export const REALITY_LABEL: Record<Reality, string> = { built: 'Works in this build', simulated: 'Example from practice data', planned: 'Planned, not connected' }

export interface Scenario {
  id: string
  title: string
  summary: string
  steps: { t: string; what: string }[]
  observes: string
  suspicious: string
  investigate: string
  response: string
  evidence: string
  /** What AegisSOC does today for this scenario. */
  support: string
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'login', title: 'Suspicious login', summary: 'Someone repeatedly tries to sign in to an account.',
    steps: [{ t: '10:02', what: 'Seven failed sign-ins for account "jdoe" from one address' }, { t: '10:04', what: 'A successful sign-in from the same address' }, { t: '10:04', what: 'Alert raised: repeated failures, then a success' }],
    observes: 'The account name, the address the attempts came from, the time of each attempt, and whether it worked.',
    suspicious: 'Many failures in a short time look like someone guessing passwords. A success right after can mean the guess worked.',
    investigate: 'Open the alert, read the eight matching records, ask the account owner whether it was them, and check what that account did next.',
    response: 'If it was not the owner: reset the password, review what the account touched, and consider blocking the address. AegisSOC records and simulates this; a person does it in the real tool.',
    evidence: 'The failed and successful sign-in records with matching address and time. A typo (three failures) or a slow guesser does not trigger the rule.',
    support: 'Built in: rule AEG-AUTH-001 on practice events.',
  },
  {
    id: 'network', title: 'Unusual network activity', summary: 'A device begins communicating in an unexpected way.',
    steps: [{ t: '14:10', what: 'Network sensor warns about traffic to a known-bad address' }, { t: '14:13', what: 'A sign-in from that same address' }, { t: '14:13', what: 'Flagged as a hypothesis, not a finding' }],
    observes: 'A warning from network equipment, then a sign-in from the same address within a few minutes.',
    suspicious: 'Two weak signals that share an address are stronger together. They could still be a coincidence, so it is labelled a hypothesis.',
    investigate: 'Check what the device was doing before the warning, whether the address is known to the organisation, and whether other devices contacted it.',
    response: 'Isolate the device only if the evidence supports it. Isolation is a person\'s decision in the real tool.',
    evidence: 'The network warning and the sign-in record, linked by the shared address and the time window.',
    support: 'Built in: rules IDS-001 and LAT-001 on practice events.',
  },
  {
    id: 'access', title: 'Unauthorized access attempt', summary: 'An account tries to use something it may not be allowed to.',
    steps: [{ t: '09:20', what: 'An account is added to an administrators group' }, { t: '09:21', what: 'A security agent service is stopped' }, { t: '09:21', what: 'Alerts raised for the change and the stopped service' }],
    observes: 'Who changed a group, which account was affected, and which services stopped.',
    suspicious: 'Gaining powerful access and switching off protection in the same minute is a common pattern. An approved patching account is excluded so it does not cause false alarms.',
    investigate: 'Find who made the change, whether a change request exists, and what else that account did.',
    response: 'Undo the change if it was not approved, review what the account did with the access, and tighten who may approve changes.',
    evidence: 'The group-change record, the service-stop record, and the approver list showing whether the change was expected.',
    support: 'Built in: rules PRIV-001, ACCT-001 and SVC-001 on practice events.',
  },
  {
    id: 'malware', title: 'Possible malware activity', summary: 'Monitoring sees behaviour that could indicate malicious software.',
    steps: [{ t: '11:30', what: 'An office document starts a command-line program' }, { t: '11:30', what: 'The program runs an encoded (hidden-looking) command' }, { t: '11:31', what: 'Alert raised, and a practice indicator matched' }],
    observes: 'Which program started which, and the command it was given.',
    suspicious: 'Documents rarely need to launch command-line programs. Hiding the command in an encoded form is a way to avoid being read.',
    investigate: 'Look at the full command, who opened the document, and what the program did next.',
    response: 'Contain the computer if the evidence supports it, then verify the problem is gone with a measured check before calling it resolved.',
    evidence: 'The process records showing the parent and child programs, and the decoded command text.',
    support: 'Built in: rules PROC-001 and TI-001 on practice events. All indicators are synthetic.',
  },
]
