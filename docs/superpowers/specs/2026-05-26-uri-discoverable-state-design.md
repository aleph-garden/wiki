# URI-Discoverable State

**Date:** 2026-05-26
**Status:** Approved (design phase)

## Goal

Every navigable state in the app is reflected in the browser URL so that any
view can be linked, shared, bookmarked, and reached via back/forward buttons.
Selecting a predicate on a focused IRI from the card view must produce a unique
URL that restores exactly that view when opened later.

## Scope

In scope:

- Mode (`point` | `card` | `triples`)
- Focused IRI (CURIE form)
- Selected predicate on the focused IRI (CURIE form)
- Browser back/forward via History API

Out of scope (future "ultra" layer):

- Selected object / specific triple row
- Triples-view line anchor (kept as ephemeral in-memory state)
- State as RDF subject with its own properties

## URL Format

History API paths (no hash routing, no query string).

```
/                                  default mode, default focus
/:mode                             mode set, focus default
/:mode/:focusCurie                 focus set
/:mode/:focusCurie/:predCurie      predicate also selected
```

Examples:

```
/card/:game-theory
/card/:game-theory/skos:related
/triples/:john-nash
/point
```

CURIEs are preserved verbatim. The leading colon for the default prefix is
required (matches TTL syntax). Unknown mode or unparseable segment falls back
to the default view; no error page.

Production deployment requires the static host to serve `index.html` for any
unknown path (e.g. nginx `try_files $uri /index.html`). Vite dev server already
does this. Documented in README, not in code.

## Architecture

### Single source of truth: URL

```
user action ──► navigate({mode, focus, pred}) ──► history.pushState
                                                          │
                                                          ▼
                                                    popstate event
                                                          │
                                                          ▼
                                                  parse pathname
                                                          │
                                                          ▼
                                              update reactive `current`
                                                          │
                                                          ▼
                                                  Vue components re-render
```

Components never write to `nav`/`current` directly. They call `navigate(...)`.
The URL is parsed back into the reactive object. One direction. Back/forward
works for free.

### New module: `src/lib/router.ts`

Responsibilities:

- `current` — reactive `{ mode: Mode, focusCurie: string | null, predCurie: string | null }`
- `navigate(patch: Partial<typeof current>, opts?: { replace?: boolean })`
  - merges patch onto current, builds path, calls `history.pushState`
  - replace mode used for initial parse on mount
- `parsePath(pathname: string)` → state object
- `buildPath(state)` → string
- Internal: `popstate` listener updates `current` from `location.pathname`
- Initial mount: parse `location.pathname` into `current`

Defaults:

- `mode` default: `point` (preserves existing `initialMode` prop behavior)
- `focusCurie` default: `null` — components fall back to `graph.focusId`
- `predCurie` default: `null`

Hand-rolled, ~50 LoC. No vue-router dependency.

### Replace existing nav

`src/lib/nav.ts` is deleted. Current callers:

- `AlephApp.vue` — reads `nav.mode`, sets via `setMode`
- `AlephChrome.vue` (mode tabs) — emits `update:mode`
- `TriplesBody.vue` — uses `nav.triplesTarget`, `nav.triplesPulse`, `navBack`, `canBack`
- `CardBody.vue` — no nav usage today

`triplesTarget` / `triplesPulse` stay as ephemeral in-memory state, moved into
a small `triplesNav` module (or kept inline in `TriplesBody`). They do not
appear in the URL. `navBack` / `canBack` are removed — browser back button
replaces them.

### Component wiring

**AlephApp.vue**

- Import `current` from router instead of `nav`
- Mode binding: `current.mode`, setter calls `navigate({ mode })`
- On mount: if URL is `/`, replace with `/:mode` from `initialMode` prop so the
  URL always shows the active mode

**AlephChrome.vue** (mode tabs)

- Click → `navigate({ mode: x })`, preserves focus + pred

**CardBody.vue**

- New prop `focusCurie: string | null` from router
- Resolve effective focus: `focusCurie ?? graph.focusId`
- New prop `selectedPred: string | null`
- Visually highlight matching predicate row (border-left accent on the row)
- Auto-open `TripleContextMenu` anchored to that row if `selectedPred` set on
  mount? — **No.** Highlight only. Menu is a transient interaction, not a view
  state. (Keeps menu state out of URL, matches scope.)
- Predicate click in triples list → `navigate({ mode: 'card', focus: <current>, pred: clicked })`
- Object click (IRI) → `navigate({ focus: clicked })` (clears pred)

**TriplesBody.vue**

- Replace `nav.triplesTarget` reads with local ref
- Drop `navBack` button (browser back replaces it) OR keep as `history.back()` wrapper

**TripleContextMenu.vue**

- Existing actions emit navigation intents that map to `navigate(...)` calls
- "open" on IRI = `navigate({ focus: iri })`
- "select predicate" = `navigate({ pred: curie })`

## Data Flow Example

User on `/point`. Switches to card mode:

1. Clicks card tab in `AlephChrome`
2. Emits `update:mode='card'`
3. `AlephApp` calls `navigate({ mode: 'card' })`
4. Router builds `/card`, calls `history.pushState`
5. (no popstate fires on pushState — router updates `current` directly inside
   `navigate` after push)
6. `AlephApp`'s computed reads `current.mode === 'card'` → renders `CardBody`
7. `CardBody` reads `current.focusCurie` = null → falls back to `graph.focusId`

User clicks `skos:related` in the triples list:

1. Click handler calls `navigate({ mode: 'card', focus: graph.focusId, pred: 'skos:related' })`
2. Router builds `/card/:game-theory/skos:related`
3. `current` updates, row highlights

User hits back button:

1. `popstate` fires
2. Router parses `/card` → `{ mode: 'card', focusCurie: null, predCurie: null }`
3. Highlight clears

## Error Handling

- Malformed path segments → fall back to defaults silently
- Unknown mode → default to `point`
- CURIE that does not resolve in graph → render whatever the component renders
  for unknown IRIs today (no special routing handling)

## Testing

Manual smoke test (no automated tests added):

- Open `/`, verify default view
- Switch modes via tabs, verify URL updates
- Click predicate in card view, verify URL gains `/skos:related`
- Copy URL, open in new tab, verify identical view
- Browser back/forward across several mode + focus + pred changes
- Reload on a deep URL, verify it restores

## Files Touched

- New: `src/lib/router.ts`
- Modified: `src/components/AlephApp.vue`, `AlephChrome.vue`, `CardBody.vue`,
  `TriplesBody.vue`, `TripleContextMenu.vue`
- Deleted: `src/lib/nav.ts`
- README: note SPA-fallback requirement for prod deploys
