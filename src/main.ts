import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { initStore } from './lib/rdf';

await initStore();
createApp(App).mount('#app');
