# Video editing — Adobe Premiere Pro feature backlog (work-later list)

An exhaustive catalog of Adobe Premiere Pro features, as a backlog for the MAW
(Multimedia Audio Workstation) video side. Everything here is **deferred** — the
slice already shipped lives in [VIDEO.md](./VIDEO.md). This file is the "what
Premiere can do" reference to pull tasks from.

Legend: **★** = high-value early targets · **◆** = medium · **·** = nice-to-have.

---

## 1. Import, media & ingest
- ✅ Live webcam (facecam) + screen/window/tab capture, composited in the monitor **(done)**
- ✅ Record the composite (screen + facecam + clips) → video clip, with mixed audio **(done)**
- ✅ Capture **device picker** (camera + mic) + **per-source size/position** (Sources panel) **(done)**
- ◆ Drag-on-canvas to move/resize sources, facecam shape (circle), per-source blend/transition
- ★ Import `.mp4/.mov/.m4v` (H.264/H.265/ProRes where the browser decodes them)
- ◆ Import `.avi`, `.mkv`, `.webm`, `.mxf`, `.wmv` via a demuxer fallback (mp4box.js / WASM)
- ★ Extract audio from any video container (beyond mp4/mov)
- ◆ Image & image-sequence import (PNG/JPG/TIFF/EXR), GIF
- ◆ Still-frame export (export current frame as PNG/JPG)
- · RAW / log footage, camera-native formats, HDR (PQ/HLG) ingest
- ◆ Media browser with bins, search, ratings, labels, columns
- ◆ Hover-scrub thumbnails in the browser
- ◆ Metadata panel (codec, resolution, fps, timecode, camera data)
- ◆ Proxy media: generate low-res proxies, edit offline, toggle full/proxy, relink
- · Tape/timecode-aware ingest, scene-edit detection
- ◆ Drag-and-drop from OS / between projects
- · Link & locate / relink missing media, consolidate & transcode, collect files

## 2. Project & sequence management
- ◆ Multiple sequences, nested sequences
- ◆ Sequence presets (resolution, fps, pixel aspect, field order)
- ◆ Sub-clips, source/program clip markers
- · Project panel: bins, search bins, shared bins
- · Sequence from clip / automate-to-sequence
- · Multiple projects open, project locking

## 3. Timeline editing
- ✅ Place, move, **trim (head/tail)** video + audio clips **(done — `src/ui/Arrange.tsx`)**
- ✅ Split / razor at playhead **(done)**; ripple delete (later)
- ★ Multiple video tracks with stacking order (V1, V2, …)
- ◆ Ripple, roll, slip, slide edits
- ◆ Three- & four-point editing (source in/out → program in/out)
- ◆ Insert / overwrite / lift / extract edits
- ★ Snapping, magnetic timeline option
- ◆ Markers (clip + sequence), colored, with comments; marker panel
- ★ Linked A/V (move video → audio follows); link/unlink
- ◆ Group / ungroup clips; sync lock & track lock per track
- ◆ Track targeting, track height, mute/solo per track
- ◆ Trim monitor, JKL shuttle, frame-step, go-to-edit
- ◆ Copy/paste attributes, paste insert, duplicate clip
- · Replace clip / replace with clip from source monitor
- · Render in/out, render & replace, render effects in work area

## 4. Speed / time
- ◆ Clip speed / duration (constant), reverse
- ◆ Time remapping with speed keyframes (ramps, freeze frames)
- · Optical-flow / frame-blend interpolation
- · Rate stretch tool

## 5. Monitors & preview
- ✅ Program monitor: live preview synced to the transport/playhead **(done — `src/ui/ProgramMonitor.tsx`)**
- ◆ Source monitor: audition clips, set in/out before editing in
- ◆ Playback resolution (full/½/¼), loop, play in-to-out
- ◆ Safe margins, overlays (timecode, transform), fit/zoom
- · Reference monitor, gang/sync monitors, fullscreen on second display
- · Comparison view (side-by-side / split for color)

## 6. Transform & motion (per-clip Effect Controls)
- ✅ Position, Scale, Rotation, Opacity **(done — `src/audio/videoTransform.ts`)**
- ✅ Keyframes with ease presets + hold **(done)**; ◆ velocity/Bezier-handle graph (later)
- · Anchor Point control (later)
- ◆ Anti-flicker, motion blur
- ◆ Crop, Auto-Reframe (aspect-ratio aware), Mirror/Flip
- · Basic 3D, corner pin

## 7. Compositing
- ✅ Opacity + blend modes (multiply, screen, overlay, add, …) **(done — per clip)**
- ✅ Multi-track compositing (upper tracks over lower) **(done — monitor + export)**
- ◆ Masks: shape (ellipse/rect/pen), feather, expansion, invert; mask tracking
- ◆ Track matte key, luma/chroma/color/difference keys
- ◆ Green-screen (Ultra Key–style) with spill suppression
- · Adjustment layers (effects applied to everything below)
- · Nesting for pre-composed effects

## 8. Video effects
- ◆ Effects library + searchable browser, drag-to-apply, presets
- ◆ Blur & sharpen (Gaussian, directional, camera blur, unsharp)
- ◆ Distort (transform, lens distortion, warp, corner pin, spherize)
- ◆ Stylize (glow, mosaic, posterize, find edges, texturize)
- ◆ Generate (gradient, lens flare, lightning, checkerboard)
- ◆ Noise & grain, denoise
- · GPU/WebGL effect pipeline (accelerated render graph)
- · Effect masking + keyframing per-effect; effect presets import/export
- · Third-party / OpenFX-style plugin surface

## 9. Transitions
- ✅ Cross dissolve + dip to black **(done — per-clip fade in/out, `src/audio/videoTransform.ts`)**
- ◆ Wipes, push, slide, zoom, page peel, iris
- ◆ Default transition + duration, drag-to-apply, alignment (center/start/end)
- ◆ Morph cut (talking-head jump-cut smoothing)
- ✅ Audio crossfades (linear gain) on extracted/clip audio **(done — `src/audio/clipFade.ts`)**; constant-power curve = later

## 10. Color (Lumetri-style)
- ✅ Basic correction: white balance (temp/tint), exposure, contrast, saturation
  **(done — per clip, `src/audio/videoTransform.ts`)**; highlights/shadows = later
- ◆ Curves: RGB master + per-channel, Hue/Sat curves (hue-vs-hue/sat/luma)
- ◆ Color wheels: lift / gamma / gain (shadows/midtones/highlights)
- ◆ HSL secondary (key a color range, qualify, refine, correct)
- ◆ LUT import/export (.cube), creative looks + intensity
- ◆ Vignette, sharpening in the color panel
- ✅ Histogram scope (RGB) **(done — monitor)**; waveform (luma/RGB/parade) + vectorscope = later
- · Auto color / match color between shots, shot-matching
- · Comparison view for grading, color management / ACES

## 11. Titles, graphics & captions
- ✅ Text tool — title clips with text/colour/align/bold/size **(done)**
- ✅ Lower-third background box **(done)**
- ✅ Font picker — 30 self-hosted families (woff2, no CDN) **(done — `src/fonts.ts`)**
- ✅ Title appear effects — fade/slide/pop/typewriter/blur **(done)**
- ◆ Type styles (tracking, leading, stroke, custom shadow), more weights/italics
- ◆ Shapes (rect/ellipse/pen), align & distribute, group
- ◆ Motion graphics templates (save/apply .mogrt-like presets)
- ◆ Rolling & crawling credits, end cards
- ◆ Responsive design (intro/outro, pin to video)
- ◆ Captions / subtitles: create, import (SRT/VTT), style, burn-in, export
- · Speech-to-text auto captions, transcript-based editing
- · Track-based titler with animation presets

## 12. Audio (much already exists in the DAW core)
- ★ Per-clip audio gain rubber-band on the video's audio
- ◆ Audio crossfades, fade in/out handles
- ◆ Essential Sound–style panel (dialogue/music/SFX/ambience tagging)
- ◆ Auto-ducking music under dialogue
- ◆ Loudness normalization (EBU R128 / -14 LUFS targets)
- ◆ A/V sync lock; nudge audio by frames/subframes
- · Audio track mixer with sends/buses (DAW already has mixing/FX/EQ)
- · Noise reduction, de-reverb, de-hum, repair (the DAW FX can host these)
- · 5.1 / surround, audio metering panel

## 13. Multicam & sync
- ◆ Multicam source sequences, angle editing, switch on the fly
- ◆ Sync by audio waveform / timecode / markers / in-points
- · Up to N angles, multicam record, flatten

## 14. Motion graphics & animation
- · Graph editor for all keyframed properties (spatial + temporal Bezier)
- · Null/parent relationships, expressions
- · After Effects–style dynamic link / round-trip (out of scope; document interop)

## 15. Export / render (Media Encoder-style)
- ★ Resolution presets + custom (done: Source/2160/1080/720/480)
- ★ Frame-rate presets + custom (done)
- ★ H.264 + AAC `.mp4` (done — WebCodecs + mp4-muxer)
- ✅ WebM/VP9 output **(done)**; AV1, H.265/HEVC = later
- ✅ Quality presets (Low/Medium/High bitrate) **(done)**; explicit target/max + 2-pass = later
- ✅ Audio codec follows container (AAC for mp4, Opus for webm) **(done)**; manual codec/bitrate = later
- ✅ In/out range export (bars) **(done)**; work-area marker UI = later
- ◆ Export presets (YouTube 1080p, Instagram, ProRes-like, etc.), save/load
- ◆ Render queue / batch, background export, progress + ETA
- ✅ Multi-track-video composite render (flatten all V tracks) **(done)**
- ◆ Match-source export, metadata/timecode burn-in option
- · HDR export, color-space/transfer tagging
- · Direct publish (YouTube/Vimeo upload), smart rendering, GPU encode tuning toggle

## 16. Performance & workflow
- ◆ Background rendering, render-and-replace, smart proxies on/off
- ◆ GPU acceleration toggle (currently `prefer-hardware` auto)
- · Render cache / preview files, cache management
- · Autosave + project versions, project archiving with media (collect files)
- · Keyboard-shortcut editor, workspaces/layout presets

## 17. Collaboration & review
- · Shared projects / team projects, project locking
- · Comments / review notes on a timeline, versions, review links
- · Frame.io-style review integration (out of scope; document interop)

---

## Suggested first milestones (pull from the ★ items)
1. ✅ **Program monitor** — live preview synced to the playhead (unblocks everything visual). **Done.**
2. ✅ **Multiple video tracks + compositing** — V1/V2 stacking, opacity, blend modes. **Done.**
3. ✅ **Transform + keyframes** — position/scale/rotation/opacity with easing. **Done.**
4. ✅ **Cross dissolve + audio crossfade** — the one transition everyone needs. **Done.**
5. ✅ **Razor + edge-trim parity** with the audio lane. **Done** (ripple/roll = later).
6. ✅ **Export upgrades** — quality, in/out range, multi-track composite, WebM. **Done.**
7. ✅ **Basic Lumetri color** — white balance, exposure, contrast, saturation + histogram. **Done.**
8. ✅ **Titles** — text tool + lower thirds + burn-in. **Done.**

**All eight suggested first-milestones are complete.** Next candidates: ripple/roll
trim, audio clip gain rubber-band, multiple-format export presets, shapes/credits,
color curves & wheels — pull from the sections above.
