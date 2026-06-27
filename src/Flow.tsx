import { useRef, useCallback, useMemo, JSX, useState, use } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
} from '@xyflow/react';
import { Connection, Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './Flow.css';

import { Handle, Position } from '@xyflow/react';
import OscillatorFlowNode from './nodes/OscillatorFlowNode';
import AudioWorkletOscillatorFlowNode from './nodes/AudioWorkletOscillatorFlowNode';
import MasterOutFlowNode from './nodes/MasterOutFlowNode';
import NodePaletteDialog from './components/NodePaletteDialog';
import BiquadFilterFlowNode from './nodes/BiquadFilterFlowNode';
import DynamicCompressorFlowNode from './nodes/DynamicCompressorFlowNode';
import GainFlowNode from './nodes/GainFlowNode';
import DelayFlowNode from './nodes/DelayFlowNode';
import ReverbFlowNode from './nodes/ReverbFlowNode';
import IIRFilterFlowNode from './nodes/IIRFilterFlowNode';
import DistortionFlowNode from './nodes/DistortionFlowNode';
import AudioWorkletFlowNode from './nodes/AudioWorkletFlowNode';
import { useEffect } from 'react';
import { AudioGraphManager } from './sys/AudioGraphManager';
import { applyNodeChanges } from '@xyflow/react';
import ADSRFlowNode from './nodes/ADSRFlowNode';
import ButtonFlowNode from './nodes/ButtonFlowNode';
import MidiButtonFlowNode from './nodes/MidiButtonFlowNode';
import OnOffButtonFlowNode from './nodes/OnOffButtonFlowNode';
import EventBus from './sys/EventBus';
import ClockFlowNode from './nodes/ClockFlowNode';
import FrequencyFlowNode from './nodes/FrequencyFlowNode';
import ConstantFlowNode from './nodes/ConstantFlowNode';
import SwitchFlowNode from './nodes/SwitchFlowNode';
import BlockingSwitchFlowNode from './nodes/BlockingSwitchFlowNode';
import FunctionFlowNode from './nodes/FunctionFlowNode';
import SampleFlowNode from './nodes/SampleFlowNode';
import MidiFlowNote from './nodes/MidiFlowNote';
import { OpenDialog } from './util/OpenDialog';
import ExplorerDialog, { ExplorerFlowItem } from './components/ExplorerDialog';
import { v4 as uuidv4 } from 'uuid';
import { SimpleIndexedDB } from './util/SimpleIndexedDB';
import * as Dialog from '@radix-ui/react-dialog';
import OutputNode from './nodes/OutputNode';
import { measureMicLatency, autoMeasureLatency } from './utils/latencyTest';
import InputNode from './nodes/InputNode';
import FlowNode from './nodes/FlowNode';
import SignalRouterFlowNode from './nodes/SignalRouterFlowNode';
import EventManager from './sys/EventManager';
import SequencerFlowNode from './nodes/SequencerFlowNode';
import SequencerFrequencyFlowNode from './nodes/SequencerFrequencyFlowNode';
// File System Audio storage utilities
import {
  loadRootHandle as loadAudioRootHandle,
  verifyPermission,
  selectAndPrepareRoot,
  clearRootHandle,
  listAudioInSubdirectory,
  ListedAudioFile,
  saveFlowToDisk,
  deleteFlowFromDisk,
  FlowData,
  syncFlowsToDisk,
  syncDiskToDb,
  hasFsApi,
  getFileObjectURL,
  migrateIndexedDbRecordings,
  listAllSubdirectories,
  listFlowsOnDisk,
  loadFlowFromDisk,
} from './util/FileSystemAudioStore';
import ImpressumDialog from './components/ImpressumDialog';
import DatenschutzDialog from './components/DatenschutzDialog';
import TopBar from './components/TopBar';
import AutomationFlowNode from './nodes/AutomationFlowNode';
import MidiKnobFlowNode from './nodes/MidiKnobFlowNode';
import EventFlowNode from './nodes/EventFlowNode';
import './sys/exposeFlowSynth';
import MouseTriggerButton from './nodes/MouseTriggerButton';
import NoiseFlowNode from './nodes/NoiseFlowNode';
import LogFlowNode from './nodes/LogFlowNode';
import RecordingFlowNode from './nodes/RecordingFlowNode';
import MicFlowNode from './nodes/MicFlowNode';
import WebRTCInputFlowNode from './nodes/WebRTCInputFlowNode';
import WebRTCOutputFlowNode from './nodes/WebRTCOutputFlowNode';
import MiniPlayer from './components/MiniPlayer';
import AudioExplorer from './components/AudioExplorer';
import AnalyzerNodeGPT from './nodes/AnalyzerNodeGPT';
import OscilloscopeFlowNode from './nodes/OscilloscopeFlowNode';
import SpeedDividerFlowNode from './nodes/SpeedDividerFlowNode';
import AudioSignalFreqShifterFlowNode from './nodes/AudioSignalFreqShifterFlowNode';
import FlowEventFreqShifterFlowNode from './nodes/FlowEventFreqShifterFlowNode';
import EqualizerFlowNode from './nodes/EqualizerFlowNode';
import VocoderFlowNode from './nodes/VocoderFlowNode';
import MidiFileFlowNode from './nodes/MidiFileFlowNode';
import DocsPlayground from './components/DocsPlayground';

function makeDistortionCurve(amount: number) {
  const k = typeof amount === "number" ? amount : 50;
  const numSamples = 44100;
  const curve = new Float32Array(numSamples);
  const deg = Math.PI / 180;

  for (let i = 0; i < numSamples; i++) {
    const x = (i * 2) / numSamples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

let timeout = Date.now();

const initialNodes = [];

const nodeStyleObj = {
  padding: "5px",
  border: "1px solid #2a3139",
  borderRadius: "5px",
  textAlign: "center",
  background: "#1f1f1f",
  color: "#eee",
  // Subtle glow around nodes for dark theme
  boxShadow: "0 1px 3px rgba(0,0,0,0.45), 0 0 8px 2px rgba(0,255,136,0.08)",
};

// === Style helpers moved outside component to avoid recreation on every render ===
const DARK_NODE_BG = '#1f1f1f';

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
};

// Cache for computed glow values to avoid recalculating the same styles
const glowCache = new Map<string, string>();
const makeGlow = (hex: string, strength: 'normal' | 'strong' = 'normal'): string => {
  const cacheKey = `${hex}-${strength}`;
  const cached = glowCache.get(cacheKey);
  if (cached) return cached;
  
  const rgb = hexToRgb(hex) || { r: 0, g: 255, b: 136 };
  const baseShadow = '0 1px 3px rgba(0,0,0,0.45)';
  let result: string;
  if (strength === 'strong') {
    result = `${baseShadow}, 0 0 14px 3px rgba(${rgb.r},${rgb.g},${rgb.b},0.40)`;
  } else {
    result = `${baseShadow}, 0 0 8px 2px rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`;
  }
  glowCache.set(cacheKey, result);
  return result;
};

// Cache for edge glow filter values
const edgeGlowCache = new Map<string, string>();
const makeEdgeGlowFilter = (hex: string, strength: 'normal' | 'strong' = 'normal'): string => {
  const cacheKey = `${hex}-${strength}`;
  const cached = edgeGlowCache.get(cacheKey);
  if (cached) return cached;
  
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
  const a1 = strength === 'strong' ? 0.8 : 0.6;
  const a2 = strength === 'strong' ? 0.5 : 0.3;
  const result = `drop-shadow(0 0 2px rgba(${rgb.r},${rgb.g},${rgb.b},${a1})) drop-shadow(0 0 4px rgba(${rgb.r},${rgb.g},${rgb.b},${a2}))`;
  edgeGlowCache.set(cacheKey, result);
  return result;
};

function normalizeNodeStylesForTheme(arr: any[] | undefined): any[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((n) => {
    const data = n?.data || {};
    const style = { ...(data.style || {}) } as any;
    if (!style.background || style.background === '#333' || style.background === '#222') {
      style.background = DARK_NODE_BG;
    }
    // Ensure a consistent border and subtle glow for legacy nodes
    if (!style.border) style.border = '1px solid #2a3139';
    if (!style.borderRadius) style.borderRadius = '5px';
    if (!style.glowColor) style.glowColor = '#00ff88';
    if (!style.boxShadow) style.boxShadow = makeGlow(style.glowColor, 'normal');
    if (!style.color) style.color = '#eeeeee';
    return { ...n, data: { ...data, style } };
  });
}

const nodeTypes = {
  MasterOutFlowNode: MasterOutFlowNode,
  OscillatorFlowNode: OscillatorFlowNode,
  AudioWorkletOscillatorFlowNode: AudioWorkletOscillatorFlowNode,
  FlowNode: FlowNode,
  BiquadFilterFlowNode: BiquadFilterFlowNode,
  DynamicCompressorFlowNode: DynamicCompressorFlowNode,
  GainFlowNode: GainFlowNode,
  DelayFlowNode: DelayFlowNode,
  ReverbFlowNode: ReverbFlowNode,
  DistortionFlowNode: DistortionFlowNode,
  AudioWorkletFlowNode: AudioWorkletFlowNode,
  IIRFilterFlowNode: IIRFilterFlowNode,
  ADSRFlowNode: ADSRFlowNode,
  ButtonFlowNode: ButtonFlowNode,
  MidiButtonFlowNode: MidiButtonFlowNode,
  OnOffButtonFlowNode: OnOffButtonFlowNode,
  ClockFlowNode: ClockFlowNode,
  FrequencyFlowNode: FrequencyFlowNode,
  ConstantFlowNode: ConstantFlowNode,
  SwitchFlowNode: SwitchFlowNode,
  BlockingSwitchFlowNode: BlockingSwitchFlowNode,
  FunctionFlowNode: FunctionFlowNode,
  InputNode: InputNode,
  OutputNode: OutputNode,
  //SignalRouterFlowNode: SignalRouterFlowNode,
  SampleFlowNode: SampleFlowNode,
  MidiFlowNote: MidiFlowNote,
  SequencerFlowNode: SequencerFlowNode,
  SequencerFrequencyFlowNode: SequencerFrequencyFlowNode,
  AutomationFlowNode: AutomationFlowNode,
  AnalyzerNodeGPT: AnalyzerNodeGPT,
  OscilloscopeFlowNode: OscilloscopeFlowNode,
  LogFlowNode: LogFlowNode,
  MidiKnobFlowNode: MidiKnobFlowNode,
  EventFlowNode: EventFlowNode,
  MouseTriggerButton: MouseTriggerButton,
  NoiseFlowNode: NoiseFlowNode,
  MicFlowNode: MicFlowNode,
  RecordingFlowNode: RecordingFlowNode,
  SpeedDividerFlowNode: SpeedDividerFlowNode,
  AudioSignalFreqShifterFlowNode: AudioSignalFreqShifterFlowNode,
  FlowEventFreqShifterFlowNode: FlowEventFreqShifterFlowNode,
  EqualizerFlowNode: EqualizerFlowNode,
  VocoderFlowNode: VocoderFlowNode,
  MidiFileFlowNode: MidiFileFlowNode,
};
const orderedNodeTypes = Object.fromEntries(
  Object.entries(nodeTypes).sort(([a], [b]) => a.localeCompare(b))
);





const currentFlow = sessionStorage.getItem('currentFlow');

let ctx: AudioContext;

// Feature flag to control debounced auto-save behavior for flows/components.
// Set to false to fully disable automatic saving on node/edge changes.
// Manual saves via Ctrl+S / Cmd+S or explicit save buttons still work.
const AUTO_SAVE_ENABLED = false;

function Flow() {
  /**
   * Manages the current instance of the AudioGraphManager or remains undefined if not initialized.
   * 
   * @remarks
   * This variable is not persistent across renders or component lifecycles. 
   * If declared inside a function component, it will be re-initialized on each render.
   * To persist the manager across renders, consider using React state or refs.
   */
  // Persist AudioGraphManager instance across renders using a ref
  const managerRef = useRef<AudioGraphManager | undefined>(undefined);
  let manager = managerRef.current;
  const reactFlow = useReactFlow();
  const eventBus = EventBus.getInstance();
  // Local flow storage (IndexedDB)
  // Note: this is required for existing flow CRUD and sync logic.
  // If you want disk-only, we can replace these call sites.
  const dbRef = useRef<SimpleIndexedDB>(
    new SimpleIndexedDB('FlowSynthDB', 'flows')
  );
  const db = dbRef.current;

  useEffect(() => {
    dbRef.current.open().catch((error) => {
      console.error('Error opening IndexedDB:', error);
    });
  }, []);

  // Open dbNode synchronously in useEffect
  useEffect(() => {
    // Expose minimal external trigger API
    (window as any).flowSynth = (window as any).flowSynth || {};
    (window as any).flowSynth.emit = (eventName: string, payload?: any) => {
      try { eventBus.emit(eventName, payload); } catch { /* noop */ }
    };
    (window as any).flowSynth.listEvents = () => {
      try { return eventBus.listEvents(); } catch { return []; }
    };
    (window as any).flowSynth.on = (eventName: string, cb: (d: any) => void) => {
      try { eventBus.subscribe(eventName, cb); return () => eventBus.unsubscribe(eventName, cb); } catch { return () => { }; }
    };
    (window as any).flowSynth.off = (eventName: string, cb: (d: any) => void) => {
      try { eventBus.unsubscribe(eventName, cb); } catch { /* noop */ }
    };
  }, [eventBus]);

  // Ensure all flow handles have a helpful title on hover.
  useEffect(() => {
    const setHandleTitle = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.title) return;
      const idAttr = el.getAttribute('data-handle-id') || el.getAttribute('data-handleid') || el.getAttribute('data-id') || el.getAttribute('id') || el.getAttribute('data-handle') || (el as any).dataset?.handle;
      const typeAttr = el.getAttribute('data-handle-type') || el.getAttribute('data-type') || (el as any).dataset?.handletype;
      const title = idAttr ? idAttr : (typeAttr ? typeAttr : 'handle');
      el.title = title;
    };

    const processExisting = () => {
      document.querySelectorAll('.react-flow__handle, .xyflow-handle, .react-flow__handle--target, .react-flow__handle--source').forEach(setHandleTitle);
    };

    processExisting();
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof Element) {
            if (node.matches && node.matches('.react-flow__handle, .xyflow-handle, .react-flow__handle--target, .react-flow__handle--source')) {
              setHandleTitle(node);
            }
            node.querySelectorAll && node.querySelectorAll('.react-flow__handle, .xyflow-handle, .react-flow__handle--target, .react-flow__handle--source').forEach(setHandleTitle);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);


  let storedNodes: Node[] = [];
  let storedEdges: Edge[] = [];

  const [nodes, setNodes, onNodesChange] = useNodesState(storedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storedEdges);
  const [flowItems, setFlowItems] = useState<string[]>([]);
  const [folderPaths, setFolderPaths] = useState<string[]>([]); // all known folders (local)
  const [currentFlowFolder, setCurrentFlowFolder] = useState<string>(''); // folder of currently open flow
  const [localFlowMeta, setLocalFlowMeta] = useState<ExplorerFlowItem[]>([]); // detailed local flow list with folder_path
  const [nodeItems, setNodeItems] = useState<string[]>([]);
  const [flowNameInput, setFlowNameInput] = useState(currentFlow || '');
  const [showDocsPlayground, setShowDocsPlayground] = useState(false);
  const strippEverythingButData = (flow: any) => {
    return JSON.parse(JSON.stringify(flow));
  }

  useEffect(() => {
    // Subscribe to params.updateParams and unsubscribe on cleanup
    const handler = (data: any) => {
      const { nodeid, data: newParams } = data;
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeid ? { ...n, data: { ...n.data, ...newParams } } : n))
      );
    };
    eventBus.subscribe("params.updateParams", handler);
    return () => {
      eventBus.unsubscribe("params.updateParams", handler);
    };
  }, [setNodes, eventBus]);

  // Lightweight toast state for inline notifications
  type Toast = { id: number; message: string; kind?: 'info' | 'error' };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);
  const showToast = useCallback((message: string, kind: 'info' | 'error' = 'info', timeoutMs = 2500) => {
    const id = ++toastCounter.current;
    const t: Toast = { id, message, kind };
    setToasts((prev) => [...prev, t]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, timeoutMs);
  }, []);


  function addOnchangeToNodes(nodes: any[]) {
    nodes.forEach((node: any) => {
      node.data.onChange = (data: any) => {
        //console.log("Node data changed:", node.id, data);
        eventBus.emit(node.id + ".params.updateParams", { nodeid: node.id, data: data });
        eventBus.emit("params.updateParams", { nodeid: node.id, data: data });

        setNodes((nds) =>
          nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, ...data } } : n))
        );

      }
    });
  }

  // Track last opened flow name to run freshness checks after auth state is ready
  const lastOpenedFlowRef = useRef<string | null>(null);
  // Track flow loading to show top-bar spinner and avoid T.D.Z. access
  const [isFlowLoading, setIsFlowLoading] = useState(false);

  

  /**
   * Opens a flow by name. Disk is the primary source;
   * falls back to IndexedDB if disk is unavailable.
   * Always syncs loaded flow to IndexedDB for consistency.
   */
  const openFlow = useCallback(async (
    flowName: string,
    folderPathOverride?: string,
    rootHandle?: FileSystemDirectoryHandle | null
  ) => {
    if (!flowName) return;
    setIsFlowLoading(true);
    // Ensure any running audio graph / virtual nodes are stopped and cleaned up
    try {
      if (managerRef.current) {
        try { managerRef.current.dispose(); } catch (e) { console.warn('[Flow] manager dispose failed', e); }
        managerRef.current = undefined;
      }
      audioGraphManagerRef.current = null;
      if (ctx !== undefined) {
        try { ctx.close().catch(() => {}); } catch (e) { console.warn('[Flow] context close failed', e); }
        (ctx as any) = undefined;
      }
      setIsPlaying(false);
      try { EventBus.getInstance().emit('audio.stopped', {}); } catch { /* noop */ }
    } catch (e) {
      console.warn('[Flow] Failed to stop audio before opening flow', e);
    }

    // Reset EventManager to ensure keyboard handlers and callbacks
    // are destroyed and recreated for the new flow.
    try {
      EventManager.resetInstance();
      eventManagerRef.current = EventManager.getInstance();
    } catch (e) {
      console.warn('[Flow] Failed to reset EventManager', e);
    }
    try {
      setNodes([]);
      setEdges([]);

      let recNodes: any[] = [];
      let recEdges: any[] = [];
      let recFolder = folderPathOverride || '';
      let loadedFromDisk = false;

      // Try disk first if handle is available
      if (rootHandle) {
        try {
          const diskFlow = await loadFlowFromDisk(
            rootHandle,
            flowName,
            folderPathOverride || ''
          );
          if (diskFlow) {
            recNodes = diskFlow.nodes || [];
            recEdges = diskFlow.edges || [];
            recFolder = diskFlow.folder_path || folderPathOverride || '';
            loadedFromDisk = true;

            // Sync to IndexedDB so DB stays in sync with disk
            const payload = {
              nodes: recNodes,
              edges: recEdges,
              folder_path: recFolder,
              updated_at: diskFlow.updated_at || new Date().toISOString(),
            };
            db.put(flowName, payload).catch((e: any) => {
              console.warn('[Flow] Failed to sync disk flow to DB', e);
            });
          }
        } catch (e) {
          console.warn('[Flow] Disk load failed, falling back to DB', e);
        }
      }

      // Fall back to IndexedDB if disk load failed or not available
      if (!loadedFromDisk) {
        try {
          const records = await db.get(flowName);
          if (!records || records.length === 0) {
            console.warn('Flow not found:', flowName);
            showToast?.(`Flow "${flowName}" not found`, 'error');
            return;
          }
          const rec = records[0];
          recNodes = rec.nodes || rec.value?.nodes || [];
          recEdges = rec.edges || rec.value?.edges || [];
          recFolder = rec.folder_path
            || rec.value?.folder_path
            || folderPathOverride
            || '';
        } catch (e) {
          console.error('Error opening flow from IndexedDB', e);
          showToast?.('Failed to open flow', 'error');
          return;
        }
      }

      // Sanitize any persisted selection/glow artifacts before applying theme
      const sanitized = recNodes.map((n: any) => {
        const d = n.data || {};
        const style = { ...(d.style || {}) } as any;
        // Remove strong glow (downgrade to neutral or remove entirely)
        if (style.boxShadow && /14px 3px/.test(style.boxShadow)) {
          style.boxShadow =
            '0 1px 3px rgba(0,0,0,0.45), 0 0 8px 2px rgba(0,255,136,0.08)';
        }
        // If glowColor persisted without selection,
        // keep color but ensure normal strength
        if (style.glowColor) {
          style.boxShadow =
            '0 1px 3px rgba(0,0,0,0.45), 0 0 8px 2px rgba(0,255,136,0.08)';
        }
        // Explicitly clear any ReactFlow selection flags
        const { selected, ...restNode } = n;
        return { ...restNode, data: { ...d, style }, selected: false };
      });
      const themedNodes = normalizeNodeStylesForTheme(sanitized);
      addOnchangeToNodes(themedNodes);
      setNodes(themedNodes);
      setEdges(recEdges);
      sessionStorage.setItem('currentFlow', flowName);

      setFlowNameInput(flowName);
      setCurrentFlowFolder(recFolder);
      // Record last opened flow; freshness check runs in effect once auth state & ensureFlowFresh are ready
      lastOpenedFlowRef.current = flowName;
    } finally {
      // Delay clearing loading state to allow React Flow to render nodes
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsFlowLoading(false);
        });
      });
    }
  }, [setNodes, setEdges, db, showToast, setIsFlowLoading]);

  // Legacy wrapper for backwards compatibility
  const openFlowFromIndexedDB = useCallback(async (
    flowName: string,
    folderPathOverride?: string
  ) => {
    // Load root handle dynamically since state may not be available yet
    const handle = await loadAudioRootHandle();
    await openFlow(flowName, folderPathOverride, handle);
  }, [openFlow]);



  useEffect(() => {
    // Disabled buggy path handling: now only restore last opened flow/node from localStorage
    const loadInitial = async () => {
      try {
        // Removed URL path parsing (/editNode/, /editFlow/) due to bugs
        const storedFlow = sessionStorage.getItem('currentFlow');
        if (storedFlow) {
          setIsFlowLoading(true);
          await openFlowFromIndexedDB(storedFlow);
        } else {
          // Ensure spinner is off if nothing to open
          setIsFlowLoading(false);
        }
      } catch (e) {
        console.warn('Initial load failed', e);
        setIsFlowLoading(false);
      }
    };
    loadInitial();

    (async () => {
      const flows = await db.get("*");
      //console.log("Flows from IndexedDB:", flows);
      const names = flows.map((flow: any) => flow.id);
      //console.log("Nodes from IndexedDB:", nodes);
      const nodeNames = nodes.map((node: any) => node.id);
      setFlowItems(names);
      setNodeItems(nodeNames);
      // derive folder paths
      const folderSet = new Set<string>();
      const meta: ExplorerFlowItem[] = flows.map((flow: any) => {
        const fp = flow.folder_path || flow.value?.folder_path || '';
        // Extract just the name from the id (which may include folder path)
        const idParts = (flow.id || '').split('/');
        const displayName = idParts[idParts.length - 1] || flow.id;
        if (fp) {
          const parts = fp.split('/').filter(Boolean);
          let acc = '';
          for (const p of parts) { acc = acc ? acc + '/' + p : p; folderSet.add(acc); }
        }
        return { id: flow.id, name: displayName, folder_path: fp, updated_at: flow.updated_at, _source: 'local' } as ExplorerFlowItem;
      });
      setLocalFlowMeta(meta);
      setFolderPaths(Array.from(folderSet.values()).sort());
    })();
  }, [db, openFlowFromIndexedDB]);

  const [openDialogFlows, setOpenDialogFlows] = useState(false);
  const [openDialogNodes, setOpenDialogNodes] = useState(false);
  const [nodeCount, setNodeCount] = useState(nodes.length);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  // New Add Node palette dialog state
  const [nodePaletteOpen, setNodePaletteOpen] = useState(false);
  // Audio playing state (for TopBar play button visual)
  const [isPlaying, setIsPlaying] = useState(false);

  // Mini player state for recording playback
  const [miniPlayerOpen, setMiniPlayerOpen] = useState(false);
  const [miniPlayerSrc, setMiniPlayerSrc] = useState('');
  const [miniPlayerTitle, setMiniPlayerTitle] = useState('');
  const nextNodeZRef = useRef<number>(0);

  // IndexedDB setup


  const exportFlowAsJSON = useCallback(() => {
    const flowData = { nodes, edges };
    const json = JSON.stringify(flowData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const filename = flowNameInput ? `${flowNameInput}.json` : 'flow.json';
    a.download = filename;
    a.click();
  }, [nodes, edges, flowNameInput]);

  // Export ALL flows & components (bulk backup)
  const exportAllAsJSON = useCallback(async () => {
    try {
      const allFlows = await db.get('*');
      const payload = { version: 1, exportedAt: new Date().toISOString(), flows: allFlows };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'flowSynth-backup.json'; a.click();
    } catch (e) { console.error('Bulk export failed', e); }
  }, [db]);

  const importAllFromJSON = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        if (Array.isArray(data.flows)) {
          for (const f of data.flows) {
            if (!f || !f.id) continue;
            await db.put(f.id, { nodes: f.nodes || [], edges: f.edges || [], updated_at: f.updated_at });
          }
          // refresh names
          const flows = await db.get('*');
          setFlowItems(flows.map((f: any) => f.id));
        }
        alert('Import complete');
      } catch (err) { console.error('Import failed', err); alert('Import failed (see console)'); }
      event.target.value = '';
    };
    reader.readAsText(file);
  }, [db]);

  // Memoize importFlowFromJSON so it doesn't get recreated on every render
  const importFlowFromJSON = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const flowData = JSON.parse(json);
        setNodes(flowData.nodes || []);
        setEdges(flowData.edges || []);
        // Set flow name from file name (without .json extension) or from data
        const flowName = flowData.name || file.name.replace(/\.json$/i, '');
        setFlowNameInput(flowName);
        sessionStorage.setItem('currentFlow', flowName);
        showToast?.(`Imported flow: ${flowName}`, 'success');
      } catch (err) {
        console.error('Failed to import flow:', err);
        showToast?.('Failed to import flow: invalid JSON', 'error');
      }
    };
    reader.onerror = () => {
      showToast?.('Failed to read file', 'error');
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again
    event.target.value = '';
  }, [setNodes, setEdges, showToast]);

  useEffect(() => {
    setNodeCount(nodes.length);
  }, [nodes]);
  const memoizedNodes = useMemo(() => nodes, [nodes]);

  // Mutable references for nodes and edges
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  // Keep refs in sync with state
  useEffect(() => {
    nodesRef.current = nodes;
    let updateEdges = false
    //get ID from all edges and edges Ref in two seperate arrays and see if they differ
    const currentEdgeIds = edges.map(e => e.id);
    const prevEdgeIds = edgesRef.current.map(e => e.id);
    if (
      currentEdgeIds.length !== prevEdgeIds.length ||
      currentEdgeIds.some((id, idx) => id !== prevEdgeIds[idx])
    ) {
      updateEdges = true;
    }

    edgesRef.current = edges;
    const maxZ = nodes.reduce((acc, node) => Math.max(acc, node.zIndex ?? 0), 0);
    if (maxZ > nextNodeZRef.current) {
      nextNodeZRef.current = maxZ;
    }
    if (updateEdges && ctx !== undefined) {
      init();
    }
  }, [nodes, edges]);

  const updateNodes = (node: any) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, ...node.data } } : n
      )
    );
  }
  const audioGraphManagerRef = useRef<AudioGraphManager | null>(null);
  const eventManagerRef = useRef<EventManager | null>(null);
  eventManagerRef.current = EventManager.getInstance();

  const [selectedEdge, setSelectedEdge] = useState<string | undefined>(undefined);
  const [selectedNode, setSelectedNode] = useState<any | undefined>(undefined);
  const [selectedNodeType, setSelectedNodeType] = useState<string>("");
  const [editState, setEditState] = useState<"flow" | "node">("flow");
  // UI color pickers for selected node/edge glow/color
  const [nodeGlowColor, setNodeGlowColor] = useState<string>('#00ff88');
  const [nodeBgColor, setNodeBgColor] = useState<string>('#1f1f1f');
  // Font color per node disabled
  const [nodeFontColor, setNodeFontColor] = useState<string>('#eeeeee');
  const [edgeColor, setEdgeColor] = useState<string>('#00ff88');
  //fix this with EventBus node Updates.



  // Add dependency array to properly close the useEffect


  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState("");
  const [impressumOpen, setImpressumOpen] = useState(false);
  const [datenschutzOpen, setDatenschutzOpen] = useState(false);
  // Control the File menu (Radix Dialog) open state so we can close it before opening other dialogs
  const [fileMenuOpen, setFileMenuOpen] = useState(false);

  // --- Recordings Panel & Storage (File System + fallback IndexedDB) ---------
  const recordingsDbRef = useRef<SimpleIndexedDB>(new SimpleIndexedDB('FlowSynthDB', 'recordings')); // retained ONLY for migration & fallback
  const [recordingsPanelOpen, setRecordingsPanelOpen] = useState(false);
  const [recordings, setRecordings] = useState<any[]>([]); // unified listing (FS mapping or IDB objects)
  const [allFolderAudio, setAllFolderAudio] = useState<Record<string, any[]>>({}); // all subdirectories and their audio files
  const [uploadedAudio, setUploadedAudio] = useState<any[]>([]);
  const [fsRootHandle, setFsRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [showFsFolderPrompt, setShowFsFolderPrompt] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);
  // Throttle & reentrancy guards for FS scans to prevent accidental loops
  const lastFsScanRef = useRef<number>(0);
  const fsScanInFlightRef = useRef<boolean>(false);
  const FS_SCAN_MIN_INTERVAL_MS = 1500;

  // Refresh flow list from disk and IndexedDB
  const refreshFlowList = useCallback(async () => {
    try {
      // If we have a disk handle, sync from disk first
      if (fsRootHandle) {
        await syncDiskToDb(fsRootHandle, db);
      }
      // Then refresh from IndexedDB
      const flows = await db.get('*');
      const names = flows.map((f: any) => f.id);
      setFlowItems(names);
      const folderSet = new Set<string>();
      const meta: ExplorerFlowItem[] = flows.map((f: any) => {
        const fp = f.folder_path || f.value?.folder_path || '';
        // Extract just the name from the id (which may include folder path)
        const idParts = (f.id || '').split('/');
        const displayName = idParts[idParts.length - 1] || f.id;
        if (fp) {
          const parts = fp.split('/').filter(Boolean);
          let acc = '';
          for (const p of parts) {
            acc = acc ? `${acc}/${p}` : p;
            folderSet.add(acc);
          }
        }
        return {
          id: f.id,
          name: displayName,
          folder_path: fp,
          updated_at: f.updated_at,
          _source: 'local',
        } as ExplorerFlowItem;
      });
      setLocalFlowMeta(meta);
      setFolderPaths(Array.from(folderSet.values()).sort());
    } catch (e) {
      console.warn('[Flow] refresh failed', e);
    }
  }, [fsRootHandle, db]);

  const refreshRecordings = useCallback(async () => {
    const now = performance.now();
    if (fsScanInFlightRef.current) {
      // Prevent overlapping scans
      return;
    }
    if (now - lastFsScanRef.current < FS_SCAN_MIN_INTERVAL_MS) {
      // Too soon since last scan – skip to avoid rapid loops
      return;
    }
    fsScanInFlightRef.current = true;
    if (fsRootHandle) {
      try {
        // Guard: verify we still have read permission; if lost, reset state & prompt
        if ((fsRootHandle as any).queryPermission) {
          let p: PermissionState | 'unknown' = 'unknown';
          try { p = await (fsRootHandle as any).queryPermission({ mode: 'read' }); } catch { p = 'unknown'; }
          if (p !== 'granted') {
            console.warn('[FS recordings] permission lost (', p, '), clearing handle');
            setFsRootHandle(null);
            setShowFsFolderPrompt(true);
            fsScanInFlightRef.current = false;
            return;
          }
        }
        // Scan all subdirectories dynamically
        const subdirs = await listAllSubdirectories(fsRootHandle);
        const folderData: Record<string, any[]> = {};

        for (const subdir of subdirs) {
          const files = await listAudioInSubdirectory(fsRootHandle, subdir);
          const mapped = await Promise.all(files.map(async f => ({
            id: f.name.replace(/\.(wav|mp3|ogg|flac|m4a|aac)$/i, '') + `-fs-${subdir}`,
            name: f.name,
            url: await getFileObjectURL(f.handle),
            createdAt: undefined,
            durationMs: undefined,
            size: f.size,
            _fs: true,
            _folder: subdir
          })));
          folderData[subdir] = mapped;
        }

        setAllFolderAudio(folderData);
        // Keep recordings state for backward compatibility (use 'recording' folder if exists)
        setRecordings(folderData['recording'] || []);
      } catch (e) { console.warn('[FS recordings] list failed', e); }
      lastFsScanRef.current = performance.now();
      fsScanInFlightRef.current = false;
      return;
    }
    // Fallback to IndexedDB only if disk is not available
    // Wrap in try-catch to handle missing store gracefully
    try {
      await recordingsDbRef.current.open();
      const all = await recordingsDbRef.current.get('*');
      setRecordings(all || []);
      setAllFolderAudio({});
    } catch (e) {
      // Store might not exist - that's ok, just use empty array
      setRecordings([]);
      setAllFolderAudio({});
    }
    lastFsScanRef.current = performance.now();
    fsScanInFlightRef.current = false;
  }, [fsRootHandle]);
  // Initial FS setup attempt (run once on mount)
  useEffect(() => {
    (async () => {
      const supported = await hasFsApi();
      setFsSupported(supported);
      if (!supported) { return; }
      const existing = await loadAudioRootHandle();
      if (existing) {
        try {
          // Only query permission (do NOT request here - needs user gesture)
          let perm: PermissionState | 'unknown' = 'unknown';
          if ((existing as any).queryPermission) {
            try { perm = await (existing as any).queryPermission({ mode: 'read' }); } catch { perm = 'unknown'; }
          }
          if (perm === 'granted') {
            setFsRootHandle(existing);
            // refreshRecordings will trigger via fsRootHandle change
          } else {
            console.info('[FS Audio] Stored handle present but permission not granted (', perm, '). Awaiting user re-selection.');
            setShowFsFolderPrompt(true);
          }
        } catch (e) {
          console.warn('[FS Audio] Error validating stored handle', e);
          setShowFsFolderPrompt(true);
        }
      } else {
        setShowFsFolderPrompt(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger refresh when fsRootHandle is first set (but not on initial null)
  const hasInitializedFsRef = useRef(false);
  useEffect(() => {
    if (fsRootHandle && !hasInitializedFsRef.current) {
      hasInitializedFsRef.current = true;
      refreshRecordings();

      // Sync flows from disk to DB (disk is leader)
      (async () => {
        try {
          const diskSyncResult = await syncDiskToDb(fsRootHandle, db);
          if (diskSyncResult.synced > 0) {
            console.info(
              '[Flow Sync] Loaded',
              diskSyncResult.synced,
              'flow(s) from disk on init'
            );
          }

          // Refresh local flow list after disk->DB sync
          const flows = await db.get('*');
          const names = flows.map((f: any) => f.id);
          setFlowItems(names);
          const folderSet = new Set<string>();
          const meta: ExplorerFlowItem[] = flows.map((f: any) => {
            const fp = f.folder_path || f.value?.folder_path || '';
            if (fp) {
              const parts = fp.split('/').filter(Boolean);
              let acc = '';
              for (const p of parts) {
                acc = acc ? `${acc}/${p}` : p;
                folderSet.add(acc);
              }
            }
            return {
              id: f.id,
              name: (f.id || '').split('/').pop() || f.id,
              folder_path: fp,
              updated_at: f.updated_at,
              _source: 'local',
            } as ExplorerFlowItem;
          });
          setLocalFlowMeta(meta);
          setFolderPaths(Array.from(folderSet.values()).sort());
        } catch (e) {
          console.warn('[Flow Sync] Error syncing from disk on init', e);
        }
      })();
    }
  }, [fsRootHandle, refreshRecordings, db]);

  const chooseFsFolder = useCallback(async () => {
    const handle = await selectAndPrepareRoot();
    if (handle) {
      setFsRootHandle(handle);
      setShowFsFolderPrompt(false);
      // migration (write legacy IDB blobs to FS)
      await migrateIndexedDbRecordings(handle);

      // Sync flows from disk to IndexedDB (disk is leader)
      try {
        showToast('Syncing flows from disk...', 'info');
        const diskSyncResult = await syncDiskToDb(handle, db);
        if (diskSyncResult.synced > 0) {
          showToast(
            `Loaded ${diskSyncResult.synced} flow(s) from disk`,
            'info'
          );
        }
        if (diskSyncResult.failed.length > 0) {
          console.warn(
            '[Flow Sync] Failed to sync from disk:',
            diskSyncResult.failed
          );
        }

        // Refresh local flow list after disk->DB sync
        const flows = await db.get('*');
        const names = flows.map((f: any) => f.id);
        setFlowItems(names);
        const folderSet = new Set<string>();
        const meta: ExplorerFlowItem[] = flows.map((f: any) => {
          const fp = f.folder_path || f.value?.folder_path || '';
          if (fp) {
            const parts = fp.split('/').filter(Boolean);
            let acc = '';
            for (const p of parts) {
              acc = acc ? `${acc}/${p}` : p;
              folderSet.add(acc);
            }
          }
          return {
            id: f.id,
            name: (f.id || '').split('/').pop() || f.id,
            folder_path: fp,
            updated_at: f.updated_at,
            _source: 'local',
          } as ExplorerFlowItem;
        });
        setLocalFlowMeta(meta);
        setFolderPaths(Array.from(folderSet.values()).sort());
      } catch (e) {
        console.warn('[Flow Sync] Error syncing from disk', e);
      }

      refreshRecordings();
      showToast('Folder selected and flows loaded');
    } else {
      showToast('Folder selection cancelled', 'error');
    }
  }, [refreshRecordings, showToast, db]);
  // Expose toggle for TopBar button
  useEffect(() => { (window as any).flowSynth.toggleRecordingsPanel = () => { setRecordingsPanelOpen(o => !o); if (!recordingsPanelOpen) refreshRecordings(); }; }, [recordingsPanelOpen, refreshRecordings]);
  // Recording ready events now handled internally by VirtualRecordingNode (legacy listener removed)


  // moved below auth state declarations

  // --- Remote (Server) Flow Management -------------------------------------
  const [serverFlows, setServerFlows] = useState<any[]>([]); // my flows
  const [publicFlows, setPublicFlows] = useState<any[]>([]);
  const [serverFilter, setServerFilter] = useState('');
  const [createServerName, setCreateServerName] = useState('');
  const [isRemoteSaving, setIsRemoteSaving] = useState(false);
  const [showServerPanel, setShowServerPanel] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  
  

  // Helper: build component source code (serializes current nodes/edges) when we have none stored yet.
  const buildComponentCode = useCallback((name: string, n: any[], e: any[]) => {
    const safeName = (name || 'Component').replace(/[^A-Za-z0-9_]/g, '_');
    const serialized = JSON.stringify({ nodes: strippEverythingButData(n), edges: strippEverythingButData(e) }, null, 2);
    return `// FlowSynth auto-generated component for ${name}\n// Edit the transform() function to customize behavior.\n// The embeddedGraph object contains the node & edge structure.\nexport const embeddedGraph = ${serialized};\n\nexport function transform(input){\n  // TODO: implement processing logic\n  return input;\n}\n\nexport default { name: '${safeName}', embeddedGraph, transform };`;
  }, [nodes, edges]);

  const saveFlow = useCallback(async () => {
    if (!flowNameInput) return;

    const name = flowNameInput.trim();
    sessionStorage.setItem('currentFlow', name);
    // Always assign a fresh updated_at so
    // "newest wins" sync logic is straightforward
    const updated_at = new Date().toISOString();

    // Strip selection glow (strong) before
    // persisting; downgrade boxShadow
    const cleanedNodes = nodes.map((n: any) => {
      const d = n.data || {};
      const style = { ...(d.style || {}) } as any;
      if (style.boxShadow && /14px 3px/.test(style.boxShadow)) {
        style.boxShadow =
          '0 1px 3px rgba(0,0,0,0.45), '
          + '0 0 8px 2px rgba(0,255,136,0.08)';
      }
      // Remove transient selection flag
      const { selected, ...restNode } = n;
      return {
        ...restNode,
        selected: false,
        data: { ...d, style },
      };
    });

    const payloadLocal = {
      nodes: strippEverythingButData(cleanedNodes),
      edges: strippEverythingButData(edges),
      updated_at,
      folder_path: currentFlowFolder,
    } as any;

    // Disk is the leader; save to disk first if available
    if (fsRootHandle) {
      try {
        const flowData: FlowData = {
          name,
          nodes: payloadLocal.nodes,
          edges: payloadLocal.edges,
          folder_path: currentFlowFolder,
          updated_at,
        };
        const diskResult = await saveFlowToDisk(fsRootHandle, flowData);
        if (!diskResult.ok) {
          console.warn('[Flow] Disk save failed', diskResult.error);
        }
      } catch (e) {
        console.warn('[Flow] Disk save error', e);
      }
    }

    // Always sync to IndexedDB as well (cache/fallback)
    db.put(name, payloadLocal);

    setFlowNameInput(name);
    setSaveDialogOpen(false);
  }, [flowNameInput, nodes, edges, db, fsRootHandle, currentFlowFolder]);

  const triggerSave = useCallback(() => {
    if (flowNameInput) {
      saveFlow()
        .then(() => setLastSavedAt(Date.now()))
        .catch(() => {
          /* ignore */
        });
      return;
    }
    setSaveDialogOpen(true);
  }, [flowNameInput, saveFlow]);

  
  

  
  // Keyboard shortcut: Ctrl+S / Cmd+S to save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const saveCombo = (isMac && e.metaKey && e.key.toLowerCase() === 's') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 's');
      if (!saveCombo) return;
      e.preventDefault();
      e.stopPropagation();
      // Decide what to save: flow vs component
      triggerSave();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
  }, [triggerSave]);

  // Manual Save State
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Debounced auto-save timer id
  const autoSaveTimerRef = useRef<number | null>(null);

  const handleSaveDialogConfirm = async () => {
    const name = saveDialogName.trim();
    if (!name) return;
    sessionStorage.setItem('currentFlow', name);
    const payloadNodes = strippEverythingButData(nodes);
    const payloadEdges = strippEverythingButData(edges);
    const updated_at = new Date().toISOString();

    // Disk is the leader; save to disk first if available
    if (fsRootHandle) {
      try {
        const flowData: FlowData = {
          name,
          nodes: payloadNodes,
          edges: payloadEdges,
          folder_path: currentFlowFolder,
          updated_at,
        };
        const diskResult = await saveFlowToDisk(fsRootHandle, flowData);
        if (!diskResult.ok) {
          console.warn('[Flow] Disk save failed', diskResult.error);
        }
      } catch (e) {
        console.warn('[Flow] Disk save error', e);
      }
    }

    // Always sync to IndexedDB as well (cache/fallback)
    db.put(name, {
      nodes: payloadNodes,
      edges: payloadEdges,
      folder_path: currentFlowFolder,
      updated_at,
    });

    setFlowNameInput(name);
    setLastSavedAt(Date.now());
    setFlowItems((items) =>
      items.includes(name) ? items : [...items, name]
    );
    setSaveDialogOpen(false);
  };

  // Add a button to trigger the save function


  const onEdgeDelete = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    },
    [setEdges]
  );


  //put this on events THIS SICKS TODO
  const onPaneClick = useCallback(
    () => {
      // Downgrade glow on previously selected edge before clearing selection
      if (selectedEdge) {
        setEdges((eds) => eds.map(ed => {
          if (ed.id !== selectedEdge) return ed;
          const stroke = (ed.style as any)?.stroke || '#ffffff';
          return { ...ed, style: { ...(ed.style || {}), filter: makeEdgeGlowFilter(stroke, 'normal') } } as any;
        }));
      }
      setSelectedEdge(undefined); // Clear the selected edge when the flow is blurred
      if (!selectedNode) return;
      const currentNode = nodes.find((node) => node.id === selectedNode.id);
      if (!currentNode) return;
      const existingStyle: any = currentNode.data.style || {};
      const glow = existingStyle.glowColor || '#00ff88';
      currentNode.data.style = { ...existingStyle, boxShadow: makeGlow(glow, 'normal') };
      updateNodes(currentNode);
      setSelectedNode(undefined); // Clear the selected node when the flow is blurred
      setSelectedNodeType("");
      // Perform any action you want when the flow is blurred here	
    },
    [nodes, selectedNode, updateNodes, setSelectedNode]
  );

  const onNodeDelete =
    (node: any) => {
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) => eds.filter((edge) => edge.source !== node.id && edge.target !== node.id));
    };



  useEffect(() => {
    const handleDelete = () => {
      // Prevent deletion if user is currently typing inside an editable field
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName.toLowerCase();
        const isInput = tag === 'input' || tag === 'textarea';
        const isContentEditable = active.isContentEditable;
        if (isInput || isContentEditable) {
          return; // Skip node/edge deletion; let the input handle the key
        }
      }

      // Get all selected nodes from React Flow
      const selectedNodes = nodes.filter((n) => n.selected);
      
      if (selectedNodes.length > 0) {
        // Delete all selected nodes
        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        selectedNodes.forEach((node) => {
          if (audioGraphManagerRef.current !== null) {
            audioGraphManagerRef.current.deleteVirtualNode(node.id);
          }
        });
        setNodes((nds) => nds.filter((n) => !selectedIds.has(n.id)));
        setEdges((eds) => eds.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)));
        setSelectedNode(undefined);
        setSelectedNodeType("");
      } else if (selectedNode) {
        // Fallback: delete single tracked selected node
        if (audioGraphManagerRef.current !== null) {
          audioGraphManagerRef.current.deleteVirtualNode(selectedNode.id);
        }
        onNodeDelete(selectedNode);
        setSelectedNode(undefined);
        setSelectedNodeType("");
      } else if (selectedEdge) {
        const edge = edges.find((edge) => edge.id === selectedEdge);
        if (audioGraphManagerRef.current !== null && edge) {
          audioGraphManagerRef.current.deleteEdge(edge);
        }
        onEdgeDelete(selectedEdge);
        setSelectedEdge(undefined); // Clear the selected edge after deletion
      }
    };
    eventManagerRef.current?.setHandleDelete(handleDelete);
  }, [selectedEdge, onEdgeDelete, selectedNode, onNodeDelete, nodeCount, edges, nodes]);



  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      // Downgrade previous selected edge glow
      const prevSelected = selectedEdge;
      // If a node is currently selected, downgrade its glow before clearing selection
      if (selectedNode) {
        const glowColor = (selectedNode.data?.style?.glowColor as string) || '#00ff88';
        const normalShadow = '0 1px 3px rgba(0,0,0,0.45), 0 0 8px 2px rgba(0,255,136,0.08)';
        const downgradedNode = {
          ...selectedNode,
          data: {
            ...selectedNode.data,
            style: { ...selectedNode.data.style, boxShadow: normalShadow }
          }
        };
        updateNodes(downgradedNode);
        setSelectedNode(undefined);
      }
      setEdges((eds) => eds.map(ed => {
        if (prevSelected && ed.id === prevSelected) {
          const stroke = (ed.style as any)?.stroke || '#ffffff';
          return { ...ed, style: { ...(ed.style || {}), filter: makeEdgeGlowFilter(stroke, 'normal') } } as any;
        }
        if (ed.id === edge.id) {
          const stroke = (edge.style as any)?.stroke || '#ffffff';
          return { ...ed, style: { ...(ed.style || {}), filter: makeEdgeGlowFilter(stroke, 'strong') } } as any;
        }
        return ed;
      }));
      setSelectedEdge(edge.id);
      const col = (edge.style as any)?.stroke || '#ffffff';
      setEdgeColor(col);
      setSelectedNodeType("");
    },
    [selectedEdge, selectedNode, updateNodes]
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: any) => {
      // If an edge is selected, downgrade its glow/filter before clearing selection
      if (selectedEdge) {
        setEdges((eds) => eds.map((ed) => {
          if (ed.id === selectedEdge) {
            const stroke = (ed.style as any)?.stroke || '#ffffff';
            return {
              ...ed,
              style: {
                ...(ed.style || {}),
                filter: makeEdgeGlowFilter(stroke, 'normal')
              }
            } as any;
          }
          return ed;
        }));
        setSelectedEdge(undefined);
      }
      // If clicking on already selected node, skip re-applying glow
      if (selectedNode?.id === node.id) {
        return;
      }
      // Downgrade glow on previously selected node before selecting new one
      if (selectedNode) {
        const prevGlow = (selectedNode.data?.style?.glowColor as string)
          || '#00ff88';
        const prevNode = {
          ...selectedNode,
          data: {
            ...selectedNode.data,
            style: {
              ...selectedNode.data.style,
              boxShadow: makeGlow(prevGlow, 'normal')
            }
          }
        };
        updateNodes(prevNode);
      }
      const glow = (node.data?.style?.glowColor as string) || '#00ff88';
      const updatedNode = {
        ...node,
        data: {
          ...node.data,
          style: {
            ...node.data.style,
            glowColor: glow,
            boxShadow: makeGlow(glow, 'strong')
          },
        },
      };
      updateNodes(updatedNode);
      setSelectedNode(updatedNode);
      setSelectedNodeType(node.type || "");
      setNodeGlowColor(glow);
      const bg = (updatedNode.data?.style?.background as string)
        || '#1f1f1f';
      setNodeBgColor(bg);
      const font = (updatedNode.data?.style?.color as string)
        || '#eeeeee';
      setNodeFontColor(font);
    },
    [setSelectedNode, updateNodes, selectedEdge, setEdges, selectedNode]
  );

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
  };

  const init = () => {
    //console.log("Initializing AudioGraphManager...");
    if (ctx !== undefined) {
      ctx.close();
    }
    // Create AudioContext with low latency settings
    ctx = new AudioContext({
      latencyHint: 'interactive',  // Lowest latency mode (typically 3-6ms)
      sampleRate: 48000,
      // Higher sample rate for better quality
    });
    // Ensure context is running in case browser starts it suspended
    ctx.resume().catch(err => console.warn('Failed to resume AudioContext', err));

    // Run diagnostics

    // Expose for debugging in console
    (window as any).__audioContext = ctx;
    (window as any).measureMicLatency = measureMicLatency;
    (window as any).autoMeasureLatency = autoMeasureLatency;
    if (managerRef.current !== undefined) {
      managerRef.current.dispose();
      managerRef.current = undefined;
    }
    managerRef.current = new AudioGraphManager(ctx, nodesRef, edgesRef);
    manager = managerRef.current;
    manager.initialize();
    audioGraphManagerRef.current = manager;
    setIsPlaying(true);
    try { EventBus.getInstance().emit('audio.started', {}); } catch { /* noop */ }
  }

  

  // Function to add a new node



  const addNode = (type: string, copy: boolean = false, copiedNode: any | null = null) => {
    // Determine raw center of viewport in flow coordinates first; we'll adjust for node size later.
    let flowCenter = { x: 0, y: 0 };
    try {
      const container = document.querySelector('.react-flow') as HTMLElement | null;
      const width = container?.clientWidth ?? window.innerWidth;
      const height = container?.clientHeight ?? window.innerHeight;
      const screenCenter = { x: width / 2, y: height / 2 };
      // @ts-ignore
      flowCenter = reactFlow?.screenToFlowPosition ? reactFlow.screenToFlowPosition(screenCenter) : { x: 0, y: 0 };
    } catch {
      flowCenter = { x: 0, y: 0 };
    }
    let data: any = { label: `` };

    if (type === "OscillatorFlowNode") {
      const narrowOscStyleObj = { ...nodeStyleObj, width: "60px" };
      data = {
        ...data,
        frequency: 440,
        detune: 0,
        type: "sine",
        frequencyType: "hz",
        label: "Oscillator",
        style: narrowOscStyleObj
      }
    }
    else if (type === "AudioWorkletOscillatorFlowNode") {
      const narrowOscStyleObj = { ...nodeStyleObj, width: "60px" };
      data = {
        ...data,
        frequency: 440,
        detune: 0,
        type: "sine",
        frequencyType: "hz",
        label: "AW Oscillator",
        style: narrowOscStyleObj
      }
    }
    else if (type === "GainFlowNode") {
      const narrowNodeStyleObj = { ...nodeStyleObj };
      data = {
        ...data,
        gain: 1,
        style: narrowNodeStyleObj
      };
    } else if (type === "DelayFlowNode") {
      const narrowNodeStyleObj = { ...nodeStyleObj, width: "80px" };
      data = {
        ...data,
        delayTime: 0.5,
        style: nodeStyleObj
      };
    }
    else if (type === "BiquadFilterFlowNode") {
      data = {
        ...data,
        filterType: "lowpass",
        frequency: 1000,
        detune: 0,
        Q: 0,
        gain: 0,
        style: nodeStyleObj
      };
    }
    else if (type === "DynamicCompressorFlowNode") {
      data = {
        ...data,
        threshold: -50,
        knee: 40,
        ratio: 12,
        attack: 0.003,
        release: 0.25,
        style: nodeStyleObj
      };
    }
    else if (type === "IIRFilterFlowNode") {
      data = {
        ...data,
        feedforward: [0.5, 0.5],
        feedback: [1.0, -0.5],
        label: "IIR Filter",
        style: nodeStyleObj
      };
    }
    else if (type === "DistortionFlowNode") {
      data = {
        ...data,
        curve: makeDistortionCurve(400),
        oversample: "none",
        style: nodeStyleObj
      };
    }
    else if (type === "MasterOutFlowNode") {
      data = {
        ...data,
        style: nodeStyleObj
      };
    }
    else if (type === "AudioWorkletFlowNode") {
      data = {
        ...data,
        processorUrl: "path/to/processor.js",
        style: nodeStyleObj
      };
    }
    else if (type === "AutomationFlowNode") {
      // Provide default automation data; style width doubled for editor
      const autoStyle = { ...nodeStyleObj, width: '440px' };
      data = {
        ...data,
        label: 'Automation',
        lengthSec: 2,
        loop: true,
        // Default points: flat at 100% (y=0.5)
        points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
        style: autoStyle
      };
    }
    else if (type === "ADSRFlowNode") {
      data = {
        ...data,
        attackTime: 0.1,
        decayTime: 0.2,
        sustainLevel: 0.5,
        releaseTime: 0.3,
        maxTime: 10,
        style: nodeStyleObj
      };
    }
    else if (type === "ButtonFlowNode") {
      data = {
        ...data,
        assignedKey: null,
        retriggerFrequency: 1,
        isRetriggering: false,
        isPressed: false,
        retriggerLength: 0.1,
      }
    }
    else if (type === "MidiButtonFlowNode") {
      data = {
        ...data,
        assignedKey: null,
        retriggerFrequency: 1,
        isRetriggering: false,
        isPressed: false,
        retriggerLength: 0.1,
        midiMapping: null,
        style: nodeStyleObj
      }
    }
    else if (type === "OnOffButtonFlowNode") {
      const gateStyle = { ...nodeStyleObj, maxHeight: 70 };
      data = {
        ...data,
        label: "Gate",
        isOn: false,
        style: gateStyle
      };
    }
    else if (type === "ClockFlowNode") {
      data = {
        ...data,
        bpm: 120,
        isEmitting: true,
        eventBus: eventBus,
        style: nodeStyleObj
      }
    }
    else if (type === "SpeedDividerFlowNode") {
      data = {
        ...data,
        divider: 1,
        multiplier: 1,
        style: nodeStyleObj
      }
    }
    else if (type == "FrequencyFlowNode") {
      data = {
        ...data,
        value: 440,
        frequency: 440,
        type: "sine",
        frequencyType: "hz",
        style: nodeStyleObj
      }
    }
    else if (type == "ConstantFlowNode") {
      data = {
        ...data,
        value: 1,
        style: nodeStyleObj
      }
    }
    else if (type == "SwitchFlowNode") {
      data = {
        ...data,
        numOutputs: 2,
        activeOutput: 1,
      }
    }
    else if (type == "BlockingSwitchFlowNode") {
      data = {
        ...data,
        numOutputs: 2,
      }
    }
    else if (type === "FlowNode") {
      data = {
        ...data,
        label: "Flow",
        style: nodeStyleObj,
        db: dbRef.current,
      }
    }
    else if (type == "FunctionFlowNode") {
      data = {
        functionCode: "function process(value) {\n  // Modify the value here\n  return value;\n}",
        value: ""
      }
    } else if (type === "InputNode") {
      data = {
        ...data,
        index: 0,
        value: "",
        style: nodeStyleObj
      };
    } else if (type === "OutputNode") {
      data = {
        ...data,
        index: 0,
        value: "",
        style: nodeStyleObj
      };
      // } else if (type === "SignalRouterFlowNode") {
      //   data = {
      //     ...data,
      //     outputs: 1,
      //     pendingRoute: 1,
      //     style: nodeStyleObj
      //   };
    } else if (type === "SampleFlowNode") {
      // Use a broader width for SampleFlowNode
      const wideNodeStyleObj = { ...nodeStyleObj, width: "320px" };
      data = {
        ...data,
        label: "string",
        audioUrl: "",
        selections: [],
        style: wideNodeStyleObj
      };
    } else if (type === "MouseTriggerButton") {
      data = {
        ...data,
        label: "Mouse Trigger",
        style: nodeStyleObj
      }
    } else if (type === "WebRTCInputFlowNode") {
      const wideNodeStyleObj = { ...nodeStyleObj, width: "240px" };
      data = {
        ...data,
        label: "WebRTC In",
        serverUrl: "http://localhost:8787",
        sessionId: undefined,
        connectionState: 'idle',
        style: wideNodeStyleObj,
      };
    } else if (type === "WebRTCOutputFlowNode") {
      const wideNodeStyleObj = { ...nodeStyleObj, width: "240px" };
      data = {
        ...data,
        label: "WebRTC Out",
        serverUrl: "http://localhost:8787",
        sessionId: undefined,
        connectionState: 'idle',
        style: wideNodeStyleObj,
      };
    } else if (type === "AnalyzerNodeGPT") {
      const analyzerStyle = {
        ...nodeStyleObj,
        width: "320px",
        borderRadius: "14px",
        background: "#05060d",
        border: "1px solid #1d2233",
        boxShadow: "0 14px 34px rgba(5,7,16,0.6)",
      };
      data = {
        ...data,
        label: "Analyzer",
        mode: "bars",
        colorPreset: "aurora",
        fftSize: 4096,
        minDecibels: -96,
        maxDecibels: -10,
        smoothingTimeConstant: 0.8,
        style: analyzerStyle,
      };
    } else if (type === "OscilloscopeFlowNode") {
      const oscilloscopeStyle = {
        ...nodeStyleObj,
        width: "420px",
      };
      data = {
        ...data,
        label: "Scope",
        fftSize: 4096,
        lineWidth: 2,
        triggerLevel: 0.0,
        timeScale: 1.0,
        glowIntensity: 8,
        zoom: 1.0,
        panOffset: 0.0,
        style: oscilloscopeStyle,
      };
    } else if (type === "MidiFileFlowNode") {
      const midiFileStyle = {
        ...nodeStyleObj,
        width: "250px",
      };
      data = {
        ...data,
        label: "MIDI File",
        midiFile: null,
        currentBar: 0,
        currentTick: 0,
        isPlaying: false,
        loop: true,
        style: midiFileStyle,
      };
    }

    // Determine style width/height for centering.
    const styleObj = (copy && copiedNode?.data?.style) ? copiedNode.data.style : (data.style || { ...nodeStyleObj, glowColor: '#00ff88', boxShadow: makeGlow('#00ff88', 'normal') });
    // Width may be like '200px'; parseInt handles that; fallback default 200.
    const nodeWidth = styleObj?.width ? parseInt(styleObj.width, 10) || 200 : 200;
    // Height isn't explicitly defined; approximate via padding & content. Use 120 as heuristic unless provided.
    const nodeHeight = styleObj?.height ? parseInt(styleObj.height, 10) || 120 : 120;
    const centeredPosition = { x: flowCenter.x - nodeWidth / 2, y: flowCenter.y - nodeHeight / 2 };
    // When copying, prefer the original node position (possibly offset beforehand)
    let basePosition = centeredPosition;
    if (copy && copiedNode) {
      const px = (copiedNode.position && typeof copiedNode.position.x === 'number')
        ? copiedNode.position.x
        : (copiedNode.positionAbsolute && typeof copiedNode.positionAbsolute.x === 'number'
          ? copiedNode.positionAbsolute.x
          : undefined);
      const py = (copiedNode.position && typeof copiedNode.position.y === 'number')
        ? copiedNode.position.y
        : (copiedNode.positionAbsolute && typeof copiedNode.positionAbsolute.y === 'number'
          ? copiedNode.positionAbsolute.y
          : undefined);
      if (px !== undefined && py !== undefined) {
        basePosition = { x: px, y: py };
      }
    }

    let newNode: any | null = null;
    const id = uuidv4() + "." + type;
    const zIndex = ++nextNodeZRef.current;
    if (copy && copiedNode) {
      // If copying, use the copied node's data
      newNode = {
        id: id,
        type: type,
        position: basePosition,
        data: {
          ...copiedNode.data, id: id, onChange: (data: any) => {
            //console.log("Node data changed:", data);
            eventBus.emit(id + ".params.updateParams", { nodeid: id, data: data });
            eventBus.emit("params.updateParams", { nodeid: id, data: data });
          }
        },
        zIndex,
        // Keep  the same ID if copying
      };
    } else {
      newNode = {
        id: id,
        type: type,
        position: basePosition,
        data: {
          ...data, id: id, style: { ...styleObj }, onChange: (data: any) => {
            // console.log("Node data changed:", data);
            eventBus.emit(id + ".params.updateParams", { nodeid: id, data: data });
            eventBus.emit("params.updateParams", { nodeid: id, data: data });
          }
        },
        zIndex,
      };
    }

    setNodes((nds) => {
      return [...nds, newNode]
    });
    if (audioGraphManagerRef.current !== null) {
      init();
    }
  };

  // Define which node types are considered audio-capable (can drive audio into other audio nodes)
  const AUDIO_NODE_TYPES = useMemo(() => new Set<string>([
    'OscillatorFlowNode',
    'GainFlowNode',
    'DelayFlowNode',
    'ReverbFlowNode',
    'BiquadFilterFlowNode',
    'DynamicCompressorFlowNode',
    'IIRFilterFlowNode',
    'DistortionFlowNode',
    'AudioWorkletFlowNode',
    'AudioWorkletOscillatorFlowNode',
    'SampleFlowNode',
    'ConvolverFlowNode',
    'ChannelMergerFlowNode',
    'ChannelSplitterFlowNode',
    'NoiseFlowNode',
    'MicFlowNode',
    'RecordingFlowNode',
    'WebRTCPulseNode',
    'WebSocketAudioNode',
    'AnalyzerNodeGPT',
    'OscilloscopeFlowNode',
    'EqualizerFlowNode',
    'VocoderFlowNode',
  ]), []);

  const isAudioNodeType = useCallback((t?: string) => !!(t && AUDIO_NODE_TYPES.has(t)), [AUDIO_NODE_TYPES]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      // Validate: only allow connecting to the main-input of an audio node
      // if the source is an audio-capable node (AudioNode or AudioWorklet node)
      try {
        const srcId = (params as Connection).source;
        const tgtId = (params as Connection).target;
        const tgtHandle = (params as Connection).targetHandle;
        const sourceNode = nodesRef.current.find((n) => n.id === srcId);
        const targetNode = nodesRef.current.find((n) => n.id === tgtId);
        if (!sourceNode || !targetNode) {
          // If we can't resolve nodes, be safe and block
          console.debug('[onConnect] Missing source/target node, blocking connection');
          return;
        }
        // Rule applies only when target is main-input of an audio node
        if (tgtHandle === 'main-input' && isAudioNodeType(targetNode.type)) {
          if (!isAudioNodeType(sourceNode.type)) {
            //TODO Check if node before output Node in custom Node is Audio Node
            if (sourceNode.type !== 'FlowNode') {

              console.info('[onConnect] Blocked: main-input of audio node requires an AudioNode/AudioWorklet source', { sourceType: sourceNode.type, targetType: targetNode.type });
              showToast('Only Audio/Worklet sources can connect to main-input', 'error');
              return; // block connection
            }
          }
        }
      } catch (e) {
        // On any unexpected error, block silently to avoid corrupt graph
        console.warn('[onConnect] Validation error, blocking connection', e);
        showToast('Connection failed due to an internal error', 'error');
        return;
      }
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges, isAudioNodeType, showToast]
  );

  const cssButton: React.CSSProperties = {
    color: '#fff',
    display: 'block',
    padding: '4px 6px',
    width: '130px',
    fontSize: '11px',
    lineHeight: 1.1,
    textAlign: 'left' as React.CSSProperties['textAlign'],
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  };

  const onCopyCapture = useCallback(
    (event: ClipboardEvent) => {
      event.preventDefault();
      const selectedNodes = reactFlow?.getNodes().filter((n) => n.selected) ?? [];
      const selectedIds = new Set(selectedNodes.map((n) => n.id));
      const selectedEdges = reactFlow?.getEdges().filter(
        (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
      ) ?? [];

      const payload = JSON.stringify({ nodes: selectedNodes, edges: selectedEdges });
      event.clipboardData?.setData("flowchart:nodes", payload);
    },
    [reactFlow]
  );

  const onPasteCapture = useCallback(
    (event: ClipboardEvent) => {
      event.preventDefault();
      const payload = JSON.parse(
        event.clipboardData?.getData("flowchart:nodes") || "{}"
      ) as { nodes?: any[]; edges?: any[] };
      const copiednodes = payload?.nodes || [];
      const copiededges = payload?.edges || [];
      if (Array.isArray(copiednodes) && copiednodes.length) {
        // Compute original group bounding box center (prefer position, fallback to positionAbsolute)
        const xs = copiednodes.map((n) =>
          (n.position && typeof n.position.x === 'number')
            ? n.position.x
            : (n.positionAbsolute && typeof n.positionAbsolute.x === 'number'
              ? n.positionAbsolute.x
              : 0)
        );
        const ys = copiednodes.map((n) =>
          (n.position && typeof n.position.y === 'number')
            ? n.position.y
            : (n.positionAbsolute && typeof n.positionAbsolute.y === 'number'
              ? n.positionAbsolute.y
              : 0)
        );
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const originalCenter = {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
        };

        // Determine current viewport center in flow coordinates
        let targetCenter = { x: originalCenter.x, y: originalCenter.y };
        try {
          const container = document.querySelector('.react-flow') as HTMLElement | null;
          const width = container?.clientWidth ?? window.innerWidth;
          const height = container?.clientHeight ?? window.innerHeight;
          const screenCenter = { x: width / 2, y: height / 2 };
          // @ts-ignore
          if (reactFlow?.screenToFlowPosition) {
            // @ts-ignore
            targetCenter = reactFlow.screenToFlowPosition(screenCenter);
          }
        } catch {
          // fall back to originalCenter if anything goes wrong
        }

        // Small extra offset so pastes don't sit exactly on originals
        const OFFSET_X = 60;
        const OFFSET_Y = 60;

        const dx = (targetCenter.x - originalCenter.x) + OFFSET_X;
        const dy = (targetCenter.y - originalCenter.y) + OFFSET_Y;

        const shiftedNodes = copiednodes.map((node) => {
          const px = (node.position && typeof node.position.x === 'number')
            ? node.position.x
            : (node.positionAbsolute && typeof node.positionAbsolute.x === 'number'
              ? node.positionAbsolute.x
              : 0);
          const py = (node.position && typeof node.position.y === 'number')
            ? node.position.y
            : (node.positionAbsolute && typeof node.positionAbsolute.y === 'number'
              ? node.positionAbsolute.y
              : 0);
          return {
            ...node,
            position: {
              x: px + dx,
              y: py + dy,
            },
          };
        });

        // Map old ids to new ids for edge remapping
        const idMap = new Map<string, string>();

        const newNodes = shiftedNodes.map((node) => {
          const newId = uuidv4() + "." + node.type;
          idMap.set(node.id, newId);
          const zIndex = ++nextNodeZRef.current;
          return {
            ...node,
            id: newId,
            selected: false,
            zIndex,
            position: { ...node.position },
            data: {
              ...node.data,
              id: newId,
              onChange: (data: any) => {
                eventBus.emit(newId + ".params.updateParams", { nodeid: newId, data: data });
                eventBus.emit("params.updateParams", { nodeid: newId, data: data });
              },
            },
          } as Node;
        });

        const newEdges = copiededges
          .filter((e: any) => idMap.has(e.source) && idMap.has(e.target))
          .map((e: any) => ({
            ...e,
            id: uuidv4() + ".edge",
            selected: false,
            source: idMap.get(e.source) as string,
            target: idMap.get(e.target) as string,
          } as Edge));

        setNodes((nds) => [...nds, ...newNodes]);
        setEdges((eds) => [...eds, ...newEdges]);
        if (audioGraphManagerRef.current !== null) {
          init();
        }
      }
    },
    [reactFlow, setNodes, setEdges]
  );

  useEffect(() => {
    window.addEventListener("copy", onCopyCapture);
    return () => {
      window.removeEventListener("copy", onCopyCapture);
    };
  }, [onCopyCapture]);

  useEffect(() => {
    window.addEventListener("paste", onPasteCapture);
    return () => {
      window.removeEventListener("paste", onPasteCapture);
    };
  }, [onPasteCapture]);

  function saveFlowToIndexedDB(name: string) {
    if (!name) return;
    db.put(name, { nodes, edges });
    sessionStorage.setItem('currentFlow', name);
    setFlowNameInput(name);
    setFlowItems((prev) => prev.includes(name) ? prev : [...prev, name]);
  }

  const renameCurrentFlow = useCallback((newName: string) => {
    const trimmed = newName.trim();
    const oldName = flowNameInput;
    if (!trimmed || trimmed === oldName) return;

    const payloadNodes = strippEverythingButData(nodes);
    const payloadEdges = strippEverythingButData(edges);
    const updatedAt = new Date().toISOString();

    (async () => {
      try {
        if (oldName && oldName !== trimmed) {
          try {
            await db.delete(oldName);
          } catch {
            // ignore
          }
        }

        await db.put(trimmed, {
          nodes: payloadNodes,
          edges: payloadEdges,
          folder_path: currentFlowFolder,
          updated_at: updatedAt,
        });

        if (fsRootHandle) {
          try {
            if (oldName && oldName !== trimmed) {
              await deleteFlowFromDisk(
                fsRootHandle,
                oldName,
                currentFlowFolder
              );
            }

            const flowData: FlowData = {
              name: trimmed,
              nodes: payloadNodes,
              edges: payloadEdges,
              folder_path: currentFlowFolder,
              updated_at: updatedAt,
            };

            await saveFlowToDisk(fsRootHandle, flowData);
          } catch (e) {
            console.warn(
              '[rename] disk write failed',
              e
            );
          }
        }
      } catch (e) {
        console.warn('[rename] local db write failed', e);
      }
    })();

    sessionStorage.setItem('currentFlow', trimmed);
    setFlowNameInput(trimmed);
    setFlowItems((items) => {
      const withoutOld = oldName
        ? items.filter((i) => i !== oldName)
        : items;
      return withoutOld.includes(trimmed)
        ? withoutOld
        : [...withoutOld, trimmed];
    });
  }, [
    currentFlowFolder,
    db,
    edges,
    flowNameInput,
    fsRootHandle,
    nodes,
  ]);

  return (
    <div style={{ height: "100vh", width: "100%", paddingTop: 44 }} onContextMenu={(e) => { e.preventDefault(); setNodePaletteOpen(prev => !prev); }}>
      {/* Inline controls: color pickers for selected node and edge */}
      {/* Color pickers moved into TopBar */}
      {/* Icon Top Bar: left shows open/tools, right shows save/publish/auth/sync */}
      <TopBar
        onNewFlow={() => {
          const name = prompt('Enter a name for the flow:');
          setNodes([]); setEdges([]);
          if (name) saveFlowToIndexedDB(name);
        }}
        onOpenFlow={() => { refreshFlowList(); setOpenDialogFlows(true); }}
        onTogglePalette={() => setNodePaletteOpen(prev => !prev)}
        onSaveFlow={triggerSave}
        onExportFlowJson={exportFlowAsJSON}
        onExportAllJson={exportAllAsJSON}
        onImportFlowJsonClick={() => document.getElementById('import-flow-json-input')?.click()}
        onImportAllJsonClick={() => document.getElementById('import-all-json-input')?.click()}
        onInitAudio={() => { if (!isPlaying) { init(); } }}
        onStopAudio={() => {
          try {
            if (managerRef.current) {
              try { managerRef.current.dispose(); } catch (e) { console.warn('[TopBar] manager dispose failed', e); }
              managerRef.current = undefined;
            }
            audioGraphManagerRef.current = null;
            if (ctx !== undefined) {
              try { ctx.close().catch(() => {}); } catch (e) { console.warn('[TopBar] context close failed', e); }
              (ctx as any) = undefined;
            }
          } finally {
            setIsPlaying(false);
            try { EventBus.getInstance().emit('audio.stopped', {}); } catch { /* noop */ }
          }
        }}
        isPlaying={isPlaying}
        isLoading={isFlowLoading}
        statusLabel={lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'Not Saved'}
        onOpenImpressum={() => setImpressumOpen(true)}
        onOpenDatenschutz={() => setDatenschutzOpen(true)}
        currentItemType={flowNameInput ? 'flow' : undefined}
        currentItemName={flowNameInput || ''}
        selectedNodeType={selectedNodeType || undefined}
        onRenameCurrent={renameCurrentFlow}
        nodeGlowColor={selectedNode ? nodeGlowColor : undefined}
        nodeBgColor={selectedNode ? nodeBgColor : undefined}
        // nodeFontColor removed from TopBar
        edgeColor={selectedEdge ? edgeColor : undefined}
        onNodeGlowColorChange={(col) => {
          setNodeGlowColor(col);
          if (!selectedNode) return;
          setNodes((nds) => nds.map((n) => {
            if (n.id !== selectedNode.id) return n;
            const s: any = { ...(n.data?.style || {}) };
            s.glowColor = col;
            s.boxShadow = makeGlow(col, 'strong');
            return { ...n, data: { ...n.data, style: s } } as any;
          }));
        }}
        onNodeBgColorChange={(col) => {
          setNodeBgColor(col);
          if (!selectedNode) return;
          setNodes((nds) => nds.map((n) => {
            if (n.id !== selectedNode.id) return n;
            const s: any = { ...(n.data?.style || {}) };
            s.background = col;
            return { ...n, data: { ...n.data, style: s } } as any;
          }));
        }}
        // Font color change disabled
        onEdgeColorChange={(col) => {
          setEdgeColor(col);
          if (!selectedEdge) return;
          setEdges((eds) => eds.map((ed) => ed.id === selectedEdge ? ({
            ...ed,
            style: { ...(ed.style || {}), stroke: col, strokeWidth: 2, filter: makeEdgeGlowFilter(col, 'strong') }
          }) : ed));
        }}
        // Integrated Auth Panel props
        audioFolderName={fsRootHandle?.name}
        audioFolderMissing={!fsRootHandle}
        onSelectAudioFolder={chooseFsFolder}
        onChangeAudioFolder={chooseFsFolder}
        onOpenDocs={() => setShowDocsPlayground(true)}
      />

      {showDocsPlayground && (
        <DocsPlayground onClose={() => setShowDocsPlayground(false)} />
      )}


      {/* Audio Explorer (File Browser) */}
      <AudioExplorer
        isOpen={recordingsPanelOpen}
        onClose={() => setRecordingsPanelOpen(false)}
        recordings={recordings}
        allFolderAudio={allFolderAudio}
        uploadedAudio={uploadedAudio}
        onPlay={(item) => {
          try {
            const raw = item.url || item.base64 || item.data || item.content;
            if (!raw) return;
            const isObjectOrHttp = /^blob:|^https?:/.test(raw);
            const isData = raw.startsWith('data:');
            const finalSrc = isData || isObjectOrHttp ? raw : ('data:audio/wav;base64,' + raw);
            setMiniPlayerSrc(finalSrc);
            setMiniPlayerTitle(item.name || 'Recording');
            setMiniPlayerOpen(true);
          } catch (e) {
            console.error('Failed to play audio:', e);
          }
        }}
        onDownload={(item) => {
          try {
            const raw = item.url || item.base64 || item.data || item.content;
            if (!raw) return;
            const isObjectOrHttp = /^blob:|^https?:/.test(raw);
            const isData = raw.startsWith('data:');
            const href = isData || isObjectOrHttp ? raw : ('data:audio/wav;base64,' + raw);
            const fname = item.name ? (item.name.endsWith('.wav') ? item.name : item.name + '.wav') : 'audio.wav';
            const a = document.createElement('a');
            a.href = href;
            a.download = fname;
            a.click();
          } catch (e) {
            console.error('Failed to download audio:', e);
          }
        }}
        onDelete={async (item) => {
          if (fsRootHandle) {
            try {
              // Determine which folder the item belongs to
              const folderName = item._folder || 'recording';
              const dir = await fsRootHandle.getDirectoryHandle(folderName);
              // Extract just the filename from the ID
              const fname = item.name || (item.id.split('-fs-')[0] + '.wav');
              await (dir as any).removeEntry(fname).catch(() => { });
              refreshRecordings();
            } catch (e) {
              console.warn('[FS delete] failed', e);
            }
          } else {
            try {
              await recordingsDbRef.current.delete(item.id);
              refreshRecordings();
            } catch (e) {
              console.warn('[IDB delete] failed', e);
            }
          }
          setUploadedAudio(prev => prev.filter(x => x.id !== item.id));
        }}
      />

      {/* Legal dialogs */}
      <ImpressumDialog open={impressumOpen} onOpenChange={setImpressumOpen} />
      <DatenschutzDialog open={datenschutzOpen} onOpenChange={setDatenschutzOpen} />
      <NodePaletteDialog open={nodePaletteOpen} onOpenChange={setNodePaletteOpen} nodeTypes={nodeTypes} onSelect={(t) => addNode(t)} />
      {/* Audio Folder Selection Prompt (File System Access) */}
      {fsSupported && showFsFolderPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 12, padding: '28px 32px', width: 430, maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, sans-serif' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Select Audio Workspace Folder</h2>
              <p style={{ margin: 0, fontSize: 13, lineHeight: '18px', opacity: .8 }}>FlowSynth can store recordings and sampling snapshots directly on your disk. Choose a folder and we'll create <code style={{ fontSize: 12 }}>recording/</code> and <code style={{ fontSize: 12 }}>sampling/</code> subdirectories. Existing in-browser recordings will be migrated.</p>
              <p style={{ margin: 0, fontSize: 12, opacity: .55 }}>You can revoke access anytime via browser site settings.</p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={chooseFsFolder} style={{ background: '#2d5b1f', border: '1px solid #3a7a28', color: '#fff', padding: '10px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer', flexGrow: 1 }}>Choose Folder…</button>
              <button onClick={() => setShowFsFolderPrompt(false)} style={{ background: '#242424', border: '1px solid #444', color: '#ccc', padding: '10px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer' }}>Skip (use browser storage)</button>
            </div>
            <div style={{ fontSize: 11, opacity: .5 }}>If you skip now you can still pick a folder later from the Audio Assets panel or a future settings menu.</div>
          </div>
        </div>
      )}
      {/* Save Dialog (moved out of hidden container so it is visible) */}
      <Dialog.Root open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{
            background: "rgba(0,0,0,0.5)",
            position: "fixed",
            inset: 0,
            zIndex: 1000
          }} />
          <Dialog.Content style={{
            background: "#222",
            color: "#fff",
            borderRadius: "8px",
            padding: "24px",
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1001,
            minWidth: "320px"
          }}>
            <Dialog.Title>Save Flow</Dialog.Title>
            <Dialog.Description>Enter a name for the current flow:</Dialog.Description>
            <input
              type="text"
              value={saveDialogName}
              onChange={e => setSaveDialogName(e.target.value)}
              style={{
                width: "100%",
                marginTop: "12px",
                marginBottom: "16px",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #444",
                background: "#333",
                color: "#fff"
              }}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setSaveDialogOpen(false)}
                style={{
                  padding: "8px 16px",
                  background: "#555",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDialogConfirm}
                style={{
                  padding: "8px 16px",
                  background: "#28a745",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "background 0.2s, transform 0.1s",
                  outline: "none",
                }}
                onMouseDown={e => e.currentTarget.style.background = "#218838"}
                onMouseUp={e => e.currentTarget.style.background = "#28a745"}
                onMouseLeave={e => e.currentTarget.style.background = "#28a745"}
                onFocus={e => e.currentTarget.style.boxShadow = "0 0 0 2px #155724"}
                onBlur={e => e.currentTarget.style.boxShadow = "none"}
              >
                Save
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <input id="import-flow-json-input" type="file" accept="application/json" onChange={importFlowFromJSON} style={{ display: 'none' }} />
      <input id="import-all-json-input" type="file" accept="application/json" onChange={importAllFromJSON} style={{ display: 'none' }} />
      {/* New Explorer Dialog for Flows */}
      <ExplorerDialog
        open={openDialogFlows}
        localFlows={localFlowMeta}
        folders={folderPaths}
        myFlows={serverFlows.map(f => ({ ...f, _source: 'mine' as const }))}
        publicFlows={publicFlows.map(f => ({ ...f, _source: 'public' as const }))}
        loading={false}
        usePortal
        fullScreen={false}
        onOpenLocal={(name, folder_path) => { openFlowFromIndexedDB(name, folder_path); setOpenDialogFlows(false); }}
        onClose={() => setOpenDialogFlows(false)}
        onDeleteLocal={async (name) => {
          try {
            await db.delete(name);
          } catch (e) { console.warn('Local delete failed', e); }
          setFlowItems(items => items.filter(i => i !== name));
          setLocalFlowMeta(meta => meta.filter(m => m.name !== name));
          if (flowNameInput === name) {
            setFlowNameInput('');
            localStorage.removeItem('currentFlow');
            setNodes([]); setEdges([]);
          }
        }}
        onCreateFolder={(fullPath) => {
          const pathStr = (fullPath || '').trim();
          if (!pathStr) return;
          setFolderPaths(prev => prev.includes(pathStr) ? prev : [...prev, pathStr].sort());
        }}
        onRenameFolder={(oldP, newP) => {
          setFolderPaths(prev => prev.map(p => p === oldP || p.startsWith(oldP + '/') ? newP + p.slice(oldP.length) : p));
          (async () => {
            const all = await db.get('*');
            for (const rec of all) {
              const fp = rec.folder_path || rec.value?.folder_path || '';
              if (fp.startsWith(oldP)) {
                const newFp = newP + fp.slice(oldP.length);
                await db.put(rec.id, { nodes: rec.nodes || rec.value?.nodes || [], edges: rec.edges || rec.value?.edges || [], folder_path: newFp, updated_at: rec.updated_at });
              }
            }
            const refreshed = await db.get('*');
            setLocalFlowMeta(refreshed.map((f: any) => ({ id: f.id, name: (f.id || '').split('/').pop() || f.id, folder_path: f.folder_path || f.value?.folder_path || '', updated_at: f.updated_at, _source: 'local' })));
          })();
        }}
        onMoveFlow={(flow, targetFolder) => {
          (async () => {
            const recs = await db.get(flow.name);
            if (recs && recs[0]) {
              const r = recs[0];
              await db.put(flow.name, { nodes: r.nodes || r.value?.nodes || [], edges: r.edges || r.value?.edges || [], folder_path: targetFolder, updated_at: r.updated_at });
              if (flowNameInput === flow.name) { setCurrentFlowFolder(targetFolder); }
              const refreshed = await db.get('*');
              setLocalFlowMeta(refreshed.map((f: any) => ({ id: f.id, name: (f.id || '').split('/').pop() || f.id, folder_path: f.folder_path || f.value?.folder_path || '', updated_at: f.updated_at, _source: 'local' })));
              const folderSet = new Set<string>();
              refreshed.forEach((f: any) => { const fp = f.folder_path || f.value?.folder_path; if (fp) { const parts = fp.split('/').filter(Boolean); let acc = ''; for (const p of parts) { acc = acc ? acc + '/' + p : p; folderSet.add(acc); } } });
              setFolderPaths(Array.from(folderSet.values()).sort());
            }
          })();
        }}
        onRenameFlow={(flow, newName) => {
          (async () => {
            // Handle local flows
            if (flow._source === 'local') {
              const recs = await db.get(flow.name);
              if (recs && recs[0]) {
                try { await db.delete(flow.name); } catch { }

                // If this is the currently open flow, save the editor's current state
                const isCurrentFlow = flowNameInput === flow.name;
                const nodesToSave = isCurrentFlow ? nodes : (recs[0].nodes || recs[0].value?.nodes || []);
                const edgesToSave = isCurrentFlow ? edges : (recs[0].edges || recs[0].value?.edges || []);
                const updated_at = new Date().toISOString();

                await db.put(newName, { nodes: nodesToSave, edges: edgesToSave, folder_path: recs[0].folder_path || recs[0].value?.folder_path || '', updated_at });
                setFlowItems(prev => prev.filter(n => n !== flow.name).concat(newName));
                setLocalFlowMeta(meta => meta.filter(m => m.name !== flow.name).concat({ id: newName, name: newName, folder_path: flow.folder_path || '', updated_at, _source: 'local' }));
                if (isCurrentFlow) { setFlowNameInput(newName); localStorage.setItem('currentFlow', newName); }

                // Also rename on disk if fs handle is present
                if (fsRootHandle) {
                  try {
                    await deleteFlowFromDisk(fsRootHandle, flow.name, flow.folder_path);
                    const flowData: FlowData = {
                      name: newName,
                      nodes: nodesToSave,
                      edges: edgesToSave,
                      folder_path: flow.folder_path,
                      updated_at
                    };
                    await saveFlowToDisk(fsRootHandle, flowData);
                  } catch (e) { console.warn('Disk rename failed during local rename', e); }
                }
              }
            }
            // Handle remote flows
          })();
        }}
      />
      {/* React Flow Graph */}

      <ReactFlow
        colorMode="dark"
        minZoom={0.05}
        nodes={memoizedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes as any}
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements={false}
        defaultEdgeOptions={{
          // Do not set stroke here so per-edge style.stroke can control color.
          // Keep consistent thickness and caps globally.
          style: { strokeWidth: 1.5, strokeLinecap: 'round' },
        }}
        connectionLineStyle={{ stroke: '#ffffff', strokeWidth: 1.5 }}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>

      {/* Inline Toasts */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: 99999,
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                background: t.kind === 'error' ? '#2b0f12' : '#0f2b12',
                border: `1px solid ${t.kind === 'error' ? '#ff5a6b' : '#2aff9a'}`,
                color: '#fff',
                padding: '8px 10px',
                borderRadius: 8,
                minWidth: 220,
                boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                fontSize: 12,
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
      {/* Mini Player for recording playback */}
      {miniPlayerOpen && (
        <MiniPlayer
          audioSrc={miniPlayerSrc}
          title={miniPlayerTitle}
          onClose={() => setMiniPlayerOpen(false)}
        />
      )}

    </div>

  );
}

export default Flow;