import { Parser } from 'n3';
import jsonld from 'jsonld';
import SHACLValidator from 'rdf-validate-shacl';
// The validator's default RDF/JS environment bundles a factory with clownface,
// term-map, dataset, etc. We reuse it so shapes/data datasets are built with the
// exact factory SHACLValidator expects (rdf-ext's factory lacks `clownface`).
import rdf from 'rdf-validate-shacl/src/defaultEnv.js';
import { readFileSync } from 'node:fs';

const VIOLATION = 'http://www.w3.org/ns/shacl#Violation';

export interface ShaclResult {
  conforms: boolean;
  /** Human-readable violation messages (empty when conforms). */
  results: string[];
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
    return new ShaclValidator(new SHACLValidator(shapes, { factory: rdf }));
  }

  /**
   * Validate a JSON-LD document against the loaded shapes.
   *
   * `documentUrl` is the absolute IRI the document will be stored at. It is
   * passed as the JSON-LD `base`, so document-relative ids (`@id: ""`, used by
   * the assertion/reply *headers*) resolve to that concrete IRI instead of
   * being dropped. The agent always leaves the header `@id` empty; the daemon
   * knows where each doc lands and fills the identity in here. Omit it only for
   * fully-absolute documents (e.g. tests).
   */
  async validateJsonLd(doc: jsonld.JsonLdDocument, documentUrl?: string): Promise<ShaclResult> {
    const nquads = (await jsonld.toRDF(doc, {
      format: 'application/n-quads',
      ...(documentUrl ? { base: documentUrl } : {}),
    })) as string;
    const data = datasetFromQuads(nquads, 'n-quads');
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
