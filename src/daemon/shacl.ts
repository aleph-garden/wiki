import { Parser } from 'n3';
import jsonld from 'jsonld';
import rdf from 'rdf-ext';
import { Validator } from 'shacl-engine';
// Opt-in SPARQL support: enables SHACL-SPARQL constraints (`sh:sparql`) such as
// SessionShape's endedAtTime>startedAtTime check. shacl-engine bundles a
// Comunica-lite engine, so no extra peer dependency is needed.
import { validations } from 'shacl-engine/sparql.js';
import { readFileSync } from 'node:fs';

const VIOLATION = 'http://www.w3.org/ns/shacl#Violation';

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

/** A shacl-engine validation result (only the fields we read). */
interface EngineResult {
  severity?: { value: string };
  message?: { value: string }[];
  path?: { predicates?: { value: string }[] }[];
}

/** Parse a Turtle/N-Quads string into an rdf-ext dataset. */
function datasetFromQuads(text: string, format: 'turtle' | 'n-quads') {
  const parser = new Parser({ format: format === 'turtle' ? 'text/turtle' : 'application/n-quads' });
  const ds = rdf.dataset();
  for (const q of parser.parse(text)) ds.add(q);
  return ds;
}

/** Best-effort human-readable label for a violation lacking an sh:message. */
function describe(r: EngineResult): string {
  const predicate = r.path?.[0]?.predicates?.[0]?.value;
  return predicate ? `violation on ${predicate}` : 'shacl violation';
}

export class ShaclValidator {
  private constructor(private validator: Validator) {}

  static async load(shapesPath: string): Promise<ShaclValidator> {
    let shapesTtl: string;
    try {
      shapesTtl = readFileSync(shapesPath, 'utf-8');
    } catch (err) {
      throw new Error(`ShaclValidator: cannot load shapes from '${shapesPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
    const shapes = datasetFromQuads(shapesTtl, 'turtle');
    return new ShaclValidator(new Validator(shapes, { factory: rdf, validations }));
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
    const report = await this.validator.validate({ dataset: data });
    // We only treat sh:Violation as a hard fail; advisory sh:Warning/sh:Info
    // results never block a write, matching the SHACL spec's sh:conforms.
    const violations = (report.results as EngineResult[]).filter((r) => r.severity?.value === VIOLATION);
    const messages = violations.map((r) => {
      const msg = (r.message ?? []).map((m) => m.value).join('; ');
      return msg || describe(r);
    });
    return { conforms: violations.length === 0, results: messages };
  }
}
