// Minimal 16-bit PCM WAV encode/decode. Encoding accepts planar channel data;
// `writeWavStream` writes header + frames incrementally so big bounces don't sit
// in memory (used by Bounce/Recorder with a File System Access writable).

export interface WavInfo { sampleRate: number; channels: number; frames: number; data: Float32Array[]; }

function floatTo16(x: number): number {
  const s = Math.max(-1, Math.min(1, x));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

/** Encode planar Float32 channels → a complete WAV ArrayBuffer (16-bit PCM). */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const blockAlign = numCh * 2;
  const dataLen = frames * blockAlign;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };

  ws(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); ws(8, 'WAVE');
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, numCh, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true); dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, dataLen, true);

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) { dv.setInt16(off, floatTo16(channels[c][i]), true); off += 2; }
  }
  return buf;
}

/** WAV header bytes for a known total frame count (for streaming writes). */
export function wavHeader(sampleRate: number, numCh: number, totalFrames: number): ArrayBuffer {
  const blockAlign = numCh * 2;
  const dataLen = totalFrames * blockAlign;
  const buf = new ArrayBuffer(44);
  const dv = new DataView(buf);
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); ws(8, 'WAVE');
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, numCh, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true); dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, dataLen, true);
  return buf;
}

/** Encode one block of planar frames → interleaved 16-bit PCM bytes (streaming). */
export function encodeWavFrames(channels: Float32Array[], start: number, count: number): ArrayBuffer {
  const numCh = channels.length;
  const buf = new ArrayBuffer(count * numCh * 2);
  const dv = new DataView(buf);
  let off = 0;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < numCh; c++) { dv.setInt16(off, floatTo16(channels[c][start + i] ?? 0), true); off += 2; }
  }
  return buf;
}

/** Decode a 16-bit (or 32-bit float) PCM WAV ArrayBuffer → planar channels. */
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
      out[c][i] = fmt === 3 ? dv.getFloat32(p, true) : dv.getInt16(p, true) / 0x8000;
    }
  }
  return { sampleRate, channels, frames, data: out };
}
