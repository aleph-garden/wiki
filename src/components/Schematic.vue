<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as d3 from 'd3';
import type { Palette } from '../palette';
import { useAllNodes, useAllEdges, type NodeKind } from '../lib/queries';

const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  hilite: string;
  isFullscreen?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-fullscreen'): void;
  (e: 'select-node', id: string): void;
}>();

const allNodes = useAllNodes();
const allEdges = useAllEdges();

const W = 800, H = 248;
const cx = W / 2, cy = H / 2;

function kindColor(k: NodeKind) {
  if (k === 'person') return props.palette.kindPerson;
  if (k === 'event')  return props.palette.kindEvent;
  return props.palette.kindConcept;
}

// ── deterministic seed from node id ──
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  kind: NodeKind;
  importance: number;
  r: number;
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  predicate: string;
}

function seedPosition(id: string): { x: number; y: number } {
  const rng = mulberry32(hashStr(id));
  const theta = rng() * Math.PI * 2;
  const radius = 40 + rng() * 90;
  return { x: cx + Math.cos(theta) * radius, y: cy + Math.sin(theta) * radius };
}

const simNodes: SimNode[] = allNodes.value.map((n) => {
  const p = seedPosition(n.id);
  return {
    id: n.id,
    label: n.label,
    kind: n.kind,
    importance: n.importance,
    r: 4 + n.importance * 7,
    x: p.x,
    y: p.y,
  };
});
const nodeById = new Map(simNodes.map((n) => [n.id, n]));

const simLinks: SimLink[] = allEdges.value
  .filter((e) => nodeById.has(e.s) && nodeById.has(e.o))
  .map((e) => ({
    source: nodeById.get(e.s) as SimNode,
    target: nodeById.get(e.o) as SimNode,
    predicate: e.predicate,
  }));

// ── controls ──
const charge = ref(-180);       // repulsion (more negative = stronger push apart)
const linkDistance = ref(130);
const linkStrength = ref(0.6);
const gravity = ref(0.06);      // centering pull
const jiggle = ref(false);      // keep alpha hot for continuous motion

// ── simulation ──
const tick = ref(0);
const sim = d3.forceSimulation<SimNode>(simNodes)
  .force('link',
    d3.forceLink<SimNode, SimLink>(simLinks)
      .id((d) => d.id)
      .distance(linkDistance.value)
      .strength(linkStrength.value),
  )
  .force('charge', d3.forceManyBody<SimNode>().strength(charge.value))
  .force('x', d3.forceX<SimNode>(cx).strength(gravity.value))
  .force('y', d3.forceY<SimNode>(cy).strength(gravity.value))
  .force('collide', d3.forceCollide<SimNode>().radius((d) => d.r + 4))
  .alpha(1)
  .on('tick', () => { tick.value++; });

function reheat(target = 0.4) {
  sim.alpha(target).restart();
}

watch(charge, (v) => {
  (sim.force('charge') as d3.ForceManyBody<SimNode>).strength(v);
  reheat();
});
watch(linkDistance, (v) => {
  (sim.force('link') as d3.ForceLink<SimNode, SimLink>).distance(v);
  reheat();
});
watch(linkStrength, (v) => {
  (sim.force('link') as d3.ForceLink<SimNode, SimLink>).strength(v);
  reheat();
});
watch(gravity, (v) => {
  (sim.force('x') as d3.ForceX<SimNode>).strength(v);
  (sim.force('y') as d3.ForceY<SimNode>).strength(v);
  reheat();
});
watch(jiggle, (on) => {
  if (on) { sim.alphaTarget(0.05).restart(); }
  else    { sim.alphaTarget(0); }
});

function freeze() {
  sim.alphaTarget(0).stop();
  jiggle.value = false;
}
function reseed() {
  simNodes.forEach((n) => {
    const p = seedPosition(n.id);
    n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0;
    n.fx = null; n.fy = null;
  });
  reheat(1);
}

onBeforeUnmount(() => sim.stop());

// ── zoom / pan ──
const svgEl = ref<SVGSVGElement | null>(null);
const INITIAL_K = 1.1;
const initialTransform = d3.zoomIdentity
  .translate((1 - INITIAL_K) * cx, (1 - INITIAL_K) * cy)
  .scale(INITIAL_K);
const transform = shallowRef(initialTransform);

const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.4, 8])
  .filter((ev) => {
    // let drag handlers own pointer events on nodes
    const t = ev.target as Element | null;
    if (t && t.closest('g.node')) return ev.type === 'wheel';
    return !ev.ctrlKey && (!ev.button || ev.button === 0);
  })
  .on('zoom', (ev) => { transform.value = ev.transform; });

function resetZoom() {
  if (!svgEl.value) return;
  d3.select(svgEl.value)
    .transition().duration(220)
    .call(zoomBehavior.transform, initialTransform);
}

// ── drag (with click-vs-drag detection) ──
function attachDrag() {
  if (!svgEl.value) return;
  let moved = false;
  const drag = d3.drag<SVGGElement, SimNode>()
    .clickDistance(4)
    .subject(function () {
      const id = (this as SVGGElement).dataset.id;
      const n = id ? nodeById.get(id) : null;
      return n ?? null;
    })
    .on('start', (ev) => {
      const d = ev.subject as SimNode | null;
      if (!d) return;
      moved = false;
      if (!ev.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag', (ev) => {
      const d = ev.subject as SimNode | null;
      if (!d) return;
      moved = true;
      d.fx = ev.x; d.fy = ev.y;
    })
    .on('end', (ev) => {
      const d = ev.subject as SimNode | null;
      if (!d) return;
      if (!ev.active) sim.alphaTarget(jiggle.value ? 0.05 : 0);
      d.fx = null; d.fy = null;
      if (!moved) emit('select-node', d.id);
    });
  d3.select(svgEl.value).selectAll<SVGGElement, SimNode>('g.node').call(drag);
}

onMounted(() => {
  if (svgEl.value) {
    const sel = d3.select(svgEl.value);
    sel.call(zoomBehavior).on('dblclick.zoom', null);
    sel.call(zoomBehavior.transform, initialTransform);
  }
  nextTick(attachDrag);
});

watch(() => props.isFullscreen, () => resetZoom());

const tfStr = computed(() => transform.value.toString());

// reactive view: re-read node positions on every tick
const renderNodes = computed(() => {
  void tick.value;
  return simNodes.map((n) => ({
    id: n.id,
    x: n.x ?? cx,
    y: n.y ?? cy,
    r: n.r,
    label: n.label,
    kind: n.kind,
    isCenter: n.id === props.hilite,
    color: kindColor(n.kind),
  }));
});

const SYMMETRIC_PREDICATES = new Set(['skos:related']);
// hierarchical predicates render as tapered triangles instead of arrows.
// The taper points from "narrow" (specific) toward "broad" (general).
const TAPER_PREDICATES = new Set(['skos:broader', 'skos:narrower']);

type EdgeStyle = 'plain' | 'arrow' | 'taper';

interface RenderEdge {
  i: number;
  predicate: string;
  x1: number; y1: number;
  x2: number; y2: number;
  mx: number; my: number;
  highlit: boolean;
  style: EdgeStyle;
  // for tapered triangles
  poly?: string;
}

function taperPolygon(
  x1: number, y1: number, x2: number, y2: number,
  ux: number, uy: number,
  wSrc: number, wTgt: number,
): string {
  const px = -uy, py = ux;
  const a = `${x1 + px * wSrc},${y1 + py * wSrc}`;
  const b = `${x2 + px * wTgt},${y2 + py * wTgt}`;
  const c = `${x2 - px * wTgt},${y2 - py * wTgt}`;
  const d = `${x1 - px * wSrc},${y1 - py * wSrc}`;
  return `${a} ${b} ${c} ${d}`;
}

const renderEdges = computed<RenderEdge[]>(() => {
  void tick.value;
  return simLinks.map((l, i) => {
    const s = l.source as SimNode;
    const t = l.target as SimNode;
    const x1 = s.x ?? cx, y1 = s.y ?? cy;
    const x2 = t.x ?? cx, y2 = t.y ?? cy;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;

    const style: EdgeStyle = SYMMETRIC_PREDICATES.has(l.predicate)
      ? 'plain'
      : TAPER_PREDICATES.has(l.predicate)
        ? 'taper'
        : 'arrow';

    // For skos:narrower, semantically the "broad" end is the source, so flip
    // the taper direction. For skos:broader, broad end is the target.
    const broadAtTarget = l.predicate !== 'skos:narrower';

    // pull the endpoints back to the node edges so glyphs sit outside circles
    const shrinkSrc = s.r + (style === 'arrow' ? 0 : 1);
    const shrinkTgt = t.r + (style === 'arrow' ? 7 : 1);
    const sx = x1 + ux * shrinkSrc;
    const sy = y1 + uy * shrinkSrc;
    const tx = x2 - ux * shrinkTgt;
    const ty = y2 - uy * shrinkTgt;

    const highlit = s.id === props.hilite || t.id === props.hilite;

    let poly: string | undefined;
    if (style === 'taper') {
      const wNarrow = 0.5;
      const wBroad = highlit ? 4 : 3.2;
      const wSrc = broadAtTarget ? wNarrow : wBroad;
      const wTgt = broadAtTarget ? wBroad : wNarrow;
      poly = taperPolygon(sx, sy, tx, ty, ux, uy, wSrc, wTgt);
    }

    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
    return {
      i, predicate: l.predicate,
      x1: sx, y1: sy, x2: tx, y2: ty,
      mx, my, highlit, style, poly,
    };
  });
});

const showControls = ref(false);
function toggleControls() { showControls.value = !showControls.value; }

const layouts = ['force', 'radial', 'tree', 'timeline'];

const ctrlBtn = computed(() => ({
  padding: '3px 7px',
  borderRadius: '2px',
  background: props.palette.soft,
  color: props.palette.mute,
  border: 'none',
  cursor: 'pointer',
  fontFamily: props.fontMono,
  fontSize: '11px',
  lineHeight: '1',
}));
const actionBtn = computed(() => ({
  padding: '3px 8px',
  borderRadius: '2px',
  background: props.palette.soft,
  color: props.palette.fg,
  border: `1px solid ${props.palette.rule}`,
  cursor: 'pointer',
  fontFamily: props.fontMono,
  fontSize: '10px',
  letterSpacing: '0.5px',
}));
</script>

<template>
  <div style="flex: 1; position: relative; overflow: hidden; min-height: 0">
    <svg
      ref="svgEl"
      width="100%"
      height="100%"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="xMidYMid meet"
      :style="{ cursor: 'grab', display: 'block' }"
    >
      <defs>
        <marker
          id="schematic-arrow"
          viewBox="0 -5 10 10"
          refX="8" refY="0"
          markerWidth="6" markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,-4L8,0L0,4" fill="context-stroke" />
        </marker>
      </defs>
      <g :transform="tfStr">
        <g v-for="item in renderEdges" :key="'e' + item.i">
          <polygon
            v-if="item.style === 'taper'"
            :points="item.poly"
            :fill="item.highlit ? palette.sepia : palette.mute"
            :opacity="item.highlit ? 0.85 : 0.5"
          />
          <line
            v-else
            :x1="item.x1" :y1="item.y1" :x2="item.x2" :y2="item.y2"
            :stroke="item.highlit ? palette.sepia : palette.mute"
            :stroke-width="item.highlit ? 1 : 0.7"
            :opacity="item.highlit ? 0.85 : 0.45"
            :marker-end="item.style === 'arrow' ? 'url(#schematic-arrow)' : null"
          />
          <text
            :x="item.mx" :y="item.my - 4"
            :font-family="fontMono"
            font-size="8.5"
            :fill="palette.mute"
            text-anchor="middle"
            :opacity="item.highlit ? 0.95 : 0.7"
            :style="{ paintOrder: 'stroke', stroke: palette.panel, strokeWidth: '3px', pointerEvents: 'none' }"
          >{{ item.predicate }}</text>
        </g>

        <g
          v-for="item in renderNodes"
          :key="item.id"
          class="node"
          :data-id="item.id"
          :style="{ cursor: 'grab' }"
        >
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
            :style="{ paintOrder: 'stroke', stroke: palette.panel, strokeWidth: '3px', pointerEvents: 'none' }"
          >{{ item.label }}</text>
        </g>
      </g>
    </svg>

    <!-- top-right: zoom + fullscreen -->
    <div
      :style="{
        position: 'absolute',
        top: '10px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: fontMono,
        fontSize: '10px',
      }"
    >
      <span
        :style="{
          padding: '3px 7px',
          borderRadius: '2px',
          background: palette.soft,
          color: palette.mute,
          letterSpacing: '0.8px',
        }"
      >scroll · drag</span>
      <button
        type="button" @click="resetZoom"
        :style="ctrlBtn"
        title="reset zoom"
      >↺</button>
      <button
        type="button" @click="emit('toggle-fullscreen')"
        :style="ctrlBtn"
        :title="isFullscreen ? 'exit fullscreen' : 'fullscreen'"
      >{{ isFullscreen ? '⤡' : '⤢' }}</button>
    </div>

    <!-- bottom-left: physics controls -->
    <div
      :style="{
        position: 'absolute',
        bottom: '10px',
        left: '12px',
        fontFamily: fontMono,
        fontSize: '10px',
        color: palette.mute,
      }"
    >
      <button
        type="button" @click="toggleControls"
        :style="{
          padding: '3px 8px',
          borderRadius: '2px',
          background: showControls ? palette.fg : palette.soft,
          color: showControls ? palette.bg : palette.mute,
          border: 'none',
          cursor: 'pointer',
          fontFamily: fontMono,
          fontSize: '10px',
          letterSpacing: '0.8px',
        }"
      >physics</button>

      <div
        v-if="showControls"
        :style="{
          marginTop: '6px',
          padding: '10px 12px',
          background: `${palette.panel}f2`,
          backdropFilter: 'blur(8px)',
          border: `1px solid ${palette.rule}`,
          borderRadius: '4px',
          display: 'grid',
          gridTemplateColumns: 'auto 140px 36px',
          gap: '6px 10px',
          alignItems: 'center',
          minWidth: '240px',
        }"
      >
        <span>gravity</span>
        <input type="range" min="0" max="0.3" step="0.01" v-model.number="gravity" style="width: 100%" />
        <span :style="{ textAlign: 'right', color: palette.fg }">{{ gravity.toFixed(2) }}</span>

        <span>charge</span>
        <input type="range" min="-500" max="-20" step="10" v-model.number="charge" style="width: 100%" />
        <span :style="{ textAlign: 'right', color: palette.fg }">{{ charge }}</span>

        <span>link dist</span>
        <input type="range" min="20" max="200" step="5" v-model.number="linkDistance" style="width: 100%" />
        <span :style="{ textAlign: 'right', color: palette.fg }">{{ linkDistance }}</span>

        <span>link str</span>
        <input type="range" min="0" max="1.5" step="0.05" v-model.number="linkStrength" style="width: 100%" />
        <span :style="{ textAlign: 'right', color: palette.fg }">{{ linkStrength.toFixed(2) }}</span>

        <span>jiggle</span>
        <label :style="{ display: 'flex', alignItems: 'center', gap: '6px' }">
          <input type="checkbox" v-model="jiggle" />
          <span :style="{ color: palette.mute }">continuous motion</span>
        </label>
        <span />

        <div :style="{ gridColumn: '1 / -1', display: 'flex', gap: '6px', marginTop: '2px' }">
          <button type="button" @click="reheat(0.8)" :style="actionBtn">reheat</button>
          <button type="button" @click="freeze" :style="actionBtn">freeze</button>
          <button type="button" @click="reseed" :style="actionBtn">reseed</button>
        </div>
      </div>
    </div>

    <!-- bottom-right: layout chips (decorative for now) -->
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

