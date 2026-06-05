// Audio asset manager: ingests imported/recorded audio, keeps large files on disk
// (streamed), embeds base64 only on export, and resolves assets to AudioBuffers
// (short, sample-accurate) or blob URLs (long, streamed via <audio>).
import { decodeToBuffer, arrayBufferToBase64, base64ToArrayBuffer } from './decodeAudioFile';
import { computePeaksMixed } from './waveform';
import { wavHeader, encodeWavFrames } from './wav';
import { readWavHeader, type WavMeta } from './wavReader';
import { writeAudio, readAudio, createAudioWritable } from '../synflow/flowStore';
import type { AudioAsset, AudioSource } from '../model/project';
import { uid } from '../model/project';

/** Files longer than this stream via an <audio> element instead of decoding to RAM. */
export const STREAM_THRESHOLD = 20; // seconds
const PEAK_BUCKETS = 1000;
/** Per-asset cap for base64 portable export. Base64 inflates ~33%, and the whole
 *  song JSON must fit in one JS string (~512 MB max), so embedding a multi-hundred-MB
 *  file is impossible (and atob couldn't read it back). Bigger files stay disk refs. */
const MAX_EMBED_BYTES = 64 * 1024 * 1024;

/** Keep the original file/asset name for the on-disk WAV, sanitized for the
 *  filesystem (drop path separators + illegal chars; keep spaces/case). */
function sanitizeAudioName(name: string): string {
  return name.trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\.+$/, '').slice(0, 120) || 'audio';
}

export class AudioAssets {
  private folder: any = null;
  private buffers = new Map<string, AudioBuffer>();  // assetId → decoded buffer (short clips)
  private urls = new Map<string, string>();          // assetId → blob URL (streamed clips)
  private streams = new Map<string, { blob: Blob; meta: WavMeta }>(); // assetId → on-disk WAV handle + header

  setFolder(folder: any): void { this.folder = folder; }

  isStreamed(asset: AudioAsset): boolean { return asset.duration > STREAM_THRESHOLD; }

  /** A disk-backed asset can be streamed off disk (after converting to WAV). */
  isDisk(asset: AudioAsset): boolean { return asset.source.kind === 'disk' && !!this.folder; }
  /** Already a disk WAV (streams with no conversion). */
  isDiskWav(asset: AudioAsset): boolean {
    return asset.source.kind === 'disk' && asset.source.mime === 'audio/wav' && !!this.folder;
  }

  /** Open a disk asset for random-access streaming (cached). Legacy non-WAV disk
   *  files (e.g. mp3 imports from before WAV-on-disk) are converted to WAV once —
   *  decoded then **streamed to disk in chunks** — so the costly decode is a
   *  one-time spike, after which playback reads frames off disk with low RAM. */
  async resolveStream(asset: AudioAsset): Promise<{ blob: Blob; meta: WavMeta } | null> {
    const hit = this.streams.get(asset.id); if (hit) return hit;
    if (!this.isDisk(asset)) return null;
    if (asset.source.kind === 'disk' && asset.source.mime !== 'audio/wav') {
      if (!(await this.migrateToWav(asset))) return null; // mutates asset.source → WAV
    }
    const blob = await this.blobOf(asset); if (!blob) return null;
    const meta = await readWavHeader(blob);
    const entry = { blob, meta }; this.streams.set(asset.id, entry); return entry;
  }

  /** Write a decoded buffer → 16-bit WAV on disk under `fileName`, streamed in
   *  chunks. If that name is taken: reuse it when the size matches (same re-import),
   *  else add a " (n)" suffix so distinct audio never overwrites another file.
   *  Returns the actual filename written/reused. */
  private async writeWavToDisk(fileName: string, buf: AudioBuffer): Promise<string> {
    const numCh = buf.numberOfChannels;
    const expected = 44 + buf.length * numCh * 2;
    const dot = fileName.lastIndexOf('.');
    const base = dot < 0 ? fileName : fileName.slice(0, dot), ext = dot < 0 ? '' : fileName.slice(dot);
    let name = fileName;
    for (let n = 2; ; n++) {
      const existing = await readAudio(this.folder, name);
      if (!existing) break;                 // free → write here
      if (existing.size === expected) return name; // same audio already on disk → reuse
      name = `${base} (${n})${ext}`;        // taken by different audio → try next
    }
    const chans = Array.from({ length: numCh }, (_, c) => buf.getChannelData(c));
    const w = await createAudioWritable(this.folder, name);
    await w.write(wavHeader(buf.sampleRate, numCh, buf.length));
    const CHUNK = 1 << 16;
    for (let s = 0; s < buf.length; s += CHUNK) await w.write(encodeWavFrames(chans, s, Math.min(CHUNK, buf.length - s)));
    await w.close();
    return name;
  }

  /** Decode a legacy disk file → WAV on disk (named after the asset's original
   *  name), re-point the asset. Deduped by name, so assets sharing a source
   *  convert it once. */
  private async migrateToWav(asset: AudioAsset): Promise<string | null> {
    const src = asset.source; if (src.kind !== 'disk') return null;
    // Prefer an already-converted WAV on disk — named after the asset, or sitting
    // next to the source (same base name, e.g. an older hash-named conversion).
    // This also recovers playback when the original (mp3) was deleted.
    const candidates = [sanitizeAudioName(asset.name) + '.wav', src.fileName.replace(/\.[^.]+$/, '') + '.wav'];
    for (const cand of candidates) {
      if (await readAudio(this.folder, cand)) {
        asset.source = { kind: 'disk', fileName: cand, mime: 'audio/wav' };
        return cand;
      }
    }
    // none on disk → decode the source (if still present) and write a fresh WAV
    const bytes = await this.bytesOf(asset); if (!bytes) return null;
    const buf = await decodeToBuffer(bytes);                  // one-time full decode (RAM spike)
    const finalName = await this.writeWavToDisk(sanitizeAudioName(asset.name) + '.wav', buf);
    asset.source = { kind: 'disk', fileName: finalName, mime: 'audio/wav' }; // persists on next save
    return finalName;
  }

  /** Cached streaming handle if already opened (synchronous; null otherwise). */
  cachedStream(asset: AudioAsset): { blob: Blob; meta: WavMeta } | null { return this.streams.get(asset.id) ?? null; }

  /** Decode bytes → AudioAsset. Writes to <folder>/audio/ when a folder is set
   *  (small song JSON, streamable); otherwise embeds base64 (portable fallback). */
  async ingest(name: string, bytes: ArrayBuffer, mime: string): Promise<AudioAsset> {
    const buf = await decodeToBuffer(bytes);
    const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    const pk = computePeaksMixed(chans, PEAK_BUCKETS);
    const peaks = { min: Array.from(pk.min), max: Array.from(pk.max) };

    let source: AudioSource;
    if (this.folder) {
      // Persist decoded PCM as WAV — playback (streamed) is then reliable regardless
      // of the imported codec. Keep the original file's name on disk.
      const fileName = await this.writeWavToDisk(sanitizeAudioName(name) + '.wav', buf);
      source = { kind: 'disk', fileName, mime: 'audio/wav' };
    } else {
      // No project folder: keep the compact original bytes embedded (base64).
      source = { kind: 'embedded', base64: arrayBufferToBase64(bytes), mime };
    }
    const asset: AudioAsset = { id: uid('asset'), name, source, duration: buf.duration, peaks };
    if (buf.duration <= STREAM_THRESHOLD) this.buffers.set(asset.id, buf); // keep small ones hot
    return asset;
  }

  async blobOf(asset: AudioAsset): Promise<Blob | null> {
    if (asset.source.kind === 'embedded') return new Blob([base64ToArrayBuffer(asset.source.base64)], { type: asset.source.mime });
    if (this.folder) return readAudio(this.folder, asset.source.fileName);
    return null;
  }

  private async bytesOf(asset: AudioAsset): Promise<ArrayBuffer | null> {
    if (asset.source.kind === 'embedded') return base64ToArrayBuffer(asset.source.base64);
    const blob = await this.blobOf(asset); return blob ? blob.arrayBuffer() : null;
  }

  /** Already-decoded buffer if hot in cache (synchronous; null otherwise). */
  cachedBuffer(asset: AudioAsset): AudioBuffer | null { return this.buffers.get(asset.id) ?? null; }

  /** Decoded buffer for short clips (sample-accurate playback + waveform fallback). */
  async resolveBuffer(asset: AudioAsset): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(asset.id); if (cached) return cached;
    const bytes = await this.bytesOf(asset); if (!bytes) return null;
    const buf = await decodeToBuffer(bytes); this.buffers.set(asset.id, buf); return buf;
  }

  /** Blob URL for streamed (long) clips via an <audio> element. */
  async resolveUrl(asset: AudioAsset): Promise<string | null> {
    const cached = this.urls.get(asset.id); if (cached) return cached;
    const blob = await this.blobOf(asset); if (!blob) return null;
    const url = URL.createObjectURL(blob); this.urls.set(asset.id, url); return url;
  }

  /** Embed every disk-backed asset as base64 (portable export). Files too large to
   *  base64 (the result would exceed the JS max string length, and `atob` couldn't
   *  read them back either) are left as disk refs and listed in `skipped`.
   *  `onProgress` reports completion fraction (sequential so it's monotonic). */
  async embedAll(assets: AudioAsset[], onProgress?: (frac: number) => void): Promise<{ assets: AudioAsset[]; skipped: string[] }> {
    const out: AudioAsset[] = []; const skipped: string[] = [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      if (a.source.kind === 'embedded') { out.push(a); }
      else {
        const bytes = await this.bytesOf(a);
        if (bytes && bytes.byteLength <= MAX_EMBED_BYTES) {
          out.push({ ...a, source: { kind: 'embedded', base64: arrayBufferToBase64(bytes), mime: a.source.mime } as AudioSource });
        } else {
          if (bytes) { skipped.push(a.name); console.warn(`[Mothscilla] "${a.name}" is ${(bytes.byteLength / 1e6).toFixed(0)} MB — too large to embed in a portable JSON; kept as a disk reference. Share the project folder or Bounce instead.`); }
          out.push(a);
        }
      }
      onProgress?.((i + 1) / assets.length);
    }
    return { assets: out, skipped };
  }

  /** Persist any disk-backed assets' bytes to <folder>/audio/ (e.g. on save). */
  async persistDisk(assets: AudioAsset[]): Promise<void> {
    if (!this.folder) return;
    for (const a of assets) {
      if (a.source.kind !== 'disk') continue;
      const bytes = await this.bytesOf(a); if (!bytes) continue;
      await writeAudio(this.folder, a.source.fileName, new Blob([bytes], { type: a.source.mime }));
    }
  }

  dispose(): void {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear(); this.buffers.clear(); this.streams.clear();
  }
}
