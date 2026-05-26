<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import type { FocusNode, FocusTriple } from '../lib/queries';

const props = defineProps<{
  palette: Palette;
  fontMono: string;
  fontProse: string;
  node: FocusNode | null;
  triples: FocusTriple[];
  backlinks: number;
}>();

function stripQuotes(s: string): string {
  // literals from triplesFor are sometimes JSON-quoted (e.g. "foo"@en)
  const m = s.match(/^"((?:[^"\\]|\\.)*)"(?:@([a-z-]+))?(?:\^\^.+)?$/i);
  if (!m) return s;
  try { return JSON.parse('"' + m[1] + '"'); } catch { return m[1]; }
}

const types = computed(() =>
  props.triples.filter((t) => t.predicate === 'a').map((t) => t.object),
);

const definition = computed(() => {
  const t = props.triples.find((x) => x.predicate === 'skos:definition');
  return t ? stripQuotes(t.object) : '';
});

const altLabel = computed(() => {
  const t = props.triples.find((x) => x.predicate === 'skos:altLabel');
  return t ? stripQuotes(t.object) : '';
});

const importance = computed(() => props.node?.importance ?? 0);
const importancePct = computed(() => Math.round(importance.value * 100));

function typeColor(t: string) {
  if (t.startsWith('aleph:Important')) return props.palette.sepia;
  if (t === 'aleph:Person' || t === 'foaf:Person') return props.palette.kindPerson;
  if (t === 'aleph:Event') return props.palette.kindEvent;
  return props.palette.kindConcept;
}

async function copyIri() {
  if (!props.node?.iri) return;
  try { await navigator.clipboard.writeText(props.node.iri); } catch { /* noop */ }
}
</script>

<template>
  <header v-if="node" style="display: flex; flex-direction: column; gap: 8px">
    <div
      :style="{
        fontFamily: fontMono,
        fontSize: '11px',
        color: palette.mute,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }"
    >
      <span>IRI</span>
      <span :style="{ color: palette.fg, wordBreak: 'break-all' }">{{ node.iri }}</span>
      <span
        @click="copyIri"
        :style="{
          padding: '1px 6px',
          borderRadius: '3px',
          fontSize: '10px',
          background: `${palette.sepia}1a`,
          color: palette.sepia,
          cursor: 'pointer',
        }"
      >copy</span>
    </div>

    <div style="display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap">
      <h1
        :style="{
          margin: 0,
          padding: 0,
          fontFamily: fontProse,
          fontSize: '40px',
          lineHeight: 1,
          fontWeight: 600,
          letterSpacing: '-0.8px',
          color: palette.fg,
        }"
      >{{ node.label }}</h1>
      <div style="flex: 1" />
      <div
        :style="{
          display: 'flex',
          gap: '6px',
          fontFamily: fontMono,
          fontSize: '11px',
          color: palette.fg,
          flexWrap: 'wrap',
        }"
      >
        <span
          v-for="t in types" :key="t"
          :style="{
            padding: '3px 8px',
            borderRadius: '3px',
            background: `${typeColor(t)}1a`,
            color: typeColor(t),
            fontWeight: 600,
          }"
        >{{ t }}</span>
      </div>
    </div>

    <div
      v-if="definition || altLabel"
      :style="{
        fontFamily: fontProse,
        fontSize: '15px',
        lineHeight: 1.55,
        color: palette.mute,
        maxWidth: '640px',
      }"
    >
      <span v-if="definition">{{ definition }}</span>
      <span v-if="altLabel" style="opacity: .55">{{ definition ? '  ·  ' : '' }}“{{ altLabel }}”</span>
    </div>

    <div
      :style="{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontFamily: fontMono,
        fontSize: '10px',
        color: palette.mute,
        flexWrap: 'wrap',
      }"
    >
      <span>perceivedImportance</span>
      <div
        :style="{
          height: '4px',
          width: '200px',
          background: palette.soft,
          borderRadius: '2px',
          overflow: 'hidden',
        }"
      >
        <div :style="{ width: importancePct + '%', height: '100%', background: palette.sepia }" />
      </div>
      <span :style="{ color: palette.fg }">{{ importance.toFixed(2) }}</span>
      <span style="opacity: .4">·</span>
      <span>{{ backlinks }} backlinks</span>
      <template v-if="node.generatedBy">
        <span style="opacity: .4">·</span>
        <span>{{ node.generatedBy.toLowerCase().replace(/_/g, ' ') }}</span>
      </template>
    </div>
  </header>
</template>
