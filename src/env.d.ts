/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '*.ttl?raw' {
  const content: string;
  export default content;
}

declare module '*.jsonld?raw' {
  const content: string;
  export default content;
}

declare module 'jsonld' {
  const m: any;
  export default m;
}
