<script setup lang="ts">
import type { Palette } from '../palette';
import ConceptHeader from './ConceptHeader.vue';

defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  fontProse: string;
  width: number;
  dense: boolean;
}>();

const turtle = `@prefix     :  <https://alice.solid/pod/concepts#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix aleph: <https://aleph.wiki/ontology#> .

:GameTheory
    a                 skos:Concept, aleph:ImportantConcept ;
    skos:prefLabel    "Game Theory"@en ;
    skos:altLabel     "Theory of games"@en ;
    skos:definition   "The mathematical study of strategic
                       interaction among rational agents."@en ;
    aleph:perceivedImportance  0.95 ;
    aleph:derivedFrom  :JohnVonNeumann ;
    aleph:requires     :Rationality ;
    skos:related       :InformationTheory ;
    prov:wasGeneratedBy :Session_042 ;
    prov:generatedAtTime "2026-04-12T14:23:01Z"^^xsd:dateTime .

:NashEquilibrium
    a                 skos:Concept ;
    skos:broader      :GameTheory ;
    prov:wasAttributedTo :JohnNash .

:PrisonersDilemma
    a                 skos:Concept ;
    skos:broader      :GameTheory ;
    skos:related      :Cooperation .

:ColdWar
    a                 schema:Event ;
    aleph:exemplifies :GameTheory .`;
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
        }"
      >
        <span>index.ttl — Turtle 1.1</span>
        <span>5.2 kb · 11 triples</span>
      </div>
      <pre
        :style="{
          margin: 0,
          padding: '14px 20px',
          flex: 1,
          fontFamily: fontMono,
          fontSize: '12.5px',
          lineHeight: 1.6,
          color: palette.fg,
          overflow: 'auto',
        }"
      >{{ turtle }}</pre>
    </div>
  </section>
</template>
