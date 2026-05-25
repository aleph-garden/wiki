<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  getPalette, proseFont, FONT_UI, FONT_MONO,
  type ThemeName, type Typeface,
} from '../palette';
import type { Mode } from './types';
import AlephChrome from './AlephChrome.vue';
import AlephStatusBar from './AlephStatusBar.vue';
import AlephLibrary from './AlephLibrary.vue';
import AlephConsole from './AlephConsole.vue';
import FloatingNarrator from './FloatingNarrator.vue';
import CardBody from './CardBody.vue';
import PointBody from './PointBody.vue';
import GraphBody from './GraphBody.vue';
import TriplesBody from './TriplesBody.vue';

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

const mode = ref<Mode>(props.initialMode);
const isPoint = computed(() => mode.value === 'point');

const palette = computed(() => getPalette(props.theme));
const skin = computed(() => isPoint.value ? palette.value.dark : palette.value.light);
const fontProse = computed(() => proseFont(props.typeface));

const dense = computed(() => props.density === 'compact');
const chatLeft = computed(() => props.layout === 'left-rail');
const overlay = computed(() => props.layout === 'overlay');

const W = 1440, H = 900;
const railW = computed(() => isPoint.value ? 56 : 240);
const consoleW = computed(() =>
  isPoint.value || overlay.value ? 0 : 380
);
const centerW = computed(() => W - railW.value - consoleW.value);

const narratorSide = computed(() =>
  isPoint.value ? (chatLeft.value ? 'left' : 'right') : undefined
);
</script>

<template>
  <div
    :style="{
      width: W + 'px',
      height: H + 'px',
      position: 'relative',
      overflow: 'hidden',
      background: skin.bg,
      color: skin.fg,
      fontFamily: FONT_UI,
      transition: 'background 220ms ease, color 220ms ease',
      boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
    }"
  >
    <AlephChrome
      :mode="mode"
      :palette="skin"
      :font-ui="FONT_UI"
      :font-mono="FONT_MONO"
      @update:mode="(m) => mode = m"
    />

    <div
      :style="{
        position: 'absolute',
        top: '44px',
        bottom: '28px',
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
        :width="centerW" :dense="dense"
      />
      <PointBody
        v-else-if="mode === 'point'"
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO" :font-prose="fontProse"
        :width="centerW" :dense="dense" :narrator-side="narratorSide"
      />
      <GraphBody
        v-else-if="mode === 'graph'"
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO" :font-prose="fontProse"
        :width="centerW" :dense="dense"
      />
      <TriplesBody
        v-else
        :palette="skin" :font-ui="FONT_UI" :font-mono="FONT_MONO" :font-prose="fontProse"
        :width="centerW" :dense="dense"
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
