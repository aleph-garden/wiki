import { describe, it, expect } from 'vitest';
import { splitGraph } from '../scripts/seed-pod';

const SAMPLE = `
@prefix : <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:GameTheory a aleph:Concept ;
    aleph:perceivedImportance 0.9 ;
    prov:wasGeneratedBy :Session_001 .

:NashEquilibrium a aleph:Concept ;
    aleph:requires :GameTheory ;
    prov:wasGeneratedBy :Session_001 .

:Session_001 a aleph:AlephSession ;
    prov:startedAtTime "2026-01-01T00:00:00Z"^^xsd:dateTime .
`;

describe('splitGraph', () => {
  it('emits one resource per Concept', () => {
    const result = splitGraph(SAMPLE);
    const paths = Object.keys(result).sort();
    expect(paths).toContain('/aleph/concepts/GameTheory.ttl');
    expect(paths).toContain('/aleph/concepts/NashEquilibrium.ttl');
    expect(paths).toContain('/aleph/sessions/Session_001/.meta.ttl');
    expect(paths).toContain('/aleph/index.ttl');
  });

  it('each concept resource has the concept triples', () => {
    const result = splitGraph(SAMPLE);
    const gt = result['/aleph/concepts/GameTheory.ttl'];
    expect(gt).toContain(':GameTheory a aleph:Concept');
    expect(gt).toContain('aleph:perceivedImportance 0.9');
  });

  it('each emitted resource carries an aleph:Edit meta block', () => {
    const result = splitGraph(SAMPLE);
    for (const ttl of Object.values(result)) {
      expect(ttl).toContain('<> a aleph:Edit');
      expect(ttl).toContain('prov:wasGeneratedBy :BootstrapSeed');
    }
  });
});
