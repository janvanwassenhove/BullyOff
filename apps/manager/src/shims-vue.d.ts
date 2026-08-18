// Lets typescript-eslint's project service (plain tsc, not vue-tsc) resolve
// `.vue` imports from .ts files. vue-tsc ignores this and uses real SFC types.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
