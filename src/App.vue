<script setup lang="ts">
import AlephApp from './components/AlephApp.vue';
</script>

<template>
  <div class="viewport">
    <AlephApp initial-mode="point" />
  </div>
</template>

<style scoped>
.viewport {
  width: 100vw;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: #d8d4cc;
  padding: 24px;
}
</style>
