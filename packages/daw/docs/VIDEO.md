# Video / MAW — feature roadmap

Mothscilla is growing from a **DAW** into a **MAW — Multimedia Audio Workstation**:
the audio engine stays the core, and video becomes a first-class track type. This
doc is the **Adobe-Premiere-style feature catalog** we're working toward. Only a
small slice is built today — most items are deliberately deferred ("implementation
can be done later"). Each item is tagged:

- **[done]** — shipped in this pass
- **[now]** — partially shipped / works for the common case
- **[later]** — roadmap, not built yet

The branding stays "Mothscilla"; "MAW" is the concept.

> **Full work-later backlog:** see
> [VIDEO-PREMIERE-BACKLOG.md](./VIDEO-PREMIERE-BACKLOG.md) for the exhaustive list
> of Adobe Premiere Pro features to pull future tasks from.

---

## Architecture (built this pass)
- **Video track type** — `Track.type === 'video'`, holding `VideoClip[]`
  (`src/model/project.ts`). **[done]**
- **`VideoAsset`** — container bytes (disk/embedded) + duration, width, height,
  poster frame, and a link to the extracted audio asset. **[done]**
- **Import** (`src/audio/video.ts`) — pick `.mov/.mp4/.avi`, probe metadata +
  poster, extract audio. **[done / now]**
- **Export** (`src/audio/videoExport.ts`) — **WebCodecs** (GPU) + `mp4-muxer` →
  standard `.mp4` (H.264 + AAC). **[now]**

---

## 1. Import & Media
- [done] **Live capture** — webcam (facecam/reaction, rounded corner overlay) via
  getUserMedia + screen/window/tab via getDisplayMedia, composited live in the
  program monitor. Toolbar Camera / Screen buttons.
- [done] **Record** — the toolbar ● records the monitor composite (screen + facecam
  + clips/titles) with mixed audio (screen + mic + song) via MediaRecorder → a WebM
  that's ingested as a new video track (+ extracted audio). `toggleRecord` in app.tsx.
- [done] Import `.mp4`, `.mov` (drag a Video track in; file picker)
- [now] Import `.avi` — imports, but Chrome can't natively decode it, so poster +
  audio extraction are best-effort
- [done] **Extract audio from video** into the mix (mp4/mov via `decodeAudioData`)
- [later] AVI/extra-codec audio extraction via a demux fallback (mp4box.js / WASM demuxer)
- [later] Media browser / bins, metadata panel, hover-scrub thumbnails
- [later] Image & image-sequence import, GIF, still export
- [later] Proxy media (low-res offline editing) + relink
- [later] Drag-and-drop from OS / from the browser panel

## 2. Timeline & Editing
- [done] Place video clips on the song timeline; drag to move
- [done] **Edge-trim** (drag clip in/out handles) + **split/razor at playhead** for
  both video and audio clips in the Song timeline (`src/ui/Arrange.tsx`,
  `splitVideoClip`/`splitAudioClip`)
- [later] Ripple / roll / slip / slide edits, ripple delete
- [later] Razor tool, multiple video tracks with stacking order
- [later] Snapping, markers, in/out points, three-point editing
- [later] Linked A/V (move video → its audio follows), group/nest sequences
- [later] Speed/duration (time-stretch, reverse, time remapping with keyframes)
- [later] Frame-accurate JKL shuttle, ripple trim to playhead

## 3. Preview / Program Monitor
- [done] Live video preview monitor synced to the transport playhead (plays the
  active clip muted while running; seeks to the frame while scrubbing) — see
  `src/ui/ProgramMonitor.tsx`. Toggle in the Song view.
- [later] Loop preview, safe margins, fit/zoom, fullscreen, playback resolution
- [later] Source monitor (audition a clip before editing in)

## 4. Effects & Compositing
- [done] **Multi-track video compositing** — every video track stacks (later track
  on top), with per-clip **opacity** + **blend modes** (normal/multiply/screen/
  overlay/lighten/darken/add/difference). Live in the Program monitor and the
  export. Edit via the monitor's inspector. `src/ui/ProgramMonitor.tsx`,
  `src/audio/videoExport.ts`, `blendCompositeOp` in `src/model/project.ts`.
- [done] **Transform + keyframes** — per-clip position (X/Y), scale, rotation,
  opacity, with keyframe animation + easing (linear/ease/ease-in/ease-out/hold).
  Edit + keyframe (◆) in the monitor inspector; evaluated identically in preview
  and export. `src/audio/videoTransform.ts` (`evalTransform`, `drawVideoLayer`).
- [later] Anchor-point control, motion blur, per-keyframe Bezier handle editor
- [later] Crop, mirror, drop shadow, masks (shape + track matte)
- [later] Motion / keyframe graph editor (Bezier easing)
- [later] Video effects library (blur, glow, distort, stylize), adjustment layers
- [later] GPU/WebGL effect pipeline; effect presets

## 5. Transitions
- [done] **Cross dissolve** via per-clip fade in/out (opacity ramps) — overlap two
  clips on stacked video tracks and they crossfade. Edit in the monitor inspector.
  `evalTransform` fade in `src/audio/videoTransform.ts`.
- [done] **Audio crossfades** — per-clip fade in/out on audio clips (gain ramps),
  applied in realtime + both bounces. Edit on the clip in the Song timeline.
  `src/audio/clipFade.ts`.
- [done] Dip to black (a fade-out with no clip beneath = fades to black)
- [later] Push/slide/wipe/zoom transitions, morph cut, default transition + drag-to-apply

## 6. Color
- [done] **Basic Lumetri grade** — exposure, contrast, saturation (canvas filters)
  + white balance temperature/tint (soft-light overlay), per clip, live in the
  monitor + export. `colorFilter`/`tintColor` in `src/audio/videoTransform.ts`.
- [done] **RGB histogram scope** in the monitor (toggle in the header)
- [later] Curves (RGB + hue/sat), color wheels (lift/gamma/gain), HSL secondary
- [later] LUT import/export, waveform + vectorscope, adjustment-layer grading

## 7. Titles & Graphics
- [done] **Title clips** — a title is a video-track clip with `text` (no asset), so
  it reuses compositing, transform (position/scale/rotation), keyframes, fades, and
  trim/split. "Add Title" button. Edit text/colour/align/bold/size + lower-third
  background bar in the monitor; **burned into the export**. `drawTitle` in
  `src/audio/videoTransform.ts`.
- [done] **30 self-hosted fonts** (woff2 bundled in `public/fonts/`, loaded via the
  FontFace API — no runtime CDN), picked per title. `src/fonts.ts`.
- [done] **Title appear effects** — fade, slide (up/down/left/right), pop,
  typewriter, blur-in (over the fade-in duration). Live + export.
- [later] Shapes, rolling/crawling credits, MOGRT-style templates, captions/SRT,
  font weights/stroke, per-character animation

## 8. Audio (leverages the existing DAW)
- [done] Extracted audio plays on a normal audio lane (full DAW mixing + FX)
- [done] Per-track FX chain, EQ, volume automation surface (DAW features)
- [later] Per-clip audio gain rubber-band on the video's audio
- [later] Ducking / auto-mix against video, loudness normalization, A/V sync lock

## 9. Multicam & Sync
- [later] Multicam source sequences, angle switching
- [later] Sync by audio waveform / timecode / markers

## 10. Export / Render
- [done] **Detailed export popup**: Video+Audio / Video only / Audio only
- [done] Resolution presets (Source / 2160p / 1080p / 720p / 480p)
- [done] Frame-rate presets (24 / 25 / 30 / 60)
- [done] **Real H.264 + AAC `.mp4`** via WebCodecs (GPU) + `mp4-muxer` — plays
  everywhere, uploads to YouTube
- [done] Audio-only → WAV (existing bounce); Video-only → silent mp4
- [done] Save to `<folder>/exports/` or download
- [done] Multi-track video composite render (all V tracks, gaps → black)
- [done] **WebM/VP9 + Opus** output alongside MP4/H.264 (`src/audio/videoExport.ts`)
- [done] **Quality control** (Low/Medium/High bitrate presets)
- [done] **In/out range export** (bars) — video + audio sliced to the range
- [later] AV1/HEVC output, explicit bitrate field, 2-pass, HDR, queue/presets
- [later] Direct-to-YouTube upload
- [later] Original-vs-mixdown audio source choice (today = song mixdown)

## 11. Performance / Project
- [later] Background rendering, render-and-replace, smart proxies
- [later] Hardware-encode tuning (`prefer-hardware` is on; expose toggle)
- [later] Autosave video edits, project archiving with media

## 12. Collaboration
- [later] Shared projects, comments/review, versioning

---

## Notes / known limits (this pass)
- Chromium-only (WebCodecs + File System Access API), consistent with the rest of
  the app.
- Export sources frames by **seeking a `<video>` element** (deterministic but slow
  for long HD); realtime `requestVideoFrameCallback` capture is a future speedup.
- Video clip timing reuses the **constant-BPM** seconds↔steps math used by audio
  clips — fine until tempo automation lands.
- Video container bytes are cached per session and persisted to `<folder>/video/`
  when a project folder is set; cross-session reload of embedded (no-folder) video
  is a roadmap item.
