<script setup lang="ts">
import { ref } from 'vue';
import { getPod, reloadResource, select } from '../lib/rdf';
import type { Palette } from '../palette';
import { renderSessionMeta } from '../lib/ttl';

defineProps<{ palette: Palette; fontMono: string }>();

const busy = ref(false);
const err = ref<string | null>(null);

function nextSessionId(): string {
  const rows = select(`
    SELECT (COUNT(?s) AS ?n) WHERE {
      ?s a aleph:AlephSession .
    }`);
  const n = Number(rows[0]?.get('n')?.value ?? 0);
  return `Session_${String(n + 1).padStart(3, '0')}`;
}

async function startSession() {
  busy.value = true;
  err.value = null;
  try {
    const sessionId = nextSessionId();
    const now = new Date().toISOString();
    const ttl = renderSessionMeta({
      sessionId,
      startedAt: now,
      attributedTo: 'Toph',
    });
    const path = `/aleph/sessions/${sessionId}/meta.ttl`;
    await getPod().putResource(path, ttl, { ifNoneMatch: true });
    await reloadResource(path);
  } catch (e) {
    err.value = String(e);
  } finally {
    busy.value = false;
  }
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
