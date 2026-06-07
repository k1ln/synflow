// The flow library: instruments and effects loaded from the editable JSON files
// under packages/daw/flows/. These flows ARE the source of truth — they run on
// @synflow/core and can be opened/edited in the synflow editor (see editorBridge).
import type { Flow } from './instruments';

export interface LibraryEntry {
  id: string;
  name: string;
  category: string;
  kind?: 'step' | 'piano';
  group: 'instrument' | 'effect';
  flow: Flow;
}

// Eagerly bundle every flow file in packages/daw/flows/**.
const files = import.meta.glob('../../flows/**/*.json', { eager: true }) as Record<string, { default: any } | any>;

function build(): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  for (const [path, mod] of Object.entries(files)) {
    if (path.endsWith('/index.json')) continue;
    const data = (mod as any).default ?? mod;
    const group: 'instrument' | 'effect' = path.includes('/effects/') ? 'effect' : 'instrument';
    // Fall back to the source filename so flows lacking daw/name metadata still get a
    // stable id + name (otherwise they seed to disk as "undefined.json" and never load).
    const base = path.split('/').pop()!.replace(/\.json$/i, '');
    out.push({
      id: data.daw?.id ?? data.name ?? base,
      name: data.name ?? base,
      category: data.daw?.category ?? (group === 'effect' ? 'Effects' : 'Instruments'),
      kind: data.daw?.kind,
      group,
      flow: { nodes: data.nodes, edges: data.edges },
    });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export const LIBRARY: LibraryEntry[] = build();
export const INSTRUMENTS = LIBRARY.filter((e) => e.group === 'instrument');
export const EFFECTS = LIBRARY.filter((e) => e.group === 'effect');

// The live catalog (bundled + on-disk + user-created), kept in sync by the app so
// findEntry can resolve flows/names that aren't in the static bundle (folder-loaded
// effects, brand-new effects made in Synflow). See registerEntries in app.tsx.
const dynamic = new Map<string, LibraryEntry>();
export function registerEntries(entries: LibraryEntry[]): void {
  dynamic.clear();
  for (const e of entries) dynamic.set(e.id, e);
}

export function findEntry(id: string): LibraryEntry | undefined {
  return dynamic.get(id) ?? LIBRARY.find((e) => e.id === id);
}

/** Deep-clone a library flow so each track instance is independently editable. */
export function cloneFlow(flow: Flow): Flow { return JSON.parse(JSON.stringify(flow)); }
