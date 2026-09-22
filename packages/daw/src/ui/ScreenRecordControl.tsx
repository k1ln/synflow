import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, MonitorPlay, Square } from 'lucide-react';

export type ScreenSurface = 'monitor' | 'window' | 'browser' | 'camera';

export interface ScreenRecordOpts {
  /** Which capture surface Chrome's picker should default to, or 'camera' for a
   *  webcam / capture-card / phone-as-webcam device instead of screen sharing. */
  surface: ScreenSurface;
  /** Include the source's audio (tab/system audio, or the camera's mic), captured unprocessed. */
  withAudio: boolean;
  /** getUserMedia deviceId for the 'camera' source ('' = system default). */
  cameraId: string;
}
export const DEFAULT_SCREEN_REC_OPTS: ScreenRecordOpts = { surface: 'browser', withAudio: true, cameraId: '' };
const KEY = 'mothscilla:screenrecopts';
export const loadScreenRecOpts = (): ScreenRecordOpts => {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT_SCREEN_REC_OPTS, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return DEFAULT_SCREEN_REC_OPTS;
};
export const saveScreenRecOpts = (o: ScreenRecordOpts) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } };

/** Record button + settings popover for screen/window/tab/camera video capture.
 *  The actual getDisplayMedia/getUserMedia call lives in app.tsx; this just picks
 *  the source (+ camera device, when applicable) and whether to keep its audio.
 *  Any camera the OS exposes shows up in the device list — including a phone set
 *  up as a webcam via Continuity Camera or a third-party app (Camo, iVCam, …),
 *  or a capture card — so that's how an external camera gets in here too. */
export function ScreenRecordControl({ recording, opts, onOpts, onToggle }: {
  recording: boolean; opts: ScreenRecordOpts; onOpts: (o: ScreenRecordOpts) => void; onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [labelsHidden, setLabelsHidden] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((d) => d.kind === 'videoinput'));
      setLabelsHidden(all.some((d) => d.kind === 'videoinput' && !d.label));
    } catch { /* no device API */ }
  }, []);
  useEffect(() => {
    if (!open) return;
    void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away);
    return () => { navigator.mediaDevices?.removeEventListener?.('devicechange', refresh); window.removeEventListener('pointerdown', away); };
  }, [open, refresh]);

  // Camera names are hidden until permission is granted once — ask on demand.
  const grant = async () => {
    try { (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach((t) => t.stop()); } catch { /* denied */ }
    void refresh();
  };

  const isCamera = opts.surface === 'camera';

  return (
    <div className="rec-ctl" ref={wrap}>
      <button className={`t-btn rec ${recording ? 'on' : ''}`} onClick={onToggle} onContextMenu={(e) => { e.preventDefault(); if (!recording) setOpen(true); }}
        title={recording ? 'Stop recording' : 'Record a screen, window, browser tab or camera as video · right-click for options'}>
        {recording ? <Square size={12} fill="currentColor" /> : <MonitorPlay size={14} />}
      </button>
      <button className={`rec-more ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} title="Video recording settings" disabled={recording}><ChevronDown size={13} /></button>
      {open && (
        <div className="rec-pop">
          <div className="rec-pop-title">Video recording</div>
          <label className="rec-field"><span>Source</span>
            <select value={opts.surface} onChange={(e) => onOpts({ ...opts, surface: e.target.value as ScreenSurface })}>
              <option value="browser">Browser tab</option>
              <option value="window">A window</option>
              <option value="monitor">Entire screen</option>
              <option value="camera">Camera</option>
            </select>
          </label>
          {isCamera ? (
            <label className="rec-field"><span>Camera</span>
              <select value={opts.cameraId} onChange={(e) => onOpts({ ...opts, cameraId: e.target.value })}>
                <option value="">System default</option>
                {cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
              </select>
            </label>
          ) : (
            <div className="rec-note">Only a hint for which tab of the browser's picker opens first — you can still pick any screen, window or tab there. Window/screen sharing may not offer audio; tab sharing does (check "Share tab audio").</div>
          )}
          <label className="rec-check">
            <input type="checkbox" checked={opts.withAudio} onChange={(e) => onOpts({ ...opts, withAudio: e.target.checked })} />
            <span>{isCamera ? "Capture the camera's mic too" : 'Capture its audio too'}</span>
          </label>
          {isCamera && labelsHidden && <button className="rec-grant" onClick={grant}>Allow camera access to show device names</button>}
          <div className="rec-note">{isCamera ? 'Requests up to 4K from the camera — actual resolution depends on what it (or the app feeding it, e.g. a phone-as-webcam tool over WiFi/USB) can deliver.' : 'Recorded at the highest quality this browser supports, with no echo cancellation, noise suppression or gain control.'}</div>
          <div className="rec-note">Lands on its own video track (+ a linked audio track), ready to trim, crop and cut in the arrangement.</div>
        </div>
      )}
    </div>
  );
}
