<script setup lang="ts">
import { ref, computed } from 'vue';
import { podBase, normalisePodBase, setPodBase, clearPodBase } from '../lib/pod-config';
import type { Palette } from '../palette';
import { FONT_UI, FONT_MONO } from '../palette';

const props = defineProps<{
  palette: Palette;
  firstRun?: boolean;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const input = ref<string>(podBase.value ?? 'http://localhost:3000');
const error = ref<string | null>(null);

const previewUrl = computed(() => {
  try {
    return normalisePodBase(input.value);
  } catch {
    return null;
  }
});

function submit() {
  error.value = null;
  try {
    setPodBase(input.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Invalid URL';
  }
}

function reset() {
  if (confirm('Forget the configured Pod URL? The setup screen will appear on next load.')) {
    clearPodBase();
  }
}

function cancel() {
  if (!props.firstRun) emit('close');
}
</script>

<template>
  <div
    :style="{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.55)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      fontFamily: FONT_UI,
    }"
    @click.self="cancel"
  >
    <div
      :style="{
        width: 'min(520px, 92vw)',
        background: palette.panel,
        color: palette.fg,
        border: `1px solid ${palette.rule}`,
        borderRadius: '6px',
        padding: '24px 28px',
        boxShadow: '0 16px 48px rgba(0,0,0,.4)',
      }"
    >
      <h2
        :style="{
          margin: '0 0 4px',
          fontSize: '17px',
          fontWeight: 600,
          letterSpacing: '-0.2px',
        }"
      >{{ firstRun ? 'Connect a Pod' : 'Pod settings' }}</h2>
      <p
        :style="{
          margin: '0 0 18px',
          fontSize: '12.5px',
          color: palette.mute,
          lineHeight: 1.5,
        }"
      >
        Enter the base URL of your Solid Pod (JSS, CSS, NSS).
        Local pods on <code :style="{ fontFamily: FONT_MONO }">localhost</code>
        work from any origin without TLS.
      </p>

      <label
        :style="{
          display: 'block',
          fontSize: '10.5px',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: palette.mute,
          marginBottom: '6px',
        }"
      >Pod base URL</label>
      <input
        v-model="input"
        type="url"
        placeholder="http://localhost:3000"
        spellcheck="false"
        autocomplete="off"
        @keydown.enter="submit"
        :style="{
          width: '100%',
          padding: '9px 12px',
          background: palette.soft,
          color: palette.fg,
          border: `1px solid ${palette.rule}`,
          borderRadius: '4px',
          fontFamily: FONT_MONO,
          fontSize: '13px',
          boxSizing: 'border-box',
        }"
      />

      <div
        v-if="previewUrl && previewUrl !== input.trim()"
        :style="{
          marginTop: '6px',
          fontSize: '11px',
          color: palette.mute,
          fontFamily: FONT_MONO,
        }"
      >→ {{ previewUrl }}</div>

      <div
        v-if="error"
        :style="{
          marginTop: '10px',
          padding: '8px 10px',
          background: palette.warn + '22',
          color: palette.warn,
          borderRadius: '3px',
          fontSize: '12px',
          fontFamily: FONT_MONO,
        }"
      >{{ error }}</div>

      <div
        :style="{
          marginTop: '22px',
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }"
      >
        <button
          v-if="!firstRun && podBase"
          @click="reset"
          :style="{
            marginRight: 'auto',
            background: 'transparent',
            color: palette.mute,
            border: 'none',
            padding: '6px 0',
            font: 'inherit',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }"
        >Forget</button>

        <button
          v-if="!firstRun"
          @click="cancel"
          :style="{
            background: 'transparent',
            color: palette.fg,
            border: `1px solid ${palette.rule}`,
            padding: '8px 14px',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
          }"
        >Cancel</button>

        <button
          @click="submit"
          :style="{
            background: palette.fg,
            color: palette.bg,
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }"
        >Save &amp; reload</button>
      </div>

      <p
        v-if="firstRun"
        :style="{
          margin: '18px 0 0',
          fontSize: '11px',
          color: palette.mute,
          lineHeight: 1.5,
        }"
      >
        Stored in <code :style="{ fontFamily: FONT_MONO }">localStorage</code> on this device only.
        Authentication (WebID-OIDC) is not implemented yet — the pod must allow unauthenticated reads.
      </p>
    </div>
  </div>
</template>
