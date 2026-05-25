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
  if (location.pathname === '/' && initial) {
    navigate({ ...parsed, ...initial }, { replace: true });
  } else {
    apply(parsed);
  }
}
