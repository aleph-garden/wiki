---
id: aleph.extend
inputs:
  graph:        "Existing TTL or JSON-LD (full or focus-neighbourhood)"
  user_turn:    "Most recent user utterance"
  session_id:   "Current session"
  now:          "ISO 8601 dateTime"
  max_new:      "default 5 — cap on net-new entities per turn"
output: "JSON-LD delta document — additions only, no deletions"
---

# Extend an existing Aleph graph

The user is mid-session. They just said:

> {{user_turn}}

Read **{{graph}}** to understand what already exists. Then emit a JSON-LD
**delta** that:

1. Adds at most **{{max_new}}** new entities the user explicitly asked
   for or that are clearly implied by the turn.
2. Adds new edges between *existing* entities where the turn surfaces a
   relation that was previously implicit.
3. Reinforces (no-op) existing predicates only if reinforcement carries
   new information (e.g. an extra `altLabel`).

## Hard rules

- **Delta only.** Do not re-emit any triple already present in the input
  graph. The downstream merge is union — duplicates are noise.
- **No deletions.** If the turn contradicts the existing graph, emit a
  `wasRevisionOf` chain instead and let SHACL flag it later.
- Each new entity carries `wasGeneratedBy: "g:{{session_id}}"` and
  `generatedAtTime: "{{now}}"` (or staggered within ±30 s).
- Reuse IRIs from the input graph verbatim — never coin a near-duplicate
  (`g:Cooperation` exists ⇒ do not emit `g:Cooperate`).
- Edit-meta node uses `editKind: "extend"`.
- Output JSON-LD only — no markdown fences, no commentary.

## Heuristics

- "yes, and link X" → add the edge `{ "@id": "g:Focus", "related": "g:X" }`.
- "tell me more about Y" → if Y is a Person, do not add new edges;
  add a `definition` / `comment` if you have one.
- "drop Z" → DO NOT delete. Lower its `perceivedImportance` by 0.2 (clamp
  at 0.1) and add `"comment": { "en": "user de-emphasised" }`.

## Skeleton

```json
{
  "@context": "https://aleph.wiki/context.jsonld",
  "@graph": [
    {
      "@id": "",
      "@type": "Edit",
      "wasGeneratedBy": "g:Session_042",
      "generatedAtTime": "{{now}}",
      "editKind": "extend"
    },

    { "@id": "g:GameTheory", "related": "g:InformationTheory" },

    {
      "@id": "g:DeterrenceTheory",
      "@type": "Concept",
      "prefLabel":           { "en": "Deterrence Theory" },
      "broader":             "g:GameTheory",
      "perceivedImportance": 0.55,
      "wasGeneratedBy":      "g:Session_042",
      "generatedAtTime":     "{{now}}"
    }
  ]
}
```

Use the hosted `@context` (`https://aleph.wiki/context.jsonld`, served at
`/aleph/context.jsonld`) rather than inlining — extend docs draw on the
full vocabulary (skos, prov, rdfs, custom predicates) and inline contexts
would balloon. The processor will dereference the URL once and cache.

If the turn implies no new entities and no new edges: emit nothing.
Do not create empty delta files.
