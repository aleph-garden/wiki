<script setup lang="ts">
withDefaults(defineProps<{
  size?: number;
  color?: string;
  accent?: string;
  stroke?: number;
}>(), {
  size: 64,
  color: '#1a2440',
  accent: '#7a8f86',
  stroke: 2,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    style="display: block"
  >
    <path
      d="M40 8 C 50 16, 52 28, 42 36 C 36 40, 30 38, 28 32"
      :stroke="color"
      :stroke-width="stroke"
      stroke-linecap="round"
      fill="none"
    />
    <path
      d="M24 56 C 14 48, 12 36, 22 28 C 28 24, 34 26, 36 32"
      :stroke="color"
      :stroke-width="stroke"
      stroke-linecap="round"
      fill="none"
    />
    <path
      d="M20 14 L 44 50"
      :stroke="accent"
      :stroke-width="stroke * 1.1"
      stroke-linecap="round"
    />
    <circle cx="20" cy="14" r="1.6" :fill="accent" />
    <circle cx="44" cy="50" r="1.6" :fill="accent" />
  </svg>
</template>
