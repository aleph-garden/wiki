<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { getPod, POD_ROOT } from '../lib/rdf';
import { useActiveSessionId, setActiveSessionId } from '../lib/queries';
import { navigate } from '../lib/router';
import type { Palette } from '../palette';

defineProps<{ palette: Palette; fontMono: string }>();

const activeId = useActiveSessionId();

// Path under pod root. For v1 the meaningful unit is the session itself; we
// don't drill into individual files (msg1.ttl etc.) — those are details the
// breadcrumb shouldn't surface.
const segments = ref<string[]>([]);

watch(activeId, (id) => {
  segments.value = id ? ['sessions', id] : [];
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
  const clean = entry.replace(/\/$/, '');
  openAt.value = null;
  // Sessions are the only thing we want to surface in the breadcrumb. If the
  // user navigated into /aleph/sessions/ and picked a Session_xxx, pin it as
  // active session AND set focus so card/triples views resolve to it.
  if (segments.value[0] === 'sessions' || (i === 1 && clean === 'sessions')) {
    if (i === 1 && clean === 'sessions') {
      // User just clicked into the `sessions` container; let them pick.
      segments.value = ['sessions'];
      return;
    }
    if (i === 1 && segments.value[0] === 'sessions') {
      // Picking a Session_xxx under sessions/
      setActiveSessionId(clean);
      navigate({ focusCurie: clean });
      segments.value = ['sessions', clean];
      return;
    }
  }
  // Any other container/file pick: just reflect the path, no auto-drill.
  segments.value = [...segments.value.slice(0, i), clean];
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
    <button
      @click="openSegment(0)"
      :style="{
        background: 'transparent',
        border: 'none',
        padding: '0 2px',
        font: 'inherit',
        color: display.length === 0 ? palette.fg : palette.mute,
        fontWeight: display.length === 0 ? 500 : 400,
        cursor: 'pointer',
        textDecoration: openAt === 0 ? 'underline' : 'none',
      }"
    >pod</button>

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
