<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import type { Mode } from './types';
import { loadDemoGraph } from '../lib/ttl';

const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  width: number;
  dense: boolean;
  mode: Mode;
}>();

const graph = loadDemoGraph();

const isPoint = computed(() => props.mode === 'point');

const trail = computed(() => {
  const focus = graph.nodes.find((n) => n.id === graph.focusId);
  const upper = graph.view.trail.length ? [...graph.view.trail].reverse() : [];
  return focus ? [...upper, focus.label] : upper;
});

interface PredRow { p: string; n: number; active?: boolean }
const predicates = computed<PredRow[]>(() => {
  const counts = new Map<string, number>();
  for (const e of graph.edges) counts.set(e.predicate, (counts.get(e.predicate) ?? 0) + 1);
  const focusEdge = graph.edges.find((e) => e.s === graph.focusId || e.o === graph.focusId);
  const activeP = focusEdge?.predicate;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => ({ p, n, active: p === activeP }));
});

interface TreeRow { icon: string; label: string; count?: string; active?: boolean; depth?: number }
const treeRows = computed<TreeRow[]>(() => {
  const concepts = graph.nodes.filter((n) => n.kind === 'concept');
  const people   = graph.nodes.filter((n) => n.kind === 'person');
  const events   = graph.nodes.filter((n) => n.kind === 'event');
  const important = concepts.filter((n) => n.importance >= 0.7);

  const rows: TreeRow[] = [
    { icon: '◇', label: 'aleph:Concept', count: String(concepts.length) },
    { icon: '◇', label: 'aleph:ImportantConcept', count: String(important.length), depth: 1 },
    ...important.map<TreeRow>((n) => ({
      icon: n.id === graph.focusId ? '●' : '◆',
      label: n.label,
      active: n.id === graph.focusId,
      depth: 2,
    })),
    { icon: '○', label: 'aleph:Person', count: String(people.length) },
    ...people.map<TreeRow>((n) => ({ icon: '◇', label: n.label, depth: 1 })),
    { icon: '✦', label: 'aleph:Event', count: String(events.length) },
    ...events.map<TreeRow>((n) => ({ icon: '◇', label: n.label, depth: 1 })),
  ];
  return rows;
});

const sessions = computed(() => graph.sessions.slice(0, 4));
</script>

<template>
  <!-- Compressed spine for point mode -->
  <aside
    v-if="isPoint"
    :style="{
      width: '56px',
      borderRight: `1px solid ${palette.rule}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 0',
      gap: '20px',
    }"
  >
    <div
      style="display: flex; flex-direction: column; align-items: center; gap: 24px; flex: 1"
    >
      <div
        v-for="(label, i) in trail"
        :key="i"
        style="display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative"
      >
        <span
          :style="{
            width: i === trail.length - 1 ? '7px' : '5px',
            height: i === trail.length - 1 ? '7px' : '5px',
            borderRadius: '4px',
            background: i === trail.length - 1 ? palette.sepia : palette.mute,
            boxShadow: i === trail.length - 1 ? `0 0 0 3px ${palette.sepia}33` : 'none',
          }"
        />
        <span
          :style="{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontFamily: fontMono,
            fontSize: '9.5px',
            letterSpacing: '1.2px',
            color: i === trail.length - 1 ? palette.fg : palette.mute,
            whiteSpace: 'nowrap',
          }"
        >{{ label }}</span>
        <span
          v-if="i < trail.length - 1"
          :style="{ width: '1px', flex: 1, background: palette.rule, minHeight: '8px' }"
        />
      </div>
    </div>

    <div
      :style="{
        fontFamily: fontMono,
        fontSize: '8px',
        color: palette.mute,
        letterSpacing: '1.4px',
        textAlign: 'center',
        lineHeight: 1.6,
      }"
    >
      413<br />C<br /><br />42<br />★
    </div>
  </aside>

  <!-- Full library for non-point modes -->
  <aside
    v-else
    :style="{
      width: width + 'px',
      borderRight: `1px solid ${palette.rule}`,
      background: palette.bg,
      padding: '14px 0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div
      :style="{
        padding: '0 14px 10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: fontMono,
        fontSize: '10px',
        letterSpacing: '1.4px',
        textTransform: 'uppercase',
        color: palette.mute,
        fontWeight: 600,
      }"
    >
      <span>Library</span>
    </div>

    <!-- Section: Predicates -->
    <div style="margin-bottom: 14px">
      <div
        :style="{
          padding: '8px 14px 4px',
          fontFamily: fontMono,
          fontSize: '9.5px',
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          color: palette.mute,
          borderTop: `1px solid ${palette.rule}`,
          marginTop: '4px',
        }"
      >Predicates in view</div>
      <div style="padding: 4px 0">
        <div
          v-for="(pr, i) in predicates"
          :key="i"
          :style="{
            margin: '2px 10px 2px 14px',
            padding: '3px 7px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: fontMono,
            fontSize: '10.5px',
            background: pr.active ? `${palette.accent}1a` : 'transparent',
            color: pr.active ? palette.accent : palette.fg,
            borderRadius: '3px',
            cursor: 'pointer',
            border: pr.active ? `0.5px solid ${palette.accent}33` : '0.5px solid transparent',
            fontWeight: pr.active ? 600 : 400,
          }"
        >
          <span>{{ pr.p }}</span>
          <span :style="{ color: palette.mute, fontVariantNumeric: 'tabular-nums' }">{{ pr.n }}</span>
        </div>
      </div>
    </div>

    <!-- Section: By type -->
    <div style="margin-bottom: 14px">
      <div
        :style="{
          padding: '8px 14px 4px',
          fontFamily: fontMono,
          fontSize: '9.5px',
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          color: palette.mute,
          borderTop: `1px solid ${palette.rule}`,
          marginTop: '4px',
        }"
      >By type</div>
      <div style="padding: 4px 0">
        <div
          v-for="(t, i) in treeRows"
          :key="i"
          :style="{
            padding: '3px 14px',
            paddingLeft: (14 + (t.depth ?? 0) * 18) + 'px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: t.active ? palette.soft : 'transparent',
            borderLeft: t.active ? `2px solid ${palette.sepia}` : '2px solid transparent',
            fontSize: '12.5px',
            color: palette.fg,
            fontWeight: t.active ? 600 : 400,
            cursor: 'pointer',
          }"
        >
          <span
            :style="{
              color: t.active ? palette.sepia : palette.mute,
              fontFamily: fontMono,
              fontSize: '10px',
            }"
          >{{ t.icon }}</span>
          <span
            style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
          >{{ t.label }}</span>
          <span
            v-if="t.count"
            :style="{ fontFamily: fontMono, fontSize: '10px', color: palette.mute }"
          >{{ t.count }}</span>
        </div>
      </div>
    </div>

    <!-- Section: Sessions -->
    <div style="margin-bottom: 14px">
      <div
        :style="{
          padding: '8px 14px 4px',
          fontFamily: fontMono,
          fontSize: '9.5px',
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          color: palette.mute,
          borderTop: `1px solid ${palette.rule}`,
          marginTop: '4px',
        }"
      >Sessions</div>
      <div style="padding: 4px 0">
        <div
          v-for="(s, i) in sessions"
          :key="s.id"
          :style="{
            padding: '5px 14px',
            fontFamily: fontMono,
            fontSize: '11px',
            color: palette.fg,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            borderLeft: i === 0 ? `2px solid ${palette.sepia}` : '2px solid transparent',
            background: i === 0 ? palette.soft : 'transparent',
          }"
        >
          <div
            :style="{
              display: 'flex',
              justifyContent: 'space-between',
              color: i === 0 ? palette.fg : palette.mute,
            }"
          >
            <span>{{ s.id }}</span>
            <span :style="{ color: palette.mute }">{{ s.conceptCount }}</span>
          </div>
          <div
            :style="{
              fontFamily: fontUI,
              fontSize: '11px',
              color: palette.mute,
              fontStyle: 'italic',
            }"
          >{{ s.focus }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>
