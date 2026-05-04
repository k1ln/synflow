import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import CodeMirror, {
  ReactCodeMirrorRef
} from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import {
  StateField,
  StateEffect,
  RangeSetBuilder
} from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  ViewPlugin
} from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import EventBus from '../sys/EventBus';
import './AudioNode.css';
import './ScriptSequencerFlowNode.css';

export interface FavoriteItem {
  id: string;
  token: string;
  type: 'var' | 'number' | 'note';
  label?: string;
  rowHeight?: number; // px; 36 = compact, 64 = expanded
  pos?: number;      // absolute char offset in script — identifies a specific occurrence
}

export interface ScriptSequencerFlowNodeData {
  id?: string;
  label?: string;
  script?: string;
  activeLine?: number;
  tickIntervalMs?: number;
  /** How many output handles to render. Auto-grows when the script
   *  references a higher index via `#N`. Each handle (`out-N`) accepts
   *  any action — send / on / off / pulse / ramp / array. */
  outputCount?: number;
  /** How many value-input handles to render on the left (in-0, in-1, …).
   *  Their live values are stored in $in0, $in1, … for use in the script. */
  inputCount?: number;
  showOutputs?: boolean;
  showFavorites?: boolean;
  favorites?: FavoriteItem[];
  vars?: Record<string, any>;
  onChange?: (d: any) => void;
  style?: React.CSSProperties;
}

export interface ScriptSequencerFlowNodeProps {
  id?: string;
  data: ScriptSequencerFlowNodeData;
}

const DEFAULT_SCRIPT = `// proprietary script — runs one line per clock tick
// connect a clock to "clock" (left), "reset" to reset the cursor.
// outputs are referenced by index using #N (e.g. #0, #1, #2)
// every output can send anything: gate, value, ramp, array, ...
on #0
ramp #1 0..1 1t
array #2 [0.1, 0.3, 0.5, 0.7] 1t swing pink 0.2
off #0
loop`;

const DEFAULT_OUTPUT_COUNT = 3;

export const SSQ_HANDLE_PREFIX = 'out-';

/** Build the engine handle id from an output index. */
export function ssqHandleId(index: number): string {
  return SSQ_HANDLE_PREFIX + index;
}

// Find the highest output index referenced in the script via #N notation.
const INDEX_RE = /(?:^|[^\w])#(\d+)\b/g;
function maxReferencedIndex(script: string): number {
  let max = -1;
  let m: RegExpExecArray | null;
  while ((m = INDEX_RE.exec(script)) !== null) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

/** Neutral handle color — every output sends anything. */
const OUTPUT_COLOR = '#7d7';

// =====================================================================
// CodeMirror: simple stream-based highlighter for the SSQ DSL
// =====================================================================

const SSQ_VERBS = new Set([
  'send',
  'on',
  'off',
  'pulse',
  'ramp',
  'array',
  'sendrandom',
  'set',
  'inc',
  'dec',
  'if',
  'ifgoto',
  'ifloop',
  'random',
  'goto',
  'loop',
  'repeat',
  'wait',
  'print'
]);

const SSQ_MODIFIERS = new Set(['swing', 'white', 'pink']);

const SSQ_KEYWORDS = new Set([...SSQ_VERBS, ...SSQ_MODIFIERS]);

const ssqStreamParser = {
  startState: () => ({ atLineStart: true }),
  token(stream: any, state: { atLineStart: boolean }) {
    if (stream.sol()) state.atLineStart = true;
    if (stream.eatSpace()) return null;

    // Line comment
    if (stream.match(/\/\/.*/)) return 'comment';
    // else: and once: and if: and init: and exec: line prefixes
    if (stream.match(/else:/i)) return 'keyword';
    if (stream.match(/once:/i)) return 'keyword';
    if (stream.match(/if:/i)) return 'keyword';
    if (stream.match(/init:/i)) return 'keyword';
    if (stream.match(/exec:/i)) return 'keyword';
    // Output reference #N → distinct color (labelName)
    if (stream.match(/#\d+\b/)) return 'labelName';
    // Note literal @C4, @A#5, @Bb-1, with optional semitone offset @C4+2 / @C4-3
    if (stream.match(/@[A-Ga-g][#b]?-?\d+(?:[+-]\d+)?/)) return 'string2';
    // Variable reference $name
    if (stream.match(/\$[A-Za-z_][\w]*/)) return 'variableName';
    // Strings
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/'(?:[^'\\]|\\.)*'/)) return 'string';
    // Range operator first (so it doesn't get eaten by number)
    if (stream.match(/\.\./)) return 'operator';
    // Numbers with optional duration suffix
    if (stream.match(/-?\d+(?:\.\d+)?(?:ms|s|t|b)\b/)) return 'number';
    if (stream.match(/-?\d+(?:\.\d+)?/)) return 'number';
    // Punctuation
    if (stream.match(/[;,()\[\]]/)) return 'punctuation';
    // Identifier / keyword
    if (stream.match(/[A-Za-z_][\w-]*/)) {
      const word = (stream.current() as string).toLowerCase();
      const wasLineStart = state.atLineStart;
      state.atLineStart = false;
      if (SSQ_VERBS.has(word)) return wasLineStart ? 'keyword' : 'keyword';
      if (SSQ_MODIFIERS.has(word)) return 'atom';
      return 'name';
    }
    if (stream.match(/;/)) {
      state.atLineStart = true;
      return 'punctuation';
    }
    state.atLineStart = false;
    stream.next();
    return null;
  }
};

// State field + effect for the running-line highlight
const setRunningLineEffect = StateEffect.define<number>();

const ssqActiveLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setRunningLineEffect)) {
        const lineNum = e.value;
        const docLines = tr.state.doc.lines;
        if (lineNum < 0 || lineNum >= docLines) return Decoration.none;
        const line = tr.state.doc.line(lineNum + 1); // 1-based
        const builder = new RangeSetBuilder<Decoration>();
        builder.add(
          line.from,
          line.from,
          Decoration.line({ attributes: { class: 'ssq-cm-running' } })
        );
        deco = builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f)
});

const ssqRunningLineTheme = EditorView.baseTheme({
  '.ssq-cm-running': {
    backgroundColor: 'rgba(120, 230, 140, 0.18)',
    boxShadow: 'inset 2px 0 0 rgba(120, 230, 140, 0.85)',
    transition: 'background-color 120ms ease'
  },
  '.ssq-cm-exec': {
    backgroundColor: 'rgba(120, 230, 140, 0.10)',
    boxShadow: 'inset 2px 0 0 rgba(120, 230, 140, 0.55)',
  },
  '.ssq-cm-error': {
    backgroundColor: 'rgba(255, 80, 80, 0.10)',
    boxShadow: 'inset 2px 0 0 rgba(255, 90, 90, 0.85)'
  },
  '.ssq-cm-error-gutter': {
    color: '#ff6464',
    width: '12px',
    paddingLeft: '2px'
  },
  // Custom token colors layered on top of vscodeDark
  '.cm-content .tok-labelName, .cm-content [class*="tok-labelName"]': {
    color: '#ffd479'
  },
  // ---- Inline token highlight marks (◈ mode) ----
  '.ssq-tok-hl': {
    borderRadius: '2px',
    padding: '0 1px',
    cursor: 'pointer'
  },
  '.ssq-tok-hl--var': {
    boxShadow: '0 0 0 1px #4a9eff',
    backgroundColor: 'rgba(74, 158, 255, 0.12)'
  },
  '.ssq-tok-hl--note': {
    boxShadow: '0 0 0 1px #7dc87d',
    backgroundColor: 'rgba(125, 200, 125, 0.12)'
  },
  '.ssq-tok-hl--number': {
    boxShadow: '0 0 0 1px #d7ba7d',
    backgroundColor: 'rgba(215, 186, 125, 0.12)'
  },
  '.ssq-tok-hl.ssq-tok-hl--fav': {
    boxShadow: '0 0 0 1.5px #fc0',
    backgroundColor: 'rgba(255, 192, 0, 0.18)'
  }
});

// =====================================================================
// Script validator → line-level errors
// =====================================================================

export interface SsqError {
  line: number; // 0-based line number in the document
  message: string;
}

/** Split a raw line into actions, respecting `[...]` depth. */
function ssqSplitActions(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) {
      out.push(buf.trim());
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const HANDLE_RE = /^(?:#\d+|out-\d+|\d+|[A-Za-z_][\w-]*)$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

/** Tokenize an action string for validation (very loose). */
function ssqTokenize(s: string): string[] {
  // Treat [..] as a single token so we can validate array literals.
  const tokens: string[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '[') {
      let depth = 1;
      let j = i + 1;
      while (j < n && depth > 0) {
        if (s[j] === '[') depth++;
        else if (s[j] === ']') depth--;
        j++;
      }
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }
    // Word / number / symbol
    let j = i;
    while (j < n && !/\s/.test(s[j]) && s[j] !== '[') j++;
    tokens.push(s.slice(i, j));
    i = j;
  }
  return tokens;
}

function validateAction(action: string): string | null {
  const trimmed = action.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return null;
  // else: prefix — validate the body
  if (/^else:/i.test(trimmed)) {
    const body = trimmed.slice(5).trim();
    if (!body) return 'else: needs an action after it (e.g. else: send #0 0)';
    return validateAction(body);
  }
  // exec: prefix — validate the body
  if (/^exec:/i.test(trimmed)) {
    const body = trimmed.slice(5).trim();
    if (!body) return 'exec: needs an action after it (e.g. exec: set $i 0)';
    return validateAction(body);
  }
  // init: prefix — validate the body
  if (/^init:/i.test(trimmed)) {
    const body = trimmed.slice(5).trim();
    if (!body) return 'init: needs an action after it (e.g. init: set $i 0)';
    return validateAction(body);
  }
  // once: prefix — validate the body
  if (/^once:/i.test(trimmed)) {
    const body = trimmed.slice(5).trim();
    if (!body) return 'once: needs an action after it (e.g. once: set $i 0)';
    return validateAction(body);
  }
  // if: <cond>: <then> [else: <else>] inline form
  if (/^if:/i.test(trimmed)) {
    const colonIdx = trimmed.indexOf(':', 3);
    if (colonIdx < 0) return 'if: missing condition colon — use `if: <cond>: <action>`';
    const afterCond = trimmed.slice(colonIdx + 1).trim();
    const elseMatch = /\belse:/i.exec(afterCond);
    const thenBody = elseMatch ? afterCond.slice(0, elseMatch.index).trim() : afterCond;
    const elseBody = elseMatch ? afterCond.slice(elseMatch.index + elseMatch[0].length).trim() : '';
    if (!thenBody) return 'if: missing then-action after the condition colon';
    const thenErr = validateAction(thenBody);
    if (thenErr) return thenErr;
    if (elseBody) {
      const elseErr = validateAction(elseBody);
      if (elseErr) return elseErr;
    }
    return null;
  }
  const toks = ssqTokenize(trimmed);
  if (toks.length === 0) return null;
  const verb = toks[0].toLowerCase();
  const rest = toks.slice(1);

  if (!SSQ_VERBS.has(verb)) {
    return `unknown command "${toks[0]}" — expected one of: ${[...SSQ_VERBS].join(', ')}`;
  }

  // Common helpers — accept #N OR a bare number (alias) OR a known name.
  const isHandle = (t: string) => HANDLE_RE.test(t);

  switch (verb) {
    case 'send':
      if (rest.length < 2) return 'send: expected `send #N <expr>`';
      if (!isHandle(rest[0])) return `send: invalid output handle "${rest[0]}" (use #N)`;
      return null;
    case 'on':
      if (rest.length < 1) return 'on: expected `on #N [expr]`';
      if (!isHandle(rest[0])) return `on: invalid output handle "${rest[0]}"`;
      return null;
    case 'off':
      if (rest.length < 1) return 'off: expected `off #N`';
      if (!isHandle(rest[0])) return `off: invalid output handle "${rest[0]}"`;
      if (rest.length > 1) return 'off: takes only `off #N`';
      return null;
    case 'pulse':
      if (rest.length < 2) return 'pulse: expected `pulse #N <duration>`';
      if (!isHandle(rest[0])) return `pulse: invalid output handle "${rest[0]}"`;
      // Duration may be `50ms`, `1t`, `$x` etc — accept anything non-empty.
      return null;
    case 'ramp': {
      if (rest.length < 3) return 'ramp: expected `ramp #N <a..b> <duration>`';
      if (!isHandle(rest[0])) return `ramp: invalid output handle "${rest[0]}"`;
      // The range token must contain `..` somewhere.
      if (!rest[1].includes('..')) return `ramp: invalid range "${rest[1]}" (e.g. 0..1, @C4..@C5)`;
      return null;
    }
    case 'array':
    case 'sendrandom': {
      if (rest.length < 2) return `${verb}: expected \`${verb} #N [v,v,…] <duration> [swing white|pink <amt>]\``;
      if (!isHandle(rest[0])) return `${verb}: invalid output handle "${rest[0]}"`;
      if (!rest[1].startsWith('[') || !rest[1].endsWith(']'))
        return `${verb}: expected literal \`[v, v, …]\` after the output`;
      // Optional duration / swing — find the swing block if any
      const swingIdx = rest.findIndex((t) => t.toLowerCase() === 'swing');
      if (swingIdx >= 0) {
        const k = (rest[swingIdx + 1] || '').toLowerCase();
        if (k !== 'white' && k !== 'pink')
          return `${verb}: swing kind must be "white" or "pink"`;
        const amt = rest[swingIdx + 2];
        if (!amt) return `${verb}: swing amount missing (e.g. 0.2)`;
      }
      return null;
    }
    case 'set':
      // Allow `set $i = expr` or `set $i expr`
      if (rest.length < 2) return 'set: expected `set <var> <expr>` or `set <var> = <expr>`';
      if (rest.length < 3 && rest[1] === '=') return 'set: missing expression after `=`';
      return null;
    case 'inc':
      if (rest.length < 1) return 'inc: expected `inc <var> [step]`';
      return null;
    case 'dec':
      if (rest.length < 1) return 'dec: expected `dec <var> [step]`';
      return null;
    case 'ifgoto':
      if (rest.length < 2) return 'ifgoto: expected `ifgoto <expr> <line>`';
      return null;
    case 'ifloop':
      if (rest.length < 1) return 'ifloop: expected `ifloop <expr>`';
      return null;
    case 'random': {
      if (rest.length < 1) return 'random: expected `random #N [a,b,c]` or `random #N a..b` or `random $var [a,b,c]`';
      const target = rest[0];
      if (!target.startsWith('$') && !isHandle(target))
        return `random: invalid target "${target}" (use #N or $var)`;
      const v = rest[1];
      if (v && !v.startsWith('[') && !v.includes('..') && rest.length > 1)
        return `random: invalid value "${v}" (expected [a,b,c] or a..b)`;
      return null;
    }
    case 'goto':
      if (rest.length < 1 || !NUMBER_RE.test(rest[0]))
        return 'goto: expected `goto <line-number>`';
      return null;
    case 'loop':
      if (rest.length > 0) return 'loop: takes no arguments';
      return null;
    case 'repeat':
      if (rest.length < 1 || !NUMBER_RE.test(rest[0]))
        return 'repeat: expected `repeat <count>`';
      return null;
    case 'wait':
      if (rest.length < 1 || !NUMBER_RE.test(rest[0]))
        return 'wait: expected `wait <ticks>`';
      return null;
    case 'print':
      return null;
  }
  return null;
}

export function validateScript(script: string): SsqError[] {
  const errors: SsqError[] = [];
  const lines = script.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/\/\/.*$/, '').trim();
    if (!stripped) continue;
    // Validate each `;`-separated action
    const actions = ssqSplitActions(stripped);
    for (const a of actions) {
      const err = validateAction(a);
      if (err) {
        errors.push({ line: i, message: err });
        break; // one error per line is enough
      }
    }
  }
  return errors;
}

// CodeMirror state: errors rendered as line decorations + gutter marker
const setErrorsEffect = StateEffect.define<SsqError[]>();

const ssqErrorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorsEffect)) {
        const errors = e.value;
        const docLines = tr.state.doc.lines;
        const builder = new RangeSetBuilder<Decoration>();
        // RangeSetBuilder requires sorted-by-position adds.
        const sorted = [...errors].sort((a, b) => a.line - b.line);
        for (const err of sorted) {
          if (err.line < 0 || err.line >= docLines) continue;
          const line = tr.state.doc.line(err.line + 1);
          builder.add(
            line.from,
            line.from,
            Decoration.line({
              attributes: {
                class: 'ssq-cm-error',
                title: err.message
              }
            })
          );
        }
        deco = builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f)
});

// ---- exec: line flash decoration ------------------------------------------

const flashExecLinesEffect = StateEffect.define<number[]>();

const ssqExecFlashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(flashExecLinesEffect)) {
        const execLines = e.value;
        if (execLines.length === 0) { deco = Decoration.none; continue; }
        const docLines = tr.state.doc.lines;
        const builder = new RangeSetBuilder<Decoration>();
        const sorted = [...execLines].sort((a, b) => a - b);
        for (const lineNum of sorted) {
          if (lineNum < 0 || lineNum >= docLines) continue;
          const line = tr.state.doc.line(lineNum + 1);
          builder.add(line.from, line.from,
            Decoration.line({ attributes: { class: 'ssq-cm-exec' } }));
        }
        deco = builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f)
});

// ---- inline token highlight decorations ------------------------------------

type TokenPos = {
  from: number; to: number;
  type: 'var' | 'number' | 'note';
  token: string;
  isFav: boolean;
};

function findAllTokenPositions(script: string, favSet: Set<number>): TokenPos[] {
  const result: TokenPos[] = [];
  const lines = script.split('\n');
  let offset = 0;
  for (const line of lines) {
    const ci = line.indexOf('//');
    const safe = ci >= 0 ? line.slice(0, ci) : line;
    for (const m of safe.matchAll(/\$([A-Za-z_]\w*)/g)) {
      const from = offset + m.index!;
      result.push({ from, to: from + m[0].length, type: 'var', token: m[0], isFav: favSet.has(from) });
    }
    for (const m of safe.matchAll(/@[A-Ga-g][#b]?-?\d+(?:[+-]\d+)?/g)) {
      const from = offset + m.index!;
      result.push({ from, to: from + m[0].length, type: 'note', token: m[0], isFav: favSet.has(from) });
    }
    for (const m of safe.matchAll(/(?<![#$@\w.])(\d+(?:\.\d+)?)(?![\w.])/g)) {
      const from = offset + m.index!;
      result.push({ from, to: from + m[0].length, type: 'number', token: m[0], isFav: favSet.has(from) });
    }
    offset += line.length + 1;
  }
  return result.sort((a, b) => a.from - b.from);
}

const setHighlightTokensEffect = StateEffect.define<TokenPos[]>();

const ssqHighlightMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHighlightTokensEffect)) {
        if (e.value.length === 0) { deco = Decoration.none; continue; }
        const builder = new RangeSetBuilder<Decoration>();
        for (const t of e.value) {
          const cls = `ssq-tok-hl ssq-tok-hl--${t.type}${t.isFav ? ' ssq-tok-hl--fav' : ''}`;
          builder.add(t.from, t.to, Decoration.mark({ class: cls }));
        }
        deco = builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f)
});

/** Per-view registry of "add token to favorites" callbacks for click handling. */
const _tokenClickHandlerMap = new WeakMap<
  EditorView,
  (token: string, type: 'var' | 'number' | 'note', pos: number) => void
>();

const ssqTokenClickPlugin = ViewPlugin.fromClass(
  class { constructor(_v: EditorView) {} },
  {
    eventHandlers: {
      mousedown(e: MouseEvent, view: EditorView) {
        const deco = view.state.field(ssqHighlightMarksField, false);
        if (!deco || (deco as any).size === 0) return;
        const docPos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (docPos == null) return;
        const tokens = findAllTokenPositions(view.state.doc.toString(), new Set<number>());
        const hit = tokens.find((t) => t.from <= docPos && docPos <= t.to);
        if (!hit) return;
        const handler = _tokenClickHandlerMap.get(view);
        if (handler) handler(hit.token, hit.type, hit.from);
        // Don't preventDefault — let CM place the cursor normally too
      }
    }
  }
);

// ---- token/favorites helpers -----------------------------------------------

const NOTE_CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_BASE_MAP: Record<string, number> = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 };

function stepNote(noteFull: string, semitones: number): string {
  const prefix = noteFull.startsWith('@') ? '@' : '';
  const text = prefix ? noteFull.slice(1) : noteFull;
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(text);
  if (!m) return noteFull;
  const base = NOTE_BASE_MAP[m[1].toLowerCase()] ?? 0;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = parseInt(m[3], 10);
  let midi = (octave + 1) * 12 + base + acc + semitones;
  midi = Math.max(0, Math.min(127, midi));
  const newOctave = Math.floor(midi / 12) - 1;
  const newSemi = ((midi % 12) + 12) % 12;
  return prefix + NOTE_CHROMATIC[newSemi] + newOctave;
}

function stepNumToken(numStr: string, direction: number): string {
  const n = parseFloat(numStr);
  if (isNaN(n)) return numStr;
  const hasDot = numStr.includes('.');
  const step = hasDot ? Math.pow(10, -(numStr.split('.')[1] || '').length) : 1;
  const newVal = n + direction * step;
  if (hasDot) {
    const decimals = (numStr.split('.')[1] || '').length;
    return newVal.toFixed(Math.max(1, decimals));
  }
  return String(Math.round(newVal));
}

function replaceTokenInScript(
  script: string, oldToken: string, newToken: string,
  type: 'var' | 'number' | 'note'
): string {
  if (type === 'note') {
    return script.split(oldToken).join(newToken);
  }
  if (type === 'number') {
    const escaped = oldToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return script.replace(new RegExp('(?<![#$@\\w.])' + escaped + '(?![\\w.])', 'g'), newToken);
  }
  return script;
}

function extractScriptTokens(script: string): Array<{ type: 'var' | 'number' | 'note'; token: string }> {
  const seen = new Set<string>();
  const result: Array<{ type: 'var' | 'number' | 'note'; token: string }> = [];
  const stripped = script.replace(/\/\/[^\n]*/g, '');
  for (const m of stripped.matchAll(/\$([A-Za-z_]\w*)/g)) {
    const t = '$' + m[1];
    if (!seen.has(t)) { seen.add(t); result.push({ type: 'var', token: t }); }
  }
  for (const m of stripped.matchAll(/@[A-Ga-g][#b]?-?\d+/g)) {
    const t = m[0];
    if (!seen.has(t)) { seen.add(t); result.push({ type: 'note', token: t }); }
  }
  for (const m of stripped.matchAll(/(?<![#$@\w.])(\d+(?:\.\d+)?)(?![\w])/g)) {
    const t = m[1];
    if (!seen.has(t)) { seen.add(t); result.push({ type: 'number', token: t }); }
  }
  return result;
}

// ---- Token panel sub-component ---------------------------------------------

const TokenPanel: React.FC<{
  script: string;
  favorites: FavoriteItem[];
  onToggle: (token: string, type: 'var' | 'number' | 'note') => void;
}> = React.memo(({ script, favorites, onToggle }) => {
  const tokens = useMemo(() => extractScriptTokens(script), [script]);
  const favSet = useMemo(() => new Set(favorites.map((f) => f.token)), [favorites]);
  if (tokens.length === 0) {
    return <div className="ssq-token-panel ssq-token-panel--empty">no tokens found</div>;
  }
  return (
    <div className="ssq-token-panel">
      {tokens.map(({ type, token }) => (
        <button
          key={token}
          className={`ssq-token-chip ssq-token-chip--${type}${favSet.has(token) ? ' ssq-token-chip--fav' : ''}`}
          title={`${type}: ${token} — click to ${favSet.has(token) ? 'remove from' : 'add to'} favorites`}
          onClick={() => onToggle(token, type)}
        >
          <span className="ssq-token-icon">
            {type === 'var' ? 'x' : type === 'note' ? '♪' : '#'}
          </span>
          <span className="ssq-token-label">{token}</span>
          <span className="ssq-token-star">{favSet.has(token) ? '\u2605' : '\u2606'}</span>
        </button>
      ))}
    </div>
  );
});

// ---- Favorites panel sub-component -----------------------------------------

const FavoritesPanel: React.FC<{
  favorites: FavoriteItem[];
  runtimeVars: Record<string, any>;
  script: string;
  showFavorites: boolean;
  onToggleShow: () => void;
  onStep: (fav: FavoriteItem, dir: number) => void;
  onRemove: (id: string) => void;
  onToggleHeight: (id: string) => void;
}> = React.memo(({ favorites, runtimeVars, script, showFavorites, onToggleShow, onStep, onRemove, onToggleHeight }) => {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Keep selectedId valid when favorites change
  React.useEffect(() => {
    if (selectedId && !favorites.find((f) => f.id === selectedId)) {
      setSelectedId(null);
    }
  }, [favorites, selectedId]);

  // Keyboard handler — fires when panel is focused
  const onKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (!selectedId) return;
    const fav = favorites.find((f) => f.id === selectedId);
    if (!fav) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      onStep(fav, 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      onStep(fav, -1);
    }
  }, [selectedId, favorites, onStep]);

  // Wheel handler on the whole panel — only acts on selected fav
  const onWheel = React.useCallback((e: React.WheelEvent) => {
    if (!selectedId) return;
    const fav = favorites.find((f) => f.id === selectedId);
    if (!fav) return;
    e.stopPropagation();
    onStep(fav, e.deltaY < 0 ? 1 : -1);
  }, [selectedId, favorites, onStep]);

  return (
    <div
      className="ssq-fav-panel"
      ref={panelRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      style={{ outline: 'none' }}
    >
      <div className="ssq-outputs-head" onClick={onToggleShow}>
        <span style={{ display: 'inline-block', transform: showFavorites ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms ease' }}>▶</span>
        <span>Favorites ({favorites.length}){selectedId ? ` — ▲▼ or wheel to step` : ''}</span>
      </div>
      {showFavorites && (
        <div className="ssq-fav-list">
          {favorites.map((fav) => {
            const isExpanded = (fav.rowHeight ?? 36) > 36;
            const isSelected = fav.id === selectedId;
            const varName = fav.token.startsWith('$') ? fav.token.slice(1) : fav.token;
            const lineNum = fav.pos !== undefined ? script.slice(0, fav.pos).split('\n').length : null;
            const displayValue = fav.type === 'var'
              ? `${fav.token} = ${runtimeVars[varName] ?? '?'}${lineNum !== null ? '  L' + lineNum : ''}`
              : lineNum !== null
                ? `${fav.token}  L${lineNum}`
                : fav.token;
            return (
              <div
                key={fav.id}
                className={`ssq-fav-row${isExpanded ? ' ssq-fav-row--expanded' : ''}${isSelected ? ' ssq-fav-row--selected' : ''}`}
                style={{ height: isExpanded ? undefined : fav.rowHeight ? fav.rowHeight + 'px' : undefined }}
                onClick={() => {
                  setSelectedId((prev) => (prev === fav.id ? null : fav.id));
                  panelRef.current?.focus();
                }}
              >
                <span className={`ssq-fav-type-icon ssq-fav-type--${fav.type}`}>
                  {fav.type === 'var' ? 'x' : fav.type === 'note' ? '♪' : '#'}
                </span>
                <span className="ssq-fav-value">{displayValue}</span>
                <button className="ssq-btn ssq-fav-step" title="Increase" onClick={(e) => { e.stopPropagation(); onStep(fav, 1); }}>▲</button>
                <button className="ssq-btn ssq-fav-step" title="Decrease" onClick={(e) => { e.stopPropagation(); onStep(fav, -1); }}>▼</button>
                <button className="ssq-btn" title="Toggle size" onClick={(e) => { e.stopPropagation(); onToggleHeight(fav.id); }} style={{ fontSize: 10 }}>
                  {isExpanded ? '⊟' : '⊞'}
                </button>
                <button className="ssq-btn ssq-del" title="Remove from favorites" onClick={(e) => { e.stopPropagation(); onRemove(fav.id); }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});


const ScriptSequencerFlowNode: React.FC<ScriptSequencerFlowNodeProps> = ({
  id,
  data
}) => {
  const eventBus = EventBus.getInstance();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeId = (data.id ?? id) as string;

  const [script, setScript] = useState<string>(
    data.script ?? DEFAULT_SCRIPT
  );
  const [activeLine, setActiveLine] = useState<number>(
    data.activeLine ?? 0
  );
  const [tickIntervalMs, setTickIntervalMs] = useState<number>(
    data.tickIntervalMs ?? 0
  );
  const [outputCount, setOutputCount] = useState<number>(
    typeof data.outputCount === 'number' && data.outputCount > 0
      ? data.outputCount
      : DEFAULT_OUTPUT_COUNT
  );
  const [inputCount, setInputCount] = useState<number>(
    typeof data.inputCount === 'number' && data.inputCount > 0
      ? data.inputCount
      : 0
  );
  const [showOutputs, setShowOutputs] = useState<boolean>(data.showOutputs ?? false);
  const [showHighlight, setShowHighlight] = useState<boolean>(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>(data.favorites ?? []);
  const [showFavorites, setShowFavorites] = useState<boolean>(data.showFavorites ?? true);
  const [runtimeVars, setRuntimeVars] = useState<Record<string, any>>(data.vars ?? {});
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const lines = useMemo(() => script.split('\n'), [script]);

  // Effective number of handles = max(declared count, max #N referenced + 1)
  const effectiveCount = useMemo(() => {
    const referenced = maxReferencedIndex(script);
    return Math.max(outputCount, referenced + 1);
  }, [outputCount, script]);

  const outputsKey = effectiveCount + '-' + inputCount;
  const suppressOnChange = useRef(false);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  // Set to true when the virtual-node handler already pushed CM effects so
  // the activeLine useEffect below can skip its redundant dispatch.
  const cmUpdatedFromHandlerRef = useRef(false);

  // Subscribe to virtual-node updates (active line, tick interval, vars, exec lines)
  useEffect(() => {
    const ch = 'FlowNode.' + nodeId + '.params.updateParams';
    const handler = (p: any) => {
      if (p?.nodeid !== nodeId) return;
      const d = p?.data || p;
      if (typeof d?.activeLine === 'number') {
        setActiveLine(d.activeLine);
        // Push running-line + exec highlights together so exec: lines stay
        // green until the *next* tick rather than flashing for 600 ms.
        const view = cmRef.current?.view;
        if (view) {
          cmUpdatedFromHandlerRef.current = true;
          const execLines: number[] = Array.isArray(d?.execLines) ? d.execLines : [];
          view.dispatch({
            effects: [
              setRunningLineEffect.of(d.activeLine),
              flashExecLinesEffect.of(execLines)
            ]
          });
        }
      }
      if (typeof d?.tickIntervalMs === 'number') setTickIntervalMs(d.tickIntervalMs);
      if (d?.vars && typeof d.vars === 'object')
        setRuntimeVars((prev) => ({ ...prev, ...d.vars }));
    };
    eventBus.subscribe(ch, handler);
    return () => eventBus.unsubscribe(ch, handler);
  }, [nodeId, eventBus]);

  // Re-render handles when output set changes
  useEffect(() => {
    if (nodeId) updateNodeInternals(nodeId);
  }, [outputsKey, nodeId, updateNodeInternals]);

  // Push the running-line highlight into the CodeMirror view whenever
  // the cursor changes. When a tick arrived from the virtual node the
  // handler already dispatched both effects together; skip here to avoid
  // clearing exec highlights that were just set.  For manual jumps
  // (jumpToLine, reset) the ref is false, so we dispatch running line
  // and clear any stale exec highlights.
  useEffect(() => {
    if (cmUpdatedFromHandlerRef.current) {
      cmUpdatedFromHandlerRef.current = false;
      return;
    }
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({
      effects: [
        setRunningLineEffect.of(activeLine),
        flashExecLinesEffect.of([]) // clear stale exec highlights on manual navigation
      ]
    });
  }, [activeLine]);

  // Validate script and push errors into CodeMirror
  const scriptErrors = useMemo(() => validateScript(script), [script]);
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({ effects: setErrorsEffect.of(scriptErrors) });
  }, [scriptErrors]);

  // Update inline token highlight marks whenever showHighlight, script, or favorites change
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    if (!showHighlight) {
      view.dispatch({ effects: setHighlightTokensEffect.of([]) });
      return;
    }
    const favSet = new Set<number>(favorites.map((f) => f.pos).filter((p): p is number => p !== undefined));
    view.dispatch({ effects: setHighlightTokensEffect.of(findAllTokenPositions(script, favSet)) });
  }, [showHighlight, script, favorites]);

  // Persist + push to virtual node
  useEffect(() => {
    if (suppressOnChange.current) {
      suppressOnChange.current = false;
      return;
    }
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, script, activeLine, outputCount, inputCount, showOutputs, showFavorites, favorites });
    }
    eventBus.emit(nodeId + '.params.updateParams', {
      nodeid: nodeId,
      data: {
        script,
        outputCount,
        inputCount,
        from: 'ScriptSequencerFlowNode'
      }
    });
  }, [script, outputCount, inputCount, showOutputs, showFavorites, favorites]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- favorites management -----------------------------------------------

  const toggleFavorite = useCallback((token: string, type: 'var' | 'number' | 'note', pos: number) => {
    setFavorites((prev) => {
      const exists = prev.find((f) => f.pos === pos);
      if (exists) return prev.filter((f) => f.pos !== pos);
      return [...prev, { id: token + '@' + pos + '-' + Date.now(), token, type, pos }];
    });
  }, []);

  // Keep the WeakMap entry up to date so ssqTokenClickPlugin can call back into React
  useEffect(() => {
    const view = cmRef.current?.view;
    if (view) _tokenClickHandlerMap.set(view, toggleFavorite);
  }, [toggleFavorite]);

  const stepFavorite = useCallback((fav: FavoriteItem, dir: number) => {
    if (fav.type === 'note' || fav.type === 'number') {
      const newToken = fav.type === 'note'
        ? stepNote(fav.token, dir)
        : stepNumToken(fav.token, dir);
      if (newToken === fav.token) return;
      if (fav.pos !== undefined) {
        // Positional: replace only this occurrence, then shift positions of
        // all other positional favorites that sit after this one.
        const delta = newToken.length - fav.token.length;
        setScript((prev) => prev.slice(0, fav.pos!) + newToken + prev.slice(fav.pos! + fav.token.length));
        setFavorites((prev) => prev.map((f) => {
          if (f.id === fav.id) return { ...f, token: newToken };
          if (f.pos !== undefined && f.pos > fav.pos!) return { ...f, pos: f.pos + delta };
          return f;
        }));
      } else {
        // Legacy global path (backward compat with old saved data without pos)
        setScript((prev) => replaceTokenInScript(prev, fav.token, newToken, fav.type));
        setFavorites((prev) => prev.map((f) => f.token === fav.token ? { ...f, token: newToken } : f));
      }
    } else if (fav.type === 'var') {
      const varName = fav.token.startsWith('$') ? fav.token.slice(1) : fav.token;
      setRuntimeVars((prev) => {
        const cur = Number(prev[varName] ?? 0);
        const newVal = (isNaN(cur) ? 0 : cur) + dir;
        const updated = { ...prev, [varName]: newVal };
        eventBus.emit(nodeId + '.params.updateParams', {
          nodeid: nodeId,
          data: { vars: { [varName]: newVal }, from: 'ScriptSequencerFlowNode.favorites' }
        });
        return updated;
      });
    }
  }, [nodeId, eventBus]);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggleFavoriteHeight = useCallback((id: string) => {
    setFavorites((prev) => prev.map((f) => f.id === id
      ? { ...f, rowHeight: (f.rowHeight ?? 36) > 36 ? 36 : 64 }
      : f
    ));
  }, []);

  // ---- script editing helpers ---------------------------------------------

  /** "Insert action at current cursor line" — used by the Outputs panel ↩
   *  button and any future quick-insert shortcuts. Appends to the current
   *  line as a `;`-separated action so a step can split into many. */
  const insertAtCurrentLine = useCallback((snippet: string) => {
    const view = cmRef.current?.view;
    if (!view) {
      // fallback: append at activeLine
      setScript((prev) => {
        const arr = prev.split('\n');
        const i = Math.max(0, Math.min(arr.length - 1, activeLine));
        const cur = arr[i] ?? '';
        arr[i] = cur.trim() ? `${cur.trimEnd()} ; ${snippet}` : snippet;
        return arr.join('\n');
      });
      return;
    }
    const state = view.state;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const cur = line.text;
    const newText = cur.trim() ? `${cur.trimEnd()} ; ${snippet}` : snippet;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + newText.length }
    });
  }, [activeLine]);

  /** Move the cursor (running line) to a 0-based line number. Updates the
   *  React state, the editor decoration, and notifies the virtual node. */
  const jumpToLine = useCallback((target: number) => {
    const total = Math.max(1, script.split('\n').length);
    const clamped = Math.max(0, Math.min(total - 1, target));
    setActiveLine(clamped);
    const view = cmRef.current?.view;
    if (view) {
      view.dispatch({ effects: setRunningLineEffect.of(clamped) });
    }
    eventBus.emit(nodeId + '.params.updateParams', {
      nodeid: nodeId,
      data: {
        activeLine: clamped,
        from: 'ScriptSequencerFlowNode'
      }
    });
  }, [script, nodeId, eventBus]);

  // Keep latest jumpToLine in a ref so the static CM keymap can call it.
  const jumpToLineRef = useRef(jumpToLine);
  useEffect(() => { jumpToLineRef.current = jumpToLine; }, [jumpToLine]);

  // Keep latest nodeId/eventBus in a ref so the static CM keymap can call it.
  const manualTickRef = useRef(() => {
    eventBus.emit(nodeId + '.manualTick', {});
  });
  useEffect(() => {
    manualTickRef.current = () => eventBus.emit(nodeId + '.manualTick', {});
  }, [nodeId, eventBus]);

  // Ctrl/Cmd+L → set running cursor to the line containing the caret.
  // Ctrl/Cmd+Enter → step (execute current line, advance cursor).
  const ssqKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: 'Mod-l',
          preventDefault: true,
          run: (view) => {
            const head = view.state.selection.main.head;
            const line = view.state.doc.lineAt(head);
            jumpToLineRef.current(line.number - 1); // doc is 1-based
            return true;
          }
        },
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: () => {
            manualTickRef.current();
            return true;
          }
        }
      ]),
    []
  );

  // ---- output editing helpers ---------------------------------------------

  const addOutput = useCallback(() => {
    setOutputCount((c) => c + 1);
  }, []);

  const removeOutput = useCallback(() => {
    setOutputCount((c) => Math.max(1, c - 1));
  }, []);

  /** Insert a `send #N <value>` skeleton at the current line. */
  const insertSendForOutput = useCallback(
    (idx: number) => {
      insertAtCurrentLine(`send #${idx} 0`);
    },
    [insertAtCurrentLine]
  );

  // ---- styles -------------------------------------------------------------

  const baseStyle = (data.style as React.CSSProperties) || {};
  const wrapperStyle: React.CSSProperties = {
    padding: 6,
    border: '1px solid #2b2b2b',
    borderRadius: 9,
    width: 480,
    background: 'linear-gradient(140deg,#181818,#1f1f1f 55%,#232323)',
    color: '#eee',
    fontSize: 12,
    boxShadow: '0 8px 22px rgba(0,0,0,0.45)',
    ...baseStyle
  };

  return (
    <div style={wrapperStyle} className="ssq-wrap">
      {/* Inputs */}
      <Handle
        type="target"
        position={Position.Left}
        id="clock"
        title="Clock (advances 1 line per tick)"
        style={{ top: 26, width: 10, height: 10, background: '#0af' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="reset"
        title="Reset cursor to line 1"
        style={{ top: 50, width: 10, height: 10, background: '#f80' }}
      />
      {/* Value inputs — in-0, in-1, … → accessible as $in0, $in1, … */}
      {Array.from({ length: inputCount }).map((_, i) => (
        <Handle
          key={'in-' + i}
          type="target"
          position={Position.Left}
          id={'in-' + i}
          title={`$in${i} — connects to $in${i} in the script`}
          style={{ top: 74 + i * 24, width: 10, height: 10, background: '#c7a' }}
        />
      ))}

      <div className="ssq-header">
        <span style={{ fontWeight: 600, letterSpacing: 1 }}>
          {data.label || 'ScriptSequencer'}
        </span>
        <span style={{ fontSize: 10, color: '#9c9' }}>
          {tickIntervalMs > 0
            ? `~${Math.round(tickIntervalMs)}ms / tick`
            : 'awaiting clock…'}
        </span>
        <span style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }}>
          line <b style={{ color: '#cfc' }}>{activeLine + 1}</b>
        </span>
        <button
          className="ssq-btn ssq-cursor-btn"
          title="Reset cursor to line 1"
          onClick={(e) => {
            e.stopPropagation();
            jumpToLine(0);
          }}
        >
          ⏮
        </button>
        <button
          className="ssq-btn ssq-cursor-btn"
          title="Jump cursor to a specific line"
          onClick={(e) => {
            e.stopPropagation();
            const totalLines = script.split('\n').length;
            const ans = window.prompt(
              `Jump to line (1 – ${totalLines})`,
              String(activeLine + 1)
            );
            if (ans == null) return;
            const n = parseInt(ans.trim(), 10);
            if (!isNaN(n)) jumpToLine(n - 1);
          }}
        >
          ↦
        </button>
        <button
          className="ssq-btn ssq-cursor-btn"
          title="Step: execute current line and advance to next (▶ once)"
          onClick={(e) => {
            e.stopPropagation();
            eventBus.emit(nodeId + '.manualTick', {});
          }}
        >
          ▶
        </button>
        <button
          className={`ssq-btn ssq-highlight-btn${showHighlight ? ' ssq-highlight-btn--active' : ''}`}
          title="Show all tokens (variables, numbers, notes) — click any to add to Favorites"
          onClick={(e) => { e.stopPropagation(); setShowHighlight((s) => !s); }}
        >
          ◈
        </button>
        <button
          className="ssq-help-btn"
          title="How to write the script (open documentation)"
          onClick={(e) => {
            e.stopPropagation();
            setShowHelp(true);
          }}
        >
          ?
        </button>
      </div>

      {showHelp && (
        <ScriptSequencerHelpModal onClose={() => setShowHelp(false)} />
      )}

      {/* ---- Favorites panel ----------------------------------------- */}
      {favorites.length > 0 && (
        <FavoritesPanel
          favorites={favorites}
          runtimeVars={runtimeVars}
          script={script}
          showFavorites={showFavorites}
          onToggleShow={() => setShowFavorites((s) => !s)}
          onStep={stepFavorite}
          onRemove={removeFavorite}
          onToggleHeight={toggleFavoriteHeight}
        />
      )}

      {/* ---- Inputs panel -------------------------------------------- */}
      <div className="ssq-outputs">
        <div className="ssq-outputs-head">
          <span style={{ color: '#c7a', marginRight: 4 }}>↙</span>
          <span>Value Inputs ({inputCount})</span>
          <button
            className="ssq-btn"
            title="Add value input"
            onClick={(e) => { e.stopPropagation(); setInputCount((c) => c + 1); }}
            style={{ marginLeft: 'auto' }}
          >+</button>
          {inputCount > 0 && (
            <button
              className="ssq-btn"
              title="Remove value input"
              onClick={(e) => { e.stopPropagation(); setInputCount((c) => Math.max(0, c - 1)); }}
            >−</button>
          )}
        </div>
        {inputCount > 0 && (
          <div className="ssq-outputs-list">
            {Array.from({ length: inputCount }).map((_, i) => {
              const val = runtimeVars['in' + i];
              return (
                <div key={i} className="ssq-out-row">
                  <span className="ssq-dot" style={{ background: '#c7a' }} />
                  <code style={{ fontSize: 11 }}>${'in' + i}</code>
                  {val !== undefined && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9c9' }}>
                      {typeof val === 'number' ? val.toFixed(3) : String(val)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Outputs panel -------------------------------------------- */}
      <div className="ssq-outputs">
        <div
          className="ssq-outputs-head"
          onClick={() => setShowOutputs((s) => !s)}
        >
          <span
            style={{
              display: 'inline-block',
              transform: showOutputs ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 120ms ease'
            }}
          >
            ▶
          </span>
          <span>Outputs ({effectiveCount})</span>
          <button
            className="ssq-btn"
            title="Add output"
            onClick={(e) => {
              e.stopPropagation();
              addOutput();
            }}
            style={{ marginLeft: 'auto' }}
          >
            +
          </button>
        </div>
        {showOutputs && (
          <div className="ssq-outputs-list">
            {Array.from({ length: effectiveCount }).map((_, i) => {
              const isAuto = i >= outputCount;
              return (
                <div key={i} className="ssq-out-row">
                  <span
                    className="ssq-dot"
                    style={{ background: OUTPUT_COLOR }}
                  />
                  <span
                    className="ssq-out-index"
                    title={'reference in script as #' + i}
                  >
                    #{i}
                  </span>
                  {isAuto && (
                    <span
                      className="ssq-out-auto-tag"
                      title="auto-created because the script references this index"
                    >
                      auto
                    </span>
                  )}
                  <button
                    className="ssq-btn"
                    title={`Insert send #${i} 0 into current line`}
                    onClick={() => insertSendForOutput(i)}
                    style={{ marginLeft: 'auto' }}
                  >
                    ↩
                  </button>
                  {!isAuto && i === outputCount - 1 && (
                    <button
                      className="ssq-btn ssq-del"
                      title="Remove last output"
                      onClick={removeOutput}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Code editor (CodeMirror) ------------------------------- */}
      <div
        className="ssq-editor-cm nodrag nowheel"
        onKeyDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <CodeMirror
          ref={cmRef}
          value={script}
          theme={vscodeDark}
          height="100%"
          style={{ height: '100%', textAlign: 'left' }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: false,
            foldGutter: false,
            autocompletion: false,
            highlightSelectionMatches: false
          }}
          extensions={[
            StreamLanguage.define(ssqStreamParser),
            ssqActiveLineField,
            ssqErrorField,
            ssqExecFlashField,
            ssqHighlightMarksField,
            ssqTokenClickPlugin,
            ssqRunningLineTheme,
            ssqKeymap,
            EditorView.lineWrapping
          ]}
          onCreateEditor={(view) => {
            // Initial highlight + error pass
            view.dispatch({ effects: setRunningLineEffect.of(activeLine) });
            view.dispatch({ effects: setErrorsEffect.of(validateScript(script)) });
            // Register click handler
            _tokenClickHandlerMap.set(view, toggleFavorite);
          }}
          onChange={(value) => setScript(value)}
        />
      </div>

      {/* Error summary */}
      {scriptErrors.length > 0 ? (
        <div className="ssq-errors" role="alert">
          <div className="ssq-errors-head">
            <span className="ssq-errors-icon">⚠</span>
            {scriptErrors.length} error{scriptErrors.length === 1 ? '' : 's'} in script
          </div>
          <ul className="ssq-errors-list">
            {scriptErrors.slice(0, 6).map((err, i) => (
              <li key={i}>
                <span className="ssq-errors-line">L{err.line + 1}</span>
                <span className="ssq-errors-msg">{err.message}</span>
              </li>
            ))}
            {scriptErrors.length > 6 && (
              <li className="ssq-errors-more">
                …and {scriptErrors.length - 6} more
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className="ssq-errors ssq-errors-ok">
          <span className="ssq-errors-icon">✓</span> script ok
        </div>
      )}

      <details className="ssq-help">
        <summary>quick reference (open ? for full docs)</summary>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 11 }}>
{`outputs are referenced as #N (e.g. #0)
send #N v ; on #N [v] ; off #N ; pulse #N ms
ramp #N a..b dur ; array #N [v,...] dur [swing white|pink amt]
set $v expr ; goto N | loop | repeat N | wait N
multi-action line:  on #0 ; ramp #1 0..1 1t`}
        </pre>
      </details>

      {/* Output handles — one per index, id = `out-N` */}
      {Array.from({ length: effectiveCount }).map((_, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Right}
          id={ssqHandleId(i)}
          title={`#${i}`}
          style={{
            top: 26 + i * 18,
            width: 10,
            height: 10,
            background: OUTPUT_COLOR
          }}
        />
      ))}
      {/* Debug output — receives `print` emissions */}
      <Handle
        type="source"
        position={Position.Right}
        id="debug"
        title="debug (print output)"
        style={{
          top: 26 + effectiveCount * 18,
          width: 10,
          height: 10,
          background: '#f90',
          border: '1px dashed #fa0'
        }}
      />
    </div>
  );
};

export default React.memo(ScriptSequencerFlowNode);

// =====================================================================
// Help / Documentation popup
// =====================================================================

const ScriptSequencerHelpModal: React.FC<{ onClose: () => void }> = ({
  onClose
}) => {
  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ssq-modal-backdrop"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="ssq-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="ScriptSequencer documentation"
      >
        <div className="ssq-modal-head">
          <span>ScriptSequencer — how to write scripts</span>
          <button
            className="ssq-btn ssq-del"
            title="Close (Esc)"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="ssq-modal-body">
          <h3>Concept</h3>
          <p>
            Each <b>line is one step</b>. A connected clock advances the
            cursor by one line per tick (wrapping to the top). The
            currently-playing line lights up in green. A line may contain
            one or more semicolon-separated actions, so you can split a
            single step into multiple sub-actions while still spending
            exactly one tick on it.
          </p>

          <h3>Inputs (left handles)</h3>
          <ul>
            <li>
              <code>clock</code> — every ON event advances the cursor.
              Also serves as the tempo source: the engine measures the
              time between ticks and uses it as the meaning of{' '}
              <code>1t</code>.
            </li>
            <li>
              <code>reset</code> — moves the cursor back to line 1, cancels
              any pending ramps/arrays.
            </li>
            <li>
              <code>in-0</code>, <code>in-1</code>, … — value inputs (add
              via the <b>Value Inputs</b> panel). Each incoming value is
              stored in <code>$in0</code>, <code>$in1</code>, … and is
              available in any expression, e.g.{' '}
              <code>send #0 $in0 * 2</code> or{' '}
              <code>pulse #1 [$in0,$in1] 80ms 1t</code>.
            </li>
          </ul>

          <h3>Outputs</h3>
          <p>
            Outputs are <b>positional and numbered</b>. Add as many as
            you want from the panel above; each gets an index starting
            at <code>0</code>. In the script you reference an output
            with <code>#N</code> notation — the same number you see in
            the panel.
          </p>
          <p>
            Each output has a <b>kind</b> that drives its handle color
            and the skeleton inserted by the panel's <code>↩</code>
            button:
          </p>
          <ul>
            <li>
              <span className="ssq-dot" style={{ background: '#7d7' }} />{' '}
              <b>event</b> — gate ON/OFF, good for triggering ADSRs,
              buttons, samples.
            </li>
            <li>
              <span className="ssq-dot" style={{ background: '#fc6' }} />{' '}
              <b>value</b> — discrete numeric events; downstream nodes
              read <code>data.value</code>.
            </li>
            <li>
              <span className="ssq-dot" style={{ background: '#6cf' }} />{' '}
              <b>audio-param</b> — continuous control; pairs nicely with{' '}
              <code>ramp</code>/<code>array</code> when wired to a
              WebAudio param handle (frequency, gain, cutoff…).
            </li>
          </ul>
          <p>
            If your script references <code>#5</code> but only 3 outputs
            are declared, the missing slots are auto-created (shown as{' '}
            <i>auto</i> in the panel) so the handle exists. Kind is just
            a UX hint — actions never enforce kind.
          </p>

          <h3>Actions</h3>
          <p style={{ fontStyle: 'italic', color: '#aaa' }}>
            <code>&lt;out&gt;</code> is the output reference, written as{' '}
            <code>#0</code>, <code>#1</code>, …
          </p>
          <table className="ssq-doc-table">
            <thead>
              <tr>
                <th>Syntax</th>
                <th>What it does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>send &lt;out&gt; &lt;expr&gt;</code>
                </td>
                <td>
                  One-shot value emission (e.g. <code>send #0 0.5</code>
                  ). If the value is an array literal{' '}
                  <code>[a, b, …]</code>, this is shorthand for{' '}
                  <code>array</code> — values are scheduled evenly
                  across one tick.
                </td>
              </tr>
              <tr>
                <td>
                  <code>on &lt;out&gt; [&lt;expr&gt;]</code>
                </td>
                <td>
                  Emit gate ON (<code>receiveNodeOn</code>) with optional
                  value (default 1).
                </td>
              </tr>
              <tr>
                <td>
                  <code>off &lt;out&gt;</code>
                </td>
                <td>
                  Emit gate OFF (<code>receiveNodeOff</code>).
                </td>
              </tr>
              <tr>
                <td>
                  <code>pulse &lt;out&gt; &lt;ms&gt;</code>
                </td>
                <td>ON now, OFF after the given milliseconds.</td>
              </tr>
              <tr>
                <td>
                  <code>ramp &lt;out&gt; a..b &lt;dur&gt;</code>
                </td>
                <td>
                  Linear interpolation from <code>a</code> to{' '}
                  <code>b</code> over <code>dur</code>, emitting{' '}
                  <code>send</code> events at ~60 Hz.
                </td>
              </tr>
              <tr>
                <td>
                  <code style={{ whiteSpace: 'pre-wrap', display: 'block' }}>
{`array <out> [v,v,v]
  [<dur>]
  [swing white|pink <amt>]`}
                  </code>
                </td>
                <td>
                  Schedule values evenly across <code>dur</code>. With a
                  1 s tick and 5 values: one every 200 ms. Optional swing
                  jitters timing using white or pink noise (
                  <code>amt</code> is fraction of step time).
                </td>
              </tr>
              <tr>
                <td>
                  <code>set &lt;var&gt; &lt;expr&gt;</code>
                </td>
                <td>
                  Store the result of <code>&lt;expr&gt;</code> in
                  <code>&lt;var&gt;</code> (with or without the leading{' '}
                  <code>$</code>). Reuse later as <code>$var</code>.
                  Expressions support <code>+ - * / %</code>, parens,
                  <code>$vars</code>, numbers, and{' '}
                  <code>@notes</code> (see below).
                </td>
              </tr>
              <tr>
                <td>
                  <code>inc &lt;var&gt; [step]</code>
                </td>
                <td>
                  Increment <code>$var</code> by <code>step</code>{' '}
                  (default <code>1</code>). <code>step</code> may be any
                  expression.
                </td>
              </tr>
              <tr>
                <td>
                  <code>dec &lt;var&gt; [step]</code>
                </td>
                <td>
                  Decrement <code>$var</code> by <code>step</code>{' '}
                  (default <code>1</code>).
                </td>
              </tr>
              <tr>
                <td>
                  <code>if &lt;expr&gt; ; &lt;action&gt;</code>
                </td>
                <td>
                  Run the next <code>;</code>-separated action only when{' '}
                  <code>&lt;expr&gt;</code> is non-zero. Operators:{' '}
                  <code>== != &lt; &lt;= &gt; &gt;=</code>. Example:{' '}
                  <code>if $i &lt; 4 ; send #0 1</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code style={{ whiteSpace: 'pre-wrap', display: 'block' }}>
{`random <out|$var> [a,b,c]
random <out|$var> a..b
random <out|$var>`}
                  </code>
                </td>
                <td>
                  Pick a random element from the array, or a uniform
                  number in the range, and either{' '}
                  <code>send</code> it on output <code>#N</code> or
                  store it in <code>$var</code>. With no value, sends
                  a uniform <code>[0, 1)</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>goto &lt;line&gt;</code>
                </td>
                <td>
                  Jump cursor to the given (1-based) line on next tick.
                </td>
              </tr>
              <tr>
                <td>
                  <code>loop</code>
                </td>
                <td>
                  Alias for <code>goto 1</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <code>repeat &lt;n&gt;</code>
                </td>
                <td>Re-run the current line n more ticks before advancing.</td>
              </tr>
              <tr>
                <td>
                  <code>wait &lt;n&gt;</code>
                </td>
                <td>Skip the next n ticks (no-op).</td>
              </tr>
              <tr>
                <td>
                  <code>print &lt;expr&gt;</code>
                </td>
                <td>
                  <code>console.log</code> for debugging.
                </td>
              </tr>
              <tr>
                <td>
                  <code>exec: &lt;action&gt;</code>
                </td>
                <td>
                  Execute the action <b>without consuming a tick</b>.
                  Fires in the same clock tick as the surrounding lines:
                  if placed after a normal line it fires together with it;
                  if at the start of the script (or after a jump target) it
                  fires together with the first normal line that follows.
                  Runs on every pass. Example:{' '}
                  <code>exec: set $i ($i + 1)</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>init: &lt;action&gt;</code>
                </td>
                <td>
                  Run once at startup (reset), <b>immediately</b> — no
                  tick needed. Multiple <code>init:</code> lines all fire
                  in sequence at reset. During normal playback the cursor
                  skips over them instantly. Useful for variable
                  initialisation, setting a base note, etc.{' '}
                  Example: <code>init: set $i 0</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>once: &lt;action&gt;</code>
                </td>
                <td>
                  Run the action only the <b>first</b> time the cursor
                  reaches this line per reset; silently skipped on every
                  subsequent pass. Unlike <code>init:</code>, the cursor
                  still <i>lands</i> on this line (spending one tick) on
                  its first visit.
                </td>
              </tr>
              <tr>
                <td>
                  <code>// comment</code>
                </td>
                <td>Ignored. Empty lines are also no-ops.</td>
              </tr>
            </tbody>
          </table>

          <h3>Durations</h3>
          <ul>
            <li>
              <code>500ms</code> — milliseconds (default unit if missing).
            </li>
            <li>
              <code>1.5s</code> — seconds.
            </li>
            <li>
              <code>2t</code> or <code>2b</code> — multiples of the
              <i> current measured tick period</i>. Change the clock BPM
              and durations follow automatically.
            </li>
          </ul>

          <h3>Expressions</h3>
          <p>
            Anywhere a value is expected you can use a full expression.
            Supported: numbers (<code>0.42</code>, <code>500ms</code>,{' '}
            <code>1t</code>), variable references (<code>$myVar</code>),
            note literals (<code>@C4</code>), arithmetic{' '}
            <code>+ - * / %</code>, parentheses, and the comparisons{' '}
            <code>== != &lt; &lt;= &gt; &gt;=</code> (returning{' '}
            <code>1</code>/<code>0</code>).
          </p>
          <pre className="ssq-doc-pre">
{`set $i 0
set $base @C3              // 130.81 Hz
send #0 $base * 2          // one octave up
ramp #1 @C4 .. @C5 1t
if $i % 4 == 0 ; pulse #0 50ms
inc $i`}
          </pre>

          <h3>Note literals</h3>
          <p>
            Prefix a note name with <code>@</code> to get its frequency
            in Hz (A4 = 440). Examples:{' '}
            <code>@C4</code> = 261.63, <code>@A#5</code> = 932.33,{' '}
            <code>@Bb3</code> = 233.08. Octave is the standard
            scientific notation; sharps use <code>#</code>, flats use{' '}
            <code>b</code> (lower-case).
          </p>

          <h3>Multiple actions on one line</h3>
          <p>
            Separate actions with <code>;</code>. Semicolons inside{' '}
            <code>[...]</code> are not splits, so arrays are safe.
          </p>
          <pre className="ssq-doc-pre">
{`on #0 ; ramp #1 0..1 1t ; send #2 0.5
pulse #0 20 ; array #1 [200, 800, 400] 1t swing pink 0.25`}
          </pre>

          <h3>Examples</h3>
          <pre className="ssq-doc-pre">
{`// 4-on-the-floor kick + filter sweep
//   #0 = gate (event), #1 = cutoff (audio-param)
on #0
ramp #1 200..2000 4t
on #0
on #0
on #0 ; off #0
loop`}
          </pre>
          <pre className="ssq-doc-pre">
{`// arpeggio of 4 notes per tick, slightly humanized
//   #0 = note, #1 = trigger
array #0 [60, 64, 67, 72] 1t swing pink 0.15
pulse #1 30
loop`}
          </pre>
          <pre className="ssq-doc-pre">
{`// probabilistic fill every 8 bars
repeat 7
goto 3
// fill line:
array #0 [1,1,1,1,1,1,1,1] 1t swing white 0.4
loop`}
          </pre>

          <h3>Tips</h3>
          <ul>
            <li>
              Press <kbd>Enter</kbd> in a code line to add a new line below
              and focus it. <kbd>Backspace</kbd> on an empty line deletes
              it.
            </li>
            <li>
              Use the <code>↩</code> button next to an output to insert a
              kind-appropriate skeleton (<code>pulse</code>/
              <code>send</code>/<code>ramp</code>) into the active line.
            </li>
            <li>
              Wire <code>audio-param</code> outputs to WebAudio param
              handles (e.g. an oscillator's <code>frequency</code>) for
              smooth ramp automation.
            </li>
            <li>
              Press <kbd>Esc</kbd> or click outside this dialog to close.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
