/**
 * Demonstration topology used by the public hero. It is an ILLUSTRATION of how AegisSOC models an environment.
 * It is not generated from, or connected to, any real network, and nothing on it is "live".
 */
export type NodeKind = 'core' | 'source' | 'host' | 'identity' | 'control'
export type Capability = 'built' | 'planned'

export interface DemoNode {
  id: string
  label: string
  kind: NodeKind
  pos: [number, number, number]
  status: Capability
  blurb: string
}

export const DEMO_NODES: DemoNode[] = [
  { id: 'core', label: 'AegisSOC core', kind: 'core', pos: [0, 0, 0], status: 'built', blurb: 'Ingestion, rule engine, alerts, cases and the audit log run here, on one machine, against PostgreSQL.' },
  { id: 'fixtures', label: 'Synthetic fixtures', kind: 'source', pos: [-3.4, 1.6, 0.6], status: 'built', blurb: 'Seven replayable scenarios, labelled SYNTHETIC. The data source behind every demo in this build.' },
  { id: 'eve', label: 'Suricata EVE import', kind: 'source', pos: [-3.8, -0.6, -0.8], status: 'built', blurb: 'Imports EVE JSON files you provide. No live Suricata connection is made.' },
  { id: 'api', label: 'JSON event API', kind: 'source', pos: [-2.6, -2.2, 0.8], status: 'built', blurb: 'Accepts bounded JSON batches from authorised senders. Validated and deduplicated on arrival.' },
  { id: 'wazuh', label: 'Wazuh (read-only)', kind: 'source', pos: [-1.2, 2.7, -1.2], status: 'planned', blurb: 'Planned read-only adapter. Disabled by default; this build never contacts a Wazuh server.' },
  { id: 'cloud', label: 'Cloud audit logs', kind: 'source', pos: [-1.6, -3.1, -0.4], status: 'planned', blurb: 'Planned offline import of exported cloud audit JSON. Not implemented yet.' },
  { id: 'ws', label: 'Workstations', kind: 'host', pos: [3.2, 2.0, 0.4], status: 'built', blurb: 'Hosts appear as assets once events mention them. Coverage shows which expected signals are missing.' },
  { id: 'srv', label: 'Servers', kind: 'host', pos: [3.9, -0.2, -0.9], status: 'built', blurb: 'Criticality and environment come from asset records. Open alerts and cases are attached per host.' },
  { id: 'idp', label: 'Identities', kind: 'identity', pos: [2.4, -2.4, 0.9], status: 'built', blurb: 'Accounts are entities extracted from events, so a sign-in burst can be pivoted from user to host.' },
  { id: 'edge', label: 'Network edge', kind: 'control', pos: [1.2, 3.0, -1.0], status: 'built', blurb: 'Firewall and IDS events arrive as telemetry. A silent edge sensor raises a coverage finding, not "all clear".' },
  { id: 'ai', label: 'AI analyst (optional)', kind: 'control', pos: [0.4, -3.2, -1.2], status: 'built', blurb: 'Off by default and loopback-only. Output must cite real event ids or it is discarded for the deterministic analysis.' },
]

export const DEMO_EDGES: [string, string][] = [
  ['fixtures', 'core'], ['eve', 'core'], ['api', 'core'], ['wazuh', 'core'], ['cloud', 'core'],
  ['core', 'ws'], ['core', 'srv'], ['core', 'idp'], ['core', 'edge'], ['core', 'ai'],
  ['ws', 'idp'], ['srv', 'idp'], ['edge', 'srv'],
]

export const KIND_LABEL: Record<NodeKind, string> = { core: 'Platform', source: 'Data source', host: 'Monitored hosts', identity: 'Identity', control: 'Control' }
