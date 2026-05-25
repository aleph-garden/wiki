<script setup lang="ts">
import { computed } from 'vue';
import type { Palette } from '../palette';
import { FONT_MONO as MONO, FONT_SERIF as SERIF } from '../palette';
import { loadDemoGraph } from '../lib/ttl';

const props = defineProps<{
  palette: Palette;
  dense: boolean;
  side: 'left' | 'right';
}>();

const positionStyle = computed(() =>
  props.side === 'left' ? { left: '80px' } : { right: '24px' }
);

const graph = loadDemoGraph();
const recent = graph.chat.slice(-4);
</script>

<template>
  <aside
    :style="{
      position: 'absolute',
      top: '70px',
      bottom: '50px',
      width: '300px',
      ...positionStyle,
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      zIndex: 4,
      color: palette.fg,
      padding: '18px',
      background: `linear-gradient(180deg, ${palette.bg}f0, ${palette.bg}d8 80%, ${palette.bg}00)`,
      backdropFilter: 'blur(10px)',
      borderRadius: '6px',
      border: `1px solid ${palette.rule}`,
    }"
  >
    <div
      :style="{
        fontSize: '10px',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        color: palette.mute,
        fontFamily: MONO,
        display: 'flex',
        justifyContent: 'space-between',
      }"
    >
      <span>The Narrator</span>
      <span :style="{ color: palette.halo }">● listening</span>
    </div>

    <div
      :style="{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: dense ? '12px' : '16px',
        overflow: 'hidden',
      }"
    >
      <div
        v-for="(m, i) in recent"
        :key="i"
        :style="{
          borderLeft: `1px solid ${m.speaker === 'user' ? palette.halo : palette.rule}`,
          paddingLeft: '12px',
        }"
      >
        <div
          :style="{
            fontSize: '9px',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            color: m.speaker === 'user' ? palette.halo : palette.mute,
            fontFamily: MONO,
            marginBottom: '4px',
          }"
        >
          {{ m.speaker === 'user' ? 'you' : 'narrator' }}
          <span v-if="m.hint" style="margin-left: 8px; opacity: 0.6">· {{ m.hint }}</span>
        </div>
        <div
          :style="{
            fontSize: '14px',
            lineHeight: 1.5,
            color: palette.fg,
            fontFamily: SERIF,
            fontStyle: m.speaker === 'user' ? 'normal' : 'italic',
            opacity: m.speaker === 'user' ? 0.95 : 0.85,
          }"
        >{{ m.body }}</div>
      </div>
    </div>
  </aside>
</template>
