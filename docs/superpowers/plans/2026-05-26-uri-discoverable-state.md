# URI-Discoverable State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mode, focus IRI, and selected predicate addressable via the browser URL using History API paths so any view can be linked and restored.

**Architecture:** Single source of truth is `location.pathname`. A small hand-rolled router parses the path into a reactive `current` object, components read from it, and all mutations go through `navigate(...)` which calls `history.pushState` and updates `current`. No vue-router dep. No test infrastructure exists in this project — verification is `npm run typecheck` plus manual browser smoke test.

**Tech Stack:** Vue 3 (script setup), TypeScript strict, Vite, History API (`window.history`, `popstate`). No new deps.

**Spec:** `docs/superpowers/specs/2026-05-26-uri-discoverable-state-design.md`

---

## Task 1: Router module

**Files:**
- Create: `src/lib/router.ts`

- [ ] **Step 1: Write `src/lib/router.ts`**

```typescript
import { reactive } from 'vue';
import type { Mode } from '../components/types';

const MODES = new Set<Mode>(['point', 'card', 'triples']);

export interface RouteState {
  mode: Mode;
  focusCurie: string | null;
  predCurie: string | null;
}

const DEFAULT: RouteState = { mode: 'point', focusCurie: null, predCurie: null };

export const current = reactive<RouteState>({ ...DEFAULT });

export function parsePath(pathname: string): RouteState {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const decoded = parts.map((p) => decodeURIComponent(p));
  const [rawMode, focus, pred] = decoded;
  const mode = MODES.has(rawMode as Mode) ? (rawMode as Mode) : DEFAULT.mode;
  return {
    mode,
    focusCurie: focus ?? null,
    predCurie: pred ?? null,
  };
}

export function buildPath(s: RouteState): string {
  const segs: string[] = [s.mode];
  if (s.focusCurie) segs.push(s.focusCurie);
  if (s.focusCurie && s.predCurie) segs.push(s.predCurie);
  return '/' + segs.map((x) => encodeURIComponent(x).replace(/%3A/gi, ':')).join('/');
}

function apply(state: RouteState) {
  current.mode = state.mode;
  current.focusCurie = state.focusCurie;
  current.predCurie = state.predCurie;
}

export function navigate(patch: Partial<RouteState>, opts: { replace?: boolean } = {}) {
  const next: RouteState = {
    mode: patch.mode ?? current.mode,
    focusCurie: patch.focusCurie === undefined ? current.focusCurie : patch.focusCurie,
    predCurie: patch.predCurie === undefined ? current.predCurie : patch.predCurie,
  };
  const url = buildPath(next);
  if (opts.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  apply(next);
}

let installed = false;
export function installRouter(initial?: Partial<RouteState>) {
  if (installed) return;
  installed = true;
  window.addEventListener('popstate', () => apply(parsePath(location.pathname)));
  const parsed = parsePath(location.pathname);
  // If the URL is bare "/", seed with caller defaults via replaceState.
  if (location.pathname === '/' && initial) {
    navigate({ ...parsed, ...initial }, { replace: true });
  } else {
    apply(parsed);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/router.ts
git commit -m "feat(router): History API router for mode/focus/pred"
```

---

## Task 2: Wire `AlephApp.vue` to the router

**Files:**
- Modify: `src/components/AlephApp.vue`

- [ ] **Step 1: Replace local `mode` ref with router**

In `src/components/AlephApp.vue`, replace lines 1–31 of the `<script setup>` block. Specifically:

Add import at the top alongside the existing imports:
```typescript
import { current as route, navigate, installRouter } from '../lib/router';
import { onBeforeMount } from 'vue';
```

Remove the line `const mode = ref<Mode>(props.initialMode);` and replace with:
```typescript
onBeforeMount(() => installRouter({ mode: props.initialMode }));
const mode = computed<Mode>({
  get: () => route.mode,
  set: (m) => navigate({ mode: m }),
});
```

The existing `@update:mode="(m) => mode = m"` template binding keeps working because `mode` is now a writable computed.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/AlephApp.vue
git commit -m "feat(router): drive AlephApp mode from URL"
```

---

## Task 3: Thread focus + predicate through CardBody

**Files:**
- Modify: `src/components/AlephApp.vue` (pass `focusCurie` + `selectedPred` to CardBody)
- Modify: `src/components/CardBody.vue`

- [ ] **Step 1: Pass router state from AlephApp to CardBody**

In `src/components/AlephApp.vue`, find the `<CardBody ...>` element. Add two props sourced from `route`:

```vue
<CardBody
  v-if="mode === 'card'"
  :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO" :font-prose="fontProse"
  :width="centerW" :height="centerH" :dense="dense"
  :focus-curie="route.focusCurie"
  :selected-pred="route.predCurie"
/>
```

- [ ] **Step 2: Accept the new props in CardBody and use them**

In `src/components/CardBody.vue` `<script setup>`:

Add the import alongside the existing imports:
```typescript
import { navigate } from '../lib/router';
```

Update the `defineProps` to add two optional props:
```typescript
const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  fontProse: string;
  width: number;
  height: number;
  dense: boolean;
  focusCurie?: string | null;
  selectedPred?: string | null;
}>();
```

Resolve effective focus. Replace:
```typescript
const focusTriples = computed(() => graph.triplesFor(graph.focusId));
```
with:
```typescript
const effectiveFocus = computed(() => {
  const c = props.focusCurie;
  if (!c) return graph.focusId;
  // Strip leading ':' for default-prefix CURIEs to match graph node ids.
  return c.startsWith(':') ? c.slice(1) : c;
});
const focusTriples = computed(() => graph.triplesFor(effectiveFocus.value));
```

Replace the `backlinks` line:
```typescript
const backlinks = computed(() => graph.backlinksFor(graph.focusId));
```
with:
```typescript
const backlinks = computed(() => graph.backlinksFor(effectiveFocus.value));
```

Update the heading and Schematic that reference `graph.focusId`. In the template:
- Change `<span>Triples — :{{ graph.focusId }} ?p ?o</span>` to `<span>Triples — :{{ effectiveFocus }} ?p ?o</span>`
- Change `<Schematic ... :hilite="graph.focusId" />` to `<Schematic ... :hilite="effectiveFocus" />`

Add a helper for the click handler in `<script setup>`:
```typescript
function selectPredicate(predCurie: string) {
  navigate({ mode: 'card', focusCurie: ':' + effectiveFocus.value, predCurie });
}
function openIri(curie: string) {
  navigate({ mode: 'card', focusCurie: curie.startsWith(':') ? curie : curie, predCurie: null });
}
```

In the triples list template, the predicate `<span>` currently is:
```vue
<span :style="{ color: palette.accent, fontWeight: 500 }">{{ tr.predicate }}</span>
```

Replace with a clickable, highlightable span:
```vue
<span
  :style="{
    color: palette.accent,
    fontWeight: 500,
    cursor: 'pointer',
    borderBottom: `1px dashed ${palette.accent}55`,
    background: selectedPred === tr.predicate ? `${palette.accent}1a` : 'transparent',
    padding: selectedPred === tr.predicate ? '1px 4px' : '0',
    marginLeft: selectedPred === tr.predicate ? '-4px' : '0',
    borderRadius: '2px',
  }"
  @click="selectPredicate(tr.predicate)"
>{{ tr.predicate }}</span>
```

The object span currently is:
```vue
<span :style="{ color: tripleColor(tr.kind), wordBreak: 'break-word' }">{{ tr.object }}</span>
```

For IRI / type objects make it clickable:
```vue
<span
  v-if="tr.kind === 'iri' || tr.kind === 'type'"
  :style="{
    color: tripleColor(tr.kind),
    wordBreak: 'break-word',
    cursor: 'pointer',
    borderBottom: `1px dashed ${tripleColor(tr.kind)}55`,
  }"
  @click="openIri(tr.object)"
>{{ tr.object }}</span>
<span
  v-else
  :style="{ color: tripleColor(tr.kind), wordBreak: 'break-word' }"
>{{ tr.object }}</span>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/AlephApp.vue src/components/CardBody.vue
git commit -m "feat(card): focus + predicate sourced from URL, clickable rows"
```

---

## Task 4: Manual smoke verification

**Files:** none

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

Note the local URL (usually `http://localhost:5173`).

- [ ] **Step 2: Verify URLs in browser**

Open `http://localhost:5173/`. Expect: point mode renders, URL replaced to `/point`.

Click the **Card** mode tab. Expect: URL becomes `/card`, card view renders, default focus shows.

Click any predicate in the triples list (e.g. `skos:related`). Expect: URL becomes `/card/:<focus-id>/skos:related`, that predicate row gets the accent background highlight.

Click an IRI in the object column. Expect: URL becomes `/card/<that-curie>`, predicate selection clears, card body re-renders for the new focus.

Copy the deep URL, open in a new tab. Expect: identical view to source tab.

Press the browser back button. Expect: previous state restored.

Switch to **Triples** mode. Expect: URL becomes `/triples` (or `/triples/:focus` if focus was set), Turtle view renders.

- [ ] **Step 3: Stop dev server, mark task complete**

Stop the dev server (Ctrl-C). No commit — verification only.

---

## Self-Review Notes

- All spec requirements covered: mode + focus + pred in URL (Tasks 1–3), back/forward (Task 1 popstate), shareable URLs (Task 4 verification).
- Out-of-scope items (object in URL, triples line anchor, RDF-subject state) explicitly excluded.
- No existing `nav.ts` to delete (working tree is clean, the spec's removal step is a no-op).
- `TriplesBody.vue` does not currently couple to nav state, so it needs no router wiring beyond receiving focus via props if/when we add focus to triples view. Not in scope.
- `AlephChrome.vue` already emits `update:mode`; the writable computed in `AlephApp` translates that into `navigate(...)`. No changes needed in AlephChrome.
- README SPA-fallback note deferred — project is dev-only at this stage.
