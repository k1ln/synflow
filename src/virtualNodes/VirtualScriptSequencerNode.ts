import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';

/**
 * VirtualScriptSequencerNode
 *
 * A code-driven step sequencer. The user writes a small line-based DSL where
 * EACH LINE is a step and is executed when the clock ticks. The "cursor"
 * advances one line per clock tick (wrap to top). Each line may contain
 * one or more semicolon-separated actions (so a line can be visually
 * split into sub-actions while remaining a single step).
 *
 * Supported actions (case-insensitive):
 *   send <handle> <expr>
 *       Emit a one-shot value on the given output handle.
 *
 *   on   <handle> [<expr>]
 *       Emit a gate-ON (receiveNodeOn) event with optional value.
 *
 *   off  <handle>
 *       Emit a gate-OFF (receiveNodeOff) event.
 *
 *   pulse <handle> <ms>
 *       Emit ON now, OFF after <ms> milliseconds.
 *
 *   ramp <handle> <from>..<to> <duration>
 *       Linearly ramp value from `from` to `to` over a duration, emitting
 *       intermediate "send" events at ~60Hz. Duration units:
 *         500ms      → 500 milliseconds
 *         2t         → 2 ticks (= 2 * current clock period)
 *
 *   array <handle> [v1,v2,v3,...] [<duration>] [swing white|pink <amount>]
 *       Schedule each value evenly spaced across the duration. With a
 *       1-second clock and 5 values you get one value every 200ms.
 *       Optional swing modulates each step time using white or pink noise:
 *           swing white 0.2   → ±20% time jitter
 *           swing pink  0.3   → ±30% pink-noise jitter (smoother)
 *
 *   set   <var> <expr>
 *       Set an internal variable, accessible later as $var.
 *
 *   goto  <line>           — jump to (1-based) line on next tick
 *   loop                   — alias for `goto 1`
 *   repeat <n>             — re-run current line n more times before advancing
 *   wait <n>               — skip the next n ticks (do nothing)
 *   print <expr>           — console.log for debugging
 *   //... or empty line    — no-op
 *
 * Inputs (target handles):
 *   clock          → advance one line per ON event
 *   reset          → reset cursor to line 0
 *   bpm-input      → optional explicit clock period in ms
 *
 * Outputs (source handles):
 *   <auto>         → every handle name referenced in the script becomes
 *                    an output handle (extracted by the React UI).
 */
export interface ScriptSequencerVirtualData {
  script?: string;
  activeLine?: number;
  vars?: Record<string, any>;
  tickIntervalMs?: number; // last measured tick period
  outputCount?: number;
  label?: string;
  onChange?: (d: any) => void;
}
export type ScriptSequencerRuntimeNode = CustomNode & { data: any } & {
  id: string;
};

// ---------- helpers ---------------------------------------------------------

interface ParsedAction {
  type: string;
  raw: string;
  args: string[];
}

function stripComments(line: string): string {
  const ix = line.indexOf('//');
  return (ix >= 0 ? line.slice(0, ix) : line).trim();
}

function splitActions(line: string): string[] {
  // split by ; but ignore semicolons inside [...]
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const c of line) {
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseAction(raw: string): ParsedAction | null {
  const cleaned = stripComments(raw);
  if (!cleaned) return null;
  // Tokenize while preserving [...] groups and quoted strings
  const tokens: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const c = cleaned[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '[') {
      let depth = 1; let j = i + 1;
      while (j < cleaned.length && depth > 0) {
        if (cleaned[j] === '[') depth++;
        else if (cleaned[j] === ']') depth--;
        j++;
      }
      tokens.push(cleaned.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'") {
      const q = c; let j = i + 1;
      while (j < cleaned.length && cleaned[j] !== q) j++;
      tokens.push(cleaned.slice(i, j + 1));
      i = j + 1;
    } else {
      let j = i;
      while (j < cleaned.length && cleaned[j] !== ' ' && cleaned[j] !== '\t') j++;
      tokens.push(cleaned.slice(i, j));
      i = j;
    }
  }
  if (!tokens.length) return null;
  return { type: tokens[0].toLowerCase(), args: tokens.slice(1), raw: cleaned };
}

function parseDuration(token: string | undefined, tickMs: number): number {
  if (!token) return tickMs;
  const m = /^([\d.]+)(ms|t|b|s)?$/i.exec(token);
  if (!m) return tickMs;
  const v = parseFloat(m[1]);
  const u = (m[2] || 'ms').toLowerCase();
  if (u === 'ms') return v;
  if (u === 's') return v * 1000;
  // 't' (ticks) or 'b' (beats) → 1 clock period
  return v * tickMs;
}

function parseArray(token: string): number[] {
  const inner = token.replace(/^\[|\]$/g, '').trim();
  if (!inner) return [];
  return inner.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
}

/**
 * Convert a note name like "C4", "A#5", "Bb3" to its frequency in Hz.
 * A4 = 440. Returns NaN on parse failure.
 */
const NOTE_BASE: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11
};
function noteToHz(text: string): number {
  if (!text) return NaN;
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(text.trim());
  if (!m) return NaN;
  const letter = m[1].toLowerCase();
  const accidental = m[2];
  const octave = parseInt(m[3], 10);
  const base = NOTE_BASE[letter];
  if (base == null || isNaN(octave)) return NaN;
  let semis = base;
  if (accidental === '#') semis += 1;
  else if (accidental === 'b') semis -= 1;
  // MIDI: C-1 = 0, A4 = 69. midi = (octave + 1) * 12 + semis
  const midi = (octave + 1) * 12 + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Paul Kellet's economical pink-noise generator (~-3 dB/oct). */
class PinkNoise {
  private b0 = 0; private b1 = 0; private b2 = 0;
  next(): number {
    const white = Math.random() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + white * 0.0990460;
    this.b1 = 0.96300 * this.b1 + white * 0.2965164;
    this.b2 = 0.57000 * this.b2 + white * 1.0526913;
    const out = this.b0 + this.b1 + this.b2 + white * 0.1848;
    return Math.max(-1, Math.min(1, out * 0.5));
  }
}

// ---------- main class ------------------------------------------------------

export class VirtualScriptSequencerNode extends VirtualNode<
  ScriptSequencerRuntimeNode,
  undefined
> {
  private script: string;
  private lines: string[];
  private active: number = 0;
  private repeatRemaining: number = 0;
  private waitRemaining: number = 0;
  private tickIntervalMs: number = 500; // sane default until we measure
  private lastTickAt: number = 0;
  private vars: Record<string, any> = {};
  private outputCount: number = 0;
  private pink = new PinkNoise();
  private sendOnHandler?: (data: any) => void;
  private sendOffHandler?: (data: any) => void;
  private rampTimers: Set<any> = new Set();

  constructor(
    audioContext: AudioContext | undefined,
    eventBus: EventBus,
    node: ScriptSequencerRuntimeNode
  ) {
    super(audioContext, undefined, eventBus, node);
    this.script = String(node.data?.script ?? '');
    this.lines = this.script.split('\n');
    this.active = node.data?.activeLine ?? 0;
    this.vars = { ...(node.data?.vars || {}) };
    if (typeof node.data?.outputCount === 'number') {
      this.outputCount = node.data.outputCount;
    }
    if (typeof node.data?.tickIntervalMs === 'number') {
      this.tickIntervalMs = node.data.tickIntervalMs;
    }
    this.installSubscriptions();
  }

  private installSubscriptions() {
    const id = this.node.id;
    // Clock advance — main inputs
    const advance = (data: any) => this.onClockTick(data);
    this.eventBus.subscribe(id + '.clock.receiveNodeOn', advance);
    this.eventBus.subscribe(id + '.clock.receivenodeOn', advance);
    this.eventBus.subscribe(id + '.main-input.receiveNodeOn', advance);
    this.eventBus.subscribe(id + '.main-input.receivenodeOn', advance);
    // Manual single-step from UI (no timing update)
    this.eventBus.subscribe(id + '.manualTick', () => this.onClockTick({ manual: true }));
    // Reset
    const reset = () => this.reset();
    this.eventBus.subscribe(id + '.reset.receiveNodeOn', reset);
    this.eventBus.subscribe(id + '.reset.receivenodeOn', reset);
    // NOTE: tickIntervalMs is derived from the actual time between clock
    // ticks (measured in onClockTick). We deliberately do NOT subscribe to
    // a bpm/period input — the clock's own tick rate is the source of truth.

    // Param updates from UI
    this.eventBus.subscribe(id + '.params.updateParams', (p: any) => {
      if (p?.data?.from === 'VirtualScriptSequencerNode') return;
      const d = p?.data || p;
      if (!d) return;
      let changed = false;
      if (typeof d.script === 'string' && d.script !== this.script) {
        this.script = d.script;
        this.lines = this.script.split('\n');
        if (this.active >= this.lines.length) this.active = 0;
        changed = true;
      }
      if (typeof d.activeLine === 'number' && d.activeLine !== this.active) {
        this.active = Math.max(0, Math.min(this.lines.length - 1, d.activeLine));
        changed = true;
      }
      if (d.vars && typeof d.vars === 'object') {
        this.vars = { ...this.vars, ...d.vars };
        changed = true;
      }
      if (typeof d.outputCount === 'number') {
        this.outputCount = d.outputCount;
        changed = true;
      }
      if (changed && this.node.data) {
        this.node.data.script = this.script;
        this.node.data.activeLine = this.active;
        this.node.data.vars = this.vars;
        this.node.data.outputCount = this.outputCount;
      }
    });
  }

  private syncToUI() {
    if (!this.node.data) return;
    this.node.data.activeLine = this.active;
    this.node.data.tickIntervalMs = this.tickIntervalMs;
    this.eventBus.emit('FlowNode.' + this.node.id + '.params.updateParams', {
      nodeid: this.node.id,
      data: {
        activeLine: this.active,
        tickIntervalMs: this.tickIntervalMs,
        vars: this.vars,
        execLines: this._lastExecLines,
        from: 'VirtualScriptSequencerNode'
      }
    });
  }

  reset() {
    this.active = 0;
    this.repeatRemaining = 0;
    this.waitRemaining = 0;
    this._onceFired.clear();
    this.cancelRamps();
    // Run all init: lines immediately at startup
    if (this.lines.length === 0) {
      this.lines = this.script.split('\n');
    }
    for (let i = 0; i < this.lines.length; i++) {
      const stripped = this.lines[i].replace(/\/\/.*/, '').trim();
      if (/^init:/i.test(stripped)) {
        const body = stripped.slice(5).trim();
        if (body) this.executeLine(body);
      }
    }
    this.syncToUI();
  }

  private cancelRamps() {
    this.rampTimers.forEach((t) => clearTimeout(t));
    this.rampTimers.clear();
  }

  // ---- clock ---------------------------------------------------------------

  private onClockTick(data: any) {
    // Manual step from UI: execute without touching timing state.
    const isManual = data?.manual === true;

    if (!isManual) {
      const advertised =
        typeof data?.intervalMs === 'number' && data.intervalMs > 0
          ? data.intervalMs
          : typeof data?.periodMs === 'number' && data.periodMs > 0
          ? data.periodMs
          : typeof data?.bpm === 'number' && data.bpm > 0
          ? (60 / data.bpm) * 1000
          : 0;
      const now = performance.now();
      if (advertised > 0) {
        this.tickIntervalMs = advertised;
      } else if (this.lastTickAt > 0) {
        const dt = now - this.lastTickAt;
        if (dt > 5 && dt < 60_000) {
          this.tickIntervalMs = this.tickIntervalMs * 0.6 + dt * 0.4;
        }
      }
      this.lastTickAt = now;
    }

    if (this.lines.length === 0) {
      this.lines = this.script.split('\n');
    }
    if (this.lines.length === 0) return;

    if (this.waitRemaining > 0) {
      this.waitRemaining--;
      return;
    }

    // Skip init: lines (already ran at startup); execute exec: lines for free.
    // Both run without consuming a tick.
    this._lastExecLines = [];
    const drainFree = () => {
      let g = 0;
      while (g++ < this.lines.length) {
        const _l = (this.lines[this.active] ?? '').replace(/\/\/.*/, '').trim();
        if (/^init:/i.test(_l)) {
          this.active = (this.active + 1) % this.lines.length;
        } else if (/^exec:/i.test(_l)) {
          this._lastExecLines.push(this.active);
          const body = _l.slice(5).trim();
          this._jumped = false; // clear before exec body so we can detect jumps
          if (body) this.executeLine(body);
          if (this._jumped) {
            // exec body did a goto/loop — the target is already in this.active.
            // Clear the flag and continue draining from that target.
            this._jumped = false;
            continue;
          }
          this.active = (this.active + 1) % this.lines.length;
        } else break;
      }
    };
    drainFree();

    const line = this.lines[this.active] ?? '';
    this.executeLine(line);

    // advance unless repeat keeps us on this line
    if (this.repeatRemaining > 0) {
      this.repeatRemaining--;
    } else {
      // a goto/loop action may have set this.active to a target index
      // already; in that case we don't advance again here.
      if (!this._jumped) {
        this.active = (this.active + 1) % this.lines.length;
      }
      this._jumped = false;
      this._inRepeatCycle = false; // finished repeating — arm again next visit
      // Drain exec: lines that follow — they fire in the same tick as the
      // line just executed ("runs at the same time as the previous line").
      drainFree();
    }
    this.syncToUI();
  }

  private _jumped = false;
  private _inRepeatCycle = false;
  /** Line indices (0-based) that have already been run via `once:` prefix. */
  private _onceFired: Set<number> = new Set();
  /** Exec: line indices that fired in the most recent clock tick (for UI flash). */
  private _lastExecLines: number[] = [];

  // ---- execution -----------------------------------------------------------

  /**
   * Evaluate a textual expression to a number / string / boolean.
   * Supports:  numbers, $vars, @notes (e.g. @C4, @A#5, @Bb3 → Hz),
   *            arithmetic + - * / %, parentheses, comparisons
   *            == != < <= > >=, and unary minus.
   */
  private resolveExpr(input: string | undefined): any {
    if (input == null) return undefined;
    const src = String(input).trim();
    if (!src) return undefined;

    // Quick path: a single quoted string returns the string verbatim.
    if ((src.startsWith('"') && src.endsWith('"')) ||
        (src.startsWith("'") && src.endsWith("'"))) {
      return src.slice(1, -1);
    }

    // ---- tokenizer ---------------------------------------------------------
    type Tok =
      | { type: 'num'; value: number }
      | { type: 'var'; name: string }
      | { type: 'op'; value: string }
      | { type: 'lp' }
      | { type: 'rp' };
    const toks: Tok[] = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      // number (with optional duration suffix → ms-equivalent magnitude)
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < n && /[0-9.]/.test(src[j])) j++;
        const numText = src.slice(i, j);
        let num = parseFloat(numText);
        if (j < n && /[a-zA-Z]/.test(src[j])) {
          let k = j;
          while (k < n && /[a-zA-Z]/.test(src[k])) k++;
          const u = src.slice(j, k).toLowerCase();
          if (u === 'ms') { /* keep as-is */ }
          else if (u === 's') num *= 1000;
          else if (u === 't' || u === 'b') num *= this.tickIntervalMs;
          else { /* unknown suffix — ignore */ }
          j = k;
        }
        toks.push({ type: 'num', value: num });
        i = j;
        continue;
      }
      // $variable
      if (c === '$') {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        const name = src.slice(i + 1, j);
        toks.push({ type: 'var', name });
        i = j;
        continue;
      }
      // @note literal
      if (c === '@') {
        // Match note + optional semitone offset: @C4+2, @Bb3-1, @C4+$var, @C4-$var
        const noteMatch = /^([A-Ga-g][#b]?-?\d+)(([+-])(\d+|\$[A-Za-z_]\w*))?/.exec(src.slice(i + 1));
        if (noteMatch) {
          const hz = noteToHz(noteMatch[1]);
          let semis = 0;
          if (noteMatch[2]) {
            const sign = noteMatch[3] === '-' ? -1 : 1;
            if (noteMatch[4].startsWith('$')) {
              const varName = noteMatch[4].slice(1);
              semis = sign * (Number(this.vars[varName]) || 0);
            } else {
              semis = parseInt(noteMatch[2], 10);
            }
          }
          const finalHz = isNaN(hz) ? 0 : hz * Math.pow(2, semis / 12);
          toks.push({ type: 'num', value: finalHz });
          i += 1 + noteMatch[0].length;
        } else {
          i++; // bare '@' — skip
        }
        continue;
      }
      // multi-char operators
      const two = src.slice(i, i + 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
        toks.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      if ('+-*/%<>'.includes(c)) {
        toks.push({ type: 'op', value: c });
        i++;
        continue;
      }
      if (c === '(') { toks.push({ type: 'lp' }); i++; continue; }
      if (c === ')') { toks.push({ type: 'rp' }); i++; continue; }
      // unknown char — bail out and return src as-is
      return src;
    }

    if (toks.length === 0) return undefined;
    if (toks.length === 1 && toks[0].type === 'num') return toks[0].value;
    if (toks.length === 1 && toks[0].type === 'var')
      return this.vars[(toks[0] as any).name];

    // ---- parser (precedence climbing) -------------------------------------
    let p = 0;
    const peek = () => toks[p];
    const eat = () => toks[p++];

    const PREC: Record<string, number> = {
      '==': 1, '!=': 1, '<': 1, '<=': 1, '>': 1, '>=': 1,
      '+': 2, '-': 2,
      '*': 3, '/': 3, '%': 3
    };

    const parsePrimary = (): number => {
      const t = peek();
      if (!t) return 0;
      if (t.type === 'num') { eat(); return t.value; }
      if (t.type === 'var') {
        eat();
        const v = this.vars[(t as any).name];
        return typeof v === 'number' ? v : Number(v) || 0;
      }
      if (t.type === 'lp') {
        eat();
        const v = parseExpr(0);
        if (peek()?.type === 'rp') eat();
        return v;
      }
      if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
        eat();
        const sign = t.value === '-' ? -1 : 1;
        return sign * parsePrimary();
      }
      eat();
      return 0;
    };

    const parseExpr = (minPrec: number): number => {
      let lhs = parsePrimary();
      while (true) {
        const t = peek();
        if (!t || t.type !== 'op') break;
        const prec = PREC[t.value];
        if (prec == null || prec < minPrec) break;
        eat();
        const rhs = parseExpr(prec + 1);
        switch (t.value) {
          case '+': lhs = lhs + rhs; break;
          case '-': lhs = lhs - rhs; break;
          case '*': lhs = lhs * rhs; break;
          case '/': lhs = rhs === 0 ? 0 : lhs / rhs; break;
          case '%': lhs = rhs === 0 ? 0 : lhs % rhs; break;
          case '==': lhs = lhs === rhs ? 1 : 0; break;
          case '!=': lhs = lhs !== rhs ? 1 : 0; break;
          case '<':  lhs = lhs <  rhs ? 1 : 0; break;
          case '<=': lhs = lhs <= rhs ? 1 : 0; break;
          case '>':  lhs = lhs >  rhs ? 1 : 0; break;
          case '>=': lhs = lhs >= rhs ? 1 : 0; break;
        }
      }
      return lhs;
    };

    return parseExpr(0);
  }

  /**
   * Parse `if: <cond>: <then> [else: <else>]` and return
   * { cond, thenBody, elseBody } or null if the input doesn't match.
   * The condition ends at the first `:` that is NOT part of `else:`.
   */
  private parseInlineIf(s: string): { cond: string; thenBody: string; elseBody: string } | null {
    // Must start with "if:" (case-insensitive)
    const m = /^if:\s*/i.exec(s);
    if (!m) return null;
    const rest = s.slice(m[0].length); // everything after "if: "
    // Find condition end: first `:` that is not followed by more letters forming "else:"
    let colonIdx = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === ':') {
        // Make sure it's not part of "else:"
        const before4 = rest.slice(Math.max(0, i - 4), i + 1).toLowerCase();
        if (!before4.endsWith('else:')) {
          colonIdx = i;
          break;
        }
      }
    }
    if (colonIdx < 0) return null;
    const cond = rest.slice(0, colonIdx).trim();
    const afterCond = rest.slice(colonIdx + 1).trim();
    // Split on the first "else:" token
    const elseMatch = /\belse:/i.exec(afterCond);
    const thenBody = elseMatch ? afterCond.slice(0, elseMatch.index).trim() : afterCond.trim();
    const elseBody = elseMatch ? afterCond.slice(elseMatch.index + elseMatch[0].length).trim() : '';
    return { cond, thenBody, elseBody };
  }

  private executeLine(rawLine: string) {
    const stripped = stripComments(rawLine);
    if (!stripped) return;
    // init: prefix — already executed at startup; skip during normal playback.
    if (/^init:/i.test(stripped)) return;
    // exec: prefix — execute immediately (tick-free); used from drainFree().
    // If executeLine is called on an exec: line directly, just run the body.
    if (/^exec:/i.test(stripped)) {
      const body = stripped.slice(5).trim();
      if (body) this.executeLine(body);
      return;
    }
    // once: prefix — run only on the first visit; skip on subsequent passes.
    if (/^once:/i.test(stripped)) {
      if (this._onceFired.has(this.active)) return;
      this._onceFired.add(this.active);
      const body = stripped.slice(5).trim();
      if (body) this.executeLine(body);
      return;
    }
    // inline if: — `if: <cond>: <then> [else: <else>]`
    const inlineIf = this.parseInlineIf(stripped);
    if (inlineIf) {
      const cond = this.resolveExpr(inlineIf.cond);
      const branch = cond ? inlineIf.thenBody : inlineIf.elseBody;
      if (branch) this.executeLine(branch);
      return;
    }
    const actions = splitActions(stripped);
    let skipNext = false;
    // null = no pending if/else, true = last if was true, false = last if was false
    let pendingElse: boolean | null = null;

    for (const a of actions) {
      const trimmedA = a.trim();
      const isElse = /^else:/i.test(trimmedA);

      if (isElse) {
        const elseBody = trimmedA.slice(5).trim();
        if (pendingElse === false) {
          // if-condition was false → run else branch
          const parsed = parseAction(elseBody);
          if (parsed) {
            try { this.executeAction(parsed); }
            catch (e) { console.warn('[ScriptSequencer] else action failed:', parsed.raw, e); }
          }
        }
        pendingElse = null; // consume
        continue;
      }

      const parsed = parseAction(trimmedA);
      if (!parsed) continue;

      if (skipNext) {
        skipNext = false;
        // keep pendingElse so the else: token after this can still fire
        continue;
      }

      if (parsed.type === 'if') {
        const argStr = parsed.args.join(' ');
        // Detect inline-if: `if $i>6: set i 0 else: inc $i`
        // (colon embedded in args means it's an inline-if without the `if:` prefix)
        if (argStr.includes(':')) {
          const inlineIf = this.parseInlineIf('if: ' + argStr);
          if (inlineIf) {
            const cond = this.resolveExpr(inlineIf.cond);
            const branch = cond ? inlineIf.thenBody : inlineIf.elseBody;
            if (branch) this.executeLine(branch);
          }
          pendingElse = null;
        } else {
          // Legacy semicolon-gating form: `if <expr> ; <next-action>`
          const cond = this.resolveExpr(argStr);
          const condBool = !!cond;
          skipNext = !condBool;
          pendingElse = condBool;
        }
        continue;
      }

      // inline if: used as a semicolon-separated action
      // e.g.  send #0 1 ; if: $i>5: set i 0 else: inc $i ; loop
      if (parsed.type === 'if:') {
        const inlineIf = this.parseInlineIf(trimmedA);
        if (inlineIf) {
          const cond = this.resolveExpr(inlineIf.cond);
          const branch = cond ? inlineIf.thenBody : inlineIf.elseBody;
          if (branch) this.executeLine(branch);
        }
        pendingElse = null;
        continue;
      }

      // A normal action that actually runs resets the if/else chain
      pendingElse = null;
      try {
        this.executeAction(parsed);
      } catch (e) {
        console.warn('[ScriptSequencer] action failed:', parsed.raw, e);
      }
    }
  }

  private executeAction(p: ParsedAction) {
    switch (p.type) {
      case 'send': {
        const handle = p.args[0];
        // If the value is an array literal `[a, b, c]`, alias to `array`
        // and schedule the values evenly across the current tick.
        if (p.args[1] && p.args[1].startsWith('[') && p.args[1].endsWith(']')) {
          const arrayAction: ParsedAction = {
            type: 'array',
            args: [handle, ...p.args.slice(1)],
            raw: p.raw
          };
          this.executeAction(arrayAction);
          return;
        }
        const value = this.resolveExpr(p.args.slice(1).join(' '));
        this.emitSend(handle, value);
        return;
      }
      case 'on': {
        const handle = p.args[0];
        const value = p.args.length > 1
          ? this.resolveExpr(p.args.slice(1).join(' '))
          : 1;
        this.emitOn(handle, value);
        return;
      }
      case 'off': {
        this.emitOff(p.args[0]);
        return;
      }
      case 'pulse': {
        const handle = p.args[0];
        const ms = parseDuration(p.args[1], this.tickIntervalMs);
        this.emitOn(handle, 1);
        const t = setTimeout(() => {
          this.rampTimers.delete(t);
          this.emitOff(handle);
        }, ms);
        this.rampTimers.add(t);
        return;
      }
      case 'ramp': {
        // ramp <handle> <from>..<to> <duration>
        const handle = p.args[0];
        const range = p.args[1] || '0..1';
        const [fromStr, toStr] = range.split('..');
        const from = Number(this.resolveExpr(fromStr));
        const to = Number(this.resolveExpr(toStr));
        const duration = parseDuration(p.args[2], this.tickIntervalMs);
        this.runRamp(handle, from, to, duration);
        return;
      }
      case 'array': {
        // array <handle> [v1,...] [<duration>] [swing white|pink <amount>]
        const handle = p.args[0];
        const arrToken = p.args[1] || '[]';
        // Evaluate each element through resolveExpr so notes / vars / math work.
        const inner = arrToken.replace(/^\[|\]$/g, '').trim();
        const values: number[] = inner
          ? inner.split(',').map((s) => Number(this.resolveExpr(s.trim())))
              .filter((n) => !isNaN(n))
          : [];
        let duration = this.tickIntervalMs;
        let swingType: 'white' | 'pink' | null = null;
        let swingAmount = 0;
        for (let i = 2; i < p.args.length; i++) {
          const tok = p.args[i];
          if (tok.toLowerCase() === 'swing') {
            const kind = (p.args[i + 1] || '').toLowerCase();
            const amt = parseFloat(p.args[i + 2] || '0');
            if (kind === 'white' || kind === 'pink') {
              swingType = kind;
              swingAmount = isNaN(amt) ? 0 : amt;
              i += 2;
            }
          } else {
            const d = parseDuration(tok, this.tickIntervalMs);
            if (!isNaN(d) && d > 0) duration = d;
          }
        }
        this.runArray(handle, values, duration, swingType, swingAmount);
        return;
      }
      case 'sendrandom': {
        // sendrandom <handle> [v1,...] [<duration>] [swing white|pink <amount>]
        // Same as array but Fisher-Yates shuffles the values first.
        const handle = p.args[0];
        const arrToken = p.args[1] || '[]';
        const inner = arrToken.replace(/^\[|\]$/g, '').trim();
        const values: number[] = inner
          ? inner.split(',').map((s) => Number(this.resolveExpr(s.trim())))
              .filter((n) => !isNaN(n))
          : [];
        // Fisher-Yates shuffle
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
        let duration = this.tickIntervalMs;
        let swingType: 'white' | 'pink' | null = null;
        let swingAmount = 0;
        for (let i = 2; i < p.args.length; i++) {
          const tok = p.args[i];
          if (tok.toLowerCase() === 'swing') {
            const kind = (p.args[i + 1] || '').toLowerCase();
            const amt = parseFloat(p.args[i + 2] || '0');
            if (kind === 'white' || kind === 'pink') {
              swingType = kind;
              swingAmount = isNaN(amt) ? 0 : amt;
              i += 2;
            }
          } else {
            const d = parseDuration(tok, this.tickIntervalMs);
            if (!isNaN(d) && d > 0) duration = d;
          }
        }
        this.runArray(handle, values, duration, swingType, swingAmount);
        return;
      }
      case 'random': {
        // random <handle> [v1,v2,...]   → pick one element, emit via send
        // random <handle> <a>..<b>      → uniform random between a..b
        // random <var>   [v1,v2,...]    → store in $var instead of sending
        const target = p.args[0] || '';
        const valueToken = p.args[1] || '';
        let picked: number | undefined;
        if (valueToken.startsWith('[') && valueToken.endsWith(']')) {
          const inner = valueToken.slice(1, -1).trim();
          const items = inner
            ? inner.split(',').map((s) => Number(this.resolveExpr(s.trim())))
                .filter((n) => !isNaN(n))
            : [];
          if (items.length === 0) return;
          picked = items[Math.floor(Math.random() * items.length)];
        } else if (valueToken.includes('..')) {
          const [aStr, bStr] = valueToken.split('..');
          const a = Number(this.resolveExpr(aStr));
          const b = Number(this.resolveExpr(bStr));
          if (isNaN(a) || isNaN(b)) return;
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          picked = lo + Math.random() * (hi - lo);
        } else {
          // No range/array given — emit a uniform [0,1).
          picked = Math.random();
        }
        if (picked === undefined) return;
        // Decide: var assignment vs handle emission.
        if (target.startsWith('$')) {
          this.vars[target.slice(1)] = picked;
        } else {
          this.emitSend(target, picked);
        }
        return;
      }
      case 'set': {
        const name = (p.args[0] || '').replace(/^\$/, '');
        // Allow optional `=` separator: `set $i = expr` or `set $i expr`
        const rest = p.args.slice(1);
        const exprParts = rest[0] === '=' ? rest.slice(1) : rest;
        const val = this.resolveExpr(exprParts.join(' '));
        if (name) this.vars[name] = val;
        return;
      }
      case 'inc': {
        const name = (p.args[0] || '').replace(/^\$/, '');
        const step = p.args.length > 1
          ? Number(this.resolveExpr(p.args.slice(1).join(' ')))
          : 1;
        if (name) {
          const cur = Number(this.vars[name] ?? 0);
          this.vars[name] = (isNaN(cur) ? 0 : cur) + (isNaN(step) ? 1 : step);
        }
        return;
      }
      case 'dec': {
        const name = (p.args[0] || '').replace(/^\$/, '');
        const step = p.args.length > 1
          ? Number(this.resolveExpr(p.args.slice(1).join(' ')))
          : 1;
        if (name) {
          const cur = Number(this.vars[name] ?? 0);
          this.vars[name] = (isNaN(cur) ? 0 : cur) - (isNaN(step) ? 1 : step);
        }
        return;
      }
      case 'goto': {
        const target = parseInt(p.args[0], 10);
        if (!isNaN(target) && this.lines.length > 0) {
          // user sees 1-based, internal is 0-based
          this.active = Math.max(0, Math.min(this.lines.length - 1, target - 1));
          this._jumped = true;
        }
        return;
      }
      case 'loop': {
        this.active = 0;
        this._jumped = true;
        return;
      }
      // ifgoto <expr> <line>  — jump to <line> when <expr> is truthy
      case 'ifgoto': {
        if (p.args.length < 2) return;
        const condArgs = p.args.slice(0, -1);
        const lineArg = p.args[p.args.length - 1];
        const cond = this.resolveExpr(condArgs.join(' '));
        if (cond) {
          const target = parseInt(lineArg, 10);
          if (!isNaN(target) && this.lines.length > 0) {
            this.active = Math.max(0, Math.min(this.lines.length - 1, target - 1));
            this._jumped = true;
          }
        }
        return;
      }
      // ifloop <expr>  — jump to line 1 when <expr> is truthy
      case 'ifloop': {
        const cond = this.resolveExpr(p.args.join(' '));
        if (cond) {
          this.active = 0;
          this._jumped = true;
        }
        return;
      }
      case 'repeat': {
        // Guard: only arm the counter when NOT already in a repeat cycle.
        // Without this, the repeat command on the same line re-runs every
        // tick and resets the counter to N each time → infinite loop.
        if (!this._inRepeatCycle) {
          const n = parseInt(p.args[0], 10);
          if (!isNaN(n) && n > 0) {
            this.repeatRemaining = n;
            this._inRepeatCycle = true;
          }
        }
        return;
      }
      case 'wait': {
        const n = parseInt(p.args[0], 10);
        if (!isNaN(n) && n > 0) this.waitRemaining = n;
        return;
      }
      case 'print': {
        const v = this.resolveExpr(p.args.join(' '));
        // eslint-disable-next-line no-console
        console.log('[ScriptSequencer]', this.node.id, v);
        // Also emit on the dedicated debug output so it reaches a Log node.
        const payload = { value: v, label: p.args.join(' '), sourceHandle: 'debug', fromNode: this.node.id };
        this.eventBus.emit(this.node.id + '.debug.sendNodeOn', payload);
        if (this.sendOnHandler) this.sendOnHandler(payload);
        return;
      }
      default:
        // unknown action — warn so it shows up in console
        console.warn('[ScriptSequencer]', this.node.id, 'unknown action:', p.type, p.args.join(' '));
        return;
    }
  }

  // ---- ramp / array schedulers --------------------------------------------

  private runRamp(
    handle: string,
    from: number,
    to: number,
    durationMs: number
  ) {
    if (!isFinite(from) || !isFinite(to) || durationMs <= 0) {
      this.emitSend(handle, to);
      return;
    }
    const stepMs = 16; // ~60Hz
    const steps = Math.max(1, Math.ceil(durationMs / stepMs));
    const start = performance.now();
    this.emitSend(handle, from);
    let i = 1;
    const tick = () => {
      const t = (performance.now() - start) / durationMs;
      if (t >= 1) {
        this.emitSend(handle, to);
        return;
      }
      const v = from + (to - from) * t;
      this.emitSend(handle, v);
      i++;
      const next = setTimeout(tick, stepMs);
      this.rampTimers.add(next);
    };
    const first = setTimeout(tick, stepMs);
    this.rampTimers.add(first);
    void steps;
  }

  private runArray(
    handle: string,
    values: number[],
    durationMs: number,
    swingType: 'white' | 'pink' | null,
    swingAmount: number
  ) {
    if (!values.length) return;
    const baseStep = durationMs / values.length;
    let elapsed = 0;
    const swingSample = (): number => {
      if (!swingType || swingAmount <= 0) return 0;
      const r = swingType === 'white'
        ? Math.random() * 2 - 1
        : this.pink.next();
      return r * swingAmount * baseStep;
    };
    // emit first immediately
    this.emitSend(handle, values[0]);
    for (let k = 1; k < values.length; k++) {
      const jitter = swingSample();
      elapsed += Math.max(1, baseStep + jitter);
      const v = values[k];
      const t = setTimeout(() => {
        this.rampTimers.delete(t);
        this.emitSend(handle, v);
      }, elapsed);
      this.rampTimers.add(t);
    }
  }

  // ---- emission ------------------------------------------------------------

  /**
   * Convert a script-side handle reference into a runtime handle id.
   * Accepted forms:
   *   - "#3"       → "out-3"
   *   - "out-3"    → "out-3"  (already resolved)
   *   - "3"        → "out-3"  (bare numeric tolerated)
   *   - "gate"     → "gate"   (legacy named handles still work)
   */
  private resolveHandle(raw: string | undefined): string {
    if (!raw) return '';
    const t = String(raw).trim();
    if (!t) return '';
    if (t.startsWith('#')) {
      const n = parseInt(t.slice(1), 10);
      if (!isNaN(n)) return 'out-' + n;
    }
    if (/^\d+$/.test(t)) return 'out-' + t;
    return t;
  }

  private emitSend(handle: string, value: any) {
    const h = this.resolveHandle(handle);
    if (!h) return;
    const payload = { value, sourceHandle: h, fromNode: this.node.id };
    this.eventBus.emit(this.node.id + '.' + h + '.sendNodeOn', payload);
    if (this.sendOnHandler) this.sendOnHandler(payload);
  }
  private emitOn(handle: string, value: any) {
    const h = this.resolveHandle(handle);
    if (!h) return;
    const payload = { value, gate: 1, sourceHandle: h, fromNode: this.node.id };
    this.eventBus.emit(this.node.id + '.' + h + '.sendNodeOn', payload);
    if (this.sendOnHandler) this.sendOnHandler(payload);
  }
  private emitOff(handle: string) {
    const h = this.resolveHandle(handle);
    if (!h) return;
    const payload = { gate: 0, sourceHandle: h, fromNode: this.node.id };
    this.eventBus.emit(this.node.id + '.' + h + '.sendNodeOff', payload);
    if (this.sendOffHandler) this.sendOffHandler(payload);
  }

  public setSendNodeOn(handler: (data: any) => void) {
    this.sendOnHandler = handler;
  }
  public setSendNodeOff(handler: (data: any) => void) {
    this.sendOffHandler = handler;
  }
}

export default VirtualScriptSequencerNode;
