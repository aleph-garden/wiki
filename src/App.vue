<script setup lang="ts">
import { computed } from 'vue';
import AlephApp from './components/AlephApp.vue';
import PodSettingsDialog from './components/PodSettingsDialog.vue';
import { isConfigured, settingsOpen, closePodSettings } from './lib/pod-config';
import { getPalette } from './palette';

// Setup screen uses the default dark palette so the unconfigured app has a
// presentable background instead of bare white.
const setupPalette = computed(() => getPalette('default').dark);

const configured = computed(() => isConfigured());
</script>

<template>
  <template v-if="configured">
    <AlephApp initial-mode="point" />
    <PodSettingsDialog
      v-if="settingsOpen"
      :palette="setupPalette"
      @close="closePodSettings"
    />
  </template>
  <template v-else>
    <div
      :style="{
        width: '100vw',
        height: '100vh',
        background: setupPalette.bg,
      }"
    />
    <PodSettingsDialog :palette="setupPalette" first-run />
  </template>
</template>
