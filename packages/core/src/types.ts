// Core graph types — replaces the engine's former dependency on @xyflow/react.
// Intentionally permissive (index signatures) so a host's richer node/edge
// objects (e.g. @xyflow/react Node/Edge) are structurally assignable.

export interface SynNode {
  id: string;
  type?: string;
  data?: any;
  parentNode?: SynNode | null;
  [key: string]: any;
}

export interface SynEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [key: string]: any;
}
