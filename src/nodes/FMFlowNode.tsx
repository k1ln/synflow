import React, { useState, useEffect, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import { OptionSelect } from "../components/OptionSelect";
import { NumberField } from "../components/NumberField";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

const ALGO_NAMES = ["Sine", "2-op", "3-stack", "4-stack", "E.Piano", "3x2", "1→3", "6-stack FB", "Organ"];
const ACCENT = "#c084fc"; // FM purple

// Routing per algorithm — mirrors ALGOS in src/wasm/fm_synth/src/lib.rs (who
// modulates whom). pos: opIndex -> [column, level]; level 0 is the carrier rail
// at the bottom, higher levels stack modulators above what they modulate.
type AlgoGraph = { pos: Record<number, [number, number]>; edges: [number, number][]; carriers: number[] };
const ALGO_GRAPH: AlgoGraph[] = [
  { pos: { 0: [0, 0] }, edges: [], carriers: [0] },                                                                   // Sine
  { pos: { 0: [0, 0], 1: [0, 1] }, edges: [[1, 0]], carriers: [0] },                                                  // 2-op
  { pos: { 0: [0, 0], 1: [0, 1], 2: [0, 2] }, edges: [[1, 0], [2, 1]], carriers: [0] },                               // 3-stack
  { pos: { 0: [0, 0], 1: [0, 1], 2: [0, 2], 3: [0, 3] }, edges: [[1, 0], [2, 1], [3, 2]], carriers: [0] },            // 4-stack
  { pos: { 0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1] }, edges: [[1, 0], [3, 2]], carriers: [0, 2] },                 // E.Piano
  { pos: { 0: [0, 0], 1: [0, 1], 2: [1, 0], 3: [1, 1], 4: [2, 0], 5: [2, 1] }, edges: [[1, 0], [3, 2], [5, 4]], carriers: [0, 2, 4] }, // 3x2
  { pos: { 0: [0, 0], 1: [1, 0], 2: [2, 0], 3: [1, 1] }, edges: [[3, 0], [3, 1], [3, 2]], carriers: [0, 1, 2] },      // 1->3
  { pos: { 0: [0, 0], 1: [0, 1], 2: [0, 2], 3: [0, 3], 4: [0, 4], 5: [0, 5] }, edges: [[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]], carriers: [0] }, // 6-stack FB
  { pos: { 0: [0, 0], 1: [1, 0], 2: [2, 0], 3: [3, 0], 4: [4, 0], 5: [5, 0] }, edges: [], carriers: [0, 1, 2, 3, 4, 5] }, // Organ
];
const ALGO_USED: Set<number>[] = ALGO_GRAPH.map((g) => new Set(Object.keys(g.pos).map(Number)));

// Live signal-flow diagram for the selected algorithm: carriers (filled, heard)
// at the bottom feeding the output rail, modulators (outlined) stacked above
// with arrows into what they shape, plus OP6's feedback loop where it applies.
const AlgoDiagram: React.FC<{ algo: number; accent: string }> = ({ algo, accent }) => {
  const g = ALGO_GRAPH[Math.max(0, Math.min(ALGO_GRAPH.length - 1, algo | 0))];
  const BW = 30, BH = 19, COL = 42, ROW = 30, PAD = 9, RAIL = 12;
  const ops = Object.keys(g.pos).map(Number);
  const maxCol = Math.max(...ops.map((o) => g.pos[o][0]));
  const maxLvl = Math.max(...ops.map((o) => g.pos[o][1]));
  const carriers = new Set(g.carriers);
  const used = new Set(ops);
  const hasFb = used.has(5); // the FB knob always drives OP6 (see lib.rs fm_process)
  const unused = [0, 1, 2, 3, 4, 5].filter((o) => !used.has(o));
  const topPad = hasFb ? 22 : PAD;
  const rPad = hasFb ? 22 : PAD;
  const W = maxCol * COL + BW + PAD + rPad;
  const H = maxLvl * ROW + BH + topPad + PAD + RAIL;
  const railY = H - PAD;
  const cx = (o: number) => PAD + g.pos[o][0] * COL + BW / 2;
  const cy = (o: number) => topPad + (maxLvl - g.pos[o][1]) * ROW + BH / 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, maxHeight: 156, height: "auto" }}>
        <defs>
          <marker id="fm-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={accent} />
          </marker>
        </defs>
        {/* output rail + carrier feeds */}
        <line x1={PAD} y1={railY} x2={W - PAD} y2={railY} stroke={accent} strokeWidth={1.1} opacity={0.35} />
        {g.carriers.map((o) => (
          <line key={`r${o}`} x1={cx(o)} y1={cy(o) + BH / 2} x2={cx(o)} y2={railY} stroke={accent} strokeWidth={1.3} opacity={0.45} />
        ))}
        {/* modulation edges (modulator -> what it shapes) */}
        {g.edges.map(([from, to], i) => (
          <line key={`e${i}`} x1={cx(from)} y1={cy(from) + BH / 2} x2={cx(to)} y2={cy(to) - BH / 2}
            stroke={accent} strokeWidth={1.5} markerEnd="url(#fm-arrow)" opacity={0.85} />
        ))}
        {/* OP6 feedback self-loop */}
        {hasFb && (
          <path d={`M ${cx(5) + BW / 2} ${cy(5) - 4} C ${cx(5) + BW / 2 + 16} ${cy(5) - 9}, ${cx(5) + 3} ${cy(5) - BH / 2 - 16}, ${cx(5)} ${cy(5) - BH / 2}`}
            fill="none" stroke={accent} strokeWidth={1.3} strokeDasharray="2 2" markerEnd="url(#fm-arrow)" opacity={0.7} />
        )}
        {/* operators */}
        {ops.map((o) => {
          const isC = carriers.has(o);
          return (
            <g key={o}>
              <rect x={cx(o) - BW / 2} y={cy(o) - BH / 2} width={BW} height={BH} rx={4}
                fill={isC ? accent : "#161b27"} stroke={accent} strokeWidth={1.3} />
              <text x={cx(o)} y={cy(o) + 0.5} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fontWeight={700} fill={isC ? "#1a0a26" : accent} style={{ userSelect: "none" }}>OP{o + 1}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2px 10px", fontSize: 8.5, color: "#9aa3b8", letterSpacing: "0.03em" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: accent }} /> carrier (heard)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, border: `1.3px solid ${accent}`, background: "#161b27", boxSizing: "border-box" }} /> modulator
        </span>
      </div>
      {unused.length > 0 && (
        <div style={{ fontSize: 8.5, color: "#6b7488", letterSpacing: "0.03em" }}>
          unused: {unused.map((o) => `OP${o + 1}`).join(", ")}
        </div>
      )}
    </div>
  );
};

export type FMFlowNodeProps = {
  data: {
    label: string;
    algorithm: number;
    feedback: number;
    attack: number; decay: number; sustain: number; release: number;
    ratio0: number; ratio1: number; ratio2: number; ratio3: number; ratio4: number; ratio5: number;
    level0: number; level1: number; level2: number; level3: number; level4: number; level5: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    fbMidiMapping?: MidiMapping | null;
  };
};

const FMFlowNode: React.FC<FMFlowNodeProps> = ({ data }) => {
  const nodeId = (data as any).id || "fm";
  const flowId = (data as any).flowId || "default";

  const [algorithm, setAlgorithm] = useState<number>(data.algorithm ?? 1);
  const [feedback, setFeedback] = useState(data.feedback ?? 0);
  const [attack, setAttack] = useState(data.attack ?? 0.005);
  const [decay, setDecay] = useState(data.decay ?? 0.3);
  const [sustain, setSustain] = useState(data.sustain ?? 0.7);
  const [release, setRelease] = useState(data.release ?? 0.3);
  const [ratios, setRatios] = useState<number[]>([0, 1, 2, 3, 4, 5].map((i) => (data as any)[`ratio${i}`] ?? 1));
  const [levels, setLevels] = useState<number[]>([0, 1, 2, 3, 4, 5].map((i) => (data as any)[`level${i}`] ?? (i === 0 ? 1 : 0)));
  const [label, setLabel] = useState(data.label ?? "FM");
  const [fbMidiMapping, setFbMidiMapping] = useState<MidiMapping | null>(data.fbMidiMapping ?? null);

  useEffect(() => {
    if (data.onChange instanceof Function) {
      const ops: Record<string, number> = {};
      for (let i = 0; i < 6; i++) { ops[`ratio${i}`] = ratios[i]; ops[`level${i}`] = levels[i]; }
      data.onChange({ ...data, algorithm, feedback, attack, decay, sustain, release, ...ops, label, fbMidiMapping });
    }
  }, [algorithm, feedback, attack, decay, sustain, release, ratios, levels, label, fbMidiMapping]);

  const setRatio = (i: number, v: number) => setRatios((r) => r.map((x, k) => (k === i ? v : x)));
  const setLevel = (i: number, v: number) => setLevels((l) => l.map((x, k) => (k === i ? v : x)));

  // Audition a note (on, then off shortly after).
  const note = useCallback(() => {
    try {
      const bus = EventBus.getInstance();
      bus.emit(`${nodeId}.main-input.receiveNodeOn`, { velocity: 1 });
      window.setTimeout(() => bus.emit(`${nodeId}.main-input.receiveNodeOff`, {}), 600);
    } catch { /* noop */ }
  }, [nodeId]);

  const numCell: React.CSSProperties = { width: 42, background: "#0a0d14", border: "1px solid #2c3a55", color: "#cdd6e6", borderRadius: 4, padding: "1px 3px", fontSize: 10 };

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px 0 18px", marginBottom: 6, gap: 4 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>FM 6-OP</b>
        <button onClick={note} title="Audition a note"
          style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, cursor: "pointer", color: "#1a0a26", fontWeight: 700, border: "none", background: ACCENT }}>Note</button>
      </div>
      <div className="node-field" style={{ marginBottom: 6, paddingLeft: 10 }}>
        <OptionSelect
          value={algorithm}
          onChange={(v) => setAlgorithm(Number(v))}
          options={ALGO_NAMES.map((nm, i) => ({ value: i, label: nm }))}
          accentColor={ACCENT}
          aria-label="Algorithm"
        />
      </div>

      {/* Trigger / pitch in, audio out */}
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      <Handle type="target" position={Position.Left} id="frequency" style={{ top: 44 }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      {/* Operator grid (left) + live routing diagram (right). Rows for operators
          the current algorithm doesn't touch are dimmed so it's obvious they
          have no effect. */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "4px 2px 8px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto auto", gap: "2px 6px", alignItems: "center", fontSize: 10 }}>
          <span />
          <span className="node-label" style={{ textAlign: "center" }}>Ratio</span>
          <span className="node-label" style={{ textAlign: "center" }}>Level</span>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const active = ALGO_USED[algorithm]?.has(i) ?? true;
            const dim = active ? 1 : 0.4;
            return (
              <React.Fragment key={i}>
                <span className="node-label" style={{ opacity: dim }}>OP{i + 1}</span>
                <NumberField value={ratios[i]} onCommit={(v) => setRatio(i, v)} step={0.5} min={0} max={64} precision={2} className="" style={{ ...numCell, opacity: dim }} />
                <NumberField value={levels[i]} onCommit={(v) => setLevel(i, v)} step={0.05} min={0} max={1} precision={2} className="" style={{ ...numCell, opacity: dim }} />
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ flex: 1, minWidth: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlgoDiagram algo={algorithm} accent={ACCENT} />
        </div>
      </div>

      {/* Feedback + envelope */}
      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">FB</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={feedback} onChange={(v) => setFeedback(Math.min(1, Math.max(0, v)))}
            midiMapping={fbMidiMapping} onMidiLearnChange={setFbMidiMapping} midiSensitivity={0.5} label="FB" persistKey={`fm:${flowId}:${nodeId}:fb`} />
        </div>
        <div className="node-field">
          <span className="node-label">A</span>
          <MidiKnob accentColor={ACCENT} min={0} max={2} value={attack} onChange={(v) => setAttack(Math.max(0, v))} midiSensitivity={0.5} label="A" persistKey={`fm:${flowId}:${nodeId}:a`} />
        </div>
        <div className="node-field">
          <span className="node-label">D</span>
          <MidiKnob accentColor={ACCENT} min={0} max={3} value={decay} onChange={(v) => setDecay(Math.max(0, v))} midiSensitivity={0.5} label="D" persistKey={`fm:${flowId}:${nodeId}:d`} />
        </div>
        <div className="node-field">
          <span className="node-label">S</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={sustain} onChange={(v) => setSustain(Math.min(1, Math.max(0, v)))} midiSensitivity={0.5} label="S" persistKey={`fm:${flowId}:${nodeId}:s`} />
        </div>
        <div className="node-field">
          <span className="node-label">R</span>
          <MidiKnob accentColor={ACCENT} min={0} max={3} value={release} onChange={(v) => setRelease(Math.max(0, v))} midiSensitivity={0.5} label="R" persistKey={`fm:${flowId}:${nodeId}:r`} />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "FM",
  algorithm: 4,
  feedback: 0.0,
  attack: 0.004, decay: 0.6, sustain: 0.4, release: 0.4,
  ratio0: 1, ratio1: 1, ratio2: 1, ratio3: 14, ratio4: 1, ratio5: 1,
  level0: 1, level1: 0.7, level2: 0.6, level3: 0.4, level4: 0, level5: 0,
};

export default React.memo(FMFlowNode);
