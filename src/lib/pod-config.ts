import { ref } from 'vue';

const STORAGE_KEY = 'aleph.podBase';

const envOverride: string | null =
  ((import.meta as any).env?.VITE_POD_BASE as string | undefined) ?? null;

function readStored(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export const podBase = ref<string | null>(readStored() ?? envOverride);

// UI state: when true, the settings dialog overlays the app. Independent of
// `firstRun` (which is implicit: !isConfigured()).
export const settingsOpen = ref<boolean>(false);

export function openPodSettings() { settingsOpen.value = true; }
export function closePodSettings() { settingsOpen.value = false; }

export function getPodBase(): string {
  if (!podBase.value) {
    throw new Error('Pod base URL not configured — call setPodBase() first');
  }
  return podBase.value;
}

export function isConfigured(): boolean {
  return podBase.value !== null;
}

export function normalisePodBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('URL required');
  const u = new URL(trimmed);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('URL must be http(s)');
  }
  // Strip trailing slash; PodClient.url() handles concatenation.
  return u.origin + u.pathname.replace(/\/$/, '');
}

export function setPodBase(input: string): void {
  const normalised = normalisePodBase(input);
  localStorage.setItem(STORAGE_KEY, normalised);
  podBase.value = normalised;
  location.reload();
}

export function clearPodBase(): void {
  localStorage.removeItem(STORAGE_KEY);
  podBase.value = envOverride;
  location.reload();
}
