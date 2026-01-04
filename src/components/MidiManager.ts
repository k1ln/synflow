// Centralized MIDI access & subscription handling
// Provides: request access, list inputs, subscribe to CC (control change) messages, generic message hook.
// Minimal DOM event interfaces if not globally present (in some TS configs)
interface MIDIMessageEvent extends Event { data: Uint8Array; }
interface Navigator { requestMIDIAccess?: (options?: { sysex: boolean }) => Promise<MIDIAccess>; }

export type MidiCCListener = (data: { channel: number; controller: number; value: number; raw: MIDIMessageEvent }) => void;
export type MidiNoteListener = (data: { channel: number; note: number; velocity: number; on: boolean; raw: MIDIMessageEvent }) => void;
export type MidiAnyListener = (data: { channel: number; status: number; data1: number; data2: number; raw: MIDIMessageEvent }) => void;

class MidiManager {
  private static instance: MidiManager;
  static debug = false; // set true to enable verbose MIDI logging
  // Optional very short-term duplicate suppression (same status+data within window)
  private dedupeWindowMs = 2; // keep extremely small to avoid filtering legit rapid changes
  private lastSig: string | null = null;
  private lastSigTime = 0;
  private access: MIDIAccess | null = null;
  private readyPromise: Promise<MIDIAccess> | null = null;
  private ccListeners: Set<MidiCCListener> = new Set();
  private noteListeners: Set<MidiNoteListener> = new Set();
  private anyListeners: Set<MidiAnyListener> = new Set();
  private inputListenersBound = false;
  private lastEvents: any[] = [];
  private buttonLearnQueue: { id: string; cb: (mapping: { type: 'note' | 'cc' | 'aftertouch'; channel: number; number: number; }) => void; started: number; }[] = [];

  private constructor() {}

  static getInstance() {
    if (!MidiManager.instance) {
      MidiManager.instance = new MidiManager();
  try { (window as any).MidiManagerInstance = MidiManager.instance; } catch { /* ignore */ }
    }
    return MidiManager.instance;
  }

  /** Enable/disable short-term duplicate suppression (set ms<=0 to disable). */
  setDuplicateSuppression(windowMs: number) { this.dedupeWindowMs = windowMs; }

  async ensureAccess(): Promise<MIDIAccess> {
    if (this.access) return this.access;
    if (!this.readyPromise) {
      if (!navigator.requestMIDIAccess) {
        throw new Error('WebMIDI not supported in this browser');
      }
      this.readyPromise = navigator.requestMIDIAccess({ sysex: false });
      this.access = await this.readyPromise;
      this.bindInputs();
    }
    return this.readyPromise;
  }

  private bindInputs() {
    if (this.inputListenersBound || !this.access) return;
    const handleStateChange = () => {
      // Rebind on connect/disconnect
      this.attachMessageHandlers();
    };
    this.access.onstatechange = handleStateChange;
    this.attachMessageHandlers();
    this.inputListenersBound = true;
  }

  private attachMessageHandlers() {
    if (!this.access) return;
  // inputs is an iterable MIDIInputMap; convert to array to iterate reliably across browsers
  // @ts-ignore - treat as any iterable
  this.access.inputs.forEach((input: any) => {
      input.onmidimessage = (evt: MIDIMessageEvent) => this.handleMessage(evt);
    });
  }

  private handleMessage(evt: MIDIMessageEvent) {
    
    const bytes = evt.data || new Uint8Array();
    const status = bytes[0] ?? 0;
    const data1 = bytes[1] ?? 0;
    const data2 = bytes[2] ?? 0;

    // Ultra-light duplicate suppression: if identical triplet arrives within tiny window, skip
    if (this.dedupeWindowMs > 0) {
      const sig = status + ':' + data1 + ':' + data2;
      const now = performance.now();
      if (sig === this.lastSig && (now - this.lastSigTime) <= this.dedupeWindowMs) {
        if (MidiManager.debug) {
          try { console.log('[MIDI] suppressed duplicate', sig); } catch { /* ignore */ }
        }
        return; // do not propagate duplicate
      }
      this.lastSig = sig;
      this.lastSigTime = now;
    }
    const statusHi = status & 0xF0;
    const channel = status & 0x0F; // 0-based
    let type = 'unknown';
    switch (statusHi) {
      case 0x80: type = 'noteOff'; break;
      case 0x90: type = data2 > 0 ? 'noteOn' : 'noteOff'; break;
      case 0xA0: type = 'polyAftertouch'; break;
      case 0xB0: type = 'cc'; break;
      case 0xC0: type = 'programChange'; break;
      case 0xD0: type = 'channelAftertouch'; break;
      case 0xE0: type = 'pitchBend'; break;
      default:
        if (status >= 0xF8 && status <= 0xFF) type = 'realtime';
        else if (status === 0xF0) type = 'sysexStart';
        else if (status === 0xF7) type = 'sysexEnd';
    }
    
    if(type==='noteOn'){
      // Midi Manager Note On
    }
    const entry = {
      t: Date.now(),
      status,
      statusHex: '0x' + status.toString(16).toUpperCase().padStart(2, '0'),
      statusHiHex: '0x' + statusHi.toString(16).toUpperCase(),
      type,
      channel: status < 0xF0 ? channel + 1 : null,
      data1,
      data2,
      bytes: Array.from(bytes)
    };
    this.lastEvents.push(entry);
    if (this.lastEvents.length > 200) this.lastEvents.splice(0, this.lastEvents.length - 200);
    if (MidiManager.debug) {
      try { console.log('[MIDI]', entry); } catch { /* ignore */ }
    }

    // Notify generic listeners first (they may want any traffic, including notes, pitch bend, etc.)
    //console.log(this.anyListeners);
    this.anyListeners.forEach(cb => {
      //console.log("Fire:", evt);
      // MIDI Data received
      cb({ channel: (status < 0xF0 ? channel : -1), status, data1, data2, raw: evt });
    });

    // Centralized button learn handling (first qualifying message maps next queued target)
    if (this.buttonLearnQueue.length) {
      let mapping: { type: 'note' | 'cc' | 'aftertouch'; channel: number; number: number; } | null = null;
      if (statusHi === 0x90) {
        mapping = { type: 'note', channel, number: data1 };
      } else if (statusHi === 0xB0) {
        mapping = { type: 'cc', channel, number: data1 };
      } else if (statusHi === 0xA0) {
        mapping = { type: 'aftertouch', channel, number: data1 };
      }
      if (mapping) {
        const target = this.buttonLearnQueue.shift();
        if (target) {
          try { target.cb(mapping); } catch(e){ console.warn('[MidiManager] learn cb error', e); }
        }
      }
      // Drop stale entries (>10s)
      const now = Date.now();
      this.buttonLearnQueue = this.buttonLearnQueue.filter(e => now - e.started < 10000);
    }

    // Note On (0x90) & Note Off (0x80) (treat Note On with velocity 0 as Off)
    if (statusHi === 0x90 || statusHi === 0x80) {
      const note = data1; 
      const velocity = data2;
      const on = statusHi === 0x90 && velocity > 0;
      if (this.noteListeners.size) {
        this.noteListeners.forEach(cb => {
          // Fire event
          cb({ channel, note, velocity, on, raw: evt });
        });
      }
    }
    // Control Change (0xB0 - 0xBF)
    if (statusHi === 0xB0) {
      const controller = data1;
      const value = data2; // 0-127
      if (this.ccListeners.size) {
        this.ccListeners.forEach(cb => {
          // FireCC event
          cb({ channel, controller, value, raw: evt });
        });
      }
    }
  }

  async listInputs(): Promise<string[]> {
    await this.ensureAccess();
    if (!this.access) return [];
    const names: string[] = [];
    // MIDIInputMap has forEach(callback(value, key))
    (this.access.inputs as any).forEach((input: any) => {
      names.push(input.name || input.id);
    });
    return names;
  }

  onCC(listener: MidiCCListener) {
    this.ccListeners.add(listener);
    return () => this.ccListeners.delete(listener);
  }

  onNote(listener: MidiNoteListener) {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  getLog() { return [...this.lastEvents]; }
  setDebug(flag: boolean) { MidiManager.debug = flag; }

  /** Queue a button learn request. First upcoming qualifying MIDI (noteOn, poly aftertouch, CC) will map it. */
  startButtonLearn(id: string, cb: (mapping: { type: 'note' | 'cc' | 'aftertouch'; channel: number; number: number; }) => void) {
    // Remove any existing entry for same id to avoid duplication
    this.buttonLearnQueue = this.buttonLearnQueue.filter(e => e.id !== id);
    this.buttonLearnQueue.push({ id, cb, started: Date.now() });
  }
  cancelButtonLearn(id: string){ this.buttonLearnQueue = this.buttonLearnQueue.filter(e => e.id !== id); }

  onMessage(listener: MidiAnyListener) {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }
}

export default MidiManager;
