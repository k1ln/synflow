/// <reference types="vite/client" />

// Flow-library JSON files are imported via import.meta.glob.
declare module '*.json' {
  const value: any;
  export default value;
}
