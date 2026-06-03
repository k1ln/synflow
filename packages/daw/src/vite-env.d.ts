/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the synflow editor used for "Edit in Synflow" (default http://localhost:5173). */
  readonly VITE_SYNFLOW_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Flow-library JSON files are imported via import.meta.glob.
declare module '*.json' {
  const value: any;
  export default value;
}
