<script setup lang="ts">
import { podStatus } from '../lib/rdf';
import type { Palette } from '../palette';

defineProps<{ palette: Palette; fontMono: string }>();

const LABEL: Record<string, string> = {
  connecting: 'connecting to pod ...',
  online: 'pod online',
  offline: 'pod offline — start `nix run .#dev`',
  reconnecting: 'reconnecting ...',
};
</script>

<template>
  <div
    v-if="podStatus !== 'online'"
    :style="{
      position: 'absolute',
      top: '46px',
      left: '16px',
      right: '16px',
      padding: '6px 10px',
      background: palette.warn + '22',
      color: palette.warn,
      fontFamily: fontMono,
      fontSize: '11px',
      borderRadius: '3px',
      zIndex: 6,
    }"
  >{{ LABEL[podStatus] }}</div>
</template>
