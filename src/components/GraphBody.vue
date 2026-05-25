<script setup lang="ts">
import type { Palette } from '../palette';
import ConceptHeader from './ConceptHeader.vue';
import Schematic from './Schematic.vue';

defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  fontProse: string;
  width: number;
  dense: boolean;
}>();
</script>

<template>
  <section
    :style="{
      width: width + 'px',
      padding: '20px 28px',
      position: 'relative',
      background: palette.bg,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }"
  >
    <ConceptHeader :palette="palette" :font-mono="fontMono" font-prose='"Fraunces", serif' />
    <div
      :style="{
        flex: 1,
        background: palette.panel,
        border: `1px solid ${palette.rule}`,
        borderRadius: '4px',
        position: 'relative',
        overflow: 'hidden',
      }"
    >
      <Schematic :palette="palette" :font-ui="fontUI" :font-mono="fontMono" hilite="gt" />
    </div>
  </section>
</template>
