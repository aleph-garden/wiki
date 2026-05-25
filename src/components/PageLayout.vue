<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';

const props = defineProps<{
  palette: Palette;
  width: number;
  dense: boolean;
}>();

const pad = computed(() => props.dense ? '18px 24px' : '22px 32px');
</script>

<template>
  <section
    :style="{
      width: width + 'px',
      padding: pad,
      position: 'relative',
      background: palette.bg,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }"
  >
    <slot />
  </section>
</template>
