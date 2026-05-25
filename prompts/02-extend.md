---
id: aleph.extend
inputs:
  graph:        "Existing TTL (full or focus-neighbourhood)"
  user_turn:    "Most recent user utterance"
  session_id:   "Current session"
  now:          "ISO 8601 dateTime"
  max_new:      "default 5 — cap on net-new entities per turn"
output: "Turtle delta — additions only, no deletions"
---

# Extend an existing Aleph graph

The user is mid-session. They just said:

> {{user_turn}}

Read **{{graph}}** to understand what already exists. Then emit a Turtle
**delta** that:

1. Adds at most **{{max_new}}** new entities the user explicitly asked
   for or that are clearly implied by the turn.
2. Adds new edges between *existing* entities where the turn surfaces a
   relation that was previously implicit.
3. Reinforces (no-op) existing predicates only if reinforcement carries
   new information (e.g. an extra `skos:altLabel`).

## Hard rules

- **Delta only.** Do not re-emit any triple already present in the input
  graph. The downstream merge is union — duplicates are noise.
- **No deletions.** If the turn contradicts the existing graph, emit a
  `prov:wasRevisionOf` chain instead and let SHACL flag it later.
- Each new entity carries `prov:wasGeneratedBy :{{session_id}}` and
  `prov:generatedAtTime "{{now}}"` (or staggered within ±30 s).
- Reuse IRIs from the input graph verbatim — never coin a near-duplicate
  (`:Cooperation` exists ⇒ do not emit `:Cooperate`).
- Output Turtle only, no fences, no commentary.

## Heuristics

- "yes, and link X" → add the edge `:Focus skos:related :X`.
- "tell me more about Y" → if Y is a Person, do not add new edges;
  add a `skos:definition` / `rdfs:comment` if you have one.
- "drop Z" → DO NOT delete. Lower its `aleph:perceivedImportance`
  by 0.2 (clamp at 0.1) and add `rdfs:comment "user de-emphasised"@en`.

## Output skeleton

```
@prefix :      <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix skos:  <http://www.w3.org/2004/02/skos/core#> .
@prefix prov:  <http://www.w3.org/ns/prov#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .

# new edges on existing nodes
:GameTheory skos:related :InformationTheory .

# new entities (if any)
:DeterrenceTheory a aleph:Concept ;
    skos:prefLabel "Deterrence Theory"@en ;
    skos:broader :GameTheory ;
    aleph:perceivedImportance 0.55 ;
    prov:wasGeneratedBy :Session_042 ;
    prov:generatedAtTime "{{now}}"^^xsd:dateTime .
```
