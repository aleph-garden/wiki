<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import { FONT_UI as SANS } from '../palette';
import { ALEPH_TRIPLES, type AlephTriple } from '../data';
import ConceptHeader from './ConceptHeader.vue';
import Schematic from './Schematic.vue';

const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  fontProse: string;
  width: number;
  height: number;
  dense: boolean;
}>();

const pad = computed(() => props.dense ? '18px 24px' : '22px 32px');

interface Group { label: string; items: AlephTriple[] }
const groups = computed<Group[]>(() => {
  const filters: Array<{ label: string; fn: (t: AlephTriple) => boolean }> = [
    { label: 'identity',     fn: (t) => t.kind === 'type' || t.p === 'skos:prefLabel' || t.p === 'skos:altLabel' || t.p === 'skos:definition' },
    { label: 'relations',    fn: (t) => t.kind === 'iri' && !t.p.startsWith('prov:') },
    { label: 'provenance',   fn: (t) => t.p.startsWith('prov:') },
    { label: 'measurements', fn: (t) => t.p === 'aleph:perceivedImportance' },
  ];
  return filters
    .map((g) => ({ label: g.label, items: ALEPH_TRIPLES.filter(g.fn) }))
    .filter((g) => g.items.length > 0);
});

interface Backlink { from: string; predicate: string; kind: 'concept' | 'person' | 'event'; via?: string }
const backlinks: Backlink[] = [
  { from: 'Cold War',           predicate: 'aleph:exemplifies', kind: 'event' },
  { from: 'Auction Theory',     predicate: 'skos:broader',      kind: 'concept', via: 'Mechanism Design' },
  { from: 'ESS',                predicate: 'skos:broader',      kind: 'concept', via: 'Evolutionary GT' },
  { from: 'Cooperation',        predicate: 'skos:related',      kind: 'concept', via: "Prisoner's Dilemma" },
  { from: 'Nash Equilibrium',   predicate: 'skos:broader',      kind: 'concept' },
  { from: "Prisoner's Dilemma", predicate: 'skos:broader',      kind: 'concept' },
];

function backColor(k: Backlink['kind']) {
  if (k === 'person') return props.palette.kindPerson;
  if (k === 'event')  return props.palette.kindEvent;
  return props.palette.kindConcept;
}

function tripleColor(kind: AlephTriple['kind']) {
  if (kind === 'iri')  return props.palette.sepia;
  if (kind === 'type') return props.palette.kindConcept;
  return props.palette.fg;
}

interface Shape { name: string; status: 'pass' | 'warn'; detail: string }
const shapes: Shape[] = [
  { name: 'ConceptShape',          status: 'pass', detail: 'all required properties present' },
  { name: 'ImportantConceptShape', status: 'pass', detail: 'perceivedImportance ≥ 0.7' },
  { name: 'ProvenanceChainShape',  status: 'pass', detail: 'chain verified to Session_042' },
  { name: 'DerivedFromShape',      status: 'warn', detail: '1 derivedFrom target missing foaf:Person type' },
];
</script>

<template>
  <section
    :style="{
      width: width + 'px',
      padding: pad,
      position: 'relative',
      background: palette.bg,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }"
  >
    <ConceptHeader :palette="palette" :font-mono="fontMono" :font-prose="fontProse" />

    <div style="display: flex; gap: 14px; flex: 1; min-height: 0">
      <!-- left column: graph + triples -->
      <div style="flex: 1; display: flex; flex-direction: column; gap: 14px">
        <!-- graph card -->
        <div
          :style="{
            background: palette.panel,
            border: `1px solid ${palette.rule}`,
            borderRadius: '4px',
            padding: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '300px',
            flexShrink: 0,
          }"
        >
          <div
            :style="{
              padding: '10px 14px',
              borderBottom: `1px solid ${palette.rule}`,
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
            <div style="display: flex; align-items: center; gap: 14px">
              <span>local neighbourhood — depth ≤ 2</span>
              <span
                :style="{
                  color: palette.fg,
                  background: palette.soft,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textTransform: 'none',
                  letterSpacing: 0,
                }"
              >15 nodes · 14 edges</span>
            </div>
            <div style="display: flex; gap: 10px; text-transform: none; letter-spacing: 0">
              <span style="display: flex; align-items: center; gap: 4px">
                <span :style="{ width: '8px', height: '8px', borderRadius: '4px', background: palette.kindConcept }" />Concept
              </span>
              <span style="display: flex; align-items: center; gap: 4px">
                <span :style="{ width: '8px', height: '8px', borderRadius: '4px', background: palette.kindPerson }" />Person
              </span>
              <span style="display: flex; align-items: center; gap: 4px">
                <span :style="{ width: '8px', height: '8px', borderRadius: '4px', background: palette.kindEvent }" />Event
              </span>
            </div>
          </div>
          <Schematic :palette="palette" :font-ui="fontUI" :font-mono="fontMono" hilite="gt" />
        </div>

        <!-- triples card -->
        <div
          :style="{
            background: palette.panel,
            border: `1px solid ${palette.rule}`,
            borderRadius: '4px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }"
        >
          <div
            :style="{
              padding: '10px 14px',
              borderBottom: `1px solid ${palette.rule}`,
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
            <span>Triples — :GameTheory ?p ?o</span>
            <span style="display: flex; gap: 8px">
              <span
                :style="{
                  color: palette.fg,
                  background: palette.soft,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textTransform: 'none',
                  letterSpacing: 0,
                }"
              >11 triples</span>
              <span
                :style="{
                  color: palette.sepia,
                  background: `${palette.sepia}1a`,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  textTransform: 'none',
                  letterSpacing: 0,
                  cursor: 'pointer',
                }"
              >view turtle</span>
            </span>
          </div>
          <div
            :style="{
              padding: '4px 14px 10px',
              fontFamily: fontMono,
              fontSize: '12px',
              lineHeight: 1.6,
              color: palette.fg,
              overflow: 'hidden',
            }"
          >
            <div
              v-for="(g, gi) in groups"
              :key="g.label"
              :style="{
                padding: '7px 0',
                borderBottom: gi === groups.length - 1 ? 'none' : `1px dotted ${palette.rule}`,
              }"
            >
              <div
                :style="{
                  fontSize: '9.5px',
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  color: palette.mute,
                  marginBottom: '4px',
                  fontWeight: 600,
                }"
              >{{ g.label }}</div>
              <div
                v-for="(tr, i) in g.items"
                :key="i"
                style="display: grid; grid-template-columns: 170px 1fr; gap: 14px; padding: 1px 0"
              >
                <span :style="{ color: palette.accent, fontWeight: 500 }">{{ tr.p }}</span>
                <span :style="{ color: tripleColor(tr.kind) }">{{ tr.o }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- right column: backlinks + shacl -->
      <div style="width: 240px; display: flex; flex-direction: column; gap: 14px">
        <div
          :style="{
            background: palette.panel,
            border: `1px solid ${palette.rule}`,
            borderRadius: '4px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }"
        >
          <div
            :style="{
              padding: '10px 12px',
              borderBottom: `1px solid ${palette.rule}`,
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
            <span>Backlinks</span>
            <span
              :style="{
                color: palette.fg,
                background: palette.soft,
                padding: '2px 6px',
                borderRadius: '3px',
                textTransform: 'none',
                letterSpacing: 0,
              }"
            >14</span>
          </div>
          <div style="padding: 6px 0; display: flex; flex-direction: column">
            <div
              v-for="(b, i) in backlinks"
              :key="i"
              style="padding: 6px 12px; display: flex; flex-direction: column; gap: 2px; cursor: pointer; border-left: 2px solid transparent"
            >
              <div
                :style="{
                  fontFamily: fontProse,
                  fontSize: '13px',
                  color: palette.fg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }"
              >
                <span :style="{ width: '6px', height: '6px', borderRadius: '3px', background: backColor(b.kind) }" />
                <span>{{ b.from }}</span>
              </div>
              <div
                :style="{
                  fontFamily: fontMono,
                  fontSize: '9.5px',
                  color: palette.mute,
                  paddingLeft: '12px',
                  letterSpacing: '0.4px',
                }"
              >
                {{ b.predicate }}{{ b.via ? ` · via ${b.via}` : '' }}
              </div>
            </div>
          </div>
        </div>

        <!-- SHACL -->
        <div
          :style="{
            background: palette.panel,
            border: `1px solid ${palette.rule}`,
            borderRadius: '4px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }"
        >
          <div
            :style="{
              padding: '10px 12px',
              borderBottom: `1px solid ${palette.rule}`,
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
            <span>SHACL</span>
            <span
              :style="{
                color: palette.ok,
                background: `${palette.ok}1a`,
                padding: '2px 6px',
                borderRadius: '3px',
                textTransform: 'none',
                letterSpacing: 0,
              }"
            >3 / 4 pass</span>
          </div>
          <div style="padding: 8px; display: flex; flex-direction: column; gap: 6px">
            <div
              v-for="(s, i) in shapes"
              :key="i"
              :style="{
                padding: '7px 9px',
                borderRadius: '3px',
                background: palette.bg,
                border: `1px solid ${palette.rule}`,
                borderLeft: `2.5px solid ${s.status === 'pass' ? palette.ok : palette.warn}`,
                fontFamily: fontMono,
                fontSize: '11px',
              }"
            >
              <div
                :style="{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: palette.fg,
                  fontWeight: 500,
                }"
              >
                <span>{{ s.name }}</span>
                <span
                  :style="{
                    fontSize: '9px',
                    letterSpacing: '1.2px',
                    color: s.status === 'pass' ? palette.ok : palette.warn,
                  }"
                >{{ s.status === 'pass' ? '✓ PASS' : '⚠ WARN' }}</span>
              </div>
              <div
                :style="{
                  fontSize: '10.5px',
                  color: palette.mute,
                  marginTop: '2px',
                  fontFamily: SANS,
                  lineHeight: 1.4,
                }"
              >{{ s.detail }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
