<script setup lang="ts">
import type { Palette } from '../palette';
import type { Mode } from './types';

defineProps<{ palette: Palette; fontMono: string; mode: Mode }>();
</script>

<template>
  <footer
    :style="{
      position: 'absolute',
      bottom: 0, left: 0, right: 0, height: '28px',
      borderTop: `1px solid ${palette.rule}`,
      background: mode === 'point' ? 'transparent' : palette.panel,
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: '18px',
      fontFamily: fontMono,
      fontSize: '10px',
      color: palette.mute,
      zIndex: 5,
    }"
  >
    <span :style="{ color: palette.ok, display: 'flex', alignItems: 'center', gap: '5px' }">
      <span :style="{ width: '6px', height: '6px', borderRadius: '3px', background: palette.ok }" />
      SHACL valid
    </span>
    <span>1,287 triples · 413 concepts · 89 persons · 37 events</span>
    <span style="flex: 1" />
    <span>SPARQL: pod://alice.solid · idle</span>
    <span style="opacity: .4">·</span>
    <span>federating: <span :style="{ color: palette.fg }">wikidata, dbpedia</span></span>
    <span style="opacity: .4">·</span>
    <span>v0.4.0-rc1</span>
  </footer>
</template>
