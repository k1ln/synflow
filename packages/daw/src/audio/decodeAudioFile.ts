// Audio file import + decode. Uses the File System Access API when available
// (the user's preference), falling back to a hidden <input>. Decoding uses a
// shared AudioContext so it works before transport playback starts.

export interface PickedFile { name: string; bytes: ArrayBuffer; mime: string; }

const MIME_BY_EXT: Record<string, string> = {
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac',
  m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm',
};
/** Best-effort MIME from a file (its type, falling back to the extension). */
export const mimeOf = (name: string, type?: string): string =>
  type || MIME_BY_EXT[(name.split('.').pop() ?? '').toLowerCase()] || 'audio/wav';

/** Read a File to an ArrayBuffer, reporting bytes-read progress for large files. */
async function readBytes(file: File, onProgress?: (read: number, total: number) => void): Promise<ArrayBuffer> {
  const total = file.size;
  if (!onProgress || typeof file.stream !== 'function') return file.arrayBuffer();
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    read += value.byteLength;
    onProgress(read, total);
  }
  const out = new Uint8Array(read);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out.buffer;
}

export async function pickAudioFile(onProgress?: (read: number, total: number) => void): Promise<PickedFile | null> {
  const w = window as any;
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'Audio', accept: { 'audio/*': ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      return { name: file.name, bytes: await readBytes(file, onProgress), mime: mimeOf(file.name, file.type) };
    } catch {
      return null; // user cancelled
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, bytes: await readBytes(f, onProgress), mime: mimeOf(f.name, f.type) } : null);
    };
    input.click();
  });
}

let decodeCtx: AudioContext | null = null;

/** Decode compressed/PCM audio bytes to an AudioBuffer (for waveform display). */
export async function decodeToBuffer(bytes: ArrayBuffer): Promise<AudioBuffer> {
  if (!decodeCtx) decodeCtx = new AudioContext();
  // decodeAudioData detaches its input; decode a copy so the original bytes stay usable.
  return decodeCtx.decodeAudioData(bytes.slice(0));
}

/** ArrayBuffer → base64 (chunked, for embedding sample bytes in a portable flow). */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

/** base64 → ArrayBuffer (inverse of arrayBufferToBase64). */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
