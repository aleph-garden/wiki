---
id: aleph.view
inputs:
  graph:        "TTL covering at least the focus concept's 2-hop neighbourhood"
  focus_iri:    "e.g. :GameTheory"
  question:     "User question to answer along the graph"
  session_id:   "Current session"
  now:          "ISO 8601 dateTime"
output: "Turtle fragment with one aleph:View instance, plus referenced blank nodes"
---

# Compose an Aleph View

The Point mode renders an answer by *tracing* a path through existing
edges and decorating it with narration. Your job is to choose that path
and emit it as RDF — not to add new concepts.

Read **{{graph}}**, then:

1. Pick a **path** of 2–4 concept IRIs starting at `{{focus_iri}}` that
   *follows existing edges* and ends at the concept most relevant to
   the question. No invented edges. If no path exists, return an empty
   View (just question + suggestions) — never fabricate edges.
2. For each consecutive pair, emit one `aleph:edgeNote` blank node:
   `aleph:from`, `aleph:to`, `rdfs:label` (the human predicate label,
   e.g. "narrows to"), optional `aleph:cite`.
3. For up to 2 of the path's non-focus stops, emit an `aleph:pathNote`
   with `aleph:atConcept` + `aleph:noteText` — a 1–2 line italic
   narration of *why this step*. Newlines as `\n` inside the literal.
4. Emit up to 3 `aleph:suggestion` blank nodes — concepts adjacent to
   the path but **not on it**, with a one-phrase `aleph:reason`.
5. Optional: `aleph:trail` — an `rdf:List` of 2–4 short breadcrumb
   strings (e.g. `( "Mathematics" "Logic" )`) for the outer ring labels.

## Hard rules

- The View itself: `prov:wasGeneratedBy :{{session_id}}`,
  `prov:generatedAtTime "{{now}}"`.
- All referenced concept IRIs MUST already exist in `{{graph}}`.
- Output Turtle only.
- `aleph:path` uses RDF list syntax `( :A :B :C )`.
- Naming for the View IRI: `:View_<slug-of-question>` truncated to 60 chars.

## Skeleton

```
@prefix :      <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov:  <http://www.w3.org/ns/prov#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .

:View_gt_to_biology a aleph:View ;
    aleph:question "How does game theory reach biology?" ;
    aleph:path  ( :GameTheory :EvolutionaryGameTheory :Evolution ) ;
    aleph:trail ( "Strategy & Games" "Mathematics" "Logic" ) ;

    aleph:edgeNote [
        aleph:from :GameTheory ; aleph:to :EvolutionaryGameTheory ;
        rdfs:label "narrows to" ;
        aleph:cite "session 035" ] ;

    aleph:pathNote [
        aleph:atConcept :EvolutionaryGameTheory ;
        aleph:noteText "EGT replaces \"rational agent\" with\n\"replicating strategy.\"" ] ;

    aleph:suggestion [
        aleph:target :ESS ; aleph:reason "follows from path" ] ;

    prov:wasGeneratedBy :Session_042 ;
    prov:generatedAtTime "{{now}}"^^xsd:dateTime .
```
