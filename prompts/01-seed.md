---
id: aleph.seed
inputs:
  topic:        "freeform string, e.g. 'Game theory across fields'"
  intent:       "what the user wants to learn / map out (1–2 sentences)"
  session_id:   "Session_NNN, monotonic"
  agent_label:  "e.g. 'Claude (sonnet-4.5)'"
  user_iri:     "e.g. ':Toph'"
  now:          "ISO 8601 dateTime"
  depth:        "1 = focus + direct neighbours · 2 = + two-hop · 3 = + tangential clusters"
  size_hint:    "approx. concept count, default 12"
output: "Turtle bundle — no markdown, no commentary"
---

# Seed a new Aleph concept graph

You are extending the user's personal Semantic Web. The user is starting a
new session on the topic **{{topic}}**. Their intent: **{{intent}}**.

Produce a single, valid Turtle file that captures:

1. **The session** as `aleph:AlephSession` with id `:{{session_id}}`,
   `aleph:focus`, `prov:startedAtTime "{{now}}"`, agents.
2. **A focus concept** — the IRI-safe CamelCase of {{topic}} —
   typed `aleph:Concept` (+ `aleph:ImportantConcept` if importance ≥ 0.7),
   with `skos:prefLabel`, `skos:definition`, `aleph:perceivedImportance`.
3. **~{{size_hint}} surrounding entities** at depth ≤ {{depth}}:
   - Other concepts → `aleph:Concept`
   - Originators / authors → `aleph:Person` + `foaf:Person`
   - Concrete cases → `aleph:Event`
4. **Edges** between them using SKOS + custom predicates:
   - `skos:broader` (specialisation → generalisation)
   - `skos:related` (lateral, symmetric in spirit)
   - `aleph:derivedFrom` (concept ↔ person)
   - `aleph:requires` (concept ↔ prerequisite concept)
   - `aleph:exemplifies` (event ↔ concept)
   - `prov:wasAttributedTo` (concept ↔ person)
5. **Provenance** on every entity: `prov:wasGeneratedBy :{{session_id}}`
   and `prov:generatedAtTime`, staggered within the session window
   (start = {{now}}, increment 30–120 s per entity).

## Hard rules

- Emit **only Turtle**. No prose around it, no ``` fences.
- All namespaces declared first; use exactly the prefixes in `schema.md`.
- Importance ∈ [0,1] with two decimals. Distribution: one anchor at
  ~0.9, ~3 strong neighbours 0.6–0.85, the rest below 0.6.
- Layout (`aleph:layoutX/Y`): optional. If included, focus at (0,0)
  and others spread radially within roughly ±500 units. Skip if unsure.
- Person and Event entities get `skos:prefLabel` and importance but
  not `skos:definition`.
- Do not invent SHACL results; pass 03-view + 04-validate downstream.

## Style

- Prefer canonical SKOS labelling: `"Label"@en`.
- Use real, well-known names. If unsure, mark with
  `rdfs:comment "speculative"@en` so the next pass can prune.
- One blank line between entities. Predicates aligned for the focus
  entity, terse elsewhere.

## Skeleton (fill in)

```
@prefix :      <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix skos:  <http://www.w3.org/2004/02/skos/core#> .
@prefix foaf:  <http://xmlns.com/foaf/0.1/> .
@prefix prov:  <http://www.w3.org/ns/prov#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .

:{{session_id}} a aleph:AlephSession ;
    rdfs:label "{{session_id|humanise}}"@en ;
    aleph:focus "{{intent}}" ;
    aleph:conceptCount {{size_hint}} ;
    prov:startedAtTime "{{now}}"^^xsd:dateTime ;
    prov:wasAssociatedWith :{{agent}}, {{user_iri}} .

:{{FocusConcept}} a aleph:Concept, aleph:ImportantConcept ;
    skos:prefLabel "{{Topic Title}}"@en ;
    skos:definition "..."@en ;
    aleph:perceivedImportance 0.92 ;
    prov:wasGeneratedBy :{{session_id}} ;
    prov:generatedAtTime "{{now}}"^^xsd:dateTime .

# ... ~{{size_hint}} more entities ...
```
