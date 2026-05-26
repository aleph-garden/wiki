<script setup lang="ts">
import { computed, ref, watchEffect, onBeforeUnmount } from 'vue';
import * as d3 from 'd3';
import type { Palette } from '../palette';
import { FONT_MONO as MONO, FONT_SERIF as SERIF } from '../palette';
import {
  useAllNodes,
  useAllEdges,
  useViewPath,
  useViewTrail,
  useViewEdgeNotes,
  useViewPathNotes,
  useActiveSessionId,
} from '../lib/queries';
import { buildLayout, type Layout, type LayoutGraph, type RenderedNode } from '../lib/orbitalLayout';

const props = defineProps<{
  palette: Palette;
  fontMono: string;
  width: number;
  height: number;
  focusId: string;
  narratorSide?: 'left' | 'right';
}>();

const allNodes = useAllNodes();
const allEdges = useAllEdges();
const viewPath = useViewPath();
const viewTrail = useViewTrail();
const viewEdgeNotes = useViewEdgeNotes();
const viewPathNotes = useViewPathNotes();
const activeSession = useActiveSessionId();

const layoutGraph = computed<LayoutGraph>(() => ({
  nodes: allNodes.value,
  edges: allEdges.value,
  view: {
    path: viewPath.value,
    trail: viewTrail.value,
    edgeNotes: viewEdgeNotes.value,
    pathNotes: viewPathNotes.value,
  },
  activeSession: activeSession.value,
}));

const emit = defineEmits<{ (e: 'select-node', id: string): void }>();

const svgEl = ref<SVGSVGElement | null>(null);

let currentTransform: d3.ZoomTransform = d3.zoomIdentity;
const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.2, 6])
  .on('zoom', (ev) => {
    currentTransform = ev.transform;
    d3.select(svgEl.value).select<SVGGElement>('g.zoom-root')
      .attr('transform', ev.transform.toString());
  });

function resetZoom() {
  if (!svgEl.value) return;
  d3.select(svgEl.value)
    .transition().duration(220)
    .call(zoomBehavior.transform, d3.zoomIdentity);
}
defineExpose({ resetZoom });

function nodeColor(kind: 'concept' | 'person' | 'event', pal: Palette): string {
  if (kind === 'person') return pal.cool;
  if (kind === 'event')  return pal.hot;
  return pal.leaf;
}

const ANIM_MS = 600;
const ANIM_EASE = d3.easeCubicInOut;

// Track skeleton size so we know when to fully rebuild the static layers.
let skeletonKey = '';

function ensureSkeleton(svgNode: SVGSVGElement, layout: Layout): d3.Selection<SVGGElement, unknown, null, undefined> {
  const pal = props.palette;
  const svg = d3.select(svgNode);
  svg.attr('width', layout.width).attr('height', layout.height);
  svg.style('cursor', 'grab');

  const key = `${layout.width}x${layout.height}|${pal.bg}|${pal.halo}|${pal.fg}|${pal.orbit}|${pal.mute}|${pal.aleph}|${pal.hot}`;
  const rebuild = key !== skeletonKey;
  skeletonKey = key;

  if (rebuild) {
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const nebula = defs.append('radialGradient')
      .attr('id', 'orbd3-nebula').attr('cx', '50%').attr('cy', '50%').attr('r', '55%');
    nebula.append('stop').attr('offset', '0%').attr('stop-color', pal.halo).attr('stop-opacity', 0.14);
    nebula.append('stop').attr('offset', '60%').attr('stop-color', pal.halo).attr('stop-opacity', 0);
    const coreGrad = defs.append('radialGradient')
      .attr('id', 'orbd3-core').attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
    coreGrad.append('stop').attr('offset', '0%').attr('stop-color', pal.halo).attr('stop-opacity', 0.55);
    coreGrad.append('stop').attr('offset', '40%').attr('stop-color', pal.halo).attr('stop-opacity', 0.15);
    coreGrad.append('stop').attr('offset', '100%').attr('stop-color', pal.halo).attr('stop-opacity', 0);

    const root = svg.append('g').attr('class', 'zoom-root')
      .attr('transform', currentTransform.toString());

    // stars (static)
    const starsG = root.append('g').attr('class', 'stars');
    starsG.selectAll('circle')
      .data(layout.stars).join('circle')
      .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r)
      .attr('fill', pal.fg).attr('opacity', (d) => d.op);

    root.append('rect').attr('class', 'nebula-rect')
      .attr('x', 0).attr('y', 0)
      .attr('width', layout.width).attr('height', layout.height)
      .attr('fill', 'url(#orbd3-nebula)');

    // halo (static — cx/cy/haloR are stable per viewport)
    root.append('circle').attr('class', 'halo')
      .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.haloR)
      .attr('fill', 'url(#orbd3-core)');

    // orbits (static)
    const orbitsG = root.append('g').attr('class', 'orbits');
    orbitsG.selectAll('circle')
      .data(layout.orbits).join('circle')
      .attr('cx', layout.cx).attr('cy', layout.cy)
      .attr('r', (d) => d.r)
      .attr('fill', 'none')
      .attr('stroke', pal.orbit)
      .attr('stroke-width', (d) => d.stroke)
      .attr('stroke-dasharray', (d) => d.dash);

    // placeholders so subsequent renders find their groups
    root.append('g').attr('class', 'orbit-labels');
    root.append('g').attr('class', 'trail');
    root.append('path').attr('class', 'trail-path')
      .attr('stroke', pal.aleph).attr('stroke-width', 0.4).attr('stroke-dasharray', '2 5')
      .attr('fill', 'none').attr('opacity', 0.25);
    root.append('g').attr('class', 'spokes');
    root.append('g').attr('class', 'core');
    root.append('g').attr('class', 'reasoning');
    root.append('g').attr('class', 'nodes');
    root.append('g').attr('class', 'notes');

    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, currentTransform);
  }

  return svg.select<SVGGElement>('g.zoom-root');
}

function render(svgNode: SVGSVGElement, layout: Layout) {
  const pal = props.palette;
  const fontMono = props.fontMono;
  const root = ensureSkeleton(svgNode, layout);

  // orbit labels (static positions)
  root.select<SVGGElement>('g.orbit-labels').selectAll('text')
    .data(layout.orbitLabels).join('text')
    .attr('x', (d) => d.tx).attr('y', (d) => d.ty)
    .attr('font-family', fontMono).attr('font-size', 9).attr('letter-spacing', 1.4)
    .attr('fill', pal.mute).attr('opacity', 0.55)
    .attr('text-anchor', 'middle')
    .text((d) => d.label);

  // trail (static positions)
  const trailG = root.select<SVGGElement>('g.trail');
  const trailItems = trailG.selectAll<SVGGElement, Layout['trail'][number]>('g')
    .data(layout.trail)
    .join('g')
    .attr('opacity', (d) => d.opacity);
  trailItems.selectAll('*').remove();
  trailItems.append('circle')
    .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', 3)
    .attr('fill', 'none').attr('stroke', pal.aleph)
    .attr('stroke-width', 0.8).attr('stroke-dasharray', '1 2');
  trailItems.append('text')
    .attr('x', (d) => d.x + 8).attr('y', (d) => d.y + 4)
    .attr('font-family', fontMono).attr('font-size', 9).attr('letter-spacing', 1)
    .attr('fill', pal.mute)
    .text((d) => d.label);
  root.select<SVGPathElement>('path.trail-path').attr('d', layout.trailPath || '');

  // core (focus label changes with crossfade)
  const coreG = root.select<SVGGElement>('g.core');
  let coreInit = coreG.select('circle.ring1');
  if (coreInit.empty()) {
    coreG.append('circle').attr('class', 'ring1')
      .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.ring1R)
      .attr('fill', 'none').attr('stroke', pal.aleph).attr('stroke-width', 0.6).attr('opacity', 0.15);
    coreG.append('circle').attr('class', 'ring2')
      .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.ring2R)
      .attr('fill', 'none').attr('stroke', pal.aleph).attr('stroke-width', 0.5).attr('opacity', 0.22);
    coreG.append('circle').attr('class', 'hot-core')
      .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.hotR).attr('fill', pal.hot);
    coreG.append('circle').attr('class', 'hot-blur')
      .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.hotR)
      .attr('fill', pal.hot).attr('opacity', 0.6).style('filter', 'blur(5px)');
    coreG.append('circle').attr('class', 'hot-halo')
      .attr('cx', layout.cx).attr('cy', layout.cy).attr('r', layout.core.hotHaloR)
      .attr('fill', 'none').attr('stroke', pal.hot).attr('stroke-width', 0.5).attr('opacity', 0.4);
    coreG.append('text').attr('class', 'meta')
      .attr('x', layout.cx).attr('y', layout.cy + layout.core.metaYOff)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9.5).attr('letter-spacing', 1.5)
      .attr('font-family', fontMono).attr('fill', pal.mute);
    coreInit = coreG.select('circle.ring1');
  }

  const backlinks = layoutGraph.value.edges.filter(
    (e) => e.s === layout.focusNode?.id || e.o === layout.focusNode?.id,
  ).length;
  const newMeta = layout.focusNode
    ? `ALEPH:${layout.focusNode.id.toUpperCase()}  ·  IMPORTANCE ${layout.focusNode.importance.toFixed(2)}  ·  ${backlinks} BACKLINKS`
    : '';
  const metaSel = coreG.select<SVGTextElement>('text.meta');
  if (metaSel.text() !== newMeta) {
    metaSel.transition().duration(ANIM_MS / 2).style('opacity', 0)
      .on('end', function () {
        d3.select(this).text(newMeta).transition().duration(ANIM_MS / 2).style('opacity', 1);
      });
  }

  // reasoning path — tween d-attribute so the curve flows with the nodes
  const reasoningG = root.select<SVGGElement>('g.reasoning');
  if (layout.reasoningD) {
    let glow = reasoningG.select<SVGPathElement>('path.reasoning-glow');
    let line = reasoningG.select<SVGPathElement>('path.reasoning-line');
    if (glow.empty()) {
      glow = reasoningG.append('path').attr('class', 'reasoning-glow')
        .attr('stroke', pal.hot).attr('stroke-width', 6).attr('fill', 'none')
        .attr('opacity', 0.18).style('filter', 'blur(4px)')
        .attr('d', layout.reasoningD);
      line = reasoningG.append('path').attr('class', 'reasoning-line')
        .attr('stroke', pal.hot).attr('stroke-width', 1.6).attr('fill', 'none')
        .attr('stroke-dasharray', '4 4').attr('stroke-linecap', 'round').attr('opacity', 0.9)
        .attr('d', layout.reasoningD);
      line.append('animate')
        .attr('attributeName', 'stroke-dashoffset')
        .attr('from', '0').attr('to', '-16')
        .attr('dur', '2.4s').attr('repeatCount', 'indefinite');
    } else {
      const tweenD = (target: string) => function (this: SVGPathElement) {
        const start = this.getAttribute('d') || target;
        return d3.interpolateString(start, target);
      };
      glow.transition().duration(ANIM_MS).ease(ANIM_EASE).attrTween('d', tweenD(layout.reasoningD));
      line.transition().duration(ANIM_MS).ease(ANIM_EASE).attrTween('d', tweenD(layout.reasoningD));
    }

    // edge labels — keyed by from→to so each survives across renders and tweens
    const labelG = reasoningG.selectAll<SVGGElement, Layout['reasoningLabels'][number]>('g.elabel')
      .data(layout.reasoningLabels, (d: any) => `${d.from}->${d.to}`)
      .join(
        enter => {
          const g = enter.append('g').attr('class', 'elabel');
          g.append('text').attr('class', 'lbl-main')
            .attr('font-family', fontMono).attr('font-size', 9.5).attr('letter-spacing', 1)
            .attr('text-anchor', 'middle').attr('fill', pal.sepia)
            .style('paint-order', 'stroke').style('stroke', pal.bg).style('stroke-width', '3px')
            .attr('x', (d) => d.mx).attr('y', (d) => d.my - 9)
            .text((d) => d.label);
          g.filter((d) => !!d.cite).append('text').attr('class', 'lbl-cite')
            .attr('font-family', fontMono).attr('font-size', 7.5).attr('letter-spacing', 1.2)
            .attr('text-anchor', 'middle').attr('fill', pal.mute).attr('opacity', 0.8)
            .style('paint-order', 'stroke').style('stroke', pal.bg).style('stroke-width', '3px')
            .attr('x', (d) => d.mx).attr('y', (d) => d.my + 4)
            .text((d) => (d.cite ?? '').toUpperCase());
          return g;
        },
        update => update,
        exit => exit.remove(),
      );
    labelG.select<SVGTextElement>('text.lbl-main').transition().duration(ANIM_MS).ease(ANIM_EASE)
      .attr('x', (d) => d.mx).attr('y', (d) => d.my - 9);
    labelG.select<SVGTextElement>('text.lbl-cite').transition().duration(ANIM_MS).ease(ANIM_EASE)
      .attr('x', (d) => d.mx).attr('y', (d) => d.my + 4);
  } else {
    reasoningG.selectAll('*').remove();
  }

  // spokes (animated)
  const spokesG = root.select<SVGGElement>('g.spokes');
  spokesG.selectAll<SVGLineElement, Layout['spokes'][number]>('line')
    .data(layout.spokes, (d: any) => d.id)
    .join(
      enter => enter.append('line')
        .attr('x1', layout.cx).attr('y1', layout.cy)
        .attr('x2', layout.cx).attr('y2', layout.cy)
        .attr('stroke', pal.faint).attr('stroke-width', 0.6).attr('stroke-dasharray', '1 3')
        .call(s => s.transition().duration(ANIM_MS).ease(ANIM_EASE)
          .attr('x2', (d) => d.x2).attr('y2', (d) => d.y2)),
      update => update.call(s => s.transition().duration(ANIM_MS).ease(ANIM_EASE)
        .attr('x1', layout.cx).attr('y1', layout.cy)
        .attr('x2', (d) => d.x2).attr('y2', (d) => d.y2)),
      exit => exit.transition().duration(ANIM_MS / 2).attr('opacity', 0).remove(),
    );

  // nodes (animated) — entire group transitions via translate; children sit at relative offsets.
  const nodesG = root.select<SVGGElement>('g.nodes');
  const node = nodesG.selectAll<SVGGElement, RenderedNode>('g.node')
    .data(layout.nodes, (d: any) => d.node.id)
    .join(
      enter => {
        const g = enter.append('g')
          .attr('class', 'node')
          .attr('transform', (d) => `translate(${layout.cx},${layout.cy})`)
          .attr('opacity', 0)
          .style('cursor', 'pointer')
          .on('click', (ev, d) => { ev.stopPropagation(); emit('select-node', d.node.id); });
        addNodeChildren(g, pal, fontMono);
        g.transition().duration(ANIM_MS).ease(ANIM_EASE)
          .attr('transform', (d) => `translate(${d.x},${d.y})`)
          .attr('opacity', (d) => (d.dim ? 0.5 : 1));
        return g;
      },
      update => {
        update.transition().duration(ANIM_MS).ease(ANIM_EASE)
          .attr('transform', (d) => `translate(${d.x},${d.y})`)
          .attr('opacity', (d) => (d.dim ? 0.5 : 1));
        updateNodeChildren(update, pal, fontMono);
        return update;
      },
      exit => exit.transition().duration(ANIM_MS / 2)
        .attr('opacity', 0)
        .attr('transform', `translate(${layout.cx},${layout.cy})`)
        .remove(),
    );
  void node;

  // notes (no transition — recreated on each render)
  const noteG = root.select<SVGGElement>('g.notes');
  noteG.selectAll('*').remove();
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

// All node children live at coordinates relative to the group's translate(d.x, d.y),
// so animating the group's transform smoothly moves the whole subtree.
function addNodeChildren(
  g: d3.Selection<SVGGElement, RenderedNode, SVGGElement, unknown>,
  pal: Palette,
  fontMono: string,
) {
  g.append('circle').attr('class', 'ring-path')
    .attr('cx', 0).attr('cy', 0)
    .attr('fill', 'none').attr('stroke', pal.hot).attr('stroke-width', 1)
    .style('filter', `drop-shadow(0 0 6px ${pal.hot})`);
  g.append('circle').attr('class', 'ring-session')
    .attr('cx', 0).attr('cy', 0)
    .attr('fill', 'none').attr('stroke', pal.sepia).attr('stroke-width', 0.7);
  g.append('circle').attr('class', 'ring-important')
    .attr('cx', 0).attr('cy', 0)
    .attr('fill', 'none').attr('stroke-width', 0.6);
  g.append('circle').attr('class', 'dot').attr('cx', 0).attr('cy', 0);
  g.append('line').attr('class', 'label-line').attr('stroke', pal.faint).attr('stroke-width', 0.6);
  g.append('text').attr('class', 'label')
    .attr('font-family', '"Fraunces", serif')
    .attr('dominant-baseline', 'middle');
  g.append('text').attr('class', 'pred')
    .attr('font-family', '"JetBrains Mono", monospace')
    .attr('font-size', 8.5).attr('letter-spacing', 1.2);
  updateNodeChildren(g, pal, fontMono);
}

function updateNodeChildren(
  sel: d3.Selection<SVGGElement, RenderedNode, SVGGElement, unknown>,
  pal: Palette,
  _fontMono: string,
) {
  const t = d3.transition().duration(ANIM_MS).ease(ANIM_EASE);

  sel.select<SVGCircleElement>('circle.ring-path').transition(t)
    .attr('r', (d) => (d.onPath ? d.r + 8 : 0))
    .attr('opacity', (d) => (d.onPath ? 0.6 : 0));
  sel.select<SVGCircleElement>('circle.ring-session').transition(t)
    .attr('r', (d) => (d.inSession && !d.onPath ? d.r + 5 : 0))
    .attr('opacity', (d) => (d.inSession && !d.onPath ? 0.35 : 0));
  sel.select<SVGCircleElement>('circle.ring-important').transition(t)
    .attr('r', (d) => (d.node.importance > 0.6 && !d.onPath ? d.r + 3 : 0))
    .attr('stroke', (d) => nodeColor(d.kind, pal))
    .attr('opacity', (d) => (d.node.importance > 0.6 && !d.onPath ? 0.4 : 0));
  sel.select<SVGCircleElement>('circle.dot').transition(t)
    .attr('r', (d) => (d.isFocus ? d.r : d.onPath ? d.r + 1 : d.r))
    .attr('fill', (d) => (d.isFocus ? pal.hot : d.onPath ? pal.hot : nodeColor(d.kind, pal)));

  // Label & line live in the parent's coordinate space. Since the parent
  // group is translated to (d.x, d.y), positions here are offsets from that.
  sel.select<SVGLineElement>('line.label-line').transition(t)
    .attr('x1', (d) => d.lineX1 - d.x).attr('y1', 0)
    .attr('x2', (d) => d.lineX2 - d.x).attr('y2', (d) => d.ty - d.y)
    .attr('opacity', (d) => (d.isFocus ? 0 : 1));
  sel.select<SVGTextElement>('text.label')
    .attr('font-style', (d) => (d.kind === 'person' ? 'italic' : d.isFocus ? 'italic' : 'normal'))
    .attr('letter-spacing', (d) => (d.isFocus ? 0.5 : 0))
    .text((d) => d.node.label)
    .transition(t)
    .attr('x', (d) => d.tx - d.x).attr('y', (d) => d.ty - d.y)
    .attr('font-size', (d) => d.labelSize)
    .attr('font-weight', (d) => d.labelWeight)
    .attr('fill', (d) => (d.isFocus ? pal.fg : d.onPath ? pal.hot : pal.fg))
    .attr('text-anchor', (d) => d.anchor);
  sel.select<SVGTextElement>('text.pred')
    .text((d) => (d.predicate ? d.predicate.toUpperCase() : ''))
    .transition(t)
    .attr('x', (d) => d.tx - d.x).attr('y', (d) => d.ty - d.y + 12)
    .attr('fill', (d) => (d.onPath ? pal.sepia : pal.mute))
    .attr('text-anchor', (d) => d.anchor)
    .attr('opacity', (d) => (d.isFocus ? 0 : 1));
}

let stopHandle: ReturnType<typeof watchEffect> | null = null;
let prevAngles: Map<string, number> | undefined;
let prevFocusId: string | undefined;

stopHandle = watchEffect(() => {
  const el = svgEl.value;
  if (!el) return;

  // When focus changes, the previous focus needs a new orbital slot. Seed it
  // with the angle the new focus just vacated so the swap looks deliberate.
  let seeded = prevAngles;
  if (prevAngles && prevFocusId && prevFocusId !== props.focusId) {
    const vacated = prevAngles.get(props.focusId);
    if (vacated !== undefined) {
      seeded = new Map(prevAngles);
      seeded.set(prevFocusId, vacated);
    }
  }

  const layout = buildLayout(layoutGraph.value, {
    width: props.width,
    height: props.height,
    narratorSide: props.narratorSide,
    focusId: props.focusId,
    prevAngles: seeded,
  });
  render(el, layout);
  prevAngles = layout.angles;
  prevFocusId = props.focusId;
});

onBeforeUnmount(() => stopHandle?.());
</script>

<template>
  <svg
    ref="svgEl"
    :style="{ position: 'absolute', inset: 0 }"
  />
</template>
