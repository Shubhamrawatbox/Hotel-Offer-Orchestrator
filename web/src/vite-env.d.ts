interface ImportMetaEnv {
  /** Base URL of the Temporal Web UI, used for "View workflow" links. */
  readonly VITE_TEMPORAL_UI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
