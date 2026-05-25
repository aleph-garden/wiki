# Aleph Schema — Quick Reference

Inject this into every generator prompt. Authoritative version:
`vocab/aleph.ttl` + `vocab/aleph-shapes.ttl`.

## Namespaces (always declare in output)

```
@prefix :      <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix skos:  <http://www.w3.org/2004/02/skos/core#> .
@prefix foaf:  <http://xmlns.com/foaf/0.1/> .
@prefix prov:  <http://www.w3.org/ns/prov#> .
@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
```

## Classes

| Class                       | Use for                                   |
|-----------------------------|-------------------------------------------|
| `aleph:Concept`             | abstract idea, theory, method             |
| `aleph:ImportantConcept`    | concept with `perceivedImportance ≥ 0.7`  |
| `aleph:Person` / `foaf:Person` | a real person                          |
| `aleph:Event`               | a bounded historical event                |
| `aleph:AlephSession`        | one learning/recording session            |
| `aleph:ChatMessage`         | one utterance in a session                |
| `aleph:View`                | captured Point/Card answer state          |
| `aleph:ShaclResult`         | result of a SHACL validation run          |
| `prov:SoftwareAgent`        | the LLM acting in the session             |

## Required per Concept

- `a aleph:Concept` (+ optionally `aleph:ImportantConcept`)
- `skos:prefLabel "..."@en`
- `aleph:perceivedImportance` ∈ [0,1] (xsd:decimal)
- `prov:wasGeneratedBy :Session_NNN`
- `prov:generatedAtTime "..."^^xsd:dateTime`

## Custom predicates

| Predicate                  | Range / shape                         | Meaning                                |
|----------------------------|---------------------------------------|----------------------------------------|
| `aleph:perceivedImportance`| xsd:decimal 0..1                      | drives node size + orbit ring          |
| `aleph:derivedFrom`        | → `aleph:Person`                      | concept originates with this person    |
| `aleph:requires`           | → `aleph:Concept`                     | this concept assumes that one          |
| `aleph:exemplifies`        | (Event)→ Concept                      | this event is an instance              |
| `aleph:layoutX / layoutY`  | xsd:decimal                           | pinned canvas position (optional)      |
| `aleph:focus`              | xsd:string (Session)                  | one-line session topic                 |
| `aleph:conceptCount`       | xsd:integer (Session)                 | # concepts touched in session          |
| `aleph:position`           | xsd:integer (ChatMessage)             | turn index, 1-based                    |
| `aleph:speaker`            | "user" / "agent"                      | who spoke                              |
| `aleph:body`               | xsd:string                            | utterance text                         |
| `aleph:hint`               | "suggestion" / "insight" / …          | optional rendering hint                |
| `aleph:question`           | xsd:string (View)                     | the user question being answered       |
| `aleph:path`               | `rdf:List` of Concept IRIs (View)     | reasoning path, ordered                |
| `aleph:edgeNote`           | blank node (View)                     | predicate label + cite for one edge    |
| `aleph:pathNote`           | blank node (View)                     | inline narration anchored at concept   |
| `aleph:suggestion`         | blank node (View)                     | "follow ↗" button                      |
| `aleph:trail`              | `rdf:List` of strings (View)          | breadcrumb labels above the focus      |
| `aleph:atConcept`          | → Concept (in pathNote)               | anchor                                 |
| `aleph:noteText`           | xsd:string (in pathNote)              | narration                              |
| `aleph:reason`             | xsd:string (in suggestion)            | why this is suggested                  |
| `aleph:cite`               | xsd:string (in edgeNote)              | e.g. "session 035"                     |
| `aleph:from` / `aleph:to`  | → Concept (in edgeNote)               | edge endpoints                         |
| `aleph:target`             | → Concept (in suggestion)             | what to jump to                        |
| `aleph:result`             | blank node (ShaclResult)              | one shape outcome                      |
| `aleph:shape`              | → SHACL NodeShape IRI                 | which shape                            |
| `aleph:status`             | "pass" / "warn" / "fail"              | shape outcome                          |
| `aleph:detail`             | xsd:string                            | human-readable explanation             |

## Reused standard predicates

| Predicate                  | Use                                          |
|----------------------------|----------------------------------------------|
| `skos:prefLabel`           | display label, language-tagged               |
| `skos:altLabel`            | secondary label                              |
| `skos:definition`          | one-sentence definition                      |
| `skos:broader`             | narrower → broader concept                   |
| `skos:related`             | symmetric weak relation                      |
| `prov:wasGeneratedBy`      | entity → session                             |
| `prov:wasAttributedTo`     | entity → person/agent                        |
| `prov:generatedAtTime`     | xsd:dateTime                                 |
| `prov:wasAssociatedWith`   | session → agent                              |
| `prov:startedAtTime` / `prov:endedAtTime` | session timing                |
| `prov:actedOnBehalfOf`     | softwareAgent → person                       |

## Hard SHACL constraints (will fail validation if missing)

- Every `aleph:Concept` ⇒ exactly one `prov:wasGeneratedBy` + one `prov:generatedAtTime`.
- Every `aleph:ImportantConcept` ⇒ `perceivedImportance ≥ 0.7`.
- Every `aleph:AlephSession` ⇒ `prov:startedAtTime` + `prov:wasAssociatedWith ≥ 1 agent`.
- `endedAtTime > startedAtTime` when both present.

## UI consumption (so you know what to produce)

- **Library rail**: lists all `aleph:AlephSession` ordered by `prov:startedAtTime DESC`.
- **Point mode**: focus concept in centre, orbit 1 = direct `skos:broader` children,
  orbit 2 = other direct neighbours (any predicate), orbit 3 = rest.
  Renders `aleph:View` if a question is active.
- **Card mode**: header from focus concept; triples grouped into
  identity / relations / provenance / measurements;
  backlinks = subjects pointing at focus; SHACL tile = `aleph:ShaclResult`.
- **Triples mode**: raw N-Triples view over the full bundle.
