import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// VstaiGui — renders a .vstai plugin's OWN HTML GUI, exactly like the VibePlugin
// hosts do: the (untrusted, AI-generated) HTML runs in a sandboxed iframe with no
// same-origin access; an injected shim defines `window.vstai` and forwards
// setParam / noteOn / noteOff / loadSample to us via postMessage. We relay them
// to the DAW engine. Same contract as VibePlugin's webplayer + JUCE WebView.
//
// Beyond the base contract the shim also:
//   • measures the GUI's natural size so the host can SCALE it to fit (fully
//     visible, no inner scroll);
//   • forwards computer-keyboard key events so the DAW's play-keys work even
//     while the plugin GUI has focus;
//   • forwards right-clicks together with the LAST param the GUI touched, so any
//     control can be automated from its own context menu.

export interface VstaiParamMeta { index: number; label: string; min: number; max: number }

/** The `window.vstai` shim injected into the plugin document's <head>. */
const SHIM = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>
(function(){
  // Seed saved param values synchronously (host injects window.__VSTAI_INIT__ just
  // before this shim) so a re-opened/re-loaded plugin restores its knob positions.
  // Keep the seed IMMUTABLE (init) alongside a live working copy (vals): plugin GUIs
  // push their OWN default on init (setParam(def) while building each control), which
  // mutates vals — so the restore replay below must read the untouched init, else it
  // would "restore" the plugin's default right over the saved value.
  var init=(window.__VSTAI_INIT__&&typeof window.__VSTAI_INIT__==='object')?window.__VSTAI_INIT__:{};
  var vals={}; for(var ik in init){ vals[ik]=+init[ik]; }
  var lastParam=null;
  function post(m){ try{ m.__vstai=1; parent.postMessage(m,'*'); }catch(e){} }
  async function loadSample(file,onProgress){
    if(!file) throw new Error('No file given.');
    var AC=window.AudioContext||window.webkitAudioContext; if(!AC) throw new Error('No AudioContext.');
    var ac=new AC(); var audio=await ac.decodeAudioData(await file.arrayBuffer()); try{ac.close();}catch(e){}
    var channels=Math.min(2,audio.numberOfChannels), frames=audio.length, rate=Math.round(audio.sampleRate);
    var data=new Float32Array(channels*frames);
    for(var c=0;c<channels;c++) data.set(audio.getChannelData(c).subarray(0,frames), c*frames);
    post({type:'sample', channels:channels, frames:frames, rate:rate, data:data});
    if(onProgress) try{onProgress(1);}catch(e){}
    return {frames:frames, channels:channels, sampleRate:rate};
  }
  window.vstai={
    setParam:function(i,v){ vals[i]=+v; lastParam=(i|0); post({type:'param', i:(i|0), v:+v}); },
    getParam:function(i){ return (i in vals)?+vals[i]:0; },
    onReady:function(cb){ try{cb();}catch(e){} },
    // Host→GUI param push. Replay the SAVED (immutable init) values to the plugin's
    // callback so its knobs restore to the persisted positions: now (in case a control
    // subscribes after building), and AGAIN next tick — after the control's own
    // set(def) has run — so the saved value, not the default, is what lands.
    onParam:function(cb){ function replay(){ try{ Object.keys(init).forEach(function(k){ cb(k|0, +init[k]); }); }catch(e){} } replay(); setTimeout(replay,0); },
    noteOn:function(n,v){ post({type:'note', on:true, note:(n|0), vel:(v==null?1:+v)}); },
    noteOff:function(n){ post({type:'note', on:false, note:(n|0)}); },
    loadSample:function(file,onProgress){ return loadSample(file,onProgress); }
  };
  // ── report natural size so the host can scale the GUI to fit ──
  function measure(){
    var d=document.documentElement, b=document.body||d;
    var w=Math.max(d.scrollWidth, b?b.scrollWidth:0, d.offsetWidth);
    var h=Math.max(d.scrollHeight, b?b.scrollHeight:0, d.offsetHeight);
    post({type:'size', w:w, h:h});
  }
  function typing(){ var a=document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName||''); }
  window.addEventListener('load', function(){ measure(); setTimeout(measure,120); setTimeout(measure,400);
    try{ new ResizeObserver(measure).observe(document.body); }catch(e){}
  });
  document.addEventListener('DOMContentLoaded', measure);
  // ── forward computer-keyboard so the DAW play-keys work while GUI is focused ──
  window.addEventListener('keydown', function(e){ if(typing()) return; post({type:'key', down:true, key:e.key, code:e.code, repeat:!!e.repeat}); });
  window.addEventListener('keyup', function(e){ if(typing()) return; post({type:'key', down:false, key:e.key, code:e.code}); });
  // ── right-click → offer to automate the last-touched control ──
  window.addEventListener('contextmenu', function(e){ e.preventDefault(); post({type:'menu', x:e.clientX, y:e.clientY, param:lastParam}); });
  // ── any other click inside the GUI dismisses an open menu (iframe is a separate
  // document, so the host's own click-outside handler never sees these) ──
  window.addEventListener('mousedown', function(e){ if(e.button!==2) post({type:'dismissMenu'}); });
})();
</scr` + `ipt>`;

export function VstaiGui({ html, params = [], values, maxHeight = '68vh', onParam, onNote, onSample, onKey, onAutomate }: {
  html: string;
  params?: VstaiParamMeta[];
  /** Saved param values (paramN index → value) to restore the plugin's knobs on load. */
  values?: Record<number, number>;
  maxHeight?: number | string;
  onParam: (index: number, value: number) => void;
  onNote?: (on: boolean, note: number, vel: number) => void;
  onSample?: (msg: { channels: number; frames: number; rate: number; data: Float32Array }) => void;
  /** A key event forwarded from the focused GUI (so DAW play-keys still work). */
  onKey?: (down: boolean, key: string, repeat: boolean) => void;
  /** Add automation for a GUI param (from its right-click menu). Enables the menu. */
  onAutomate?: (index: number, label: string, min: number, max: number, mode: 'step' | 'curve') => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ onParam, onNote, onSample, onKey, onAutomate });
  cbRef.current = { onParam, onNote, onSample, onKey, onAutomate };
  // Read at iframe-build time (memoised on `html`) so re-opening restores the saved
  // knobs without a live re-inject reloading the plugin mid-session.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [cw, setCw] = useState(0);
  const [menu, setMenu] = useState<null | { x: number; y: number; index: number | null }>(null);

  const doc = useMemo(() => {
    // Inject saved values BEFORE the shim so its `vals` seeds synchronously, then the
    // shim, then the plugin's own scripts (which read getParam / subscribe onParam).
    const init = `<script>window.__VSTAI_INIT__=${JSON.stringify(valuesRef.current ?? {})};</scr` + `ipt>`;
    const inject = init + SHIM;
    const head = html.indexOf('<head>');
    return head >= 0 ? html.slice(0, head + 6) + inject + html.slice(head + 6) : inject + html;
  }, [html]);

  // track container width for scale-to-fit
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el); setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (!m || !m.__vstai || e.source !== frameRef.current?.contentWindow) return;
      if (m.type === 'param') cbRef.current.onParam(m.i | 0, +m.v || 0);
      else if (m.type === 'note') cbRef.current.onNote?.(!!m.on, m.note | 0, m.vel == null ? 1 : +m.vel);
      else if (m.type === 'sample') cbRef.current.onSample?.({ channels: m.channels | 0, frames: m.frames | 0, rate: m.rate | 0, data: m.data });
      else if (m.type === 'size') { if (m.w > 0 && m.h > 0) setNat({ w: m.w | 0, h: m.h | 0 }); }
      else if (m.type === 'key') cbRef.current.onKey?.(!!m.down, String(m.key ?? ''), !!m.repeat);
      else if (m.type === 'menu') { if (cbRef.current.onAutomate) setMenu({ x: m.x | 0, y: m.y | 0, index: m.param == null ? null : (m.param | 0) }); }
      else if (m.type === 'dismissMenu') setMenu(null);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Close the menu on a click anywhere outside this component (clicks inside it are
  // handled by the wrapper's own onClick / the iframe's dismissMenu message above).
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  // Scale the GUI so its full natural width fits the container (never upscale).
  const scale = nat && cw > 0 ? Math.min(1, cw / nat.w) : 1;
  const wrapH = nat ? Math.round(nat.h * scale) : undefined;
  const meta = menu?.index != null ? params.find((p) => p.index === menu.index) : undefined;
  const menuPos = menu ? { left: Math.min(menu.x * scale, (wrapRef.current?.clientWidth ?? 300) - 210), top: menu.y * scale } : null;

  return (
    <div className="vstai-wrap" ref={wrapRef}
      style={nat
        // measured: box the scaled GUI exactly (overflow hidden clips the transform's
        // un-scaled layout box) so the whole plugin shows with no inner scrollbar —
        // a very tall plugin just makes the page scroll, never clips.
        ? { position: 'relative', width: '100%', height: wrapH, overflow: 'hidden' }
        : { position: 'relative', width: '100%', maxHeight, overflow: 'auto' }}
      onClick={() => menu && setMenu(null)}>
      <iframe
        ref={frameRef}
        className="vstai-gui"
        title="Plugin GUI"
        sandbox="allow-scripts"
        srcDoc={doc}
        style={nat
          ? { width: nat.w, height: nat.h, border: 'none', display: 'block', background: '#0a0b0f', transform: `scale(${scale})`, transformOrigin: 'top left' }
          : { width: '100%', height: typeof maxHeight === 'number' ? maxHeight : 420, border: 'none', display: 'block', background: '#0a0b0f' }}
      />
      {menu && menuPos && (
        <div className="vstai-ctx" style={{ position: 'absolute', left: menuPos.left, top: menuPos.top }} onClick={(e) => e.stopPropagation()}>
          {meta ? (
            <>
              <div className="vstai-ctx-title">Automate <b>{meta.label}</b></div>
              <button onClick={() => { cbRef.current.onAutomate?.(meta.index, meta.label, meta.min, meta.max, 'step'); setMenu(null); }}>Add step lane</button>
              <button onClick={() => { cbRef.current.onAutomate?.(meta.index, meta.label, meta.min, meta.max, 'curve'); setMenu(null); }}>Add song curve</button>
            </>
          ) : (
            <div className="vstai-ctx-hint">Move a control first, then right-click to automate it.</div>
          )}
        </div>
      )}
    </div>
  );
}
