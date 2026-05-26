const PREFIX_HEADER = `@prefix : <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export interface EditMeta {
  sessionId: string;
  at: string;
  kind: 'create' | 'amend' | 'retract';
  attributedTo?: string;
}

export function renderEditMeta(m: EditMeta): string {
  const attr = m.attributedTo ? ` ;\n   prov:wasAttributedTo :${m.attributedTo}` : '';
  return `<> a aleph:Edit ;
   prov:wasGeneratedBy :${m.sessionId} ;
   prov:generatedAtTime "${m.at}"^^xsd:dateTime ;
   aleph:editKind "${m.kind}"${attr} .`;
}

export interface ChatMessageInput {
  sessionId: string;
  position: number;
  speaker: 'user' | 'agent';
  body: string;
  hint?: string;
  generatedAt: string;
  attributedTo?: string;
}

export function renderChatMessage(m: ChatMessageInput): string {
  const id = `:${m.sessionId}_msg${m.position}`;
  const hint = m.hint ? ` ;\n    aleph:hint "${esc(m.hint)}"` : '';
  const edit = renderEditMeta({
    sessionId: m.sessionId, at: m.generatedAt, kind: 'create',
    attributedTo: m.attributedTo,
  });
  return `${PREFIX_HEADER}
${edit}

${id} a aleph:ChatMessage ;
    aleph:position ${m.position} ;
    aleph:speaker "${m.speaker}" ;
    aleph:body "${esc(m.body)}"${hint} ;
    prov:wasGeneratedBy :${m.sessionId} ;
    prov:generatedAtTime "${m.generatedAt}"^^xsd:dateTime .
`;
}

export interface SessionMetaInput {
  sessionId: string;
  startedAt: string;
  attributedTo?: string;
  agent?: string;
  focus?: string;
}

export function renderSessionMeta(m: SessionMetaInput): string {
  const attr = m.attributedTo ? ` ;\n    prov:wasAttributedTo :${m.attributedTo}` : '';
  const focus = m.focus ? ` ;\n    aleph:focus "${esc(m.focus)}"` : '';
  const edit = renderEditMeta({
    sessionId: m.sessionId, at: m.startedAt, kind: 'create',
    attributedTo: m.attributedTo,
  });
  return `${PREFIX_HEADER}
${edit}

:${m.sessionId} a aleph:AlephSession ;
    prov:startedAtTime "${m.startedAt}"^^xsd:dateTime${attr}${focus} .
`;
}
