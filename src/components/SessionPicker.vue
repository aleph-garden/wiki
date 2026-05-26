<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSessions, useActiveSessionId, setActiveSessionId } from '../lib/queries';
import type { Palette } from '../palette';

defineProps<{ palette: Palette; fontMono: string }>();

const open = ref(false);
const sessions = useSessions();
const activeId = useActiveSessionId();

const label = computed(() => activeId.value ?? '—');

function pick(id: string | null) {
  setActiveSessionId(id);
  open.value = false;
}

function close() { open.value = false; }
</script>

<template>
  <div :style="{ position: 'relative' }">
    <button
      @click="open = !open"
      :style="{
        fontFamily: fontMono,
        fontSize: '11px',
        padding: '4px 10px',
        background: 'transparent',
        color: palette.fg,
        border: `1px solid ${palette.rule}`,
        borderRadius: '3px',
        cursor: 'pointer',
        letterSpacing: '0.8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }"
    >
      <span :style="{ color: palette.mute, fontSize: '9px' }">session</span>
      <span>{{ label }}</span>
      <span :style="{ fontSize: '9px', opacity: 0.6 }">▾</span>
    </button>

    <div
      v-if="open"
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
          right: '16px',
          minWidth: '260px',
          maxHeight: '420px',
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
        <button
          @click="pick(null)"
          :style="{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 12px',
            background: 'transparent',
            color: palette.mute,
            border: 'none',
            borderBottom: `1px solid ${palette.rule}`,
            cursor: 'pointer',
            fontFamily: fontMono,
            fontSize: '10px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }"
        >reset (newest)</button>

        <button
          v-for="s in sessions"
          :key="s.id"
          @click="pick(s.id)"
          :style="{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 12px',
            background: s.id === activeId ? palette.soft : 'transparent',
            color: palette.fg,
            border: 'none',
            borderBottom: `1px solid ${palette.rule}`,
            cursor: 'pointer',
            fontFamily: fontMono,
            fontSize: '11px',
          }"
        >
          <div :style="{ display: 'flex', justifyContent: 'space-between', gap: '12px' }">
            <span :style="{ fontWeight: s.id === activeId ? 600 : 400 }">{{ s.id }}</span>
            <span :style="{ color: palette.mute, fontSize: '9px' }">
              {{ s.startedAt ? s.startedAt.slice(0, 10) : '—' }}
            </span>
          </div>
          <div
            v-if="s.focus || s.agent !== '—'"
            :style="{ color: palette.mute, fontSize: '9.5px', marginTop: '2px' }"
          >
            {{ s.focus || s.agent }}
          </div>
        </button>

        <div
          v-if="sessions.length === 0"
          :style="{ padding: '12px', color: palette.mute, fontSize: '10px' }"
        >no sessions yet</div>
      </div>
    </div>
  </div>
</template>
