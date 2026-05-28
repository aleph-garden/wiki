import { Parser } from 'n3';
import jsonld from 'jsonld';
import SHACLValidator from 'rdf-validate-shacl';
// The validator's default RDF/JS environment bundles a factory with clownface,
// term-map, dataset, etc. We reuse it so shapes/data datasets are built with the
// exact factory SHACLValidator expects (rdf-ext's factory lacks `clownface`).
import rdf from 'rdf-validate-shacl/src/defaultEnv.js';
import { readFileSync } from 'node:fs';

const VIOLATION = 'http://www.w3.org/ns/shacl#Violation';
const SH_SPARQL = 'http://www.w3.org/ns/shacl#sparql';

export interface ShaclResult {
  conforms: boolean;
  /** Human-readable violation messages (empty when conforms). */
  results: string[];
}

export interface ValidateOptions {
  /**
   * Absolute IRI the document will be stored at. Passed as the JSON-LD `base`
   * so document-relative ids (`@id: ""`, used by the assertion/reply *header*)
   * resolve to that concrete IRI instead of being dropped. The agent always
   * leaves the header `@id` empty; the daemon fills the identity in from the
   * path it computes. Omit for fully-absolute documents (e.g. tests).
   */
  documentUrl?: string;
  /**
   * Extra Turtle merged into the data graph before validation — e.g. the
   * referenced session's `meta.ttl`. Lets cross-document constraints such as
   * `prov:wasGeneratedBy → sh:class aleph:AlephSession` resolve against the
   * typed session node, which lives in a separate pod resource. The merged
   * graph is itself validated, so the referenced session must satisfy its own
   * shape (SessionShape) for the write to conform.
   */
  contextTurtle?: string;
}

/** Parse a Turtle/N-Quads string into an rdf-ext dataset. */
function datasetFromQuads(text: string, format: 'turtle' | 'n-quads') {
  const parser = new Parser({ format: format === 'turtle' ? 'text/turtle' : 'application/n-quads' });
  const ds = rdf.dataset();
  for (const q of parser.parse(text)) ds.add(q);
  return ds;
}

export class ShaclValidator {
  private constructor(private validator: SHACLValidator) {}

  static async load(shapesPath: string): Promise<ShaclValidator> {
    let shapesTtl: string;
    try {
      shapesTtl = readFileSync(shapesPath, 'utf-8');
    } catch (err) {
      throw new Error(`ShaclValidator: cannot load shapes from '${shapesPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
    const shapes = datasetFromQuads(shapesTtl, 'turtle');
    // rdf-validate-shacl cannot execute SHACL-SPARQL constraints (`sh:sparql`)
    // and throws if it meets one on an active target. Strip those associations
    // so the rest of a shape still validates (e.g. SessionShape keeps its
    // cardinality checks but drops the endedAtTime>startedAtTime SPARQL clause).
    // The clause stays in vocab/aleph-shapes.ttl for a SPARQL-capable engine.
    for (const q of [...shapes]) {
      if (q.predicate.value === SH_SPARQL) shapes.delete(q);
    }
    return new ShaclValidator(new SHACLValidator(shapes, { factory: rdf }));
  }

  /** Validate a JSON-LD document against the loaded shapes. See ValidateOptions. */
  async validateJsonLd(doc: jsonld.JsonLdDocument, opts: ValidateOptions = {}): Promise<ShaclResult> {
    const nquads = (await jsonld.toRDF(doc, {
      format: 'application/n-quads',
      ...(opts.documentUrl ? { base: opts.documentUrl } : {}),
    })) as string;
    const data = datasetFromQuads(nquads, 'n-quads');
    if (opts.contextTurtle) {
      const parser = new Parser({ format: 'text/turtle' });
      for (const q of parser.parse(opts.contextTurtle)) data.add(q);
    }
    const report = await this.validator.validate(data);
    // rdf-validate-shacl sets report.conforms = (results.length === 0), counting
    // sh:Warning/sh:Info results too. We only treat sh:Violation as a hard fail
    // (advisory results never block a write), matching the SHACL spec's sh:conforms.
    const violations = report.results.filter((r) => r.severity?.value === VIOLATION);
    const messages = violations.map((r) => {
      const msg = r.message.map((m) => m.value).join('; ');
      const path = r.path?.value ?? '';
      return msg || `violation on ${path}`;
    });
    return { conforms: violations.length === 0, results: messages };
  }
}
