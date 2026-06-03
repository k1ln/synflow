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
    out.push({
      id: data.daw?.id ?? data.name,
      name: data.name,
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

export function findEntry(id: string): LibraryEntry | undefined { return LIBRARY.find((e) => e.id === id); }

/** Deep-clone a library flow so each track instance is independently editable. */
export function cloneFlow(flow: Flow): Flow { return JSON.parse(JSON.stringify(flow)); }
