// Public API of the util module — see src/host/index.ts for the pattern.
// NodeDropdown.tsx and OpenDialog.tsx used to live here as "internal, not
// consumed outside this module yet" — but had zero consumers anywhere, not
// even internally, so they've been deleted rather than kept around unused.
//
// pitchDetection.ts is deliberately NOT re-exported: SampleFlowNode.tsx is
// its only consumer and dynamically `import()`s it for `detectPitch` to keep
// essentia.js out of the main bundle — barrel-exporting it would pull it into
// every static consumer of this module and defeat that. It's an entry-point
// exception (see eslint.config.mjs section 8), imported directly.
export * from './FileSystemAudioStore';
export * from './SimpleIndexedDB';
export * from './CustomNumberInput';
export * from './onsetDetection';
