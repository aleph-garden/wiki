<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import { FONT_MONO as MONO, FONT_SERIF as SERIF } from '../palette';
import type { DemoGraph } from '../lib/ttl';
import { buildLayout } from '../lib/orbitalLayout';

const props = defineProps<{
  graph: DemoGraph;
  palette: Palette;
  fontMono: string;
  width: number;
  height: number;
  focusId: string;
  narratorSide?: 'left' | 'right';
}>();

const layout = computed(() =>
  buildLayout(props.graph, {
    width: props.width,
    height: props.height,
    narratorSide: props.narratorSide,
    focusId: props.focusId,
  }),
);

const focusMeta = computed(() => {
  const f = layout.value.focusNode;
  if (!f) return '';
  const backlinks = props.graph.edges.filter((e) => e.s === f.id || e.o === f.id).length;
  return `ALEPH:${f.id.toUpperCase()}  ·  IMPORTANCE ${f.importance.toFixed(2)}  ·  ${backlinks} BACKLINKS`;
});

function nodeColor(kind: 'concept' | 'person' | 'event'): string {
  if (kind === 'person') return props.palette.cool;
  if (kind === 'event')  return props.palette.hot;
  return props.palette.leaf;
}
</script>

<template>
  <svg
    :width="width" :height="height"
    :style="{ position: 'absolute', inset: 0 }"
  >
    <!-- starfield -->
    <circle
      v-for="(s, i) in layout.stars" :key="'st' + i"
      :cx="s.x" :cy="s.y" :r="s.r"
      :fill="palette.fg" :opacity="s.op"
    />
    <defs>
      <radialGradient id="orbital-nebula" cx="50%" cy="50%" r="55%">
        <stop offset="0%" :stop-color="palette.halo" stop-opacity="0.14" />
        <stop offset="60%" :stop-color="palette.halo" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="orbital-core" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   :stop-color="palette.halo" stop-opacity="0.55" />
        <stop offset="40%"  :stop-color="palette.halo" stop-opacity="0.15" />
        <stop offset="100%" :stop-color="palette.halo" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect x="0" y="0" :width="width" :height="height" fill="url(#orbital-nebula)" />

    <!-- halo -->
    <circle :cx="layout.cx" :cy="layout.cy" :r="layout.core.haloR" fill="url(#orbital-core)" />

    <!-- orbits -->
    <circle
      v-for="(o, i) in layout.orbits" :key="'o' + i"
      :cx="layout.cx" :cy="layout.cy" :r="o.r"
      fill="none" :stroke="palette.orbit"
      :stroke-width="o.stroke" :stroke-dasharray="o.dash"
    />
    <text
      v-for="(rl, i) in layout.orbitLabels" :key="'ol' + i"
      :x="rl.tx" :y="rl.ty"
      :font-family="fontMono" font-size="9" letter-spacing="1.4"
      :fill="palette.mute" opacity="0.55"
      text-anchor="middle"
    >{{ rl.label }}</text>

    <!-- trail -->
    <g v-for="(t, i) in layout.trail" :key="'tm' + i" :opacity="t.opacity">
      <circle :cx="t.x" :cy="t.y" r="3" fill="none"
        :stroke="palette.aleph" stroke-width="0.8" stroke-dasharray="1 2" />
      <text :x="t.x + 8" :y="t.y + 4"
        :font-family="fontMono" font-size="9" letter-spacing="1"
        :fill="palette.mute"
      >{{ t.label }}</text>
    </g>
    <path v-if="layout.trailPath"
      :d="layout.trailPath"
      :stroke="palette.aleph" stroke-width="0.4" stroke-dasharray="2 5"
      fill="none" opacity="0.25"
    />

    <!-- spokes -->
    <line
      v-for="sp in layout.spokes" :key="'sp-' + sp.id"
      :x1="layout.cx" :y1="layout.cy" :x2="sp.x2" :y2="sp.y2"
      :stroke="palette.faint" stroke-width="0.6" stroke-dasharray="1 3"
    />

    <!-- central core -->
    <g>
      <circle :cx="layout.cx" :cy="layout.cy" :r="layout.core.ring1R" fill="none"
        :stroke="palette.aleph" stroke-width="0.6" opacity="0.15" />
      <circle :cx="layout.cx" :cy="layout.cy" :r="layout.core.ring2R" fill="none"
        :stroke="palette.aleph" stroke-width="0.5" opacity="0.22" />
      <text :x="layout.cx" :y="layout.cy + layout.core.glyphYOff"
        text-anchor="middle"
        :font-size="layout.core.glyphSize"
        font-family='"Fraunces", "Cormorant Garamond", serif'
        :fill="palette.aleph"
      >א</text>
      <circle :cx="layout.cx" :cy="layout.cy" :r="layout.core.hotR" :fill="palette.hot" />
      <circle :cx="layout.cx" :cy="layout.cy" :r="layout.core.hotR" :fill="palette.hot" opacity="0.6"
        :style="{ filter: 'blur(5px)' }" />
      <circle :cx="layout.cx" :cy="layout.cy" :r="layout.core.hotHaloR" fill="none"
        :stroke="palette.hot" stroke-width="0.5" opacity="0.4" />
      <text :x="layout.cx" :y="layout.cy + layout.core.nameYOff"
        text-anchor="middle"
        :font-size="layout.core.nameSize" font-weight="500"
        font-family='"Fraunces", "Cormorant Garamond", serif'
        font-style="italic" letter-spacing="0.5"
        :fill="palette.fg"
      >— {{ layout.focusNode?.label ?? '' }} —</text>
      <text :x="layout.cx" :y="layout.cy + layout.core.metaYOff"
        text-anchor="middle"
        font-size="9.5" letter-spacing="1.5"
        :font-family="fontMono" :fill="palette.mute"
      >{{ focusMeta }}</text>
    </g>

    <!-- reasoning path -->
    <g v-if="layout.reasoningD">
      <path :d="layout.reasoningD" :stroke="palette.hot" stroke-width="6" fill="none"
        opacity="0.18" :style="{ filter: 'blur(4px)' }" />
      <path :d="layout.reasoningD" :stroke="palette.hot" stroke-width="1.6" fill="none"
        stroke-dasharray="4 4" stroke-linecap="round" opacity="0.9">
        <animate attributeName="stroke-dashoffset" from="0" to="-16"
          dur="2.4s" repeatCount="indefinite" />
      </path>
      <g v-for="(e, i) in layout.reasoningLabels" :key="'rl' + i">
        <text :x="e.mx" :y="e.my - 9" :font-family="fontMono" font-size="9.5"
          letter-spacing="1" text-anchor="middle"
          :fill="palette.sepia"
          :style="{ paintOrder: 'stroke', stroke: palette.bg, strokeWidth: '3px' }"
        >{{ e.label }}</text>
        <text v-if="e.cite" :x="e.mx" :y="e.my + 4" :font-family="fontMono" font-size="7.5"
          letter-spacing="1.2" text-anchor="middle"
          :fill="palette.mute" opacity="0.8"
          :style="{ paintOrder: 'stroke', stroke: palette.bg, strokeWidth: '3px' }"
        >{{ e.cite.toUpperCase() }}</text>
      </g>
    </g>

    <!-- orbital nodes -->
    <g v-for="rn in layout.nodes" :key="rn.node.id"
       :opacity="rn.dim ? 0.5 : 1"
       :style="{ transition: 'opacity 220ms ease' }">
      <circle v-if="rn.onPath"
        :cx="rn.x" :cy="rn.y" :r="rn.r + 8" fill="none"
        :stroke="palette.hot" stroke-width="1" opacity="0.6"
        :style="{ filter: `drop-shadow(0 0 6px ${palette.hot})` }" />
      <circle v-if="rn.inSession && !rn.onPath"
        :cx="rn.x" :cy="rn.y" :r="rn.r + 5" fill="none"
        :stroke="palette.sepia" stroke-width="0.7" opacity="0.35" />
      <circle v-if="rn.node.importance > 0.6 && !rn.onPath"
        :cx="rn.x" :cy="rn.y" :r="rn.r + 3" fill="none"
        :stroke="nodeColor(rn.kind)" stroke-width="0.6" opacity="0.4" />
      <circle :cx="rn.x" :cy="rn.y"
        :r="rn.onPath ? rn.r + 1 : rn.r"
        :fill="rn.onPath ? palette.hot : nodeColor(rn.kind)" />
      <line :x1="rn.lineX1" :y1="rn.y" :x2="rn.lineX2" :y2="rn.ty"
        :stroke="palette.faint" stroke-width="0.6" />
      <text :x="rn.tx" :y="rn.ty"
        font-family='"Fraunces", serif'
        :font-size="rn.onPath ? 15 : (rn.node.importance > 0.6 ? 14 : 12)"
        :font-weight="rn.onPath ? 600 : (rn.node.importance > 0.7 ? 500 : 400)"
        :font-style="rn.kind === 'person' ? 'italic' : 'normal'"
        :fill="rn.onPath ? palette.hot : palette.fg"
        :text-anchor="rn.anchor"
        dominant-baseline="middle"
      >{{ rn.node.label }}</text>
      <text v-if="rn.predicate" :x="rn.tx" :y="rn.ty + 12"
        font-family='"JetBrains Mono", monospace'
        font-size="8.5" letter-spacing="1.2"
        :fill="rn.onPath ? palette.sepia : palette.mute"
        :text-anchor="rn.anchor"
      >{{ rn.predicate.toUpperCase() }}</text>
    </g>

    <!-- inline narration -->
    <foreignObject
      v-for="(note, i) in layout.pathNoteAnchors" :key="'pn' + i"
      :x="note.ox - 110" :y="note.oy - 28"
      width="220" height="80"
    >
      <div
        :style="{
          padding: '6px 9px',
          background: `${palette.bg}c8`,
          backdropFilter: 'blur(6px)',
          border: `1px solid ${palette.sepia}44`,
          borderLeft: `2px solid ${palette.sepia}`,
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: '11.5px',
          color: palette.fg,
          lineHeight: 1.4,
          whiteSpace: 'pre-line',
        }"
      >
        <div
          :style="{
            fontSize: '8px',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            fontFamily: MONO,
            fontStyle: 'normal',
            color: palette.sepia,
            marginBottom: '2px',
            opacity: 0.9,
          }"
        >step {{ note.step }}</div>
        {{ note.text }}
      </div>
    </foreignObject>
  </svg>
</template>
