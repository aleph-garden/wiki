<script setup lang="ts">
import { ref, watchEffect, onBeforeUnmount } from 'vue';
import * as d3 from 'd3';
import type { Palette } from '../palette';
import { FONT_MONO as MONO, FONT_SERIF as SERIF } from '../palette';
import type { DemoGraph } from '../lib/ttl';
import { buildLayout, type Layout } from '../lib/orbitalLayout';

const props = defineProps<{
  graph: DemoGraph;
  palette: Palette;
  fontMono: string;
  width: number;
  height: number;
  focusId: string;
  narratorSide?: 'left' | 'right';
}>();

const svgEl = ref<SVGSVGElement | null>(null);

function nodeColor(kind: 'concept' | 'person' | 'event', pal: Palette): string {
  if (kind === 'person') return pal.cool;
  if (kind === 'event')  return pal.hot;
  return pal.leaf;
}

function render(svgNode: SVGSVGElement, layout: Layout) {
  const pal = props.palette;
  const fontMono = props.fontMono;
  const svg = d3.select(svgNode);
  svg.attr('width', layout.width).attr('height', layout.height);

  // wipe
  svg.selectAll('*').remove();

  // ── defs ──
  const defs = svg.append('defs');
  const nebula = defs.append('radialGradient')
    .attr('id', 'orbd3-nebula').attr('cx', '50%').attr('cy', '50%').attr('r', '55%');
  nebula.append('stop').attr('offset', '0%').attr('stop-color', pal.halo).attr('stop-opacity', 0.14);
  nebula.append('stop').attr('offset', '60%').attr('stop-color', pal.halo).attr('stop-opacity', 0);
  const core = defs.append('radialGradient')
    .attr('id', 'orbd3-core').attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
  core.append('stop').attr('offset', '0%').attr('stop-color', pal.halo).attr('stop-opacity', 0.55);
  core.append('stop').attr('offset', '40%').attr('stop-color', pal.halo).attr('stop-opacity', 0.15);
  core.append('stop').attr('offset', '100%').attr('stop-color', pal.halo).attr('stop-opacity', 0);

  // ── stars ──
  const starsG = svg.append('g').attr('class', 'stars');
  starsG.selectAll('circle')
    .data(layout.stars)
    .join('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r)
    .attr('fill', pal.fg).attr('opacity', (d) => d.op);

  svg.append('rect')
    .attr('x', 0).attr('y', 0)
    .attr('width', layout.width).attr('height', layout.height)
    .attr('fill', 'url(#orbd3-nebula)');

  // halo
  svg.append('circle')
    .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.haloR)
    .attr('fill', 'url(#orbd3-core)');

  // orbits
  const orbitsG = svg.append('g').attr('class', 'orbits');
  orbitsG.selectAll('circle')
    .data(layout.orbits)
    .join('circle')
    .attr('cx', layout.cx).attr('cy', layout.cy)
    .attr('r', (d) => d.r)
    .attr('fill', 'none')
    .attr('stroke', pal.orbit)
    .attr('stroke-width', (d) => d.stroke)
    .attr('stroke-dasharray', (d) => d.dash);

  orbitsG.selectAll('text')
    .data(layout.orbitLabels)
    .join('text')
    .attr('x', (d) => d.tx).attr('y', (d) => d.ty)
    .attr('font-family', fontMono).attr('font-size', 9).attr('letter-spacing', 1.4)
    .attr('fill', pal.mute).attr('opacity', 0.55)
    .attr('text-anchor', 'middle')
    .text((d) => d.label);

  // trail
  const trailG = svg.append('g').attr('class', 'trail');
  const trail = trailG.selectAll('g')
    .data(layout.trail)
    .join('g')
    .attr('opacity', (d) => d.opacity);
  trail.append('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', 3)
    .attr('fill', 'none').attr('stroke', pal.aleph)
    .attr('stroke-width', 0.8).attr('stroke-dasharray', '1 2');
  trail.append('text')
    .attr('x', (d) => d.x + 8).attr('y', (d) => d.y + 4)
    .attr('font-family', fontMono).attr('font-size', 9).attr('letter-spacing', 1)
    .attr('fill', pal.mute)
    .text((d) => d.label);
  if (layout.trailPath) {
    svg.append('path')
      .attr('d', layout.trailPath)
      .attr('stroke', pal.aleph).attr('stroke-width', 0.4).attr('stroke-dasharray', '2 5')
      .attr('fill', 'none').attr('opacity', 0.25);
  }

  // spokes
  const spokesG = svg.append('g').attr('class', 'spokes');
  spokesG.selectAll('line')
    .data(layout.spokes)
    .join('line')
    .attr('x1', layout.cx).attr('y1', layout.cy)
    .attr('x2', (d) => d.x2).attr('y2', (d) => d.y2)
    .attr('stroke', pal.faint).attr('stroke-width', 0.6).attr('stroke-dasharray', '1 3');

  // core
  const coreG = svg.append('g').attr('class', 'core');
  coreG.append('circle')
    .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.ring1R)
    .attr('fill', 'none').attr('stroke', pal.aleph).attr('stroke-width', 0.6).attr('opacity', 0.15);
  coreG.append('circle')
    .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.ring2R)
    .attr('fill', 'none').attr('stroke', pal.aleph).attr('stroke-width', 0.5).attr('opacity', 0.22);
  coreG.append('text')
    .attr('x', layout.cx).attr('y', layout.cy + layout.core.glyphYOff)
    .attr('text-anchor', 'middle')
    .attr('font-size', layout.core.glyphSize)
    .attr('font-family', '"Fraunces", "Cormorant Garamond", serif')
    .attr('fill', pal.aleph)
    .text('א');
  coreG.append('circle')
    .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.hotR).attr('fill', pal.hot);
  coreG.append('circle')
    .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.hotR)
    .attr('fill', pal.hot).attr('opacity', 0.6)
    .style('filter', 'blur(5px)');
  coreG.append('circle')
    .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.hotHaloR)
    .attr('fill', 'none').attr('stroke', pal.hot).attr('stroke-width', 0.5).attr('opacity', 0.4);
  coreG.append('text')
    .attr('x', layout.cx).attr('y', layout.cy + layout.core.nameYOff)
    .attr('text-anchor', 'middle')
    .attr('font-size', layout.core.nameSize).attr('font-weight', 500)
    .attr('font-family', '"Fraunces", "Cormorant Garamond", serif')
    .attr('font-style', 'italic').attr('letter-spacing', 0.5)
    .attr('fill', pal.fg)
    .text(`— ${layout.focusNode?.label ?? ''} —`);

  const backlinks = props.graph.edges.filter(
    (e) => e.s === layout.focusNode?.id || e.o === layout.focusNode?.id,
  ).length;
  coreG.append('text')
    .attr('x', layout.cx).attr('y', layout.cy + layout.core.metaYOff)
    .attr('text-anchor', 'middle')
    .attr('font-size', 9.5).attr('letter-spacing', 1.5)
    .attr('font-family', fontMono).attr('fill', pal.mute)
    .text(layout.focusNode
      ? `ALEPH:${layout.focusNode.id.toUpperCase()}  ·  IMPORTANCE ${layout.focusNode.importance.toFixed(2)}  ·  ${backlinks} BACKLINKS`
      : '');

  // reasoning path
  if (layout.reasoningD) {
    const rg = svg.append('g').attr('class', 'reasoning');
    rg.append('path')
      .attr('d', layout.reasoningD)
      .attr('stroke', pal.hot).attr('stroke-width', 6).attr('fill', 'none')
      .attr('opacity', 0.18).style('filter', 'blur(4px)');
    const animated = rg.append('path')
      .attr('d', layout.reasoningD)
      .attr('stroke', pal.hot).attr('stroke-width', 1.6).attr('fill', 'none')
      .attr('stroke-dasharray', '4 4').attr('stroke-linecap', 'round').attr('opacity', 0.9);
    animated.append('animate')
      .attr('attributeName', 'stroke-dashoffset')
      .attr('from', '0').attr('to', '-16')
      .attr('dur', '2.4s').attr('repeatCount', 'indefinite');

    const labelG = rg.selectAll('g.elabel')
      .data(layout.reasoningLabels)
      .join('g').attr('class', 'elabel');
    labelG.append('text')
      .attr('x', (d) => d.mx).attr('y', (d) => d.my - 9)
      .attr('font-family', fontMono).attr('font-size', 9.5).attr('letter-spacing', 1)
      .attr('text-anchor', 'middle').attr('fill', pal.sepia)
      .style('paint-order', 'stroke').style('stroke', pal.bg).style('stroke-width', '3px')
      .text((d) => d.label);
    labelG.filter((d) => !!d.cite).append('text')
      .attr('x', (d) => d.mx).attr('y', (d) => d.my + 4)
      .attr('font-family', fontMono).attr('font-size', 7.5).attr('letter-spacing', 1.2)
      .attr('text-anchor', 'middle').attr('fill', pal.mute).attr('opacity', 0.8)
      .style('paint-order', 'stroke').style('stroke', pal.bg).style('stroke-width', '3px')
      .text((d) => (d.cite ?? '').toUpperCase());
  }

  // orbital nodes
  const nodesG = svg.append('g').attr('class', 'nodes');
  const node = nodesG.selectAll('g.node')
    .data(layout.nodes, (d: any) => d.node.id)
    .join('g')
    .attr('class', 'node')
    .attr('opacity', (d) => (d.dim ? 0.5 : 1))
    .style('transition', 'opacity 220ms ease');

  node.filter((d) => d.onPath).append('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r + 8)
    .attr('fill', 'none').attr('stroke', pal.hot).attr('stroke-width', 1).attr('opacity', 0.6)
    .style('filter', `drop-shadow(0 0 6px ${pal.hot})`);

  node.filter((d) => d.inSession && !d.onPath).append('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r + 5)
    .attr('fill', 'none').attr('stroke', pal.sepia).attr('stroke-width', 0.7).attr('opacity', 0.35);

  node.filter((d) => d.node.importance > 0.6 && !d.onPath).append('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r + 3)
    .attr('fill', 'none')
    .attr('stroke', (d) => nodeColor(d.kind, pal))
    .attr('stroke-width', 0.6).attr('opacity', 0.4);

  node.append('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y)
    .attr('r', (d) => (d.onPath ? d.r + 1 : d.r))
    .attr('fill', (d) => (d.onPath ? pal.hot : nodeColor(d.kind, pal)));

  node.append('line')
    .attr('x1', (d) => d.lineX1).attr('y1', (d) => d.y)
    .attr('x2', (d) => d.lineX2).attr('y2', (d) => d.ty)
    .attr('stroke', pal.faint).attr('stroke-width', 0.6);

  node.append('text')
    .attr('x', (d) => d.tx).attr('y', (d) => d.ty)
    .attr('font-family', '"Fraunces", serif')
    .attr('font-size', (d) => (d.onPath ? 15 : d.node.importance > 0.6 ? 14 : 12))
    .attr('font-weight', (d) => (d.onPath ? 600 : d.node.importance > 0.7 ? 500 : 400))
    .attr('font-style', (d) => (d.kind === 'person' ? 'italic' : 'normal'))
    .attr('fill', (d) => (d.onPath ? pal.hot : pal.fg))
    .attr('text-anchor', (d) => d.anchor)
    .attr('dominant-baseline', 'middle')
    .text((d) => d.node.label);

  node.filter((d) => !!d.predicate).append('text')
    .attr('x', (d) => d.tx).attr('y', (d) => d.ty + 12)
    .attr('font-family', '"JetBrains Mono", monospace')
    .attr('font-size', 8.5).attr('letter-spacing', 1.2)
    .attr('fill', (d) => (d.onPath ? pal.sepia : pal.mute))
    .attr('text-anchor', (d) => d.anchor)
    .text((d) => d.predicate.toUpperCase());

  // narration foreignObjects
  const noteG = svg.append('g').attr('class', 'notes');
  const noteFo = noteG.selectAll<SVGForeignObjectElement, Layout['pathNoteAnchors'][number]>('foreignObject')
    .data(layout.pathNoteAnchors)
    .join('foreignObject')
    .attr('x', (d) => d.ox - 110).attr('y', (d) => d.oy - 28)
    .attr('width', 220).attr('height', 80);
  noteFo.html((d) => `
    <div style="
      padding: 6px 9px;
      background: ${pal.bg}c8;
      backdrop-filter: blur(6px);
      border: 1px solid ${pal.sepia}44;
      border-left: 2px solid ${pal.sepia};
      font-family: ${SERIF};
      font-style: italic;
      font-size: 11.5px;
      color: ${pal.fg};
      line-height: 1.4;
      white-space: pre-line;
    ">
      <div style="
        font-size: 8px;
        letter-spacing: 1.4px;
        text-transform: uppercase;
        font-family: ${MONO};
        font-style: normal;
        color: ${pal.sepia};
        margin-bottom: 2px;
        opacity: 0.9;
      ">step ${d.step}</div>
      ${d.text.replace(/\n/g, '<br/>')}
    </div>
  `);
}

let stopHandle: ReturnType<typeof watchEffect> | null = null;

stopHandle = watchEffect(() => {
  const el = svgEl.value;
  if (!el) return;
  const layout = buildLayout(props.graph, {
    width: props.width,
    height: props.height,
    narratorSide: props.narratorSide,
    focusId: props.focusId,
  });
  render(el, layout);
});

onBeforeUnmount(() => stopHandle?.());
</script>

<template>
  <svg
    ref="svgEl"
    :style="{ position: 'absolute', inset: 0 }"
  />
</template>
