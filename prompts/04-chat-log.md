---
id: aleph.chat
inputs:
  session_id:   "Current session"
  transcript:   "JSON array of { speaker: 'user'|'agent', text, hint?, at?: ISO 8601 }"
output: "JSON-LD document — one aleph:ChatMessage per turn + edit-meta"
---

# Record a session transcript

Console + FloatingNarrator render `aleph:ChatMessage` instances in
ascending `aleph:position` order. Emit one per transcript entry.

JSON-LD (not Turtle) — LLM-authored writes go through `application/ld+json`
because the JSON syntax is easier to validate pre-PUT (JSON Schema) and
LLMs make fewer syntax errors than in Turtle. The pod normalises both into
the same RDF graph, so the wire format is purely an authoring concern.

## Hard rules

- `@id` for the message: `g:{{session_id}}_msg{{N}}` (N = 1-based turn index).
- `position` = N (integer).
- `speaker` exactly `"user"` or `"agent"`.
- `body` is plain text. No markdown — UI renders it as prose. Escape `"`
  and `\` per JSON rules (the JSON parser handles it, no manual Turtle
  escaping needed).
- `hint` only when meaningful — vocabulary: `"suggestion"`, `"insight"`,
  `"warning"`, `"reference"`. Omit otherwise.
- Every message carries `wasGeneratedBy: "g:{{session_id}}"` and
  `generatedAtTime` from `at` if present, else stagger ~20–60 s per turn
  from the session start.
- Edit-meta node has `@id: ""` (relative to the resource URL), `@type:
  "Edit"`, and `editKind: "create"`.
- Output JSON-LD only — no markdown fences, no commentary.

## Skeleton

```json
{
  "@context": {
    "aleph": "https://vocab.aleph.wiki/",
    "prov":  "http://www.w3.org/ns/prov#",
    "xsd":   "http://www.w3.org/2001/XMLSchema#",
    "g":     "https://aleph.wiki/g/",
    "ChatMessage": "aleph:ChatMessage",
    "Edit":        "aleph:Edit",
    "position":        { "@id": "aleph:position",       "@type": "xsd:integer" },
    "speaker":         { "@id": "aleph:speaker" },
    "body":            { "@id": "aleph:body" },
    "hint":            { "@id": "aleph:hint" },
    "editKind":        { "@id": "aleph:editKind" },
    "wasGeneratedBy":  { "@id": "prov:wasGeneratedBy",  "@type": "@id" },
    "generatedAtTime": { "@id": "prov:generatedAtTime", "@type": "xsd:dateTime" }
  },
  "@graph": [
    {
      "@id": "",
      "@type": "Edit",
      "wasGeneratedBy": "g:Session_042",
      "generatedAtTime": "2026-04-12T14:28:11Z",
      "editKind": "create"
    },
    {
      "@id": "g:Session_042_msg2",
      "@type": "ChatMessage",
      "position": 2,
      "speaker": "agent",
      "hint": "suggestion",
      "body": "Adding Prisoner's Dilemma · EGT · Mechanism Design.",
      "wasGeneratedBy": "g:Session_042",
      "generatedAtTime": "2026-04-12T14:28:11Z"
    }
  ]
}
```

The full canonical `@context` is hosted at `/aleph/context.jsonld` on the
pod. The inline subset above keeps each chat-msg doc self-contained
(no fetch dep, validates offline). Use the full hosted context only when
emitting concept/edge deltas that need terms beyond the chat vocabulary.
