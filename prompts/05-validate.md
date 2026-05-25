---
id: aleph.validate
inputs:
  graph:        "TTL to validate"
  shapes:       "vocab/aleph-shapes.ttl"
  session_id:   "Current session"
  now:          "ISO 8601 dateTime"
output: "Turtle fragment — one aleph:ShaclResult with N aleph:result blank nodes"
---

# Capture SHACL validation as RDF

The Card view's "SHACL" tile reads `aleph:ShaclResult` instances and
renders them as pass/warn rows. Run validation externally (e.g.
`pyshacl`, `oxigraph shapes`), then emit the structured outcome.

## Hard rules

- One `aleph:ShaclResult` per run, IRI `:ShaclRun_{{session_id}}`.
- One `aleph:result` blank node per *NodeShape* that targeted at least
  one node — pass-by-default if no violations.
- `aleph:status`: `"pass"` (no violations), `"warn"` (only
  `sh:Warning`/`sh:Info` results), `"fail"` (any `sh:Violation`).
- `aleph:detail`: one sentence, human-readable. Quote the worst
  violation's `sh:resultMessage` if any, else state the success
  condition that was checked.
- `aleph:shape`: IRI of the NodeShape, e.g. `aleph:ConceptShape`.
- Optional `rdfs:label` on the blank node if you want a friendlier
  display name (e.g. `"ProvenanceChainShape"`).
- Output Turtle only.

## Skeleton

```
@prefix :      <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov:  <http://www.w3.org/ns/prov#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .

:ShaclRun_Session_042 a aleph:ShaclResult ;
    prov:wasGeneratedBy :Session_042 ;
    prov:generatedAtTime "{{now}}"^^xsd:dateTime ;
    aleph:result
        [ aleph:shape aleph:ConceptShape ;
          aleph:status "pass" ;
          aleph:detail "all required properties present" ] ,
        [ aleph:shape aleph:DerivedFromShape ;
          aleph:status "warn" ;
          aleph:detail "1 derivedFrom target missing foaf:Person type" ] .
```
