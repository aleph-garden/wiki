import type { DemoGraph, GraphNode, NodeKind } from './ttl';

export interface LayoutOpts {
  width: number;
  height: number;
  narratorSide?: 'left' | 'right';
  focusId: string;          // central node id
}

export interface Placed {
  node: GraphNode;
  angle: number;
  radius: number;
}

export interface RenderedNode {
  node: GraphNode;
  x: number; y: number; r: number;
  kind: NodeKind;
  predicate: string;        // pretty predicate to focus
  inSession: boolean;
  onPath: boolean;
  dim: boolean;
  tx: number; ty: number;
  anchor: 'start' | 'end';
  lineX1: number; lineX2: number;
}

export interface Star { x: number; y: number; r: number; op: number; }

export interface Layout {
  width: number; height: number;
  cx: number; cy: number;
  scale: number;
  stars: Star[];
  orbits: { r: number; dash: string; stroke: number }[];
  orbitLabels: { r: number; label: string; angle: number; tx: number; ty: number }[];
  trail: { label: string; angle: number; x: number; y: number; opacity: number }[];
  trailPath: string;
  spokes: { id: string; x2: number; y2: number }[];
  nodes: RenderedNode[];
  reasoningD: string;
  reasoningLabels: { from: string; to: string; label: string; cite?: string; mx: number; my: number }[];
  pathNoteAnchors: { atConcept: string; text: string; ox: number; oy: number; step: number }[];
  core: {
    haloR: number; ring1R: number; ring2R: number;
    hotR: number; hotHaloR: number;
    glyphSize: number; glyphYOff: number;
    nameSize: number; nameYOff: number; metaYOff: number;
  };
  focusNode: GraphNode | undefined;
}

const TRAIL_ANGLES = [Math.PI * 0.65, Math.PI * 0.78, Math.PI * 0.92];

export function buildLayout(graph: DemoGraph, opts: LayoutOpts): Layout {
  const { width, height, narratorSide, focusId } = opts;
  const cx = width / 2;
  const cy = height * 0.46;
  const scale = Math.max(0.55, Math.min(1.4, Math.min(width / 1384, height / 828)));

  // ── starfield (deterministic) ───────────────────────────
  const stars: Star[] = [];
  let s = 7;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const starCount = Math.round(220 * Math.max(0.4, (width * height) / (1384 * 828)));
  for (let i = 0; i < starCount; i++) {
    stars.push({ x: rng() * width, y: rng() * height, r: rng() * 1.2 + 0.2, op: rng() * 0.6 + 0.1 });
  }

  const orbits = [
    { r: 150 * scale, dash: '2 6', stroke: 0.7 },
    { r: 250 * scale, dash: '2 6', stroke: 0.7 },
    { r: 350 * scale, dash: '1 8', stroke: 0.5 },
  ];

  const orbitLabelDefs = [
    { r: orbits[0].r, label: '— specialisations —', angle: -Math.PI / 2 - 0.18 },
    { r: orbits[1].r, label: '— direct relations —', angle: -Math.PI / 2 - 0.15 },
    { r: orbits[2].r, label: '— two steps out —',   angle: -Math.PI / 2 - 0.12 },
  ];
  const orbitLabels = orbitLabelDefs.map((d) => ({
    ...d,
    tx: cx + Math.cos(d.angle) * d.r,
    ty: cy + Math.sin(d.angle) * d.r,
  }));

  // ── classify nodes into rings relative to focus ────────
  const inner = graph.edges
    .filter((e) => e.predicate === 'skos:broader' && e.o === focusId)
    .map((e) => e.s);
  const innerSet = new Set(inner);
  const directSet = new Set<string>();
  graph.edges.forEach((e) => {
    if (e.s === focusId) directSet.add(e.o);
    if (e.o === focusId) directSet.add(e.s);
  });
  const middle = [...directSet].filter((id) => !innerSet.has(id));
  const middleSet = new Set(middle);
  const outer = graph.nodes
    .filter((n) => n.id !== focusId && !directSet.has(n.id) && !innerSet.has(n.id))
    .map((n) => n.id);

  const placed: Placed[] = [];
  const distribute = (ids: string[], radius: number, startAngle: number) => {
    ids.forEach((id, i) => {
      const angle = startAngle + (i / Math.max(ids.length, 1)) * Math.PI * 2;
      const node = graph.nodes.find((x) => x.id === id);
      if (node) placed.push({ node, angle, radius });
    });
  };
  distribute(inner,  orbits[0].r, -Math.PI / 2);
  distribute(middle, orbits[1].r, -Math.PI / 2 + 0.6);
  distribute(outer,  orbits[2].r, -Math.PI / 2 - 0.4);

  void middleSet;

  // ── label flip vs narrator pad ─────────────────────────
  const narratorPad = 340;
  const labelLeft = narratorSide === 'left' ? narratorPad : 80;
  const labelRight = narratorSide === 'right' ? width - narratorPad : width - 80;

  const onPathSet = new Set(graph.view.path);
  const inSessionSet = new Set(
    graph.nodes.filter((n) => n.generatedBy === graph.activeSession).map((n) => n.id),
  );

  const spokePred = (id: string): string => {
    const e = graph.edges.find(
      (x) => (x.s === focusId && x.o === id) || (x.o === focusId && x.s === id),
    );
    return e ? e.pretty : '';
  };

  const place = (id: string): [number, number] => {
    if (id === focusId) return [cx, cy];
    const p = placed.find((n) => n.node.id === id);
    return p ? [cx + Math.cos(p.angle) * p.radius, cy + Math.sin(p.angle) * p.radius] : [cx, cy];
  };

  const renderedNodes: RenderedNode[] = placed.map((p) => {
    const x = cx + Math.cos(p.angle) * p.radius;
    const y = cy + Math.sin(p.angle) * p.radius;
    const r = 2.5 + p.node.importance * 5;
    const onPath = onPathSet.has(p.node.id);
    const inSession = inSessionSet.has(p.node.id);
    const dim = !onPath;

    const offset = r + 10;
    const labelDirX = Math.cos(p.angle);
    const labelDirY = Math.sin(p.angle);
    const outwardX = x + labelDirX * offset;
    const halfW = Math.min(90, 4 + p.node.label.length * 5);
    let onRight = labelDirX > 0;
    if (onRight && outwardX + halfW > labelRight) onRight = false;
    if (!onRight && outwardX - halfW < labelLeft) onRight = true;
    const dirX = onRight ? (Math.abs(labelDirX) || 0.3) : -(Math.abs(labelDirX) || 0.3);
    const tx = x + dirX * offset;
    const ty = y + labelDirY * offset;

    return {
      node: p.node,
      x, y, r,
      kind: p.node.kind,
      predicate: spokePred(p.node.id),
      inSession,
      onPath,
      dim,
      tx, ty,
      anchor: onRight ? 'start' : 'end',
      lineX1: x + (onRight ? r : -r),
      lineX2: tx - (onRight ? 4 : -4),
    };
  });

  // ── reasoning path ──
  let reasoningD = '';
  if (graph.view.path.length >= 2) {
    const pts = graph.view.path.map(place);
    reasoningD = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const off = 14;
      const cxp = mx - (dy / len) * off;
      const cyp = my + (dx / len) * off;
      reasoningD += ` Q ${cxp} ${cyp} ${x2} ${y2}`;
    }
  }

  const reasoningLabels = graph.view.edgeNotes.map((e) => {
    const [x1, y1] = place(e.from);
    const [x2, y2] = place(e.to);
    return {
      from: e.from,
      to: e.to,
      label: e.label,
      cite: e.cite,
      mx: (x1 + x2) / 2,
      my: (y1 + y2) / 2,
    };
  });

  const pathNoteAnchors = graph.view.pathNotes
    .map((note, i) => {
      const p = placed.find((n) => n.node.id === note.atConcept);
      if (!p) return null;
      const x = cx + Math.cos(p.angle) * p.radius;
      const y = cy + Math.sin(p.angle) * p.radius;
      const ox = x + Math.cos(p.angle) * 60;
      const oy = y + Math.sin(p.angle) * 60;
      return { atConcept: note.atConcept, text: note.text, ox, oy, step: i + 2 };
    })
    .filter(Boolean) as Layout['pathNoteAnchors'];

  const trailR = 440 * scale;
  const trailInnerR = 350 * scale;
  const trailLabels = graph.view.trail.length === 3 ? graph.view.trail : ['Strategy & Games', 'Mathematics', 'Logic'];
  const trail = trailLabels.map((label, i) => {
    const angle = TRAIL_ANGLES[i];
    return {
      label,
      angle,
      x: cx + Math.cos(angle) * trailR,
      y: cy + Math.sin(angle) * trailR,
      opacity: 0.2 + (i / trailLabels.length) * 0.3,
    };
  });
  const trailPath = trail.length >= 2
    ? `M ${cx + Math.cos(trail[0].angle) * trailInnerR} ${cy + Math.sin(trail[0].angle) * trailInnerR}
       Q ${cx + Math.cos(trail[1].angle) * trailR} ${cy + Math.sin(trail[1].angle) * trailR}
       ${cx + Math.cos(trail[trail.length - 1].angle) * trailR} ${cy + Math.sin(trail[trail.length - 1].angle) * trailR}`
    : '';

  const spokes = placed.map((p) => ({
    id: p.node.id,
    x2: cx + Math.cos(p.angle) * p.radius,
    y2: cy + Math.sin(p.angle) * p.radius,
  }));

  const core = {
    haloR:     240 * scale,
    ring1R:     78 * scale,
    ring2R:     60 * scale,
    hotR:      3.4 * scale,
    hotHaloR:   12 * scale,
    glyphSize: 180 * scale,
    glyphYOff:  56 * scale,
    nameSize:   22 * scale,
    nameYOff:   96 * scale,
    metaYOff:  116 * scale,
  };

  return {
    width, height,
    cx, cy, scale,
    stars, orbits, orbitLabels,
    trail, trailPath,
    spokes,
    nodes: renderedNodes,
    reasoningD, reasoningLabels,
    pathNoteAnchors,
    core,
    focusNode: graph.nodes.find((n) => n.id === focusId),
  };
}
