// Minimal WAV encode/decode. Encoding accepts planar channel data at 16-bit
// (TPDF-dithered), 24-bit PCM, or 32-bit float; `wavHeader` + `encodeWavFrames`
// write incrementally so big bounces don't sit in memory (used by Bounce/Recorder
// with a File System Access writable).

export type WavBits = 16 | 24 | 32;   // 32 = IEEE float

export interface WavInfo { sampleRate: number; channels: number; frames: number; data: Float32Array[]; }

const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

/** TPDF dither at ±1 LSB (triangular = sum of two uniforms), 16-bit only —
 *  decorrelates quantization error so quiet tails don't distort. */
const tpdf16 = () => (Math.random() + Math.random() - 1) / 0x8000;

function writeSample(dv: DataView, off: number, x: number, bits: WavBits): number {
  if (bits === 32) { dv.setFloat32(off, x, true); return off + 4; }
  if (bits === 24) {
    const v = Math.round(clamp1(x) * 0x7fffff);
    dv.setUint8(off, v & 0xff); dv.setUint8(off + 1, (v >> 8) & 0xff); dv.setUint8(off + 2, (v >> 16) & 0xff);
    return off + 3;
  }
  const s = clamp1(x + tpdf16());
  dv.setInt16(off, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  return off + 2;
}

function writeHeader(dv: DataView, sampleRate: number, numCh: number, dataLen: number, bits: WavBits): void {
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  const blockAlign = numCh * (bits / 8);
  ws(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); ws(8, 'WAVE');
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, bits === 32 ? 3 : 1, true);   // 3 = IEEE float
  dv.setUint16(22, numCh, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true); dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bits, true);
  ws(36, 'data'); dv.setUint32(40, dataLen, true);
}

/** Encode planar Float32 channels → a complete WAV ArrayBuffer. */
export function encodeWav(channels: Float32Array[], sampleRate: number, bits: WavBits = 16): ArrayBuffer {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataLen = frames * numCh * (bits / 8);
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  writeHeader(dv, sampleRate, numCh, dataLen, bits);
  let off = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < numCh; c++) off = writeSample(dv, off, channels[c][i], bits);
  return buf;
}

/** WAV header bytes for a known total frame count (for streaming writes). */
export function wavHeader(sampleRate: number, numCh: number, totalFrames: number, bits: WavBits = 16): ArrayBuffer {
  const buf = new ArrayBuffer(44);
  writeHeader(new DataView(buf), sampleRate, numCh, totalFrames * numCh * (bits / 8), bits);
  return buf;
}

/** Encode one block of planar frames → interleaved PCM/float bytes (streaming). */
export function encodeWavFrames(channels: Float32Array[], start: number, count: number, bits: WavBits = 16): ArrayBuffer {
  const numCh = channels.length;
  const buf = new ArrayBuffer(count * numCh * (bits / 8));
  const dv = new DataView(buf);
  let off = 0;
  for (let i = 0; i < count; i++) for (let c = 0; c < numCh; c++) off = writeSample(dv, off, channels[c][start + i] ?? 0, bits);
  return buf;
}

/** Decode a 16/24-bit PCM or 32-bit float WAV ArrayBuffer → planar channels. */
export function decodeWav(buf: ArrayBuffer): WavInfo {
  const dv = new DataView(buf);
  const rd = (off: number, len: number) => { let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i)); return s; };
  if (rd(0, 4) !== 'RIFF' || rd(8, 4) !== 'WAVE') throw new Error('not a WAV file');

  let off = 12, fmt = 1, channels = 1, sampleRate = 44100, bits = 16, dataOff = -1, dataLen = 0;
  while (off + 8 <= dv.byteLength) {
    const id = rd(off, 4); const size = dv.getUint32(off + 4, true); off += 8;
    if (id === 'fmt ') {
      fmt = dv.getUint16(off, true); channels = dv.getUint16(off + 2, true);
      sampleRate = dv.getUint32(off + 4, true); bits = dv.getUint16(off + 14, true);
    } else if (id === 'data') { dataOff = off; dataLen = size; }
    off += size + (size & 1);
  }
  if (dataOff < 0) throw new Error('no data chunk');

  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLen / (bytesPerSample * channels));
  const out: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = dataOff + (i * channels + c) * bytesPerSample;
      out[c][i] = fmt === 3 ? dv.getFloat32(p, true)
        : bits === 24 ? (((dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getUint8(p + 2) << 16)) << 8) >> 8) / 0x800000
          : dv.getInt16(p, true) / 0x8000;
    }
  }
  return { sampleRate, channels, frames, data: out };
}
