<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Palette } from '../palette';
import { FONT_SERIF as SERIF } from '../palette';
import { localName } from '../lib/rdf';
import {
  useAllNodes,
  useViewPath,
  useViewQuestion,
  useViewSuggestions,
  useDefaultFocusIri,
} from '../lib/queries';
import { current as route, navigate } from '../lib/router';
import AlephGlyph from './AlephGlyph.vue';
import OrbitalD3 from './OrbitalD3.vue';

const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  fontProse: string;
  width: number;
  height: number;
  dense: boolean;
  narratorSide?: 'left' | 'right';
}>();

const d3Ref = ref<InstanceType<typeof OrbitalD3> | null>(null);
function resetZoom() { d3Ref.value?.resetZoom?.(); }

const allNodes = useAllNodes();
const viewPath = useViewPath();
const viewQuestion = useViewQuestion();
const viewSuggestions = useViewSuggestions();
const defaultFocusIri = useDefaultFocusIri();

const focusId = computed(() =>
  route.focusCurie
    ?? viewPath.value[0]
    ?? (defaultFocusIri.value ? localName(defaultFocusIri.value) : 'GameTheory'),
);

// Initial value seeded from the query; user edits decouple from the store.
const question = ref(viewQuestion.value);

const stops = computed(() => viewPath.value.length);
const hops = computed(() => Math.max(0, viewPath.value.length - 1));

const labelById = (id: string) =>
  allNodes.value.find((n) => n.id === id)?.label ?? id;

function selectNode(id: string) {
  navigate({ focusCurie: id, predCurie: null });
}
</script>

<template>
  <section
    :style="{
      width: width + 'px',
      position: 'relative',
      overflow: 'hidden',
      background: palette.bg,
    }"
  >
    <OrbitalD3
      ref="d3Ref"
      :palette="palette"
      :font-mono="fontMono"
      :width="width"
      :height="height"
      :focus-id="focusId"
      :narrator-side="narratorSide"
      @select-node="selectNode"
    />

    <!-- zoom controls -->
    <div
      :style="{
        position: 'absolute',
        top: '14px',
        right: '18px',
        zIndex: 7,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: `${palette.bg}c8`,
        border: `1px solid ${palette.rule}`,
        borderRadius: '999px',
        backdropFilter: 'blur(8px)',
        fontFamily: fontMono,
        color: palette.mute,
      }"
    >
      <span
        :style="{
          fontSize: '9px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }"
      >scroll · drag</span>
      <button
        @click="resetZoom"
        :style="{
          padding: '2px 8px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          background: 'transparent',
          color: palette.mute,
          fontFamily: fontMono,
          fontSize: '11px',
        }"
        title="reset zoom"
      >↺</button>
    </div>

    <!-- question banner -->
    <div
      :style="{
        position: 'absolute',
        top: '18px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        zIndex: 4,
        pointerEvents: 'none',
      }"
    >
      <div
        :style="{
          fontFamily: fontMono,
          fontSize: '9.5px',
          letterSpacing: '1.6px',
          textTransform: 'uppercase',
          color: palette.mute,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }"
      >
        <span
          :style="{
            width: '6px', height: '6px', borderRadius: '3px',
            background: palette.hot,
            boxShadow: `0 0 8px ${palette.hot}`,
          }"
        />
        the agent is tracing an answer
      </div>
      <div
        :style="{
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: '22px',
          color: palette.fg,
          fontWeight: 400,
          letterSpacing: '-0.2px',
          textAlign: 'center',
        }"
      >“{{ question }}”</div>
    </div>

    <!-- suggested -->
    <div
      :style="{
        position: 'absolute',
        left: '50%',
        bottom: '96px',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 5,
      }"
    >
      <span
        :style="{
          fontFamily: fontMono,
          fontSize: '9.5px',
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          color: palette.mute,
          marginRight: '4px',
        }"
      >follow ↗</span>
      <button
        v-for="s in viewSuggestions" :key="s.target"
        @click="selectNode(s.target)"
        :style="{
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: '14px',
          color: palette.fg,
          background: `${palette.bg}c8`,
          backdropFilter: 'blur(8px)',
          border: `1px solid ${palette.rule}`,
          padding: '5px 12px',
          borderRadius: '999px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }"
      >
        {{ labelById(s.target) }}
        <span
          :style="{
            fontFamily: fontMono,
            fontSize: '8.5px',
            letterSpacing: '1px',
            color: palette.mute,
            fontStyle: 'normal',
            textTransform: 'uppercase',
          }"
        >{{ s.reason }}</span>
      </button>
    </div>

    <!-- speak bar -->
    <div
      :style="{
        position: 'absolute',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        width: '720px',
        padding: '12px 18px',
        background: `${palette.bg}c0`,
        backdropFilter: 'blur(14px) saturate(140%)',
        border: `1px solid ${palette.rule}`,
        borderRadius: '999px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 6,
        color: palette.fg,
      }"
    >
      <AlephGlyph :size="18" :color="palette.aleph" :accent="palette.halo" :stroke="1.6" />
      <input
        v-model="question"
        :style="{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: '15px',
          fontFamily: SERIF,
          fontStyle: 'italic',
          color: palette.fg,
          padding: 0,
        }"
      />
      <span
        :style="{
          fontFamily: fontMono,
          fontSize: '9px',
          letterSpacing: '1.2px',
          color: palette.mute,
          textTransform: 'uppercase',
        }"
      >{{ stops }} stops · {{ hops }} hops</span>
      <span
        :style="{
          fontFamily: fontMono,
          fontSize: '10px',
          padding: '2px 6px',
          border: `1px solid ${palette.rule}`,
          borderRadius: '4px',
          color: palette.mute,
        }"
      >↵</span>
    </div>
  </section>
</template>
