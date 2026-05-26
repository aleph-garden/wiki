<script setup lang="ts">
import { ref } from 'vue';
import { getPod, reloadResource, select } from '../lib/rdf';
import type { Palette } from '../palette';
import { renderSessionMeta } from '../lib/ttl';

defineProps<{ palette: Palette; fontMono: string }>();

const busy = ref(false);
const err = ref<string | null>(null);

function currentSessionCount(): number {
  const rows = select(`
    SELECT (COUNT(?s) AS ?n) WHERE {
      ?s a aleph:AlephSession .
    }`);
  return Number(rows[0]?.get('n')?.value ?? 0);
}

async function startSession() {
  busy.value = true;
  err.value = null;
  const base = currentSessionCount();
  const now = new Date().toISOString();
  // Pod may already have sessions the local store doesn't know about (stale
  // cache, prior failed loads). On 412 keep bumping N until we land a fresh
  // slot. Cap at 50 to avoid runaway in pathological states.
  for (let bump = 1; bump <= 50; bump++) {
    const sessionId = `Session_${String(base + bump).padStart(3, '0')}`;
    const path = `/aleph/sessions/${sessionId}/meta.ttl`;
    const ttl = renderSessionMeta({ sessionId, startedAt: now, attributedTo: 'Toph' });
    try {
      await getPod().putResource(path, ttl, { ifNoneMatch: true });
      await reloadResource(path);
      busy.value = false;
      return;
    } catch (e) {
      if (!String(e).includes('412')) {
        err.value = String(e);
        busy.value = false;
        return;
      }
      // 412 → slot taken on pod but missing locally; try next N
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
