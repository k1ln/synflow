// Audio file import + decode. Uses the File System Access API when available
// (the user's preference), falling back to a hidden <input>. Decoding uses a
// shared AudioContext so it works before transport playback starts.

export interface PickedFile { name: string; bytes: ArrayBuffer; }

export async function pickAudioFile(): Promise<PickedFile | null> {
  const w = window as any;
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'Audio', accept: { 'audio/*': ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      return { name: file.name, bytes: await file.arrayBuffer() };
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
      resolve(f ? { name: f.name, bytes: await f.arrayBuffer() } : null);
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
