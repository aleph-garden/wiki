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

function enc(s: string): string {
  return encodeURIComponent(s).replace(/%3A/gi, ':');
}

function parseSegs(raw: string): string[] {
  return raw.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map((p) => decodeURIComponent(p));
}

function stripColon(s: string | null): string | null {
  if (!s) return s;
  return s.startsWith(':') ? s.slice(1) : s;
}

export function parseLocation(pathname: string = location.pathname, hash: string = location.hash): RouteState {
  const pathParts = parseSegs(pathname);
  const hashParts = parseSegs(hash.replace(/^#/, ''));

  // Legacy: /{mode}/{focus}/{pred} with no hash
  if (hashParts.length === 0 && pathParts.length > 0 && MODES.has(pathParts[0] as Mode)) {
    return {
      mode: pathParts[0] as Mode,
      focusCurie: stripColon(pathParts[1] ?? null),
      predCurie: pathParts[2] ?? null,
    };
  }

  const focus = stripColon(pathParts[0] ?? null);
  const rawMode = hashParts[0] ?? '';
  const mode = MODES.has(rawMode as Mode) ? (rawMode as Mode) : DEFAULT.mode;
  const pred = hashParts[1] ?? null;

  return { mode, focusCurie: focus, predCurie: pred };
}

export function buildUrl(s: RouteState): string {
  const focus = stripColon(s.focusCurie);
  const path = focus ? '/' + enc(focus) : '/';

  // Omit hash entirely for the default state (point mode, no predicate)
  const isDefault = s.mode === DEFAULT.mode && !s.predCurie;
  if (isDefault) return path;

  const hashSegs: string[] = [s.mode];
  if (s.predCurie) hashSegs.push(s.predCurie);
  return path + '#/' + hashSegs.map(enc).join('/');
}

function apply(state: RouteState) {
  current.mode = state.mode;
  current.focusCurie = state.focusCurie;
  current.predCurie = state.predCurie;
}

export function navigate(patch: Partial<RouteState>, opts: { replace?: boolean } = {}) {
  const next: RouteState = {
    mode: patch.mode ?? current.mode,
    focusCurie: patch.focusCurie === undefined ? current.focusCurie : stripColon(patch.focusCurie),
    predCurie: patch.predCurie === undefined ? current.predCurie : patch.predCurie,
  };
  const url = buildUrl(next);
  if (opts.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  apply(next);
}

let installed = false;
export function installRouter(initial?: Partial<RouteState>) {
  if (installed) return;
  installed = true;
  const sync = () => apply(parseLocation());
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);

  const parsed = parseLocation();
  const merged: RouteState =
    location.pathname === '/' && !location.hash && initial
      ? { ...parsed, ...initial, focusCurie: stripColon(initial.focusCurie ?? parsed.focusCurie) }
      : parsed;

  const canonical = buildUrl(merged);
  if (canonical !== location.pathname + location.hash) {
    window.history.replaceState(null, '', canonical);
  }
  apply(merged);
}
