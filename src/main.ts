import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { initStore } from './lib/rdf';
import { isConfigured } from './lib/pod-config';

// Skip pod load until the user has chosen a Pod URL. App.vue renders the
// setup screen in that state.
if (isConfigured()) {
  await initStore();
}
createApp(App).mount('#app');
