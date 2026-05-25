---
id: aleph.chat
inputs:
  session_id:   "Current session"
  transcript:   "JSON array of { speaker: 'user'|'agent', text, hint?, at?: ISO 8601 }"
output: "Turtle fragment — one aleph:ChatMessage per turn"
---

# Record a session transcript

Console + FloatingNarrator render `aleph:ChatMessage` instances in
ascending `aleph:position` order. Emit one per transcript entry.

## Hard rules

- IRI template: `:{{session_id}}_msg{{N}}`, N = 1-based turn index.
- `aleph:position` = N.
- `aleph:speaker` exactly `"user"` or `"agent"`.
- `aleph:body` is plain text. No markdown — the UI renders it as prose.
  Escape `"` and `\` inside the literal.
- `aleph:hint` only when meaningful — current vocabulary: `"suggestion"`,
  `"insight"`, `"warning"`, `"reference"`. Omit otherwise.
- `prov:wasGeneratedBy :{{session_id}}` on every message.
- `prov:generatedAtTime` from `at` if present, else stagger ~20–60 s
  per turn from the session start.
- Output Turtle only.

## Skeleton

```
@prefix :      <https://aleph.wiki/g/> .
@prefix aleph: <https://vocab.aleph.wiki/> .
@prefix prov:  <http://www.w3.org/ns/prov#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .

:Session_042_msg1 a aleph:ChatMessage ;
    aleph:position 1 ; aleph:speaker "user" ;
    aleph:body "i want to map out how game theory shows up across fields" ;
    prov:wasGeneratedBy :Session_042 ;
    prov:generatedAtTime "2026-04-12T14:23:01Z"^^xsd:dateTime .

:Session_042_msg2 a aleph:ChatMessage ;
    aleph:position 2 ; aleph:speaker "agent" ;
    aleph:hint "suggestion" ;
    aleph:body "Adding Prisoner's Dilemma · EGT · Mechanism Design." ;
    prov:wasGeneratedBy :Session_042 ;
    prov:generatedAtTime "2026-04-12T14:28:11Z"^^xsd:dateTime .
```
