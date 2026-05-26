<script setup lang="ts">
import { computed, onBeforeMount, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import {
  getPalette, proseFont, FONT_UI, FONT_MONO,
  type ThemeName, type Typeface,
} from '../palette';
import type { Mode } from './types';
import { current as route, navigate, installRouter } from '../lib/router';
import AlephChrome from './AlephChrome.vue';
import AlephStatusBar from './AlephStatusBar.vue';
import AlephLibrary from './AlephLibrary.vue';
import AlephConsole from './AlephConsole.vue';
import FloatingNarrator from './FloatingNarrator.vue';
import StatusBanner from './StatusBanner.vue';
import CardBody from './CardBody.vue';
import PointBody from './PointBody.vue';
import TriplesBody from './TriplesBody.vue';
import { subscribePodChanges } from '../lib/rdf';

const props = withDefaults(defineProps<{
  initialMode?: Mode;
  theme?: ThemeName;
  typeface?: Typeface;
  density?: 'cozy' | 'compact';
  layout?: 'left-rail' | 'right-rail' | 'overlay';
}>(), {
  initialMode: 'point',
  theme: 'default',
  typeface: 'literary',
  density: 'cozy',
  layout: 'right-rail',
});

onBeforeMount(() => installRouter({ mode: props.initialMode }));

const hasFocus = computed(() => !!route.focusCurie);

const mode = computed<Mode>({
  get: () => route.mode,
  set: (m) => { navigate({ mode: m }); },
});
const isPoint = computed(() => mode.value === 'point');

const palette = computed(() => getPalette(props.theme));
const skin = computed(() => isPoint.value ? palette.value.dark : palette.value.light);
const fontProse = computed(() => proseFont(props.typeface));

const dense = computed(() => props.density === 'compact');
const chatLeft = computed(() => props.layout === 'left-rail');
const overlay = computed(() => props.layout === 'overlay');

const CHROME_H = 44;
const FOOTER_H = 28;

// ── live viewport tracking ──
const root = ref<HTMLElement | null>(null);
const vw = ref(window.innerWidth);
const vh = ref(window.innerHeight);

let ro: ResizeObserver | null = null;
onMounted(() => {
  if (root.value) {
    ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      vw.value = r.width;
      vh.value = r.height;
    });
    ro.observe(root.value);
  }
});
onBeforeUnmount(() => ro?.disconnect());

let unsubscribe: (() => void) | null = null;
onMounted(() => {
  unsubscribe = subscribePodChanges(() => {
    // store re-loaded by subscribe handler; reactive queries pick it up
  });
});
onBeforeUnmount(() => { unsubscribe?.(); });

const railW = computed(() => isPoint.value ? 56 : 240);
const consoleW = computed(() =>
  isPoint.value || overlay.value ? 0 : Math.min(380, Math.max(280, vw.value * 0.26))
);
const centerW = computed(() =>
  Math.max(320, vw.value - railW.value - consoleW.value)
);
const centerH = computed(() =>
  Math.max(360, vh.value - CHROME_H - FOOTER_H)
);

const narratorSide = computed(() =>
  isPoint.value ? (chatLeft.value ? 'left' : 'right') : undefined
);
</script>

<template>
  <div
    ref="root"
    :style="{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: skin.bg,
      color: skin.fg,
      fontFamily: FONT_UI,
      transition: 'background 220ms ease, color 220ms ease',
    }"
  >
    <AlephChrome
      :mode="mode"
      :has-focus="hasFocus"
      :palette="skin"
      :font-ui="FONT_UI"
      :font-mono="FONT_MONO"
      @update:mode="(m) => mode = m"
    />

    <StatusBanner :palette="skin" :font-mono="FONT_MONO" />

    <div
      :style="{
        position: 'absolute',
        top: CHROME_H + 'px',
        bottom: FOOTER_H + 'px',
        left: 0,
        right: 0,
        display: 'flex',
      }"
    >
      <AlephLibrary
        v-if="!chatLeft"
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO"
        :width="railW" :dense="dense" :mode="mode"
      />

      <CardBody
        v-if="mode === 'card'"
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO" :font-prose="fontProse"
        :width="centerW" :height="centerH" :dense="dense"
        :focus-curie="route.focusCurie"
        :selected-pred="route.predCurie"
      />
      <PointBody
        v-else-if="mode === 'point'"
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO" :font-prose="fontProse"
        :width="centerW" :height="centerH" :dense="dense" :narrator-side="narratorSide"
      />
      <TriplesBody
        v-else
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO" :font-prose="fontProse"
        :width="centerW" :height="centerH" :dense="dense"
      />

      <AlephLibrary
        v-if="chatLeft"
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO"
        :width="railW" :dense="dense" :mode="mode"
      />

      <AlephConsole
        v-if="!overlay && !isPoint"
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO"
        :width="consoleW" :dense="dense" :mode="mode"
      />
    </div>

    <AlephStatusBar :palette="skin" :font-mono="FONT_MONO" :mode="mode" />

    <FloatingNarrator
      v-if="isPoint"
      :palette="skin" :dense="dense"
      :side="chatLeft ? 'left' : 'right'"
    />
  </div>
</template>
