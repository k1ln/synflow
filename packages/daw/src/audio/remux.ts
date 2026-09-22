// Fix a MediaRecorder-produced recording for arbitrary-time seeking. MediaRecorder
// writes a headerless/un-indexed container (no Cues/keyframe index): sequential
// playback works, but seeking a <video> element to a later point — which both the
// program monitor's scrub sync and the exporter's per-frame seek do — silently
// stalls or goes black past wherever the browser's best-effort index runs out.
// Fixed by playing the recording through once (faster than real time) and
// re-encoding the captured frames into a properly-seekable MP4 via WebCodecs +
// mp4-muxer — the same muxer already used for export, so preview/export/trim all
// see a normal, fully-seekable file afterwards.
//
// Video-only: the <video> element used for playback/compositing is always muted
// (audio comes from a separately-extracted AudioAsset — see buildVideoEntities),
// so there is nothing to preserve on the recording's own audio track.
import { webCodecsSupported } from './videoExport';

export async function remuxForSeeking(bytes: ArrayBuffer, mime: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const original = { bytes, mime };
  if (!webCodecsSupported()) return original;

  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('could not load recording for remux'));
      window.setTimeout(() => reject(new Error('remux load timed out')), 10000);
    });
    const W = video.videoWidth, H = video.videoHeight;
    if (!W || !H) return original; // no picture to re-encode (shouldn't happen for a screen recording)

    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });

    const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42E01F'];
    const bitrate = Math.round(W * H * 30 * 0.1); // ~same heuristic as export's "medium" quality
    let cfg: VideoEncoderConfig | null = null;
    for (const codec of candidates) {
      const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate, hardwareAcceleration: 'prefer-hardware' };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; break; }
      const sw: VideoEncoderConfig = { ...c, hardwareAcceleration: 'prefer-software' };
      if ((await VideoEncoder.isConfigSupported(sw)).supported) { cfg = sw; break; }
    }
    if (!cfg) return original; // no usable H.264 encoder for this resolution — keep the raw recording

    let encodeErr: unknown = null;
    const venc = new VideoEncoder({
      output: (chunk, meta) => {
        try { muxer.addVideoChunk(chunk, meta); }
        catch (e) { encodeErr = e; console.error('[Mothscilla] remux mux error', e); }
      },
      error: (e) => { encodeErr = e; console.error('[Mothscilla] remux encode error', e); },
    });
    venc.configure(cfg);

    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d')!;
    let frameCount = 0;
    let firstMediaTime: number | null = null;
    let lastRelTs = -1;
    let lastIntervalUs = 1e6 / 30; // seed guess; refined from real frame spacing below
    let done = false;

    await new Promise<void>((resolve) => {
      const capture = (mediaTimeSec: number) => {
        if (firstMediaTime == null) firstMediaTime = mediaTimeSec;
        // Relative to the first captured frame, so the muxer always sees timestamp
        // 0 first regardless of whatever the browser's rVFC media-time origin is.
        const relTs = Math.max(0, Math.round((mediaTimeSec - firstMediaTime) * 1e6));
        if (relTs <= lastRelTs) return; // duplicate/out-of-order — chunks must strictly increase
        if (lastRelTs >= 0) lastIntervalUs = relTs - lastRelTs;
        lastRelTs = relTs;
        ctx.drawImage(video, 0, 0, W, H);
        // A duration is required on every frame (including the last) — without it
        // the muxer reports the track as ending at the last frame's *start* time,
        // silently trimming off however long that final frame should have shown.
        const frame = new VideoFrame(canvas, { timestamp: relTs, duration: Math.max(1, Math.round(lastIntervalUs)) });
        venc.encode(frame, { keyFrame: frameCount % 60 === 0 });
        frame.close();
        frameCount++;
      };
      // 'ended' can be processed before the final requestVideoFrameCallback for
      // the last frame runs — capture whatever's currently showing so the tail
      // of the recording is never silently dropped.
      const finish = () => { if (done) return; done = true; capture(video.currentTime); resolve(); };
      video.onended = finish;
      video.onerror = finish;
      const onFrame: VideoFrameRequestCallback = async (_now, meta) => {
        if (done || encodeErr) return;
        capture(meta.mediaTime);
        if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
        if (!done) video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      void video.play().catch(finish);
    });

    await venc.flush();
    venc.close();
    if (encodeErr || frameCount === 0) return original;
    muxer.finalize();
    const { buffer } = muxer.target as { buffer: ArrayBuffer };
    return { bytes: buffer, mime: 'video/mp4' };
  } catch (e) {
    console.warn('[Mothscilla] remux for seeking failed, keeping the original recording', e);
    return original;
  } finally {
    URL.revokeObjectURL(url);
  }
}
