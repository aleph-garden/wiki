<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import type { Mode } from './types';
import AlephGlyph from './AlephGlyph.vue';
import ModeToggle from './ModeToggle.vue';
import SessionStartButton from './SessionStartButton.vue';
import PodBreadcrumb from './PodBreadcrumb.vue';
import { podBase, openPodSettings } from '../lib/pod-config';
import { podStatus } from '../lib/rdf';

const props = defineProps<{
  mode: Mode;
  hasFocus: boolean;
  palette: Palette;
  fontUI: string;
  fontMono: string;
}>();

defineEmits<{ (e: 'update:mode', m: Mode): void }>();

// Compact host label: strip scheme, drop default ports, keep trailing path.
const podLabel = computed(() => {
  if (!podBase.value) return 'no pod';
  try {
    const u = new URL(podBase.value);
    const port = u.port && u.port !== (u.protocol === 'https:' ? '443' : '80') ? `:${u.port}` : '';
    return `${u.hostname}${port}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return podBase.value;
  }
});

const statusDot = computed(() => {
  switch (podStatus.value) {
    case 'online': return props.palette.sage;
    case 'offline': return props.palette.warn;
    default: return props.palette.gold;
  }
});
</script>

<template>
  <div
    :style="{
      position: 'absolute',
      top: 0, left: 0, right: 0, height: '44px',
      borderBottom: `1px solid ${palette.rule}`,
      background: mode === 'point' ? 'transparent' : palette.panel,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '12px',
      zIndex: 5,
      transition: 'background 220ms ease',
      fontFamily: fontUI,
    }"
  >
    <AlephGlyph :size="20" :color="palette.fg" :accent="palette.sage" :stroke="1.8" />
    <span style="font-weight: 600; font-size: 14px; letter-spacing: -0.2px">
      aleph.wiki
    </span>

    <div :style="{ marginLeft: '20px' }">
      <PodBreadcrumb :palette="palette" :font-mono="fontMono" />
    </div>

    <div style="flex: 1" />

    <ModeToggle
      :mode="mode"
      :has-focus="hasFocus"
      :palette="palette"
      :font-mono="fontMono"
      @update:mode="(m) => $emit('update:mode', m)"
    />

    <SessionStartButton :palette="palette" :font-mono="fontMono" />

    <button
      @click="openPodSettings"
      :title="podBase ?? 'Configure pod URL'"
      :style="{
        fontFamily: fontMono,
        fontSize: '11px',
        color: palette.mute,
        background: 'transparent',
        border: `1px solid ${palette.rule}`,
        borderRadius: '3px',
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: 'pointer',
        maxWidth: '260px',
      }"
    >
      <span
        :style="{
          width: '7px', height: '7px', borderRadius: '4px', background: statusDot,
          display: 'inline-block',
          flexShrink: 0,
        }"
      />
      <span
        :style="{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }"
      >{{ podLabel }}</span>
    </button>
  </div>
</template>
