<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Palette } from '../palette';
import { FONT_UI as SANS } from '../palette';
import { localName } from '../lib/rdf';
import {
  useFocusNode,
  useFocusTriples,
  useBacklinks,
  useShaclResults,
  useCount,
  useDefaultFocusIri,
  type FocusTriple,
  type NodeKind,
} from '../lib/queries';
import { navigate } from '../lib/router';
import ConceptHeader from './ConceptHeader.vue';
import PageLayout from './PageLayout.vue';
import Schematic from './Schematic.vue';

const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  fontProse: string;
  width: number;
  height: number;
  dense: boolean;
  focusCurie?: string | null;
  selectedPred?: string | null;
}>();

const defaultFocusIri = useDefaultFocusIri();

const effectiveFocus = computed(() => {
  const c = props.focusCurie;
  if (c) return c.startsWith(':') ? c.slice(1) : c;
  return defaultFocusIri.value ? localName(defaultFocusIri.value) : '';
});

const focusNode = useFocusNode(effectiveFocus);
const focusTriples = useFocusTriples(effectiveFocus);
const backlinks = useBacklinks(effectiveFocus);
const shacl = useShaclResults();
const nodeCount = useCount('nodeCount');
const edgeCount = useCount('edgeCount');

function selectPredicate(predCurie: string) {
  navigate({ mode: 'card', focusCurie: ':' + effectiveFocus.value, predCurie });
}
function openIri(curie: string) {
  navigate({ mode: 'card', focusCurie: curie, predCurie: null });
}

interface Group { label: string; items: FocusTriple[] }

const IDENTITY = new Set(['a', 'skos:prefLabel', 'skos:altLabel', 'skos:definition']);
const MEASUREMENT = new Set(['aleph:perceivedImportance']);

const groups = computed<Group[]>(() => {
  const t: FocusTriple[] = focusTriples.value;
  const identity     = t.filter((x) => IDENTITY.has(x.predicate));
  const measurements = t.filter((x) => MEASUREMENT.has(x.predicate));
  const provenance   = t.filter((x) => x.predicate.startsWith('prov:'));
  const relations    = t.filter((x) =>
    x.kind === 'iri'
    && !IDENTITY.has(x.predicate)
    && !x.predicate.startsWith('prov:'),
  );
  return [
    { label: 'identity',     items: identity },
    { label: 'relations',    items: relations },
    { label: 'provenance',   items: provenance },
    { label: 'measurements', items: measurements },
  ].filter((g) => g.items.length > 0);
});

function backColor(k: NodeKind) {
  if (k === 'person') return props.palette.kindPerson;
  if (k === 'event')  return props.palette.kindEvent;
  return props.palette.kindConcept;
}

function tripleColor(kind: FocusTriple['kind']) {
  if (kind === 'iri')  return props.palette.sepia;
  if (kind === 'type') return props.palette.kindConcept;
  return props.palette.fg;
}

const shaclPasses = computed(() => shacl.value.filter((s) => s.status === 'pass').length);
const shaclTotal = computed(() => shacl.value.length);

const graphFullscreen = ref(false);
function toggleGraphFullscreen() { graphFullscreen.value = !graphFullscreen.value; }
</script>

<template>
  <PageLayout :palette="palette" :width="width" :dense="dense">
    <ConceptHeader
      v-if="!graphFullscreen"
      :palette="palette" :font-mono="fontMono" :font-prose="fontProse"
      :node="focusNode" :triples="focusTriples" :backlinks="backlinks.length"
    />

    <div style="display: flex; gap: 14px; flex: 1; min-height: 0">
      <!-- left column: graph + triples -->
      <div style="flex: 1; display: flex; flex-direction: column; gap: 14px; min-width: 0">
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
            height: graphFullscreen ? '100%' : Math.round(height * 0.5) + 'px',
            flex: graphFullscreen ? '1 1 auto' : '0 0 auto',
            flexShrink: graphFullscreen ? 1 : 0,
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
              >{{ nodeCount }} nodes · {{ edgeCount }} edges</span>
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
          <Schematic
            :palette="palette" :font-ui="fontUI" :font-mono="fontMono"
            :hilite="effectiveFocus"
            :selected-pred="selectedPred"
            :is-fullscreen="graphFullscreen"
            @toggle-fullscreen="toggleGraphFullscreen"
            @select-node="openIri"
          />
        </div>

        <!-- triples card -->
        <div
          v-if="!graphFullscreen"
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
            <span>Triples — :{{ effectiveFocus }} ?p ?o</span>
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
              >{{ focusTriples.length }} triples</span>
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
              overflow: 'auto',
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
                <span
                  :style="{
                    color: palette.accent,
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderBottom: `1px dashed ${palette.accent}55`,
                    background: selectedPred === tr.predicate ? `${palette.accent}1a` : 'transparent',
                    padding: selectedPred === tr.predicate ? '1px 4px' : '0',
                    marginLeft: selectedPred === tr.predicate ? '-4px' : '0',
                    borderRadius: '2px',
                    justifySelf: 'start',
                  }"
                  @click="selectPredicate(tr.predicate)"
                >{{ tr.predicate }}</span>
                <span
                  v-if="tr.kind === 'iri' || tr.kind === 'type'"
                  :style="{
                    color: tripleColor(tr.kind),
                    wordBreak: 'break-word',
                    cursor: 'pointer',
                    borderBottom: `1px dashed ${tripleColor(tr.kind)}55`,
                  }"
                  @click="openIri(tr.object)"
                >{{ tr.object }}</span>
                <span
                  v-else
                  :style="{ color: tripleColor(tr.kind), wordBreak: 'break-word' }"
                >{{ tr.object }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- right column: backlinks + shacl -->
      <div v-if="!graphFullscreen" style="width: 240px; display: flex; flex-direction: column; gap: 14px">
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
            >{{ backlinks.length }}</span>
          </div>
          <div style="padding: 6px 0; display: flex; flex-direction: column">
            <div
              v-for="(b, i) in backlinks"
              :key="i"
              @click="openIri(b.from)"
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
                <span>{{ b.fromLabel }}</span>
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
                color: shaclPasses === shaclTotal ? palette.ok : palette.warn,
                background: `${shaclPasses === shaclTotal ? palette.ok : palette.warn}1a`,
                padding: '2px 6px',
                borderRadius: '3px',
                textTransform: 'none',
                letterSpacing: 0,
              }"
            >{{ shaclPasses }} / {{ shaclTotal }} pass</span>
          </div>
          <div style="padding: 8px; display: flex; flex-direction: column; gap: 6px; overflow: auto">
            <div
              v-for="(s, i) in shacl"
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
                <span>{{ s.label ?? s.shape }}</span>
                <span
                  :style="{
                    fontSize: '9px',
                    letterSpacing: '1.2px',
                    color: s.status === 'pass' ? palette.ok : palette.warn,
                  }"
                >{{ s.status === 'pass' ? '✓ PASS' : '⚠ ' + s.status.toUpperCase() }}</span>
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
  </PageLayout>
</template>
