// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { Store } from 'oxigraph';
import { render } from '../src/lib/queries';
import { SPARQL_PREFIX_BLOCK } from '../src/lib/rdf';

const DATA = `@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
<http://localhost:3000/g/GameTheory> a aleph:Concept ; skos:prefLabel "Game Theory"@en .
<http://localhost:3000/aleph/sessions/s1/g/Draft> a aleph:Concept ; skos:prefLabel "Draft"@en .
<https://vocab.aleph.wiki/Concept> a owl:Class .`;

describe('all-nodes canonical filter', () => {
  let store: Store;
  beforeAll(() => {
    store = new Store();
    store.load(DATA, { format: 'text/turtle' });
  });

  it('matches pod-scoped /g/ concepts and excludes drafts + vocab', () => {
    const q = SPARQL_PREFIX_BLOCK + '\n' + render('allNodes', {});
    const rows = store.query(q) as Iterable<Map<string, { value: string }>>;
    const iris = [...rows].map((r) => r.get('iri')!.value);
    expect(iris).toContain('http://localhost:3000/g/GameTheory');
    expect(iris).not.toContain('http://localhost:3000/aleph/sessions/s1/g/Draft');
    expect(iris.some((i) => i.includes('vocab.aleph.wiki'))).toBe(false);
  });
});
