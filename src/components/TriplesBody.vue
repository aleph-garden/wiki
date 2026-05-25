<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import { loadDemoGraph } from '../lib/ttl';
import ConceptHeader from './ConceptHeader.vue';

const props = defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  fontProse: string;
  width: number;
  height: number;
  dense: boolean;
}>();

const graph = loadDemoGraph();

type Tok = 'comment' | 'directive' | 'iri' | 'literal' | 'prefixed' | 'number' | 'keyword' | 'punct' | 'plain';
interface Token { text: string; cls: Tok }

const TOKENIZE_RE =
  /(#[^\n]*)|(@\w+)|(<[^>]*>)|("(?:[^"\\]|\\.)*"(?:@[A-Za-z-]+|\^\^\S+)?)|((?:[A-Za-z_][\w-]*)?:[A-Za-z_][\w_-]*)|(\b\d+\.\d+\b|\b\d+\b)|(\ba\b)|([;,.[\]()])/g;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  // RegExp objects keep `lastIndex`; reset per call.
  const re = new RegExp(TOKENIZE_RE.source, 'g');
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) tokens.push({ text: src.slice(last, m.index), cls: 'plain' });
    let cls: Tok = 'plain';
    if (m[1]) cls = 'comment';
    else if (m[2]) cls = 'directive';
    else if (m[3]) cls = 'iri';
    else if (m[4]) cls = 'literal';
    else if (m[5]) cls = 'prefixed';
    else if (m[6]) cls = 'number';
    else if (m[7]) cls = 'keyword';
    else if (m[8]) cls = 'punct';
    tokens.push({ text: m[0], cls });
    last = m.index + m[0].length;
  }
  if (last < src.length) tokens.push({ text: src.slice(last), cls: 'plain' });
  return tokens;
}

const lines = computed(() =>
  graph.raw.split('\n').map((line, i) => ({ n: i + 1, tokens: tokenize(line) })),
);

const gutterWidth = computed(() => String(lines.value.length).length * 8 + 18 + 'px');

const sizeLabel = computed(() => {
  const b = graph.byteSize;
  return b >= 1024 ? (b / 1024).toFixed(1) + ' kb' : b + ' b';
});

const colorOf = (cls: Tok): string => {
  const p = props.palette;
  switch (cls) {
    case 'comment':   return p.mute;
    case 'directive': return p.sage;
    case 'iri':       return p.cool;
    case 'literal':   return p.leaf;
    case 'number':    return p.hot;
    case 'keyword':   return p.aleph;
    case 'punct':     return p.mute;
    case 'prefixed':  return p.fg;
    default:          return p.fg;
  }
};
</script>

<template>
  <section
    :style="{
      width: width + 'px',
      padding: '20px 28px',
      position: 'relative',
      background: palette.bg,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }"
  >
    <ConceptHeader :palette="palette" :font-mono="fontMono" font-prose='"Fraunces", serif' />
    <div
      :style="{
        flex: 1,
        minHeight: 0,
        background: palette.panel,
        border: `1px solid ${palette.rule}`,
        borderRadius: '4px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }"
    >
      <div
        :style="{
          padding: '8px 14px',
          borderBottom: `1px solid ${palette.rule}`,
          fontFamily: fontMono,
          fontSize: '10px',
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          color: palette.mute,
          fontWeight: 600,
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
        }"
      >
        <span>{{ graph.source }} — Turtle 1.1</span>
        <span>{{ sizeLabel }} · {{ graph.tripleCount }} triples · {{ graph.nodes.length }} nodes</span>
      </div>
      <div
        :style="{
          flex: 1,
          overflow: 'auto',
          fontFamily: fontMono,
          fontSize: '12.5px',
          lineHeight: 1.6,
          color: palette.fg,
        }"
      >
        <div
          v-for="row in lines" :key="row.n"
          :style="{
            display: 'grid',
            gridTemplateColumns: `${gutterWidth} 1fr`,
            alignItems: 'baseline',
            paddingRight: '20px',
          }"
        >
          <span
            :style="{
              textAlign: 'right',
              paddingRight: '12px',
              color: palette.mute,
              opacity: 0.45,
              fontSize: '10.5px',
              userSelect: 'none',
              borderRight: `1px solid ${palette.rule}`,
            }"
          >{{ row.n }}</span>
          <span :style="{ whiteSpace: 'pre', paddingLeft: '14px' }">
            <span
              v-for="(t, i) in row.tokens" :key="i"
              :style="{
                color: colorOf(t.cls),
                fontStyle: t.cls === 'literal' ? 'italic' : 'normal',
                fontWeight: t.cls === 'keyword' || t.cls === 'directive' ? 600 : 400,
                opacity: t.cls === 'comment' ? 0.55 : 1,
              }"
            >{{ t.text }}</span>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
