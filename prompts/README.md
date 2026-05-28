# Aleph Prompt Framework

Why? Don't hardcode the UI from `data.ts` — feed it from real `.ttl` files
instead. These prompts generate and maintain exactly those files. Output
drops 1:1 into `data/*.ttl` and is read by the UI loader.

## Pipeline

```
        ┌──────────────┐                ┌──────────────────────┐
topic   │ 01-seed      │  fresh.ttl    │ vocab/aleph-shapes   │
─────►  │ Concept-Seed │ ────────────► │ SHACL validate       │
        └──────────────┘                └──────────┬───────────┘
                                                   │ pass
                                                   ▼
user input   ┌──────────────┐                ┌──────────────┐
  +graph ──► │ 02-extend    │  delta.ttl ──► │ merge        │
             │ Concept-Grow │                │ into store   │
             └──────────────┘                └──────┬───────┘
                                                    │
                                                    ▼
question     ┌──────────────┐                ┌──────────────┐
  +graph ──► │ 03-view      │  view.ttl  ──► │ UI renders   │
             │ View-Compose │                │ Point/Card   │
             └──────────────┘                └──────────────┘
```

## Files

| File | Input | Output | Used by |
|------|-------|--------|---------|
| `01-seed.md`     | topic, depth, intent             | full TTL bundle      | first session on a new topic |
| `02-extend.md`   | existing TTL + chat turn         | TTL delta (additions only) | every subsequent turn |
| `03-view.md`     | TTL + user question              | `aleph:View` block   | Point/Card mode rendering |
| `04-chat-log.md` | session id + transcript          | `aleph:ChatMessage` block | Console panel |
| `schema.md`      | —                                | vocab cheat sheet    | read-only reference loaded into every other prompt |
| `learning.md`    | —                                | learning-science rationale | reference for `agent-loop.md` reply/extend constraints |

## Conventions

- All prompts emit **valid Turtle**, no markdown fences in the LLM output —
  the harness pipes stdout straight into `n3`/`oxigraph`.
- Each emitted entity gets `prov:wasGeneratedBy <session>` +
  `prov:generatedAtTime` so SHACL passes.
- Namespaces:
  - `:`       → `https://aleph.wiki/g/`  (data)
  - `aleph:`  → `https://vocab.aleph.wiki/`  (vocab)
- Local naming: `CamelCaseEntity`, `Session_NNN`, `Session_NNN_msgK`.
- Layout coords (`aleph:layoutX/Y`) are optional. Omit → loader
  re-runs force layout. Include → loader respects pinned positions.

## Testing the loop

`data/demo-game-theory.ttl` is the **reference output**. Any prompt should be
able to regenerate something structurally equivalent from the seed topic
"Game theory across fields" — same predicates, same classes, layout may
differ. Use it as a golden file:

```
diff <(prompt 01-seed "Game theory across fields") data/demo-game-theory.ttl
```

Not a strict text diff — compare *graph isomorphism*, e.g. via
`rapper -c` triple count + `sparql --query check.rq`.
