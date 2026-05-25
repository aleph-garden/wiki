<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Palette } from '../palette';
import { FONT_MONO as MONO, FONT_SERIF as SERIF } from '../palette';
import { ALEPH_NODES, ALEPH_EDGES, type AlephNode } from '../data';
import AlephGlyph from './AlephGlyph.vue';

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

const question = ref('How does game theory reach biology?');

const answerPath = ['gt', 'egt', 'evo'];
const answerEdges = [
  { from: 'gt',  to: 'egt', pretty: 'narrows to',             cite: 'session 035' },
  { from: 'egt', to: 'evo', pretty: 'shares assumptions with', cite: 'session 042' },
];
const pathNotes = [
  { atId: 'egt', text: 'EGT replaces "rational agent" with\n"replicating strategy."' },
  { atId: 'evo', text: 'ESS (Maynard Smith, 1973) is the\nbridge term. Citable.' },
];

const suggested = [
  { id: 'ess',  via: 'follows from path' },
  { id: 'coop', via: 'related to PD' },
  { id: 'nash', via: 'authored equilibrium' },
];

const session042 = new Set(['gt','ne','pd','egt','md','it','nash','jvn','rat']);

// ── responsive scaling ──
// Design baseline: width=1384, height=828, orbits 150/250/350, trail 440.
// Scale uniformly to available space, clamped so the layout stays readable.
const H = computed(() => props.height);
const scale = computed(() => {
  const s = Math.min(props.width / 1384, props.height / 828);
  return Math.max(0.55, Math.min(1.4, s));
});

// ── starfield (deterministic) ──
const stars = computed(() => {
  const out: { x: number; y: number; r: number; op: number }[] = [];
  let s = 7;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const count = Math.round(220 * Math.max(0.4, (props.width * H.value) / (1384 * 828)));
  for (let i = 0; i < count; i++) {
    out.push({
      x: rng() * props.width,
      y: rng() * H.value,
      r: rng() * 1.2 + 0.2,
      op: rng() * 0.6 + 0.1,
    });
  }
  return out;
});

// ── orbital layout ──
const cx = computed(() => props.width / 2);
// Bias slightly upward so the speak bar at the bottom has breathing room.
const cy = computed(() => H.value * 0.46);

const orbits = computed(() => [
  { r: 150 * scale.value, dash: '2 6', stroke: 0.7 },
  { r: 250 * scale.value, dash: '2 6', stroke: 0.7 },
  { r: 350 * scale.value, dash: '1 8', stroke: 0.5 },
]);

const orbitLabels = computed(() => [
  { r: orbits.value[0].r, label: '— specialisations —', angle: -Math.PI / 2 - 0.18 },
  { r: orbits.value[1].r, label: '— direct relations —', angle: -Math.PI / 2 - 0.15 },
  { r: orbits.value[2].r, label: '— two steps out —',   angle: -Math.PI / 2 - 0.12 },
]);

const trail = [
  { label: 'Strategy & Games', angle:  Math.PI * 0.65 },
  { label: 'Mathematics',      angle:  Math.PI * 0.78 },
  { label: 'Logic',            angle:  Math.PI * 0.92 },
];

interface Placed extends AlephNode { angle: number; radius: number }

const placed = computed<Placed[]>(() => {
  const inner = ALEPH_EDGES
    .filter((e) => e.p === 'skos:broader' && e.o === 'gt')
    .map((e) => e.s);
  const direct = new Set<string>();
  ALEPH_EDGES.forEach((e) => {
    if (e.s === 'gt') direct.add(e.o);
    if (e.o === 'gt') direct.add(e.s);
  });
  const middle = [...direct].filter((id) => !inner.includes(id));
  const outer = ALEPH_NODES
    .filter((n) => n.id !== 'gt' && !direct.has(n.id))
    .map((n) => n.id);

  const distribute = (ids: string[], radius: number, startAngle: number): Placed[] =>
    ids.map((id, i) => {
      const angle = startAngle + (i / Math.max(ids.length, 1)) * Math.PI * 2;
      const node = ALEPH_NODES.find((x) => x.id === id)!;
      return { ...node, angle, radius };
    });

  return [
    ...distribute(inner,  orbits.value[0].r, -Math.PI / 2),
    ...distribute(middle, orbits.value[1].r, -Math.PI / 2 + 0.6),
    ...distribute(outer,  orbits.value[2].r, -Math.PI / 2 - 0.4),
  ];
});

function place(id: string): [number, number] {
  if (id === 'gt') return [cx.value, cy.value];
  const p = placed.value.find((n) => n.id === id);
  return p
    ? [cx.value + Math.cos(p.angle) * p.radius, cy.value + Math.sin(p.angle) * p.radius]
    : [cx.value, cy.value];
}

const labelLeft = computed(() => {
  const narratorPad = 340;
  return props.narratorSide === 'left' ? narratorPad : 80;
});
const labelRight = computed(() => {
  const narratorPad = 340;
  return props.narratorSide === 'right' ? props.width - narratorPad : props.width - 80;
});

function spokePred(id: string) {
  const e = ALEPH_EDGES.find((x) => (x.s === 'gt' && x.o === id) || (x.o === 'gt' && x.s === id));
  return e ? e.pretty : '';
}

interface RenderedNode {
  node: Placed;
  x: number;
  y: number;
  r: number;
  color: string;
  predicate: string;
  inSession: boolean;
  onPath: boolean;
  dim: boolean;
  onRight: boolean;
  tx: number;
  ty: number;
  anchor: 'start' | 'end';
  lineX1: number;
  lineX2: number;
}

const renderedNodes = computed<RenderedNode[]>(() => {
  return placed.value.map((n) => {
    const x = cx.value + Math.cos(n.angle) * n.radius;
    const y = cy.value + Math.sin(n.angle) * n.radius;
    const r = 2.5 + n.importance * 5;
    const color = n.kind === 'person' ? props.palette.cool
                : n.kind === 'event'  ? props.palette.hot
                : props.palette.leaf;
    const onPath = answerPath.includes(n.id);
    const inSession = session042.has(n.id);
    const dim = !onPath;
    // label flip
    const offset = r + 10;
    const labelDirX = Math.cos(n.angle);
    const labelDirY = Math.sin(n.angle);
    const outwardX = x + labelDirX * offset;
    const halfW = Math.min(90, 4 + n.label.length * 5);
    let onRight = labelDirX > 0;
    if (onRight && outwardX + halfW > labelRight.value) onRight = false;
    if (!onRight && outwardX - halfW < labelLeft.value) onRight = true;
    const dirX = onRight
      ? (Math.abs(labelDirX) || 0.3)
      : -(Math.abs(labelDirX) || 0.3);
    const tx = x + dirX * offset;
    const ty = y + labelDirY * offset;
    return {
      node: n,
      x, y, r, color,
      predicate: spokePred(n.id),
      inSession,
      onPath,
      dim,
      onRight,
      tx, ty,
      anchor: (onRight ? 'start' : 'end') as 'start' | 'end',
      lineX1: x + (onRight ? r : -r),
      lineX2: tx - (onRight ? 4 : -4),
    };
  });
});

// ── reasoning path ──
const reasoningD = computed(() => {
  if (!answerPath || answerPath.length < 2) return '';
  const pts = answerPath.map(place);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const off = 14;
    const cxp = mx - (dy / len) * off;
    const cyp = my + (dx / len) * off;
    d += ` Q ${cxp} ${cyp} ${x2} ${y2}`;
  }
  return d;
});

const reasoningLabels = computed(() =>
  answerEdges.map((e) => {
    const [x1, y1] = place(e.from);
    const [x2, y2] = place(e.to);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return { ...e, mx, my };
  })
);

const pathNoteAnchors = computed(() =>
  pathNotes.map((note, i) => {
    const p = placed.value.find((n) => n.id === note.atId);
    if (!p) return null;
    const x = cx.value + Math.cos(p.angle) * p.radius;
    const y = cy.value + Math.sin(p.angle) * p.radius;
    const ox = x + Math.cos(p.angle) * 60;
    const oy = y + Math.sin(p.angle) * 60;
    return { ...note, ox, oy, step: i + 2 };
  }).filter(Boolean) as Array<{ atId: string; text: string; ox: number; oy: number; step: number }>
);

const trailR = computed(() => 440 * scale.value);
const core = computed(() => ({
  haloR:     240 * scale.value,
  ring1R:     78 * scale.value,
  ring2R:     60 * scale.value,
  hotR:      3.4 * scale.value,
  hotHaloR:   12 * scale.value,
  glyphSize: 180 * scale.value,
  glyphYOff:  56 * scale.value,
  nameSize:   22 * scale.value,
  nameYOff:   96 * scale.value,
  metaYOff:  116 * scale.value,
}));
const trailInnerR = computed(() => 350 * scale.value);

const trailMarkers = computed(() => {
  const R = trailR.value;
  return trail.map((t, i) => {
    const x = cx.value + Math.cos(t.angle) * R;
    const y = cy.value + Math.sin(t.angle) * R;
    const opacity = 0.2 + (i / trail.length) * 0.3;
    return { ...t, x, y, opacity };
  });
});

const trailPath = computed(() => {
  const R = trailR.value;
  const innerR = trailInnerR.value;
  return `M ${cx.value + Math.cos(trail[0].angle) * innerR} ${cy.value + Math.sin(trail[0].angle) * innerR}
          Q ${cx.value + Math.cos(trail[1].angle) * R} ${cy.value + Math.sin(trail[1].angle) * R}
          ${cx.value + Math.cos(trail[trail.length - 1].angle) * R} ${cy.value + Math.sin(trail[trail.length - 1].angle) * R}`;
});

const orbitLabelCoords = computed(() =>
  orbitLabels.value.map((rl) => ({
    ...rl,
    tx: cx.value + Math.cos(rl.angle) * rl.r,
    ty: cy.value + Math.sin(rl.angle) * rl.r,
  }))
);

const spokes = computed(() =>
  placed.value.map((n) => ({
    id: n.id,
    x2: cx.value + Math.cos(n.angle) * n.radius,
    y2: cy.value + Math.sin(n.angle) * n.radius,
  }))
);

function labelOf(id: string) {
  return ALEPH_NODES.find((n) => n.id === id)?.label ?? id;
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
    <!-- ── starfield ────────────────────────────────────── -->
    <svg :width="width" :height="H" :style="{ position: 'absolute', inset: 0 }">
      <circle
        v-for="(s, i) in stars" :key="i"
        :cx="s.x" :cy="s.y" :r="s.r"
        :fill="palette.fg" :opacity="s.op"
      />
      <defs>
        <radialGradient id="aleph-nebula" cx="50%" cy="50%" r="55%">
          <stop offset="0%" :stop-color="palette.halo" stop-opacity="0.14" />
          <stop offset="60%" :stop-color="palette.halo" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" :width="width" :height="H" fill="url(#aleph-nebula)" />
    </svg>

    <!-- ── orbital field ────────────────────────────────── -->
    <svg
      :width="width" :height="H" :viewBox="`0 0 ${width} ${H}`"
      :style="{ position: 'absolute', inset: 0 }"
    >
      <defs>
        <radialGradient id="aleph-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   :stop-color="palette.halo" stop-opacity="0.55" />
          <stop offset="40%"  :stop-color="palette.halo" stop-opacity="0.15" />
          <stop offset="100%" :stop-color="palette.halo" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- halo -->
      <circle :cx="cx" :cy="cy" :r="core.haloR" fill="url(#aleph-core)" />

      <!-- orbits -->
      <circle
        v-for="(o, i) in orbits" :key="'o' + i"
        :cx="cx" :cy="cy" :r="o.r"
        fill="none" :stroke="palette.orbit"
        :stroke-width="o.stroke" :stroke-dasharray="o.dash"
      />

      <!-- orbit labels -->
      <text
        v-for="(rl, i) in orbitLabelCoords" :key="'ol' + i"
        :x="rl.tx" :y="rl.ty"
        :font-family="fontMono" font-size="9" letter-spacing="1.4"
        :fill="palette.mute" opacity="0.55"
        text-anchor="middle"
      >{{ rl.label }}</text>

      <!-- trail markers -->
      <g v-for="(t, i) in trailMarkers" :key="'tm' + i" :opacity="t.opacity">
        <circle
          :cx="t.x" :cy="t.y" r="3" fill="none"
          :stroke="palette.aleph" stroke-width="0.8" stroke-dasharray="1 2"
        />
        <text
          :x="t.x + 8" :y="t.y + 4"
          :font-family="fontMono" font-size="9" letter-spacing="1"
          :fill="palette.mute"
        >{{ t.label }}</text>
      </g>
      <path
        :d="trailPath"
        :stroke="palette.aleph" stroke-width="0.4" stroke-dasharray="2 5"
        fill="none" opacity="0.25"
      />

      <!-- spokes -->
      <line
        v-for="sp in spokes" :key="'sp-' + sp.id"
        :x1="cx" :y1="cy" :x2="sp.x2" :y2="sp.y2"
        :stroke="palette.faint" stroke-width="0.6" stroke-dasharray="1 3"
      />

      <!-- central aleph core -->
      <g>
        <circle :cx="cx" :cy="cy" :r="core.ring1R" fill="none"
          :stroke="palette.aleph" stroke-width="0.6" opacity="0.15" />
        <circle :cx="cx" :cy="cy" :r="core.ring2R" fill="none"
          :stroke="palette.aleph" stroke-width="0.5" opacity="0.22" />
        <text :x="cx" :y="cy + core.glyphYOff"
          text-anchor="middle"
          :font-size="core.glyphSize"
          font-family='"Fraunces", "Cormorant Garamond", serif'
          :fill="palette.aleph"
        >א</text>
        <circle :cx="cx" :cy="cy" :r="core.hotR" :fill="palette.hot" />
        <circle :cx="cx" :cy="cy" :r="core.hotR" :fill="palette.hot" opacity="0.6"
          :style="{ filter: 'blur(5px)' }" />
        <circle :cx="cx" :cy="cy" :r="core.hotHaloR" fill="none"
          :stroke="palette.hot" stroke-width="0.5" opacity="0.4" />
        <text :x="cx" :y="cy + core.nameYOff"
          text-anchor="middle"
          :font-size="core.nameSize" font-weight="500"
          font-family='"Fraunces", "Cormorant Garamond", serif'
          font-style="italic" letter-spacing="0.5"
          :fill="palette.fg"
        >— Game Theory —</text>
        <text :x="cx" :y="cy + core.metaYOff"
          text-anchor="middle"
          font-size="9.5" letter-spacing="1.5"
          :font-family="fontMono" :fill="palette.mute"
        >ALEPH:GAMETHEORY  ·  IMPORTANCE 0.95  ·  14 BACKLINKS</text>
      </g>

      <!-- reasoning path -->
      <g v-if="reasoningD">
        <path :d="reasoningD" :stroke="palette.hot" stroke-width="6" fill="none"
          opacity="0.18" :style="{ filter: 'blur(4px)' }" />
        <path :d="reasoningD" :stroke="palette.hot" stroke-width="1.6" fill="none"
          stroke-dasharray="4 4" stroke-linecap="round" opacity="0.9">
          <animate attributeName="stroke-dashoffset" from="0" to="-16"
            dur="2.4s" repeatCount="indefinite" />
        </path>
        <g v-for="(e, i) in reasoningLabels" :key="'rl' + i">
          <text :x="e.mx" :y="e.my - 9" :font-family="fontMono" font-size="9.5"
            letter-spacing="1" text-anchor="middle"
            :fill="palette.sepia"
            :style="{ paintOrder: 'stroke', stroke: palette.bg, strokeWidth: '3px' }"
          >{{ e.pretty }}</text>
          <text v-if="e.cite" :x="e.mx" :y="e.my + 4" :font-family="fontMono" font-size="7.5"
            letter-spacing="1.2" text-anchor="middle"
            :fill="palette.mute" opacity="0.8"
            :style="{ paintOrder: 'stroke', stroke: palette.bg, strokeWidth: '3px' }"
          >{{ e.cite.toUpperCase() }}</text>
        </g>
      </g>

      <!-- orbital nodes -->
      <g v-for="rn in renderedNodes" :key="rn.node.id"
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
          :stroke="rn.color" stroke-width="0.6" opacity="0.4" />
        <circle :cx="rn.x" :cy="rn.y"
          :r="rn.onPath ? rn.r + 1 : rn.r"
          :fill="rn.onPath ? palette.hot : rn.color" />
        <line :x1="rn.lineX1" :y1="rn.y" :x2="rn.lineX2" :y2="rn.ty"
          :stroke="palette.faint" stroke-width="0.6" />
        <text :x="rn.tx" :y="rn.ty"
          font-family='"Fraunces", serif'
          :font-size="rn.onPath ? 15 : (rn.node.importance > 0.6 ? 14 : 12)"
          :font-weight="rn.onPath ? 600 : (rn.node.importance > 0.7 ? 500 : 400)"
          :font-style="rn.node.kind === 'person' ? 'italic' : 'normal'"
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
        v-for="(note, i) in pathNoteAnchors" :key="'pn' + i"
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

    <!-- ── question banner ─────────────────────────────── -->
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

    <!-- ── suggested next ──────────────────────────────── -->
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
        v-for="s in suggested" :key="s.id"
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
        {{ labelOf(s.id) }}
        <span
          :style="{
            fontFamily: fontMono,
            fontSize: '8.5px',
            letterSpacing: '1px',
            color: palette.mute,
            fontStyle: 'normal',
            textTransform: 'uppercase',
          }"
        >{{ s.via }}</span>
      </button>
    </div>

    <!-- ── speak bar ───────────────────────────────────── -->
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
      >3 stops · 2 hops</span>
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
