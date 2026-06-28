// Video import: pick a file, probe its metadata + poster frame, and extract the
// audio track. Picture compositing/preview is a roadmap item (see docs/VIDEO.md);
// today we keep the container bytes (for export) and pull out the audio so a video
// drop is immediately useful in the mix. Mirrors decodeAudioFile.ts.

export interface PickedVideo { name: string; bytes: ArrayBuffer; mime: string; }

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  m4v: 'video/mp4', webm: 'video/webm',
};
export const VIDEO_EXTS = ['.mov', '.mp4', '.avi'] as const;

export const videoMimeOf = (name: string, type?: string): string =>
  type || VIDEO_MIME_BY_EXT[(name.split('.').pop() ?? '').toLowerCase()] || 'video/mp4';

async function readBytes(file: File, onProgress?: (read: number, total: number) => void): Promise<ArrayBuffer> {
  const total = file.size;
  if (!onProgress || typeof file.stream !== 'function') return file.arrayBuffer();
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); read += value.byteLength; onProgress(read, total);
  }
  const out = new Uint8Array(read);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out.buffer;
}

export async function pickVideoFile(onProgress?: (read: number, total: number) => void): Promise<PickedVideo | null> {
  const w = window as any;
  const exts = [...VIDEO_EXTS];
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'Video', accept: { 'video/*': exts } }],
        multiple: false,
      });
      const file = await handle.getFile();
      return { name: file.name, bytes: await readBytes(file, onProgress), mime: videoMimeOf(file.name, file.type) };
    } catch { return null; } // cancelled
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,' + exts.join(',');
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, bytes: await readBytes(f, onProgress), mime: videoMimeOf(f.name, f.type) } : null);
    };
    input.click();
  });
}

export interface VideoProbe { duration: number; width: number; height: number; poster?: string; }

/** Load just enough of a video to read its dimensions/duration and grab a poster
 *  frame. Uses an offscreen <video>; returns zeros if the browser can't decode it
 *  (e.g. AVI) so the import still proceeds. */
export async function probeVideo(bytes: ArrayBuffer, mime: string): Promise<VideoProbe> {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.src = url;
    const meta = await new Promise<VideoProbe>((resolve) => {
      const read = () => resolve({ duration: v.duration || 0, width: v.videoWidth || 0, height: v.videoHeight || 0 });
      v.onloadedmetadata = read;
      v.onerror = () => resolve({ duration: 0, width: 0, height: 0 });
      window.setTimeout(read, 4000);
    });
    let poster: string | undefined;
    if (meta.width && meta.height) {
      poster = await new Promise<string | undefined>((resolve) => {
        const grab = () => {
          try {
            const c = document.createElement('canvas');
            c.width = Math.min(320, meta.width);
            c.height = Math.max(1, Math.round(c.width * (meta.height / meta.width)));
            c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.6));
          } catch { resolve(undefined); }
        };
        v.onseeked = grab;
        try { v.currentTime = Math.min(0.1, (meta.duration || 1) / 2); } catch { resolve(undefined); }
        window.setTimeout(() => resolve(undefined), 3000);
      });
    }
    return { ...meta, poster };
  } finally { URL.revokeObjectURL(url); }
}

let decodeCtx: AudioContext | null = null;

/** Extract the audio track from a video container by decoding it as audio. Works
 *  for mp4/mov (AAC) in the browser; AVI / unsupported codecs return null (the
 *  video still imports — see docs/VIDEO.md for the demux fallback plan). */
export async function extractAudioFromVideo(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  if (!decodeCtx) decodeCtx = new AudioContext();
  try {
    return await decodeCtx.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  }
}
