// Random-access reader for the 16-bit/32-bit PCM WAV files AudioAssets writes to
// disk. Lets us pull an arbitrary frame range straight off disk (Blob.slice) without
// decoding the whole file — the basis for low-RAM streaming playback and the
// windowed mixdown.

export interface WavMeta {
  sampleRate: number;
  numCh: number;
  bits: number;       // 16 (PCM int) or 32 (float)
  float: boolean;     // fmt === 3
  dataOffset: number; // byte offset of the first sample frame
  dataLen: number;    // length of the data chunk in bytes
  frames: number;     // total sample frames
  blockAlign: number; // bytes per frame (numCh * bits/8)
}

const ascii = (dv: DataView, off: number, len: number): string => {
  let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i)); return s;
};

/** Parse a WAV header from the first bytes of a blob (reads at most ~4 KB). */
export async function readWavHeader(blob: Blob): Promise<WavMeta> {
  // The fmt/data chunks live near the start; 4 KB covers any reasonable header.
  const head = await blob.slice(0, Math.min(blob.size, 4096)).arrayBuffer();
  const dv = new DataView(head);
  if (ascii(dv, 0, 4) !== 'RIFF' || ascii(dv, 8, 4) !== 'WAVE') throw new Error('not a WAV file');

  let off = 12, fmt = 1, numCh = 2, sampleRate = 44100, bits = 16, dataOffset = -1, dataLen = 0;
  while (off + 8 <= dv.byteLength) {
    const id = ascii(dv, off, 4); const size = dv.getUint32(off + 4, true); off += 8;
    if (id === 'fmt ') {
      fmt = dv.getUint16(off, true); numCh = dv.getUint16(off + 2, true);
      sampleRate = dv.getUint32(off + 4, true); bits = dv.getUint16(off + 14, true);
    } else if (id === 'data') {
      dataOffset = off;
      // The header's data size can be wrong/streaming-placeholder; trust the file size.
      dataLen = Math.min(size, blob.size - off);
      break;
    }
    off += size + (size & 1);
  }
  if (dataOffset < 0) throw new Error('no data chunk');
  const blockAlign = numCh * (bits / 8);
  return { sampleRate, numCh, bits, float: fmt === 3, dataOffset, dataLen, blockAlign, frames: Math.floor(dataLen / blockAlign) };
}

/** Read `count` frames starting at `startFrame` → planar Float32 (one array per
 *  channel). Reads only the needed byte range from disk. Resamples to
 *  `outRate`/`outFrames` when the file rate differs from the audio context. */
export async function readWavFrames(
  blob: Blob, meta: WavMeta, startFrame: number, count: number,
  outRate?: number,
): Promise<Float32Array[]> {
  const need = outRate && outRate !== meta.sampleRate;
  // When resampling, pull enough source frames to cover the requested output span.
  const ratio = need ? meta.sampleRate / outRate! : 1;
  const srcCount = need ? Math.ceil(count * ratio) + 1 : count;

  const from = Math.max(0, Math.min(meta.frames, startFrame));
  const avail = Math.max(0, Math.min(srcCount, meta.frames - from));
  const byteStart = meta.dataOffset + from * meta.blockAlign;
  const byteEnd = byteStart + avail * meta.blockAlign;
  const buf = avail > 0 ? await blob.slice(byteStart, byteEnd).arrayBuffer() : new ArrayBuffer(0);
  const dv = new DataView(buf);

  const bytesPer = meta.bits / 8;
  const src: Float32Array[] = Array.from({ length: meta.numCh }, () => new Float32Array(avail));
  for (let i = 0; i < avail; i++) {
    for (let c = 0; c < meta.numCh; c++) {
      const p = i * meta.blockAlign + c * bytesPer;
      src[c][i] = meta.float ? dv.getFloat32(p, true) : dv.getInt16(p, true) / 0x8000;
    }
  }
  if (!need) return src;

  // Linear resample each channel to `count` output frames.
  const out: Float32Array[] = Array.from({ length: meta.numCh }, () => new Float32Array(count));
  for (let c = 0; c < meta.numCh; c++) {
    const s = src[c];
    for (let i = 0; i < count; i++) {
      const x = i * ratio;
      const i0 = Math.floor(x); const i1 = Math.min(s.length - 1, i0 + 1); const f = x - i0;
      out[c][i] = i0 < s.length ? s[i0] * (1 - f) + s[i1] * f : 0;
    }
  }
  return out;
}
