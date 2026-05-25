<script setup lang="ts">
import type { Palette } from '../palette';

defineProps<{
  palette: Palette;
  fontMono: string;
  fontProse: string;
}>();
</script>

<template>
  <header style="display: flex; flex-direction: column; gap: 8px">
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
      <span :style="{ color: palette.fg }">https://alice.solid/pod/concepts#GameTheory</span>
      <span
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
      >Game Theory</h1>
      <div style="flex: 1" />
      <div
        :style="{
          display: 'flex',
          gap: '6px',
          fontFamily: fontMono,
          fontSize: '11px',
          color: palette.fg,
        }"
      >
        <span
          :style="{
            padding: '3px 8px',
            borderRadius: '3px',
            background: `${palette.kindConcept}1a`,
            color: palette.kindConcept,
            fontWeight: 600,
          }"
        >skos:Concept</span>
        <span
          :style="{
            padding: '3px 8px',
            borderRadius: '3px',
            background: `${palette.sepia}1a`,
            color: palette.sepia,
            fontWeight: 600,
          }"
        >aleph:ImportantConcept</span>
      </div>
    </div>

    <div
      :style="{
        fontFamily: fontProse,
        fontSize: '15px',
        lineHeight: 1.55,
        color: palette.mute,
        maxWidth: '640px',
      }"
    >
      The mathematical study of strategic interaction among rational agents.
      <span style="opacity: .55">  ·  "Theory of games"@en</span>
    </div>

    <div
      :style="{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontFamily: fontMono,
        fontSize: '10px',
        color: palette.mute,
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
        <div :style="{ width: '95%', height: '100%', background: palette.sepia }" />
      </div>
      <span :style="{ color: palette.fg }">0.95</span>
      <span style="opacity: .4">·</span>
      <span>14 backlinks</span>
      <span style="opacity: .4">·</span>
      <span>session 042</span>
      <span style="opacity: .4">·</span>
      <span>edited 12 Apr 2026 14:23 UTC</span>
    </div>
  </header>
</template>
