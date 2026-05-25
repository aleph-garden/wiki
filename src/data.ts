export type NodeKind = 'concept' | 'person' | 'event';

export interface AlephNode {
  id: string;
  label: string;
  kind: NodeKind;
  importance: number;
  x: number;
  y: number;
}

export interface AlephEdge {
  s: string;
  p: string;
  o: string;
  pretty: string;
}

export interface AlephTriple {
  p: string;
  o: string;
  kind: 'type' | 'literal' | 'iri';
}

export interface AlephChatMsg {
  who: 'user' | 'agent';
  text: string;
  hint?: string;
}

export interface AlephSession {
  id: string;
  agent: string;
  start: string;
  concepts: number;
  focus: string;
}

export const ALEPH_NODES: AlephNode[] = [
  { id: 'gt',   label: 'Game Theory',              kind: 'concept', importance: 0.95, x:    0, y:    0 },
  { id: 'jvn',  label: 'John von Neumann',         kind: 'person',  importance: 0.78, x:   60, y: -200 },
  { id: 'nash', label: 'John Nash',                kind: 'person',  importance: 0.70, x: -210, y: -110 },
  { id: 'ne',   label: 'Nash Equilibrium',         kind: 'concept', importance: 0.82, x: -260, y:   40 },
  { id: 'pd',   label: "Prisoner's Dilemma",       kind: 'concept', importance: 0.80, x: -110, y:  180 },
  { id: 'egt',  label: 'Evolutionary Game Theory', kind: 'concept', importance: 0.66, x:  210, y:  150 },
  { id: 'md',   label: 'Mechanism Design',         kind: 'concept', importance: 0.60, x:  290, y:  -30 },
  { id: 'cw',   label: 'Cold War',                 kind: 'event',   importance: 0.55, x: -220, y: -220 },
  { id: 'it',   label: 'Information Theory',       kind: 'concept', importance: 0.74, x:  360, y: -140 },
  { id: 'rat',  label: 'Rationality',              kind: 'concept', importance: 0.62, x: -380, y:  -50 },
  { id: 'ess',  label: 'ESS',                      kind: 'concept', importance: 0.42, x:  320, y:  270 },
  { id: 'auc',  label: 'Auction Theory',           kind: 'concept', importance: 0.40, x:  410, y:   80 },
  { id: 'coop', label: 'Cooperation',              kind: 'concept', importance: 0.50, x: -260, y:  260 },
  { id: 'shan', label: 'Claude Shannon',           kind: 'person',  importance: 0.55, x:  490, y: -230 },
  { id: 'evo',  label: 'Evolution',                kind: 'concept', importance: 0.58, x:  140, y:  300 },
];

export const ALEPH_EDGES: AlephEdge[] = [
  { s: 'gt',  p: 'aleph:derivedFrom',     o: 'jvn',  pretty: 'derived from' },
  { s: 'gt',  p: 'skos:related',          o: 'it',   pretty: 'related to' },
  { s: 'gt',  p: 'aleph:requires',        o: 'rat',  pretty: 'requires' },
  { s: 'ne',  p: 'skos:broader',          o: 'gt',   pretty: 'broader' },
  { s: 'ne',  p: 'prov:wasAttributedTo',  o: 'nash', pretty: 'attributed to' },
  { s: 'pd',  p: 'skos:broader',          o: 'gt',   pretty: 'broader' },
  { s: 'pd',  p: 'skos:related',          o: 'coop', pretty: 'related to' },
  { s: 'egt', p: 'skos:broader',          o: 'gt',   pretty: 'broader' },
  { s: 'egt', p: 'skos:related',          o: 'evo',  pretty: 'related to' },
  { s: 'ess', p: 'skos:broader',          o: 'egt',  pretty: 'broader' },
  { s: 'md',  p: 'skos:broader',          o: 'gt',   pretty: 'broader' },
  { s: 'auc', p: 'skos:broader',          o: 'md',   pretty: 'broader' },
  { s: 'cw',  p: 'aleph:exemplifies',     o: 'gt',   pretty: 'exemplifies' },
  { s: 'it',  p: 'prov:wasAttributedTo',  o: 'shan', pretty: 'attributed to' },
];

export const ALEPH_TRIPLES: AlephTriple[] = [
  { p: 'rdf:type',                   o: 'skos:Concept',           kind: 'type'    },
  { p: 'rdf:type',                   o: 'aleph:ImportantConcept', kind: 'type'    },
  { p: 'skos:prefLabel',             o: '"Game Theory"@en',       kind: 'literal' },
  { p: 'skos:altLabel',              o: '"Theory of games"@en',   kind: 'literal' },
  { p: 'skos:definition',            o: '"The mathematical study of strategic interaction among rational agents."@en', kind: 'literal' },
  { p: 'aleph:perceivedImportance',  o: '0.95',                   kind: 'literal' },
  { p: 'aleph:derivedFrom',          o: ':JohnVonNeumann',        kind: 'iri'     },
  { p: 'skos:related',               o: ':InformationTheory',     kind: 'iri'     },
  { p: 'aleph:requires',             o: ':Rationality',           kind: 'iri'     },
  { p: 'prov:wasGeneratedBy',        o: ':Session_042',           kind: 'iri'     },
  { p: 'prov:generatedAtTime',       o: '"2026-04-12T14:23:01Z"', kind: 'literal' },
];

export const ALEPH_CHAT: AlephChatMsg[] = [
  { who: 'user',  text: "i want to map out how game theory shows up across fields — biology, econ, politics" },
  { who: 'agent', text: "Good seed. I'll anchor the concept and pull its direct neighbors from your existing graph first. You already have Nash Equilibrium (created in Session 38) and a stub for von Neumann — I'll link them as :derivedFrom and :wasAttributedTo." },
  { who: 'agent', text: "Adding Prisoner's Dilemma · Evolutionary Game Theory · Mechanism Design. Should I import the Cold War branch (deterrence, MAD)? It connects to your Politics cluster.", hint: 'suggestion' },
  { who: 'user',  text: "yes, and link information theory" },
  { who: 'agent', text: "Linked. :GameTheory skos:related :InformationTheory. Note the bridge: both formalize uncertainty under constraint — that's why your earlier note on Shannon resonates here.", hint: 'insight' },
];

export const ALEPH_SESSIONS: AlephSession[] = [
  { id: 'Session_042', agent: 'Claude (sonnet-4.5)',  start: '2026-04-12 14:23', concepts: 9, focus: 'Game theory across fields' },
  { id: 'Session_041', agent: 'Claude (sonnet-4.5)',  start: '2026-04-11 09:08', concepts: 4, focus: 'John Nash · biography'      },
  { id: 'Session_038', agent: 'Claude (haiku-4.5)',   start: '2026-04-04 22:14', concepts: 6, focus: 'Equilibrium · fixed points' },
  { id: 'Session_035', agent: 'Claude (sonnet-4.5)',  start: '2026-03-28 11:51', concepts: 12, focus: 'Information theory · entropy' },
];
