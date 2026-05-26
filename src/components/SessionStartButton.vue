<script setup lang="ts">
import { ref } from 'vue';
import { getPod, reloadContainer } from '../lib/rdf';
import { setActiveSessionId } from '../lib/queries';
import type { Palette } from '../palette';
import { renderSessionMeta } from '../lib/ttl';

defineProps<{ palette: Palette; fontMono: string }>();

const busy = ref(false);
const err = ref<string | null>(null);

// Ask the pod directly for existing Session_NNN/ containers — local store
// may lag (no WS event yet, or WS handler hasn't run). Returns the largest N
// already in use, 0 if none.
async function highestSessionN(): Promise<number> {
  const entries = await getPod().listContainer('/aleph/sessions/');
  let max = 0;
  for (const entry of entries) {
    const m = entry.match(/Session_(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

async function startSession() {
  busy.value = true;
  err.value = null;
  const now = new Date().toISOString();
  let base: number;
  try {
    base = await highestSessionN();
  } catch (e) {
    err.value = String(e);
    busy.value = false;
    return;
  }
  // Still race-tolerant: if two clients PUT at once, the loser bumps N.
  for (let bump = 1; bump <= 20; bump++) {
    const sessionId = `Session_${String(base + bump).padStart(3, '0')}`;
    const path = `/aleph/sessions/${sessionId}/meta.ttl`;
    const ttl = renderSessionMeta({ sessionId, startedAt: now, attributedTo: 'Toph' });
    try {
      await getPod().putResource(path, ttl, { ifNoneMatch: true });
      // Re-scan the whole /aleph/sessions/ container so the new session shows
      // up in queries (active-session, chat, etc.) without waiting for a WS
      // event.
      await reloadContainer('/aleph/sessions/');
      // Pin selection directly — don't rely on SPARQL "newest by startedAt"
      // (which can return null if the new triple isn't in the default graph
      // yet for whatever reason).
      setActiveSessionId(sessionId);
      busy.value = false;
      return;
    } catch (e) {
      if (!String(e).includes('412')) {
        err.value = String(e);
        busy.value = false;
        return;
      }
    }
  }
  err.value = 'no free session slot found';
  busy.value = false;
}
</script>

<template>
  <button
    :disabled="busy"
    @click="startSession"
    :style="{
      fontFamily: fontMono,
      fontSize: '11px',
      padding: '4px 10px',
      background: palette.fg,
      color: palette.bg,
      border: 'none',
      borderRadius: '3px',
      cursor: busy ? 'wait' : 'pointer',
      letterSpacing: '0.8px',
    }"
  >{{ busy ? '...' : 'neue sitzung' }}</button>
  <span v-if="err" :style="{ color: palette.warn, fontSize: '10px', marginLeft: '6px' }">{{ err }}</span>
</template>
