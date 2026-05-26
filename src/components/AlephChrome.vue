<script setup lang="ts">
import type { Palette } from '../palette';
import type { Mode } from './types';
import AlephGlyph from './AlephGlyph.vue';
import ModeToggle from './ModeToggle.vue';
import SessionStartButton from './SessionStartButton.vue';
import SessionPicker from './SessionPicker.vue';

const props = defineProps<{
  mode: Mode;
  hasFocus: boolean;
  palette: Palette;
  fontUI: string;
  fontMono: string;
}>();

defineEmits<{ (e: 'update:mode', m: Mode): void }>();
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

    <div
      :style="{
        marginLeft: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: fontMono,
        fontSize: '11.5px',
        color: palette.mute,
      }"
    >
      <span :style="{ color: palette.fg }">~/</span>
      <span>pod</span>
      <span style="opacity: .4">/</span>
      <span>concepts</span>
      <span style="opacity: .4">/</span>
      <span :style="{ color: palette.fg, fontWeight: 500 }">GameTheory.ttl</span>
      <span
        :style="{
          marginLeft: '8px',
          fontSize: '10px',
          color: palette.ok,
          background: `${palette.ok}1a`,
          padding: '1px 6px',
          borderRadius: '3px',
        }"
      >SHACL ✓</span>
    </div>

    <div style="flex: 1" />

    <ModeToggle
      :mode="mode"
      :has-focus="hasFocus"
      :palette="palette"
      :font-mono="fontMono"
      @update:mode="(m) => $emit('update:mode', m)"
    />

    <SessionPicker :palette="palette" :font-mono="fontMono" />
    <SessionStartButton :palette="palette" :font-mono="fontMono" />

    <div
      :style="{
        fontFamily: fontMono,
        fontSize: '11px',
        color: palette.mute,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }"
    >
      <span
        :style="{
          width: '7px', height: '7px', borderRadius: '4px', background: palette.sage,
          display: 'inline-block',
        }"
      />
      pod://alice.solid · synced
    </div>
  </div>
</template>
