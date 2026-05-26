<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { getPod, POD_ROOT } from '../lib/rdf';
import { useActiveSessionId, setActiveSessionId } from '../lib/queries';
import type { Palette } from '../palette';

defineProps<{ palette: Palette; fontMono: string }>();

const activeId = useActiveSessionId();

// Current path under pod root. Segments are container/file names. Last
// segment may be a file (no trailing slash); everything before is containers.
// Initialised to the active session's meta.ttl, but the user can navigate.
const segments = ref<string[]>([]);

watch(activeId, (id) => {
  if (id && segments.value.length === 0) {
    segments.value = ['sessions', id, 'meta.ttl'];
  }
}, { immediate: true });

// Listing for whichever segment dropdown is open. Loaded lazily.
const openAt = ref<number | null>(null);
const entries = ref<string[]>([]);
const loading = ref(false);

// Build the absolute pod path up to (but not including) segment index `i`.
// segments[0..i-1] are containers. Returns "/aleph/" prefix included.
function pathUpto(i: number): string {
  return POD_ROOT + segments.value.slice(0, i).map((s) => s + '/').join('');
}

async function openSegment(i: number) {
  // Closing on second click
  if (openAt.value === i) { openAt.value = null; return; }
  loading.value = true;
  openAt.value = i;
  try {
    const containerPath = pathUpto(i);
    const list = await getPod().listContainer(containerPath);
    // listContainer returns absolute URLs; reduce to last segment relative to
    // the container so the dropdown shows just names like "msg1.ttl" or
    // "Session_005/".
    entries.value = list
      .map((url) => {
        try { return new URL(url).pathname; } catch { return url; }
      })
      .map((p) => p.replace(containerPath, ''))
      .filter((s) => s.length > 0);
  } catch (e) {
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

function pickEntry(i: number, entry: string) {
  // entry is e.g. "msg1.ttl" or "Session_005/"
  const isContainer = entry.endsWith('/');
  const clean = entry.replace(/\/$/, '');
  // Replace segments[i..] with [clean]; if it's a container, leave terminal
  // segment as just the container (the user can drill again).
  segments.value = [...segments.value.slice(0, i), clean];
  openAt.value = null;
  // If user picked a Session_xxx inside /sessions/, mirror to the active
  // session selection so chat-input + queries follow along.
  if (i >= 1 && segments.value[0] === 'sessions' && i === 1) {
    setActiveSessionId(clean);
    // Auto-drill into meta.ttl by default
    segments.value = ['sessions', clean, 'meta.ttl'];
  }
  if (!isContainer) {
    // file selected — nothing more to drill; could fetch + preview in v2
  }
}

function close() { openAt.value = null; }

const display = computed(() => segments.value);
</script>

<template>
  <div
    :style="{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontFamily: fontMono,
      fontSize: '11.5px',
      color: palette.mute,
      position: 'relative',
    }"
  >
    <span :style="{ color: palette.fg }">~/</span>
    <span :style="{ color: palette.mute }">pod</span>

    <template v-for="(seg, i) in display" :key="i">
      <span style="opacity: .4">/</span>
      <button
        @click="openSegment(i + 1)"
        :style="{
          background: 'transparent',
          border: 'none',
          padding: '0 2px',
          font: 'inherit',
          color: i === display.length - 1 ? palette.fg : palette.mute,
          fontWeight: i === display.length - 1 ? 500 : 400,
          cursor: 'pointer',
          textDecoration: openAt === i + 1 ? 'underline' : 'none',
        }"
      >{{ seg }}</button>
    </template>

    <!-- dropdown overlay -->
    <div
      v-if="openAt !== null"
      @click.self="close"
      :style="{
        position: 'fixed',
        inset: 0,
        zIndex: 9,
      }"
    >
      <div
        :style="{
          position: 'absolute',
          top: '42px',
          left: '180px',
          minWidth: '220px',
          maxHeight: '380px',
          overflowY: 'auto',
          background: palette.panel,
          border: `1px solid ${palette.rule}`,
          borderRadius: '4px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          fontFamily: fontMono,
          fontSize: '11px',
          color: palette.fg,
        }"
      >
        <div
          :style="{
            padding: '6px 10px',
            color: palette.mute,
            fontSize: '9px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            borderBottom: `1px solid ${palette.rule}`,
          }"
        >{{ pathUpto(openAt) }}</div>
        <div v-if="loading" :style="{ padding: '10px', color: palette.mute }">loading…</div>
        <div v-else-if="entries.length === 0" :style="{ padding: '10px', color: palette.mute }">empty</div>
        <button
          v-for="entry in entries"
          :key="entry"
          @click="pickEntry(openAt!, entry)"
          :style="{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 10px',
            background: 'transparent',
            color: entry.endsWith('/') ? palette.fg : palette.sepia,
            border: 'none',
            borderBottom: `1px solid ${palette.rule}`,
            cursor: 'pointer',
            fontFamily: fontMono,
            fontSize: '11px',
          }"
        >{{ entry }}</button>
      </div>
    </div>
  </div>
</template>
