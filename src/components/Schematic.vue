<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import { loadDemoGraph, type NodeKind } from '../lib/ttl';

const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  hilite: string;
}>();

const graph = loadDemoGraph();

const W = 800, H = 248;
const cx = W / 2, cy = H / 2;
const scale = 0.43;

function project(x: number, y: number): [number, number] {
  return [cx + x * scale, cy + y * scale];
}

function kindColor(k: NodeKind) {
  if (k === 'person') return props.palette.kindPerson;
  if (k === 'event')  return props.palette.kindEvent;
  return props.palette.kindConcept;
}

const edges = computed(() =>
  graph.edges.map((e) => {
    const a = graph.nodes.find((n) => n.id === e.s);
    const b = graph.nodes.find((n) => n.id === e.o);
    if (!a || !b) return null;
    const [x1, y1] = project(a.x, a.y);
    const [x2, y2] = project(b.x, b.y);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const highlit = e.s === props.hilite || e.o === props.hilite;
    return { e, x1, y1, x2, y2, mx, my, highlit };
  }).filter(Boolean) as Array<{
    e: typeof graph.edges[number]; x1: number; y1: number; x2: number; y2: number;
    mx: number; my: number; highlit: boolean;
  }>
);

const nodes = computed(() =>
  graph.nodes.map((n) => {
    const [x, y] = project(n.x, n.y);
    const r = 4 + n.importance * 7;
    const isCenter = n.id === props.hilite;
    return { n, x, y, r, isCenter, color: kindColor(n.kind) };
  })
);

const layouts = ['force', 'radial', 'tree', 'timeline'];
</script>

<template>
  <div style="flex: 1; position: relative; overflow: hidden">
    <svg width="100%" height="100%" :viewBox="`0 0 ${W} ${H}`">
      <g v-for="(item, i) in edges" :key="'e' + i">
        <line
          :x1="item.x1" :y1="item.y1" :x2="item.x2" :y2="item.y2"
          :stroke="item.highlit ? palette.sepia : palette.mute"
          :stroke-width="item.highlit ? 1 : 0.7"
          :opacity="item.highlit ? 0.85 : 0.45"
        />
        <text
          :x="item.mx" :y="item.my - 4"
          :font-family="fontMono"
          font-size="8.5"
          :fill="palette.mute"
          text-anchor="middle"
          :opacity="item.highlit ? 0.95 : 0.7"
          :style="{ paintOrder: 'stroke', stroke: palette.panel, strokeWidth: '3px' }"
        >{{ item.e.predicate }}</text>
      </g>

      <g v-for="item in nodes" :key="item.n.id">
        <circle
          v-if="item.isCenter"
          :cx="item.x" :cy="item.y" :r="item.r + 6"
          fill="none" :stroke="item.color" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.5"
        />
        <circle
          :cx="item.x" :cy="item.y" :r="item.r"
          :fill="item.isCenter ? item.color : palette.panel"
          :stroke="item.color" stroke-width="1.5"
        />
        <text
          :x="item.x" :y="item.y + item.r + 11"
          :font-family="fontUI"
          :font-size="item.isCenter ? 11 : 10"
          :font-weight="item.isCenter ? 600 : 500"
          :fill="palette.fg"
          text-anchor="middle"
          :style="{ paintOrder: 'stroke', stroke: palette.panel, strokeWidth: '3px' }"
        >{{ item.n.label }}</text>
      </g>
    </svg>

    <div
      :style="{
        position: 'absolute',
        bottom: '10px',
        right: '12px',
        display: 'flex',
        gap: '4px',
        fontFamily: fontMono,
        fontSize: '10px',
      }"
    >
      <span
        v-for="(m, i) in layouts"
        :key="m"
        :style="{
          padding: '3px 7px',
          borderRadius: '2px',
          background: i === 0 ? palette.fg : palette.soft,
          color: i === 0 ? palette.bg : palette.mute,
          cursor: 'pointer',
        }"
      >{{ m }}</span>
    </div>
  </div>
</template>
