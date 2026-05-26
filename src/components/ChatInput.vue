<script setup lang="ts">
import { ref } from 'vue';
import { getPod, reloadResource, select } from '../lib/rdf';
import { renderChatMessage } from '../lib/ttl';
import type { Palette } from '../palette';

const props = defineProps<{
  palette: Palette;
  fontMono: string;
  sessionId: string | null;
}>();

const text = ref('');
const busy = ref(false);
const err = ref<string | null>(null);

function nextPosition(sessionId: string): number {
  const rows = select(`
    SELECT (COUNT(?m) AS ?n) WHERE {
      ?m a aleph:ChatMessage ;
         prov:wasGeneratedBy :${sessionId} .
    }`);
  return Number(rows[0]?.get('n')?.value ?? 0) + 1;
}

async function submit() {
  if (!props.sessionId || !text.value.trim() || busy.value) return;
  busy.value = true;
  err.value = null;
  const sessionId = props.sessionId;
  const body = text.value.trim();

  let attempt = 0;
  while (attempt < 3) {
    try {
      const position = nextPosition(sessionId);
      const ttl = renderChatMessage({
        sessionId, position, speaker: 'user', body,
        generatedAt: new Date().toISOString(), attributedTo: 'Toph',
      });
      const path = `/aleph/sessions/${sessionId}/msg${position}.ttl`;
      await getPod().putResource(path, ttl, { ifNoneMatch: true });
      await reloadResource(path);
      text.value = '';
      break;
    } catch (e) {
      attempt++;
      if (!String(e).includes('412') || attempt === 3) {
        err.value = String(e);
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  busy.value = false;
}
</script>

<template>
  <div
    :style="{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: fontMono,
      fontSize: '12px',
    }"
  >
    <span :style="{ color: palette.sepia, fontWeight: 600 }">›</span>
    <input
      v-model="text"
      :disabled="!sessionId || busy"
      @keydown.enter="submit"
      :placeholder="sessionId ? 'message ...' : 'starte eine sitzung'"
      :style="{
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: palette.fg,
        fontFamily: fontMono,
        fontSize: '12px',
      }"
    />
    <span v-if="busy" :style="{ color: palette.mute, fontSize: '10px' }">...</span>
    <span v-if="err" :style="{ color: palette.warn, fontSize: '10px' }">{{ err }}</span>
  </div>
</template>
