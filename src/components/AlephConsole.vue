<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Palette } from '../palette';
import ChatInput from './ChatInput.vue';
import type { Mode } from './types';
import {
  useAllNodes,
  useAllEdges,
  useSessions,
  useActiveSessionId,
  useChat,
} from '../lib/queries';
import { blessSession } from '../daemon/bless';
import { getPod, reloadContainer } from '../lib/rdf';
import { ensureRegistration } from '../lib/typeindex';

defineProps<{
  palette: Palette;
  fontUI: string;
  fontMono: string;
  width: number;
  dense: boolean;
  mode: Mode;
}>();

const allNodes = useAllNodes();
const allEdges = useAllEdges();
const allSessions = useSessions();
const activeSessionId = useActiveSessionId();
const chat = useChat();

const activeAgent = computed(() => {
  const id = activeSessionId.value;
  if (!id) return '—';
  return allSessions.value.find((x) => x.id === id)?.agent ?? '—';
});

// Edges already committed by the active session.
// Endpoint is considered "of the session" when its node was generatedBy this session.
interface Proposed { s: string; p: string; o: string; ok: 'committed' | 'pending' }
const proposed = computed<Proposed[]>(() => {
  const sid = activeSessionId.value;
  if (!sid) return [];
  const inSession = new Set(
    allNodes.value.filter((n) => n.generatedBy === sid).map((n) => n.id),
  );
  return allEdges.value
    .filter((e) => inSession.has(e.s) || inSession.has(e.o))
    .slice(0, 3)
    .map((e) => ({ s: `:${e.s}`, p: e.predicate, o: `:${e.o}`, ok: 'committed' as const }));
});

function formatTime(iso?: string): string {
  if (!iso) return '';
  const t = iso.slice(11, 16);
  return t || '';
}

const blessing = ref(false);
const blessResult = ref<string | null>(null);

async function bless() {
  const sid = activeSessionId.value;
  if (!sid || blessing.value) return;
  blessing.value = true;
  blessResult.value = null;
  try {
    const pod = getPod();
    await ensureRegistration(pod, 'https://vocab.aleph.wiki/Concept', '/g/');
    const { promoted } = await blessSession(pod, sid);
    await reloadContainer('/g/');
    blessResult.value = `Blessed — ${promoted.length} concept(s) promoted`;
  } catch (e) {
    blessResult.value = `Bless failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    blessing.value = false;
  }
}
</script>

<template>
  <aside
    :style="{
      width: width + 'px',
      borderLeft: `1px solid ${palette.rule}`,
      background: palette.panel,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }"
  >
    <!-- header -->
    <div
      :style="{
        padding: '12px 16px',
        borderBottom: `1px solid ${palette.rule}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: fontMono,
      }"
    >
      <div style="display: flex; align-items: center; gap: 8px">
        <span style="font-size: 11px; font-weight: 600">aleph › agent</span>
        <span
          :style="{
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '3px',
            background: `${palette.ok}1a`,
            color: palette.ok,
            letterSpacing: '1.2px',
          }"
        >WRITING</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px">
        <button
          v-if="activeSessionId"
          class="bless-btn"
          :disabled="blessing"
          @click="bless"
        >{{ blessing ? 'Blessing…' : 'Bless session' }}</button>
        <span v-if="blessResult" class="bless-result">{{ blessResult }}</span>
        <span :style="{ fontSize: '10px', color: palette.mute }">{{ activeAgent }}</span>
      </div>
    </div>

    <!-- chat -->
    <div
      :style="{
        flex: 1,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: dense ? '12px' : '16px',
        overflow: 'hidden',
        fontFamily: fontUI,
      }"
    >
      <div v-for="m in chat" :key="m.id">
        <div
          :style="{
            fontFamily: fontMono,
            fontSize: '9.5px',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            color: m.speaker === 'user' ? palette.sepia : palette.accent,
            marginBottom: '4px',
            display: 'flex',
            justifyContent: 'space-between',
          }"
        >
          <span>{{ m.speaker === 'user' ? 'you' : 'agent' }}{{ m.hint ? ` · ${m.hint}` : '' }}</span>
          <span :style="{ color: palette.mute, letterSpacing: 0 }">{{ formatTime(m.generatedAt) }}</span>
        </div>
        <div
          :style="{
            fontSize: '13px',
            lineHeight: 1.5,
            background: m.speaker === 'user' ? 'transparent' : palette.soft,
            padding: m.speaker === 'user' ? 0 : '8px 10px',
            borderLeft: m.speaker === 'user' ? 'none' : `2px solid ${palette.accent}`,
            borderRadius: m.speaker === 'user' ? 0 : '2px',
            color: palette.fg,
          }"
        >{{ m.body }}</div>
      </div>

      <!-- proposed triples -->
      <div
        :style="{
          borderTop: `1px dashed ${palette.rule}`,
          paddingTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }"
      >
        <div
          :style="{
            fontFamily: fontMono,
            fontSize: '9.5px',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            color: palette.gold,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }"
        >
          <span>committed in {{ (activeSessionId ?? '').toLowerCase() }}</span>
          <span :style="{ flex: 1, height: '1px', background: `${palette.gold}40` }" />
        </div>
        <div
          v-for="(p, i) in proposed"
          :key="i"
          :style="{
            background: palette.bg,
            border: `1px solid ${palette.rule}`,
            borderRadius: '3px',
            padding: '8px',
            fontFamily: fontMono,
            fontSize: '11.5px',
            lineHeight: 1.55,
          }"
        >
          <div>
            <span :style="{ color: palette.sepia }">{{ p.s }}</span>
            <span :style="{ color: palette.accent, margin: '0 6px' }">{{ p.p }}</span>
            <span :style="{ color: palette.sepia }">{{ p.o }}</span>
            <span :style="{ color: palette.fg }"> .</span>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 6px">
            <template v-if="p.ok === 'committed'">
              <span
                :style="{
                  fontSize: '9px',
                  color: palette.ok,
                  padding: '1px 6px',
                  background: `${palette.ok}1a`,
                  borderRadius: '3px',
                  letterSpacing: '1.2px',
                }"
              >COMMITTED</span>
            </template>
            <template v-else>
              <button
                :style="{
                  fontFamily: fontMono,
                  fontSize: '11px',
                  padding: '3px 8px',
                  background: palette.fg,
                  color: palette.bg,
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }"
              >accept</button>
              <button
                :style="{
                  fontFamily: fontMono,
                  fontSize: '11px',
                  padding: '3px 8px',
                  background: 'transparent',
                  color: palette.mute,
                  border: `1px solid ${palette.rule}`,
                  borderRadius: '3px',
                  cursor: 'pointer',
                }"
              >edit</button>
              <button
                :style="{
                  fontFamily: fontMono,
                  fontSize: '11px',
                  padding: '3px 8px',
                  background: 'transparent',
                  color: palette.warn,
                  border: 'none',
                  cursor: 'pointer',
                }"
              >reject</button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- input -->
    <div
      :style="{
        padding: '12px 16px',
        borderTop: `1px solid ${palette.rule}`,
      }"
    >
      <ChatInput
        :palette="palette"
        :font-mono="fontMono"
        :session-id="activeSessionId"
      />
    </div>
  </aside>
</template>

<style scoped>
.bless-btn {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid currentColor;
  background: transparent;
  cursor: pointer;
  letter-spacing: 0.5px;
  opacity: 0.8;
}
.bless-btn:disabled {
  cursor: default;
  opacity: 0.45;
}
.bless-result {
  font-size: 9.5px;
  opacity: 0.7;
}
</style>
