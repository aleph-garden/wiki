#!/usr/bin/env bun
import { Parser, Writer, type Quad } from 'n3';
import { readFileSync } from 'node:fs';
import { PodClient } from '../src/lib/pod';

const ALEPH = 'https://vocab.aleph.wiki/';
const G = 'https://aleph.wiki/g/';

const NOW = '2026-05-26T00:00:00Z';

const PREFIXES = {
  '': G,
  aleph: ALEPH,
  prov: 'http://www.w3.org/ns/prov#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  foaf: 'http://xmlns.com/foaf/0.1/',
};

const PREFIX_HEADER = Object.entries(PREFIXES)
  .map(([k, v]) => `@prefix ${k}: <${v}> .`)
  .join('\n') + '\n';

function editMeta(): string {
  return `<> a aleph:Edit ;
   prov:wasGeneratedBy :BootstrapSeed ;
   prov:generatedAtTime "${NOW}"^^xsd:dateTime ;
   aleph:editKind "create" .`;
}

function localName(iri: string): string {
  const s = iri.lastIndexOf('/');
  const h = iri.lastIndexOf('#');
  return iri.slice(Math.max(s, h) + 1);
}

function isConceptType(t: string): boolean {
  return (
    t === `${ALEPH}Concept` ||
    t === `${ALEPH}Person` ||
    t === `${ALEPH}Event` ||
    t === `${ALEPH}ImportantConcept`
  );
}

function emitTtl(triples: Quad[]): string {
  const writer = new Writer({ prefixes: PREFIXES });
  for (const q of triples) writer.addQuad(q);
  let body = '';
  writer.end((_err, result) => { body = result; });
  // Edit-meta uses prefixed names (aleph:, prov:, xsd:) so it must come
  // AFTER the writer's @prefix declarations, not before.
  return `${body}\n${editMeta()}\n`;
}

export function splitGraph(ttl: string): Record<string, string> {
  const parser = new Parser();
  const quads = parser.parse(ttl);

  // Index triples by subject IRI
  const bySubject = new Map<string, Quad[]>();
  for (const q of quads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const arr: Quad[] = bySubject.get(q.subject.value) ?? [];
    arr.push(q as Quad);
    bySubject.set(q.subject.value, arr);
  }

  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  const concepts: string[] = [];
  const sessions: string[] = [];
  const orphans: string[] = [];

  for (const [subj, triples] of bySubject) {
    const types = triples
      .filter((q) => q.predicate.value === RDF_TYPE)
      .map((q) => q.object.value);
    if (types.some(isConceptType)) {
      concepts.push(subj);
    } else if (types.includes(`${ALEPH}AlephSession`)) {
      sessions.push(subj);
    } else {
      orphans.push(subj);
    }
  }

  const out: Record<string, string> = {};

  for (const s of concepts) {
    const name = localName(s);
    out[`/aleph/concepts/${name}.ttl`] = emitTtl(bySubject.get(s)!);
  }

  for (const s of sessions) {
    const name = localName(s);
    out[`/aleph/sessions/${name}/meta.ttl`] = emitTtl(bySubject.get(s)!);
  }

  if (orphans.length) {
    const orphanQuads = orphans.flatMap((s) => bySubject.get(s)!);
    out['/aleph/index.ttl'] = emitTtl(orphanQuads);
  } else {
    // Always emit index.ttl marker so idempotency check in main() works
    out['/aleph/index.ttl'] = `${PREFIX_HEADER}\n${editMeta()}\n\n:AlephRoot a aleph:Index .\n`;
  }

  return out;
}

async function main() {
  const podBase = process.env.POD_BASE ?? 'http://localhost:3000';
  const seedFile = process.argv[2] ?? 'data/demo-game-theory.ttl';

  const client = new PodClient(podBase);
  const existing = await client.getResource('/aleph/index.ttl');
  if (existing) {
    console.log('pod already seeded (/aleph/index.ttl exists). skipping.');
    return;
  }

  const ttlSrc = readFileSync(seedFile, 'utf-8');
  const resources = splitGraph(ttlSrc);

  for (const [path, body] of Object.entries(resources)) {
    await client.putResource(path, body);
    console.log(`PUT ${path} (${body.length} bytes)`);
  }
  console.log(`seeded ${Object.keys(resources).length} resources.`);
}

if (import.meta.main) main();
