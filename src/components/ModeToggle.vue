<script setup lang="ts">
import type { Palette } from '../palette';
import { FONT_SERIF as SERIF } from '../palette';
import type { Mode } from './types';

defineProps<{ mode: Mode; palette: Palette; fontMono: string }>();
const emit = defineEmits<{ (e: 'update:mode', m: Mode): void }>();

const modes: { id: Mode; icon: string; label: string }[] = [
  { id: 'point',   icon: 'א', label: 'point' },
  { id: 'card',    icon: '◉', label: 'card' },
  { id: 'triples', icon: '≡', label: 'triples' },
];

function pick(m: Mode) { emit('update:mode', m); }
</script>

<template>
  <div
    :style="{
      display: 'flex',
      alignItems: 'center',
      background: palette.soft,
      borderRadius: '5px',
      padding: '2px',
      fontSize: '11px',
      fontFamily: fontMono,
      border: `1px solid ${palette.rule}`,
    }"
  >
    <button
      v-for="m in modes"
      :key="m.id"
      @click="pick(m.id)"
      :style="{
        padding: '5px 12px',
        borderRadius: '3px',
        cursor: 'pointer',
        background: m.id === mode ? palette.panel : 'transparent',
        color: m.id === mode ? palette.fg : palette.mute,
        boxShadow: m.id === mode ? `0 1px 2px ${palette.rule}, 0 0 0 0.5px ${palette.rule}` : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontWeight: m.id === mode ? 600 : 400,
        border: 'none',
      }"
    >
      <span
        :style="{
          fontSize: m.id === 'point' ? '15px' : '13px',
          opacity: m.id === mode ? 1 : 0.6,
          fontFamily: m.id === 'point' ? SERIF : 'inherit',
          lineHeight: 1,
        }"
      >{{ m.icon }}</span>
      {{ m.label }}
    </button>
  </div>
</template>
