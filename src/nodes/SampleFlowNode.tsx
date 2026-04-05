import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Handle,
  Position,
  useUpdateNodeInternals
} from '@xyflow/react';
import { createPortal } from 'react-dom';
import EventBus from '../sys/EventBus';
import MidiKnob from '../components/MidiKnob';
import { frequencyToNote } from '../util/pitchDetection';
import { detectOnsets as detectOnsetsEssentia } from '../util/onsetDetection';
import './AudioNode.css';

export type AudioBufferSegment = {
  id: string;
  label: string;
  start: number; // seconds
  end: number;   // seconds
  loopEnabled?: boolean;
  loopMode?: 'hold' | 'toggle';
  holdEnabled?: boolean; // if true, stops on nodeOff; if false, ignores nodeOff
  reverse?: boolean;
  speed?: number;
  detectedFrequency?: number | null; // segment pitch in Hz
  // ── Granular FX (active when grainEnabled = true) ──────────────────────
  grainEnabled?: boolean;
  grainSize?: number;    // grain length in ms (5–500)
  grainOverlap?: number; // 0–0.95: higher = denser / smoother
  grainPitch?: number;   // pitch shift in semitones (−36..+36)
  grainSpread?: number;  // position jitter as fraction of segment (0–0.5)
  grainSpeed?: number;   // read-pointer drift speed (−4..4)
  grainFrozen?: boolean; // freeze the read pointer in place
};

// Helper to draw waveform on a canvas for a given segment
// Audacity-style: shows peak (outer) and RMS (inner filled)
const drawSegmentWaveform = (
  canvas: HTMLCanvasElement,
  audioBuffer: AudioBuffer | null,
  start: number,
  end: number
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Get actual display size
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const fallbackWidth = canvas.clientWidth || 300;
  const fallbackHeight = canvas.clientHeight || 120;
  const displayWidth = Math.floor(
    (rect.width || fallbackWidth) * dpr
  );
  const displayHeight = Math.floor(
    (rect.height || fallbackHeight) * dpr
  );

  // Set canvas buffer size to match display size
  if (
    canvas.width !== displayWidth ||
    canvas.height !== displayHeight
  ) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas with dark background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, width, height);

  if (!audioBuffer || audioBuffer.length === 0) {
    // Draw placeholder line
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.max(
    0,
    Math.floor(start * sampleRate)
  );
  const endSample = Math.min(
    Math.floor(end * sampleRate),
    audioBuffer.length
  );
  const totalSamples = endSample - startSample;

  if (totalSamples <= 0) {
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  // Get channel data (mix stereo to mono if needed)
  const numChannels = audioBuffer.numberOfChannels;
  const channelData = audioBuffer.getChannelData(0);
  const channelData2 = numChannels > 1
    ? audioBuffer.getChannelData(1)
    : null;

  const samplesPerPixel = totalSamples / width;
  const mid = height / 2;

  // Draw center line
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  // Precompute waveform data: peak and RMS per pixel
  const peaks: { min: number; max: number; rms: number }[] = [];
  let globalPeak = 0; // track largest absolute amplitude to normalize height

  for (let x = 0; x < width; x++) {
    const sampleStart = startSample + Math.floor(x * samplesPerPixel);
    const sampleEnd = Math.min(
      startSample + Math.floor((x + 1) * samplesPerPixel),
      endSample
    );
    const count = sampleEnd - sampleStart;

    let min = 0;
    let max = 0;
    let sumSq = 0;

    for (let i = sampleStart; i < sampleEnd; i++) {
      // Mix channels if stereo
      let sample = channelData[i] || 0;
      if (channelData2) {
        sample = (sample + (channelData2[i] || 0)) / 2;
      }

      if (sample < min) min = sample;
      if (sample > max) max = sample;
      sumSq += sample * sample;
    }

    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    const localPeak = Math.max(Math.abs(min), Math.abs(max), rms);
    if (localPeak > globalPeak) globalPeak = localPeak;
    peaks.push({ min, max, rms });
  }

  const scale = globalPeak > 0 ? (mid / globalPeak) : mid;

  // Draw peak waveform (outer envelope) - lighter color
  ctx.fillStyle = '#2d5a8a';
  for (let x = 0; x < width; x++) {
    const { min, max } = peaks[x];
    const yTop = mid - max * scale;
    const yBottom = mid - min * scale;
    const barHeight = Math.max(1, yBottom - yTop);
    ctx.fillRect(x, yTop, 1, barHeight);
  }

  // Draw RMS waveform (inner volume) - brighter color
  ctx.fillStyle = '#4a9eff';
  for (let x = 0; x < width; x++) {
    const { rms } = peaks[x];
    const rmsHeight = rms * scale;
    const yTop = mid - rmsHeight;
    const barHeight = Math.max(1, rmsHeight * 2);
    ctx.fillRect(x, yTop, 1, barHeight);
  }
};

// Component to render waveform canvas for a segment
type SegmentWaveformProps = {
  audioBuffer: AudioBuffer | null;
  start: number;
  end: number;
};

const SegmentWaveform: React.FC<SegmentWaveformProps> = ({
  audioBuffer,
  start,
  end
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawTrigger, setDrawTrigger] = useState(0);

  // Trigger redraw when audio buffer changes
  useEffect(() => {
    setDrawTrigger((n) => n + 1);
  }, [audioBuffer]);

  // Setup ResizeObserver and trigger redraws on size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const triggerDraw = () => setDrawTrigger((n) => n + 1);

    const resizeObserver = new ResizeObserver(() => {
      triggerDraw();
    });
    resizeObserver.observe(canvas);

    // Trigger initial draws to cover first layout frames
    const rafId = requestAnimationFrame(triggerDraw);
    const timeoutId = setTimeout(triggerDraw, 60);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, []);

  // Draw waveform when buffer, dimensions, or trigger changes
  useEffect(() => {
    // Drawing segment waveform
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    drawSegmentWaveform(canvas, audioBuffer, start, end);
  }, [audioBuffer, start, end, drawTrigger]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: 60,
        marginTop: 4,
        borderRadius: 3,
        border: '1px solid #444',
        display: 'block'
      }}
    />
  );
};

// Format time as mm:ss:ms
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:` +
    `${secs.toString().padStart(2, '0')}:` +
    `${ms.toString().padStart(3, '0')}`;
};

// Draw waveform for the selector canvas with zoom support
const drawSelectorWaveform = (
  canvas: HTMLCanvasElement,
  audioBuffer: AudioBuffer | null,
  zoomStart: number,
  zoomEnd: number,
  selectionStart: number | null,
  selectionEnd: number | null,
  playbackPosition: number | null
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas with dark background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, width, height);

  if (!audioBuffer || audioBuffer.length === 0) {
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.max(
    0,
    Math.floor(zoomStart * sampleRate)
  );
  const endSample = Math.min(
    Math.floor(zoomEnd * sampleRate),
    audioBuffer.length
  );
  const totalSamples = endSample - startSample;

  if (totalSamples <= 0) {
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  const numChannels = audioBuffer.numberOfChannels;
  const channelData = audioBuffer.getChannelData(0);
  const channelData2 = numChannels > 1
    ? audioBuffer.getChannelData(1)
    : null;

  const samplesPerPixel = totalSamples / width;
  const mid = height / 2;

  // Draw center line
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  // Compute waveform data
  const peaks: { min: number; max: number; rms: number }[] = [];
  let globalPeak = 0;

  for (let x = 0; x < width; x++) {
    const sampleStart = startSample +
      Math.floor(x * samplesPerPixel);
    const sampleEnd = Math.min(
      startSample + Math.floor((x + 1) * samplesPerPixel),
      endSample
    );
    const count = sampleEnd - sampleStart;

    let min = 0;
    let max = 0;
    let sumSq = 0;

    for (let i = sampleStart; i < sampleEnd; i++) {
      let sample = channelData[i] || 0;
      if (channelData2) {
        sample = (sample + (channelData2[i] || 0)) / 2;
      }
      if (sample < min) min = sample;
      if (sample > max) max = sample;
      sumSq += sample * sample;
    }

    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    const localPeak = Math.max(
      Math.abs(min),
      Math.abs(max),
      rms
    );
    if (localPeak > globalPeak) globalPeak = localPeak;
    peaks.push({ min, max, rms });
  }

  const scale = globalPeak > 0 ? (mid / globalPeak) : mid;

  // Draw selection overlay first (behind waveform)
  if (
    selectionStart !== null &&
    selectionEnd !== null &&
    selectionEnd > selectionStart
  ) {
    const visibleDuration = zoomEnd - zoomStart;
    const selStartX = ((selectionStart - zoomStart) /
      visibleDuration) * width;
    const selEndX = ((selectionEnd - zoomStart) /
      visibleDuration) * width;

    ctx.fillStyle = 'rgba(74, 158, 255, 0.25)';
    ctx.fillRect(
      Math.max(0, selStartX),
      0,
      Math.min(width, selEndX) - Math.max(0, selStartX),
      height
    );

    // Selection boundaries
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    if (selStartX >= 0 && selStartX <= width) {
      ctx.beginPath();
      ctx.moveTo(selStartX, 0);
      ctx.lineTo(selStartX, height);
      ctx.stroke();
    }
    if (selEndX >= 0 && selEndX <= width) {
      ctx.beginPath();
      ctx.moveTo(selEndX, 0);
      ctx.lineTo(selEndX, height);
      ctx.stroke();
    }
  }

  // Draw peak waveform
  ctx.fillStyle = '#2d5a8a';
  for (let x = 0; x < width; x++) {
    const { min, max } = peaks[x];
    const yTop = mid - max * scale;
    const yBottom = mid - min * scale;
    const barHeight = Math.max(1, yBottom - yTop);
    ctx.fillRect(x, yTop, 1, barHeight);
  }

  // Draw RMS waveform
  ctx.fillStyle = '#4a9eff';
  for (let x = 0; x < width; x++) {
    const { rms } = peaks[x];
    const rmsHeight = rms * scale;
    const yTop = mid - rmsHeight;
    const barHeight = Math.max(1, rmsHeight * 2);
    ctx.fillRect(x, yTop, 1, barHeight);
  }

  // Draw playback position marker
  if (playbackPosition !== null) {
    const visibleDuration = zoomEnd - zoomStart;
    const posX = ((playbackPosition - zoomStart) /
      visibleDuration) * width;

    if (posX >= 0 && posX <= width) {
      ctx.strokeStyle = '#ff5555';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, height);
      ctx.stroke();

      // Draw position indicator triangle
      ctx.fillStyle = '#ff5555';
      ctx.beginPath();
      ctx.moveTo(posX - 6, 0);
      ctx.lineTo(posX + 6, 0);
      ctx.lineTo(posX, 10);
      ctx.closePath();
      ctx.fill();
    }
  }
};

// Waveform Selector Overlay Component
type WaveformSelectorProps = {
  audioBuffer: AudioBuffer | null;
  duration: number;
  nodeId: string;
  onClose: () => void;
  onAddPart: (start: number, end: number, speed: number) => void;
};

const WaveformSelector: React.FC<WaveformSelectorProps> = ({
  audioBuffer,
  duration,
  nodeId,
  onClose,
  onAddPart
}) => {
  const eventBus = EventBus.getInstance();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // View state
  const [zoomStart, setZoomStart] = useState(0);
  const [zoomEnd, setZoomEnd] = useState(duration);

  // Selection state
  const [selectionStart, setSelectionStart] = useState<number | null>(
    null
  );
  const [selectionEnd, setSelectionEnd] = useState<number | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<
    'select' | 'moveStart' | 'moveEnd' | 'pan' | null
  >(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; zoomStart: number; zoomEnd: number }>(
    { x: 0, zoomStart: 0, zoomEnd: 0 }
  );

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isReverse, setIsReverse] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState<
    number | null
  >(null);
  const [speed, setSpeed] = useState(1);
  const reversedBufferRef = useRef<AudioBuffer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);

  // Convert speed slider (-100 to +20) to playback rate
  // 0 = 1x, +20 = 4x, -100 = 0.01x (very slow)
  const speedToRate = (spd: number): number => {
    if (spd === 0) return 1;
    if (spd > 0) return 1 + (spd / 20) * 3; // 0 to +20 maps to 1x to 4x
    // -100 to 0 maps to 0.01x to 1x (logarithmic feel)
    return Math.pow(10, spd / 50); // -100 -> 0.01, -50 -> 0.1, 0 -> 1
  };

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    drawSelectorWaveform(
      canvas,
      audioBuffer,
      zoomStart,
      zoomEnd,
      selectionStart,
      selectionEnd,
      playbackPosition
    );
  }, [
    audioBuffer,
    zoomStart,
    zoomEnd,
    selectionStart,
    selectionEnd,
    playbackPosition
  ]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      drawSelectorWaveform(
        canvas,
        audioBuffer,
        zoomStart,
        zoomEnd,
        selectionStart,
        selectionEnd,
        playbackPosition
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    audioBuffer,
    zoomStart,
    zoomEnd,
    selectionStart,
    selectionEnd,
    playbackPosition
  ]);

  // Update playback position during playback
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const updatePosition = () => {
      if (
        !audioContextRef.current ||
        !isPlaying
      ) return;

      const rate = speedToRate(speed);
      const elapsed = (audioContextRef.current.currentTime -
        startTimeRef.current) * rate;

      // Calculate position based on direction
      let currentPos: number;
      if (isReverse) {
        currentPos = startOffsetRef.current - elapsed;
      } else {
        currentPos = startOffsetRef.current + elapsed;
      }

      // Handle looping
      if (
        selectionStart !== null &&
        selectionEnd !== null &&
        isLooping
      ) {
        const loopDuration = selectionEnd - selectionStart;
        if (isReverse) {
          const loopedPos = selectionEnd -
            ((selectionEnd - currentPos) % loopDuration);
          setPlaybackPosition(
            loopedPos < selectionStart ? selectionEnd : loopedPos
          );
        } else {
          const loopedPos = selectionStart +
            ((currentPos - selectionStart) % loopDuration);
          setPlaybackPosition(loopedPos);
        }
      } else {
        setPlaybackPosition(currentPos);

        // Stop if past end
        if (isReverse) {
          const endPos = selectionStart ?? 0;
          if (currentPos <= endPos) {
            stopPlayback();
            return;
          }
        } else {
          const endPos = selectionEnd ?? duration;
          if (currentPos >= endPos) {
            stopPlayback();
            return;
          }
        }
      }

      animationRef.current = requestAnimationFrame(updatePosition);
    };

    animationRef.current = requestAnimationFrame(updatePosition);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, isLooping, isReverse, speed, selectionStart, selectionEnd]);

  // Convert canvas X to time
  const xToTime = (x: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = x / rect.width;
    return zoomStart + ratio * (zoomEnd - zoomStart);
  };

  // Mouse handlers for selection and panning
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = xToTime(x);

    // Middle mouse button or Shift+Left click for panning
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setDragType('pan');
      panStartRef.current = { x: e.clientX, zoomStart, zoomEnd };
      return;
    }

    // Check if clicking near selection edges
    if (selectionStart !== null && selectionEnd !== null) {
      const visibleDuration = zoomEnd - zoomStart;
      const pixelsPerSecond = rect.width / visibleDuration;
      const startX = (selectionStart - zoomStart) * pixelsPerSecond;
      const endX = (selectionEnd - zoomStart) * pixelsPerSecond;

      if (Math.abs(x - startX) < 10) {
        setDragType('moveStart');
        setIsDragging(true);
        return;
      }
      if (Math.abs(x - endX) < 10) {
        setDragType('moveEnd');
        setIsDragging(true);
        return;
      }
    }

    // Start new selection
    setSelectionStart(time);
    setSelectionEnd(time);
    setDragType('select');
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Handle panning
    if (isPanning && dragType === 'pan') {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const deltaX = e.clientX - panStartRef.current.x;
      const visibleDuration = panStartRef.current.zoomEnd -
        panStartRef.current.zoomStart;
      const deltaTime = -(deltaX / rect.width) * visibleDuration;

      let newStart = panStartRef.current.zoomStart + deltaTime;
      let newEnd = panStartRef.current.zoomEnd + deltaTime;

      // Clamp to bounds
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > duration) {
        newStart -= (newEnd - duration);
        newEnd = duration;
      }
      newStart = Math.max(0, newStart);
      newEnd = Math.min(duration, newEnd);

      setZoomStart(newStart);
      setZoomEnd(newEnd);
      return;
    }

    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(duration, xToTime(x)));

    if (dragType === 'select') {
      if (
        selectionStart !== null &&
        time >= selectionStart
      ) {
        setSelectionEnd(time);
      } else if (selectionStart !== null) {
        setSelectionEnd(selectionStart);
        setSelectionStart(time);
      }
    } else if (
      dragType === 'moveStart' &&
      selectionEnd !== null
    ) {
      setSelectionStart(Math.min(time, selectionEnd - 0.01));
    } else if (
      dragType === 'moveEnd' &&
      selectionStart !== null
    ) {
      setSelectionEnd(Math.max(time, selectionStart + 0.01));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsPanning(false);
    setDragType(null);
  };

  // Zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const centerTime = zoomStart + ratio * (zoomEnd - zoomStart);

    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    const currentSpan = zoomEnd - zoomStart;
    const newSpan = Math.max(0.1, Math.min(duration, currentSpan * zoomFactor));

    let newStart = centerTime - ratio * newSpan;
    let newEnd = centerTime + (1 - ratio) * newSpan;

    // Clamp to bounds
    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(duration, newSpan);
    }
    if (newEnd > duration) {
      newEnd = duration;
      newStart = Math.max(0, duration - newSpan);
    }

    setZoomStart(newStart);
    setZoomEnd(newEnd);
  };

  // Create reversed audio buffer
  const getReversedBuffer = (
    ctx: AudioContext,
    original: AudioBuffer
  ): AudioBuffer => {
    if (reversedBufferRef.current) {
      return reversedBufferRef.current;
    }

    const reversed = ctx.createBuffer(
      original.numberOfChannels,
      original.length,
      original.sampleRate
    );

    for (let ch = 0; ch < original.numberOfChannels; ch++) {
      const originalData = original.getChannelData(ch);
      const reversedData = reversed.getChannelData(ch);
      for (let i = 0; i < originalData.length; i++) {
        reversedData[i] = originalData[originalData.length - 1 - i];
      }
    }

    reversedBufferRef.current = reversed;
    return reversed;
  };

  // Playback functions
  const startPlayback = () => {
    if (!audioBuffer) return;

    stopPlayback();

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const source = ctx.createBufferSource();

    // Use reversed buffer if reverse is enabled
    if (isReverse) {
      source.buffer = getReversedBuffer(ctx, audioBuffer);
    } else {
      source.buffer = audioBuffer;
    }

    source.playbackRate.value = speedToRate(speed);
    source.connect(ctx.destination);

    const playStart = selectionStart ?? 0;
    const playEnd = selectionEnd ?? duration;
    const playDuration = playEnd - playStart;

    // For reverse playback, calculate reversed positions
    let actualStart = playStart;
    let actualEnd = playEnd;
    if (isReverse) {
      actualStart = duration - playEnd;
      actualEnd = duration - playStart;
    }

    if (isLooping) {
      source.loop = true;
      source.loopStart = actualStart;
      source.loopEnd = actualEnd;
    }

    source.start(0, actualStart, isLooping ? undefined : playDuration);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    startOffsetRef.current = isReverse ? playEnd : playStart;
    setPlaybackPosition(isReverse ? playEnd : playStart);
    setIsPlaying(true);

    source.onended = () => {
      if (!isLooping) {
        setIsPlaying(false);
        setPlaybackPosition(null);
      }
    };
  };

  const stopPlayback = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Already stopped
      }
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackPosition(null);
  };

  // Reset zoom
  const resetZoom = () => {
    setZoomStart(0);
    setZoomEnd(duration);
  };

  // Zoom to selection
  const zoomToSelection = () => {
    if (
      selectionStart !== null &&
      selectionEnd !== null &&
      selectionEnd > selectionStart
    ) {
      const padding = (selectionEnd - selectionStart) * 0.1;
      setZoomStart(Math.max(0, selectionStart - padding));
      setZoomEnd(Math.min(duration, selectionEnd + padding));
    }
  };

  // Add selected part
  const handleAddPart = () => {
    if (
      selectionStart !== null &&
      selectionEnd !== null &&
      selectionEnd > selectionStart
    ) {
      onAddPart(selectionStart, selectionEnd, speed);
      // Keep the selector open for more selections
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopPlayback();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const hasSelection = selectionStart !== null &&
    selectionEnd !== null &&
    selectionEnd > selectionStart;

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: '#1a1a1a',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        color: '#eee',
        fontFamily: 'Calibri, sans-serif'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #333',
          background: '#222'
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>
          Waveform Selector
        </div>
        <button
          onClick={() => {
            stopPlayback();
            onClose();
          }}
          style={{
            background: '#522',
            color: '#eee',
            border: '1px solid #733',
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Waveform Canvas */}
      <div style={{ flex: 1, padding: 16, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 4,
            border: '1px solid #444',
            cursor: isPanning
              ? 'grabbing'
              : isDragging
                ? 'ew-resize'
                : 'crosshair'
          }}
        />
      </div>

      {/* Navigation Slider */}
      <div
        style={{
          padding: '8px 16px',
          background: '#1f1f1f',
          borderTop: '1px solid #333'
        }}
      >
        <div
          style={{
            position: 'relative',
            height: 24,
            background: '#111',
            borderRadius: 4,
            border: '1px solid #444',
            cursor: 'pointer'
          }}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = x / rect.width;
            const clickTime = ratio * duration;
            const viewSpan = zoomEnd - zoomStart;
            let newStart = clickTime - viewSpan / 2;
            let newEnd = clickTime + viewSpan / 2;

            if (newStart < 0) {
              newStart = 0;
              newEnd = Math.min(duration, viewSpan);
            }
            if (newEnd > duration) {
              newEnd = duration;
              newStart = Math.max(0, duration - viewSpan);
            }

            setZoomStart(newStart);
            setZoomEnd(newEnd);
          }}
        >
          {/* Mini waveform background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: 0.3,
              background: 'linear-gradient(to right, #2d5a8a 0%, ' +
                '#4a9eff 25%, #2d5a8a 50%, #4a9eff 75%, #2d5a8a 100%)',
              borderRadius: 3
            }}
          />
          {/* Current view indicator */}
          <div
            style={{
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: `${(zoomStart / duration) * 100}%`,
              width: `${((zoomEnd - zoomStart) / duration) * 100}%`,
              background: 'rgba(74, 158, 255, 0.5)',
              border: '1px solid #4a9eff',
              borderRadius: 3,
              minWidth: 8
            }}
          />
          {/* Selection indicator on mini track */}
          {hasSelection && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(selectionStart! / duration) * 100}%`,
                width: `${((selectionEnd! - selectionStart!) / duration) * 100}%`,
                background: 'rgba(255, 200, 50, 0.4)',
                borderLeft: '1px solid #ffc832',
                borderRight: '1px solid #ffc832',
                pointerEvents: 'none'
              }}
            />
          )}
          {/* Playback position on mini track */}
          {playbackPosition !== null && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(playbackPosition / duration) * 100}%`,
                width: 2,
                background: '#ff5555',
                pointerEvents: 'none'
              }}
            />
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            opacity: 0.5,
            marginTop: 2
          }}
        >
          <span>0:00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Time Display */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '8px 16px',
          background: '#222',
          borderTop: '1px solid #333',
          fontSize: 13
        }}
      >
        <div>
          <span style={{ opacity: 0.7 }}>View: </span>
          {formatTime(zoomStart)} - {formatTime(zoomEnd)}
        </div>
        <div>
          <span style={{ opacity: 0.7 }}>Selection: </span>
          {hasSelection
            ? `${formatTime(selectionStart!)} - ` +
              `${formatTime(selectionEnd!)}`
            : '-- : -- : --- - -- : -- : ---'}
        </div>
        <div style={{ color: '#ff5555' }}>
          <span style={{ opacity: 0.7 }}>Position: </span>
          {playbackPosition !== null
            ? formatTime(playbackPosition)
            : '-- : -- : ---'}
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          padding: '12px 16px',
          background: '#252525',
          borderTop: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        {/* Zoom Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.7, minWidth: 50 }}>
            Zoom:
          </span>
          <button
            onClick={resetZoom}
            style={{
              background: '#333',
              color: '#eee',
              border: '1px solid #555',
              padding: '6px 12px',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
          <button
            onClick={zoomToSelection}
            disabled={!hasSelection}
            style={{
              background: hasSelection ? '#333' : '#222',
              color: hasSelection ? '#eee' : '#666',
              border: '1px solid #555',
              padding: '6px 12px',
              borderRadius: 4,
              cursor: hasSelection ? 'pointer' : 'not-allowed'
            }}
          >
            Zoom to Selection
          </button>
          <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>
            (Use mouse wheel to zoom)
          </span>
        </div>

        {/* Speed Control */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.7, minWidth: 50 }}>
            Speed:
          </span>
          <input
            type='range'
            min={-100}
            max={20}
            step={1}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{
              flex: 1,
              maxWidth: 400,
              height: 24,
              cursor: 'pointer'
            }}
          />
          <input
            type='number'
            value={speed.toFixed(0)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) {
                setSpeed(Math.max(-100, Math.min(20, v)));
              }
            }}
            style={{
              width: 60,
              background: '#111',
              color: '#eee',
              border: '1px solid #555',
              padding: '4px 8px',
              borderRadius: 4
            }}
          />
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            ({speedToRate(speed).toFixed(2)}x)
          </span>
        </div>

        {/* Playback Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.7, minWidth: 50 }}>
            Play:
          </span>
          <button
            onClick={isPlaying ? stopPlayback : startPlayback}
            disabled={!audioBuffer}
            style={{
              background: isPlaying ? '#733' : '#373',
              color: '#eee',
              border: '1px solid #555',
              padding: '8px 16px',
              borderRadius: 4,
              cursor: audioBuffer ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            {isPlaying ? '■ Stop' : '▶ Play'}
          </button>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12
            }}
          >
            <input
              type='checkbox'
              checked={isLooping}
              onChange={(e) => setIsLooping(e.target.checked)}
            />
            Loop
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12
            }}
          >
            <input
              type='checkbox'
              checked={isReverse}
              onChange={(e) => {
                setIsReverse(e.target.checked);
                // Clear cached reversed buffer when toggling
                reversedBufferRef.current = null;
              }}
            />
            Reverse
          </label>
          {hasSelection && (
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              (Duration: {
                ((selectionEnd! - selectionStart!) /
                  speedToRate(speed)).toFixed(3)
              }s)
            </span>
          )}
        </div>

        {/* Add Part Button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleAddPart}
            disabled={!hasSelection}
            style={{
              flex: 1,
              background: hasSelection ? '#4a9eff' : '#333',
              color: hasSelection ? '#fff' : '#666',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 4,
              cursor: hasSelection ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: 14
            }}
          >
            + Add Selection as Part
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div
        style={{
          padding: '8px 16px',
          background: '#1f1f1f',
          borderTop: '1px solid #333',
          fontSize: 11,
          opacity: 0.7
        }}
      >
        <b>Instructions:</b> Click and drag to select a region. 
        Drag selection edges to adjust. 
        Mouse wheel to zoom. 
        Shift+drag or middle-click to pan when zoomed in. 
        Press Escape to close.
      </div>
    </div>,
    document.body
  );
};

// Auto-Sample Dialog Component
type AutoSampleDialogProps = {
  duration: number;
  onClose: () => void;
  onConfirm: (
    rangeStart: number,
    rangeEnd: number,
    method: 'equal' | 'transient',
    options?: {
      detectionMethods?: Array<'hfc' | 'complex' | 'flux' | 'complex_phase'>;
      sensitivity?: number;
      overlapPadding?: number;
    }
  ) => void;
};

const AutoSampleDialog: React.FC<AutoSampleDialogProps> = ({
  duration,
  onClose,
  onConfirm
}) => {
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(duration);
  const [method, setMethod] = useState<'equal' | 'transient'>('transient');
  
  // Advanced onset detection options
  const [detectionMethods, setDetectionMethods] = useState<{
    hfc: boolean;
    complex: boolean;
    flux: boolean;
    complex_phase: boolean;
  }>({
    hfc: true,
    complex: true,
    flux: false,
    complex_phase: false
  });
  const [sensitivity, setSensitivity] = useState(0.7);
  const [overlapPadding, setOverlapPadding] = useState(0.01); // 10ms default
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleConfirm = () => {
    if (rangeEnd <= rangeStart) {
      alert('End time must be greater than start time');
      return;
    }
    
    const selectedMethods = Object.entries(detectionMethods)
      .filter(([_, enabled]) => enabled)
      .map(([name, _]) => name as 'hfc' | 'complex' | 'flux' | 'complex_phase');
    
    if (method === 'transient' && selectedMethods.length === 0) {
      alert('Please select at least one detection method');
      return;
    }
    
    onConfirm(rangeStart, rangeEnd, method, {
      detectionMethods: selectedMethods,
      sensitivity,
      overlapPadding
    });
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#2a2a2a',
          border: '1px solid #555',
          borderRadius: 8,
          padding: 24,
          width: 400,
          maxWidth: '90vw',
          color: '#eee',
          fontFamily: 'Calibri, sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18 }}>
          Auto-Sample
        </h3>

        {/* Range Selection */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
            Range Start (seconds)
          </label>
          <input
            type="number"
            value={rangeStart}
            onChange={(e) => setRangeStart(Math.max(0, parseFloat(e.target.value) || 0))}
            step={0.01}
            min={0}
            max={duration}
            style={{
              width: '100%',
              background: '#1a1a1a',
              color: '#eee',
              border: '1px solid #555',
              padding: '6px 8px',
              borderRadius: 4
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
            Range End (seconds)
          </label>
          <input
            type="number"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(Math.min(duration, parseFloat(e.target.value) || duration))}
            step={0.01}
            min={0}
            max={duration}
            style={{
              width: '100%',
              background: '#1a1a1a',
              color: '#eee',
              border: '1px solid #555',
              padding: '6px 8px',
              borderRadius: 4
            }}
          />
        </div>

        {/* Method Selection */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
            Division Method
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMethod('equal')}
              style={{
                flex: 1,
                background: method === 'equal' ? '#2d5a8a' : '#333',
                color: '#eee',
                border: '1px solid #555',
                padding: '8px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: method === 'equal' ? 'bold' : 'normal'
              }}
            >
              Equal Time
            </button>
            <button
              onClick={() => setMethod('transient')}
              style={{
                flex: 1,
                background: method === 'transient' ? '#2d5a8a' : '#333',
                color: '#eee',
                border: '1px solid #555',
                padding: '8px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: method === 'transient' ? 'bold' : 'normal'
              }}
            >
              Detect Onsets
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
            {method === 'equal'
              ? 'Creates 8 equal-length segments (good for loops)'
              : 'Uses Essentia.js professional onset detection (best for drums/percussion)'}
          </div>
        </div>

        {/* Advanced Options Toggle */}
        {method === 'transient' && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: '100%',
                background: '#1a1a1a',
                color: '#eee',
                border: '1px solid #555',
                padding: '8px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>⚙️ Advanced Options</span>
              <span>{showAdvanced ? '▼' : '▶'}</span>
            </button>
          </div>
        )}

        {/* Advanced Options Panel */}
        {method === 'transient' && showAdvanced && (
          <div style={{ 
            marginBottom: 16, 
            padding: 12, 
            background: '#1a1a1a', 
            borderRadius: 4,
            border: '1px solid #555'
          }}>
            {/* Detection Methods */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                Detection Methods
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  ['hfc', 'HFC (Percussive)'],
                  ['complex', 'Complex (Tonal)'],
                  ['flux', 'Flux (Timbre)'],
                  ['complex_phase', 'Complex Phase']
                ] as const).map(([key, label]) => (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      padding: 4,
                      background: detectionMethods[key] ? '#2d5a8a44' : 'transparent',
                      borderRadius: 3
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={detectionMethods[key]}
                      onChange={(e) => setDetectionMethods(prev => ({
                        ...prev,
                        [key]: e.target.checked
                      }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12 }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sensitivity */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                Sensitivity: {sensitivity.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.1"
                max="0.99"
                step="0.01"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                Lower: fewer but stronger onsets • Higher: more onsets detected
              </div>
            </div>

            {/* Overlap Padding */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                Overlap Padding: {(overlapPadding * 1000).toFixed(0)}ms
              </label>
              <input
                type="range"
                min="0"
                max="0.1"
                step="0.005"
                value={overlapPadding}
                onChange={(e) => setOverlapPadding(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                Extends each segment to create overlap (useful for smooth playback)
              </div>
            </div>
          </div>
        )}

        {/* Preview Info */}
        <div
          style={{
            background: '#1a1a1a',
            padding: 8,
            borderRadius: 4,
            marginBottom: 16,
            fontSize: 12
          }}
        >
          <div>Range: {rangeStart.toFixed(2)}s - {rangeEnd.toFixed(2)}s</div>
          <div>Duration: {(rangeEnd - rangeStart).toFixed(2)}s</div>
          {method === 'transient' && (
            <div style={{ opacity: 0.7 }}>Segments will be detected automatically</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: '#333',
              color: '#eee',
              border: '1px solid #555',
              padding: '10px 16px',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1,
              background: '#2d5a8a',
              color: '#fff',
              border: '1px solid #4a9eff',
              padding: '10px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Create Segments
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export type SampleFlowNodeProps = {
  data: {
    id: string;
    label: string;
    style?: React.CSSProperties;
    fileName?: string;
    fileId?: string; // persisted backend id
    fileUrl?: string; // served URL
    diskFileName?: string; // filename on local disk (sampling/)
    arrayBuffer?: ArrayBuffer | null; // raw file data (fallback)
    duration?: number; // decoded duration (for UI only)
    segments: AudioBufferSegment[];
    autoStop?: boolean; // if true, stop when segment ends (default true)
    loopEnabled?: boolean;
    loopMode?: 'hold' | 'toggle';
    reverse?: boolean;
    speed?: number; // -10..10 log mapped
    onChange?: (data:any)=>void;
  }
};

const randomId = ()=> Math.random().toString(36).slice(2,10);

const adjustNumericInput = (
  e: React.KeyboardEvent<HTMLInputElement>,
  current: number,
  setter: (v:number)=>void,
  clamp?: (v:number)=>number
) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const dir = e.key === 'ArrowUp' ? 1 : -1;
  let delta = 0.01;
  if (e.ctrlKey && e.shiftKey) {
    delta = 1;
  } else if (e.ctrlKey) {
    delta = 0.1;
  } else if (e.shiftKey) {
    delta = 0.001;
  }
  const next = current + dir * delta;
  const clamped = clamp ? clamp(next) : next;
  setter(parseFloat(clamped.toFixed(4)));
  e.preventDefault();
};

const SampleFlowNode: React.FC<SampleFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const updateNodeInternals = useUpdateNodeInternals();
  const [label, setLabel] = useState(data.label || 'Sample');
  const [fileName, setFileName] = useState<string | undefined>(data.fileName);
  const [fileId, setFileId] = useState<string | undefined>(data.fileId);
  const [fileUrl, setFileUrl] = useState<string | undefined>(data.fileUrl);
  const [diskFileName, setDiskFileName] = useState<string | undefined>(
    data.diskFileName
  );
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(
    data.arrayBuffer || null
  );
  const [duration, setDuration] = useState<number | undefined>(data.duration);
  const [segments, setSegments] = useState<AudioBufferSegment[]>(
    data.segments || []
  );
  const [loopEnabled, setLoopEnabled] = useState<boolean>(
    data.loopEnabled ?? false
  );
  const [loopMode, setLoopMode] = useState<'hold'|'toggle'>(
    data.loopMode || 'hold'
  );
  const [reverse, setReverse] = useState<boolean>(
    data.reverse ?? false
  );
  const [speed, setSpeed] = useState<number>(
    typeof data.speed === 'number' ? data.speed : 1
  );
  const fileInputRef = useRef<HTMLInputElement|null>(null);
  const [style, setStyle] = useState<React.CSSProperties>(
    data.style || { background:'#333', color:'#eee', padding:10, width:360 }
  );
  // Prefetch guard
  const prefetchingRef = useRef(false);
  // Track if initial load has been attempted
  const initialLoadRef = useRef(false);
  // Decoded AudioBuffer for waveform visualization
  const [decodedBuffer, setDecodedBuffer] = useState<AudioBuffer | null>(null);
  // Waveform selector modal state
  const [showSelector, setShowSelector] = useState(false);
  // Auto-sample dialog state
  const [showAutoSample, setShowAutoSample] = useState(false);
  // Which segment cards are expanded to show full details
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());
  const toggleSegmentExpanded = (id: string) =>
    setExpandedSegments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Safety net: if we have a disk file but no decoded buffer, try to decode once on mount
  useEffect(() => {
    if (decodedBuffer || !diskFileName || prefetchingRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        prefetchingRef.current = true;
        const {
          loadRootHandle,
          verifyPermission,
          loadSampleFromDisk
        } = await import('../util/FileSystemAudioStore');
        const root = await loadRootHandle();
        if (!root || !(await verifyPermission(root, 'read'))) return;
        const buf = await loadSampleFromDisk(root, diskFileName);
        if (!buf || cancelled) return;
        setArrayBuffer(buf);
        try {
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(buf.slice(0));
          if (!cancelled) {
            setDecodedBuffer(decoded);
            setDuration(decoded.duration);
          }
          ctx.close();
        } catch (err) {
          console.warn('Waveform decode failed in safety net', err);
        }
      } finally {
        prefetchingRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [decodedBuffer, diskFileName]);

  // Decode arrayBuffer when it changes
  useEffect(() => {
    if (!arrayBuffer) {
      setDecodedBuffer(null);
      return;
    }
    let cancelled = false;
    const audioCtx = new AudioContext();

    // Ensure we have a proper ArrayBuffer (may be serialized)
    let bufferCopy: ArrayBuffer;
    if (arrayBuffer instanceof ArrayBuffer) {
      bufferCopy = arrayBuffer.slice(0);
    } else if (
      typeof arrayBuffer === 'object' &&
      arrayBuffer !== null
    ) {
      // Handle serialized ArrayBuffer (e.g., from JSON)
      const byteArray = new Uint8Array(
        Object.values(arrayBuffer as object) as number[]
      );
      bufferCopy = byteArray.buffer;
    } else {
      console.warn('Invalid arrayBuffer type:', typeof arrayBuffer);
      setDecodedBuffer(null);
      return;
    }

    audioCtx.decodeAudioData(bufferCopy)
      .then((buffer) => {
        if (!cancelled) {
          setDecodedBuffer(buffer);
          setDuration(buffer.duration);
        }
      })
      .catch((err) => {
        console.warn('Failed to decode audio for waveform:', err);
      })
      .finally(() => {
        audioCtx.close();
      });
    return () => { cancelled = true; };
  }, [arrayBuffer]);
  
  // Dynamically size the segment list: allow the node to grow naturally for a
  // reasonable number of segments, then introduce a scroll area past a soft cap
  // so extremely large sample lists don't consume the entire canvas.
  const segmentListStyle = useMemo<React.CSSProperties>(()=>{
    const base: React.CSSProperties = { background:'#222', padding:4, borderRadius:4 };
    const SOFT_MAX_VISIBLE = 6; // number of segment cards before scrolling kicks in
    if(segments.length > SOFT_MAX_VISIBLE){
      // Approximate per-segment vertical footprint (card + margin)
      const per = 78; // tweak if visual layout changes
      base.maxHeight = SOFT_MAX_VISIBLE * per;
      base.overflowY = 'auto';
    }
    return base;
  }, [segments.length]);

  // Update external consumer
  useEffect(()=>{
    data.label = label;
    data.fileName = fileName;
    data.fileId = fileId;
    data.fileUrl = fileUrl;
    data.diskFileName = diskFileName;
    // Only store arrayBuffer if no disk file (fallback for IndexedDB)
    data.arrayBuffer = diskFileName ? undefined : (arrayBuffer || undefined);
    data.duration = duration;
    data.segments = segments;
    data.loopEnabled = loopEnabled;
    data.loopMode = loopMode;
    data.reverse = reverse;
    data.speed = speed;
    if(data.onChange) data.onChange({ ...data });
    // notify params change so virtual node can react (e.g., re-decode file)
    // Include arrayBuffer so virtual node can decode and play audio
    eventBus.emit(data.id + '.params.updateParams', {
      nodeid: data.id,
      data: {
        label,
        fileName,
        fileId,
        fileUrl,
        diskFileName,
        arrayBuffer,
        duration,
        segments,
        loopEnabled,
        loopMode,
        reverse,
        speed
      }
    });
  }, [
    label,
    fileName,
    fileId,
    fileUrl,
    diskFileName,
    arrayBuffer,
    duration,
    segments,
    loopEnabled,
    loopMode,
    reverse,
    speed
  ]);

  // Listen for params updates coming from the virtual node (e.g., when it fetched/decoded audio)
  useEffect(() => {
    // SampleFlowNode setting up params update listener for GUI
    const eventName = data.id + '-GUI.params.updateParams';
    const handler = (payload: any) => {
      // SampleFlowNode received params update GUI Array buffer
      const d = payload?.data || {};
      if (d.arrayBuffer instanceof ArrayBuffer) {
        setArrayBuffer(d.arrayBuffer);
      }
      if (typeof d.duration === 'number') {
        setDuration(d.duration);
      }
      if (d.fileUrl) {
        setFileUrl(d.fileUrl);
      }
      if (d.diskFileName) {
        setDiskFileName(d.diskFileName);
      }
      if (d.fileName) {
        setFileName(d.fileName);
      }
      if (typeof d.loopEnabled === 'boolean') {
        setLoopEnabled(d.loopEnabled);
      }
      if (d.loopMode === 'hold' || d.loopMode === 'toggle') {
        setLoopMode(d.loopMode);
      }
      if (typeof d.reverse === 'boolean') {
        setReverse(d.reverse);
      }
      if (typeof d.speed === 'number') {
        setSpeed(d.speed);
      }
    };
    eventBus.subscribe(eventName, handler);
    return () => {
      eventBus.unsubscribe(eventName, handler);
    };
  }, []);

  useEffect(()=>{
    eventBus.subscribe(data.id + '.style.background', (d:any)=>{ if(d?.color) setStyle(s=>({ ...s, background:d.color })); });
    return ()=>{ eventBus.unsubscribeAll(data.id + '.style.background'); };
  }, []);

  const onFileSelected = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();

    // Try to save to local disk first (File System API)
    try {
      const {
        loadRootHandle,
        verifyPermission,
        saveSampleToDisk
      } = await import('../util/FileSystemAudioStore');
      const root = await loadRootHandle();
      if (root && await verifyPermission(root, 'readwrite')) {
        const result = await saveSampleToDisk(root, buf, file.name);
        if (result.ok && result.filename) {
          setDiskFileName(result.filename);
          setArrayBuffer(buf);
          setFileId(undefined);
          setFileUrl(undefined);
          eventBus.emit(data.id + '.params.updateParams', {
            nodeid: data.id,
            data: {
              arrayBuffer: buf,
              fileName: file.name,
              diskFileName: result.filename
            }
          });
          setDuration(undefined);
          return;
        }
      }
    } catch (fsErr) {
      console.warn('Disk save failed, trying backend upload', fsErr);
    }

    // Fallback: try backend upload
    
    setDuration(undefined);
  }, [data.id, eventBus]);

  // Prefetch previously saved file (when node restored)
  // Priority: 1. disk file, 2. backend URL, 3. fallback arrayBuffer in data
  useEffect(() => {
    // Skip if already loaded
    if (arrayBuffer) {
      initialLoadRef.current = true;
      return;
    }
    // Avoid parallel fetches
    if (prefetchingRef.current) return;
    // Need at least one source to fetch from
    if (!diskFileName && !fileId && !fileUrl) {
      initialLoadRef.current = true;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        prefetchingRef.current = true;
        initialLoadRef.current = true;

        // 1. Try loading from local disk first
        if (diskFileName) {
          try {
            const {
              loadRootHandle,
              verifyPermission,
              loadSampleFromDisk
            } = await import('../util/FileSystemAudioStore');
            const root = await loadRootHandle();
            if (root && await verifyPermission(root, 'read')) {
              const buf = await loadSampleFromDisk(root, diskFileName);
              if (buf && !cancelled) {
                setArrayBuffer(buf);
                // Eagerly decode so waveform paints immediately
                try {
                  const ctx = new AudioContext();
                  const decoded = await ctx.decodeAudioData(buf.slice(0));
                  if (!cancelled) {
                    setDecodedBuffer(decoded);
                    setDuration(decoded.duration);
                  }
                  ctx.close();
                } catch(err){
                  console.warn('Waveform decode failed after disk load', err);
                }
                eventBus.emit(data.id + '.params.updateParams', {
                  nodeid: data.id,
                  data: { arrayBuffer: buf, diskFileName }
                });
                return;
              }
            }
          } catch (diskErr) {
            console.warn('Disk load failed, trying other sources', diskErr);
          }
        }

        
      } finally {
        prefetchingRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [diskFileName, fileId, fileUrl, arrayBuffer, data.id, eventBus]);

  const addSegment = ()=>{
    const start = 0;
    const end = Math.max(0.5, duration || 1);
    const seg: AudioBufferSegment = {
      id: randomId(),
      label: 'Part ' + (segments.length+1),
      start,
      end,
      loopEnabled,
      loopMode,
      reverse: false,
      speed
    };
    // Detect pitch for this segment
    if (decodedBuffer) {
      import('../util/pitchDetection').then(({ detectPitch }) => {
        const freq = detectPitch(decodedBuffer, start, end);
        if (freq) {
          updateSegment(seg.id, { detectedFrequency: freq });
        }
      });
    }
    setSegments(prev=>[...prev, seg]);
  };

  // Add segment from waveform selector
  const addSegmentFromSelector = (
    start: number,
    end: number,
    selSpeed: number
  ) => {
    const seg: AudioBufferSegment = {
      id: randomId(),
      label: 'Part ' + (segments.length + 1),
      start,
      end,
      loopEnabled: false,
      loopMode: 'hold',
      reverse: false,
      speed: selSpeed
    };
    // Detect pitch for this segment
    if (decodedBuffer) {
      import('../util/pitchDetection').then(({ detectPitch }) => {
        const freq = detectPitch(decodedBuffer, start, end);
        if (freq) {
          updateSegment(seg.id, { detectedFrequency: freq });
        }
      });
    }
    setSegments((prev) => [...prev, seg]);
  };

  const updateSegment = (id: string, patch: Partial<AudioBufferSegment>) => {
    setSegments(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...patch } : s);
      // If this is the currently playing segment and loop boundaries changed, restart playback
      if (
        id === playingSegmentId &&
        (patch.start !== undefined || patch.end !== undefined || patch.speed !== undefined || patch.reverse !== undefined)
      ) {
        const updated = next.find(s => s.id === id);
        if (updated?.loopEnabled) {
          // defer so state has settled
          setTimeout(() => playSegment(updated), 0);
        }
      }
      return next;
    });
  };

  const removeSegment = (id:string)=>{ setSegments(prev=> prev.filter(s=> s.id!==id)); };

  // Auto-sample: create multiple segments automatically
  const autoSample = async (
    rangeStart: number,
    rangeEnd: number,
    method: 'equal' | 'transient',
    options?: {
      detectionMethods?: Array<'hfc' | 'complex' | 'flux' | 'complex_phase'>;
      sensitivity?: number;
      overlapPadding?: number;
    }
  ) => {
    if (!decodedBuffer) return;

    const { detectionMethods, sensitivity, overlapPadding = 0 } = options || {};
    const newSegments: AudioBufferSegment[] = [];

    if (method === 'equal') {
      // Equal time divisions (default 8 segments)
      const numSegments = 8;
      const segmentDuration = (rangeEnd - rangeStart) / numSegments;
      for (let i = 0; i < numSegments; i++) {
        let start = rangeStart + i * segmentDuration;
        let end = start + segmentDuration;
        
        // Apply overlap padding
        if (overlapPadding > 0) {
          start = Math.max(0, start - overlapPadding);
          end = Math.min(decodedBuffer.duration, end + overlapPadding);
        }
        
        const seg: AudioBufferSegment = {
          id: randomId(),
          label: `Part ${segments.length + i + 1}`,
          start,
          end,
          loopEnabled: false,
          loopMode: 'hold',
          reverse: false,
          speed: 1
        };
        newSegments.push(seg);
      }
    } else if (method === 'transient') {
      // Essentia-based onset detection with advanced options
      try {
        const cutPoints = await detectOnsetsEssentia(
          decodedBuffer,
          rangeStart,
          rangeEnd,
          {
            methods: detectionMethods,
            sensitivity,
            overlapPadding
          }
        );
        
        // Create segments from adjacent cut points with overlap
        for (let i = 0; i < cutPoints.length - 1; i++) {
          let start = cutPoints[i];
          let end = cutPoints[i + 1];
          
          // Apply overlap padding
          if (overlapPadding > 0) {
            start = Math.max(0, start - overlapPadding);
            end = Math.min(decodedBuffer.duration, end + overlapPadding);
          }
          
          const seg: AudioBufferSegment = {
            id: randomId(),
            label: `Part ${segments.length + i + 1}`,
            start,
            end,
            loopEnabled: false,
            loopMode: 'hold',
            reverse: false,
            speed: 1
          };
          newSegments.push(seg);
        }
      } catch (err) {
        console.error('Auto-sampling failed:', err);
        alert('Auto-sampling failed. Please try again.');
        return;
      }
    }

    // Add all new segments and detect pitch for each
    setSegments(prev => [...prev, ...newSegments]);
    
    // Asynchronously detect pitch for each segment
    if (decodedBuffer) {
      import('../util/pitchDetection').then(({ detectPitch }) => {
        newSegments.forEach(seg => {
          const freq = detectPitch(decodedBuffer, seg.start, seg.end);
          if (freq) {
            updateSegment(seg.id, { detectedFrequency: freq });
          }
        });
      });
    }
  };

  // Direct playback state for segment preview
  const segmentAudioCtxRef = useRef<AudioContext | null>(null);
  const segmentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);

  // Granular preview refs
  const grainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const grainCtxRef = useRef<AudioContext | null>(null);
  // Always-current segments for use inside setInterval closures
  const segmentsRef = useRef<AudioBufferSegment[]>(segments);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  // Convert speed for segment playback
  const segmentSpeedToRate = (spd: number): number => {
    if (spd === 0) return 1;
    if (spd > 0) return 1 + (spd / 20) * 3;
    return Math.pow(10, spd / 50);
  };

  const playGranularPreview = (segment: AudioBufferSegment) => {
    if (!decodedBuffer) return;

    const ctx = new AudioContext();
    grainCtxRef.current = ctx;

    const srcSr = decodedBuffer.sampleRate;
    const startSample = Math.floor(Math.max(0, segment.start) * srcSr);
    const endSample = Math.min(Math.floor(segment.end * srcSr), decodedBuffer.length);
    const segLen = Math.max(1, endSample - startSample);

    // Build mono snapshot of the segment region
    const nc = decodedBuffer.numberOfChannels;
    const mono = new Float32Array(segLen);
    for (let ch = 0; ch < nc; ch++) {
      const cd = decodedBuffer.getChannelData(ch);
      for (let i = 0; i < segLen; i++) mono[i] += (cd[startSample + i] || 0) / nc;
    }

    const grainSizeMs = Math.max(5, segment.grainSize ?? 100);
    const overlap = Math.min(0.95, Math.max(0, segment.grainOverlap ?? 0.6));
    const periodMs = Math.max(1, grainSizeMs * (1 - overlap));

    let ptr = 0;

    const handle = setInterval(() => {
      const ctx = grainCtxRef.current;
      if (!ctx) return;

      const liveSeg = segmentsRef.current.find(s => s.id === segment.id) ?? segment;
      const pitch = liveSeg.grainPitch ?? 0;
      const spread = Math.max(0, Math.min(0.5, liveSeg.grainSpread ?? 0.05));
      const speed = liveSeg.grainSpeed ?? 0.1;
      const frozen = !!liveSeg.grainFrozen;
      const sr = ctx.sampleRate;
      const grainSampNow = Math.max(2, Math.floor((liveSeg.grainSize ?? grainSizeMs) / 1000 * sr));

      if (!frozen) {
        const periodSamples = Math.floor(periodMs / 1000 * sr);
        const step = Math.round(speed * periodSamples * 0.15);
        ptr = ((ptr + step) % segLen + segLen) % segLen;
      }

      const jitter = Math.round((Math.random() * 2 - 1) * spread * segLen);
      const grainStart = ((ptr + jitter) % segLen + segLen) % segLen;

      const grainBuf = ctx.createBuffer(1, grainSampNow, sr);
      const gd = grainBuf.getChannelData(0);
      const N = Math.max(1, grainSampNow - 1);
      for (let i = 0; i < grainSampNow; i++) {
        const win = 0.5 * (1 - Math.cos(2 * Math.PI * i / N));
        gd[i] = (mono[(grainStart + i) % segLen] || 0) * win;
      }

      const src = ctx.createBufferSource();
      src.buffer = grainBuf;
      src.playbackRate.value = Math.pow(2, pitch / 12);
      src.connect(ctx.destination);
      src.start();
    }, periodMs);

    grainIntervalRef.current = handle;
    setPlayingSegmentId(segment.id);
  };

  const playSegment = (segment: AudioBufferSegment) => {
    // Stop any currently playing segment
    stopAllSegments();

    if (!decodedBuffer) return;

    // Route to granular engine when enabled
    if (segment.grainEnabled) {
      playGranularPreview(segment);
      return;
    }

    const ctx = new AudioContext();
    segmentAudioCtxRef.current = ctx;

    const source = ctx.createBufferSource();

    // Handle reverse playback
    if (segment.reverse) {
      const reversed = ctx.createBuffer(
        decodedBuffer.numberOfChannels,
        decodedBuffer.length,
        decodedBuffer.sampleRate
      );
      for (let ch = 0; ch < decodedBuffer.numberOfChannels; ch++) {
        const originalData = decodedBuffer.getChannelData(ch);
        const reversedData = reversed.getChannelData(ch);
        for (let i = 0; i < originalData.length; i++) {
          reversedData[i] = originalData[originalData.length - 1 - i];
        }
      }
      source.buffer = reversed;
    } else {
      source.buffer = decodedBuffer;
    }

    const rate = segmentSpeedToRate(segment.speed ?? 1);
    source.playbackRate.value = rate;
    source.connect(ctx.destination);

    const playStart = segment.start;
    const playEnd = segment.end;
    const playDuration = playEnd - playStart;

    // Calculate actual start/end for reversed buffer
    let actualStart = playStart;
    if (segment.reverse && decodedBuffer) {
      actualStart = decodedBuffer.duration - playEnd;
    }

    if (segment.loopEnabled) {
      source.loop = true;
      if (segment.reverse && decodedBuffer) {
        source.loopStart = decodedBuffer.duration - playEnd;
        source.loopEnd = decodedBuffer.duration - playStart;
      } else {
        source.loopStart = playStart;
        source.loopEnd = playEnd;
      }
    }

    source.start(
      0,
      actualStart,
      segment.loopEnabled ? undefined : playDuration
    );
    segmentSourceRef.current = source;
    setPlayingSegmentId(segment.id);

    source.onended = () => {
      setPlayingSegmentId(null);
      if (segmentAudioCtxRef.current) {
        segmentAudioCtxRef.current.close();
        segmentAudioCtxRef.current = null;
      }
    };

    // Note: Don't emit event to virtual node for GUI preview playback
    // The virtual node only plays when triggered via graph connections
  };

  const stopAllSegments = () => {
    // Stop granular preview scheduler
    if (grainIntervalRef.current !== null) {
      clearInterval(grainIntervalRef.current);
      grainIntervalRef.current = null;
    }
    if (grainCtxRef.current) {
      grainCtxRef.current.close();
      grainCtxRef.current = null;
    }
    // Stop regular playback
    if (segmentSourceRef.current) {
      try {
        segmentSourceRef.current.stop();
      } catch {
        // Already stopped
      }
      segmentSourceRef.current = null;
    }
    if (segmentAudioCtxRef.current) {
      segmentAudioCtxRef.current.close();
      segmentAudioCtxRef.current = null;
    }
    setPlayingSegmentId(null);
  };

  const stopSegment = (segment: AudioBufferSegment) => {
    stopAllSegments();
    // Note: Don't emit event to virtual node for GUI preview stop
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllSegments();
    };
  }, []);

  if(!data.style){ data.style = style; }

  // Ensure React Flow is aware of newly added / removed dynamic handles.
  useEffect(()=>{
    // Only when count changes (add/remove) we need a recalculation.
    updateNodeInternals(data.id);
  }, [segments.length, data.id, updateNodeInternals]);

  return (
    <div style={style}>
      <div className='audio-header' style={{ display: 'flex', justifyContent: 'center' }}>
        <label >
          <b>SAMPLE</b>
        </label>
      </div>

      <div style={{ marginBottom:6 ,width:'97%'}}>
          <input type='file' accept='.wav,.mp3,.ogg,.flac' ref={fileInputRef} onChange={onFileSelected} style={{ background:'#111', color:'#eee', border:'1px solid #555', padding:4, width:'100%' }} />
        {fileName && <div style={{ fontSize:12, opacity:0.8 }}>{fileName}{duration ? ` (${duration.toFixed(2)}s)` : ''}{fileId ? ' • saved' : ''}</div>}
      </div>

      {/* Select Button - Opens Waveform Selector */}
      <button
        onClick={() => setShowSelector(true)}
        disabled={!decodedBuffer || !duration}
        style={{
          width: '100%',
          marginBottom: 8,
          background: decodedBuffer ? '#2d5a8a' : '#333',
          color: decodedBuffer ? '#fff' : '#666',
          border: '1px solid #555',
          padding: '8px 12px',
          borderRadius: 4,
          cursor: decodedBuffer ? 'pointer' : 'not-allowed',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        <span>🎚️</span> Select Parts
      </button>

      {/* Auto Sample Button */}
      <button
        onClick={() => setShowAutoSample(true)}
        disabled={!decodedBuffer || !duration}
        style={{
          width: '100%',
          marginBottom: 8,
          background: decodedBuffer ? '#5a2d8a' : '#333',
          color: decodedBuffer ? '#fff' : '#666',
          border: '1px solid #555',
          padding: '8px 12px',
          borderRadius: 4,
          cursor: decodedBuffer ? 'pointer' : 'not-allowed',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        <span>✂️</span> Auto Sample
      </button>

      {/* Waveform Selector Modal */}
      {showSelector && decodedBuffer && duration && (
        <WaveformSelector
          audioBuffer={decodedBuffer}
          duration={duration}
          nodeId={data.id}
          onClose={() => setShowSelector(false)}
          onAddPart={addSegmentFromSelector}
        />
      )}

      {/* Auto Sample Dialog */}
      {showAutoSample && duration && (
        <AutoSampleDialog
          duration={duration}
          onClose={() => setShowAutoSample(false)}
          onConfirm={autoSample}
        />
      )}

      {/* No global options; configure per-part below */}

      <div style={segmentListStyle}>
        {segments.map((seg, idx) => {
          const isExpanded = expandedSegments.has(seg.id);
          const isPlaying = playingSegmentId === seg.id;
          return (
            <div
              key={seg.id}
              style={{
                border: isPlaying ? '1px solid #4a9eff' : '1px solid #555',
                borderRadius: 4,
                marginBottom: 3,
                background: isPlaying ? '#1e2e40' : '#2f2f2f',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: isPlaying ? '0 0 8px 2px rgba(74,158,255,0.45)' : 'none',
                transition: 'box-shadow 0.15s, border-color 0.15s, background 0.15s'
              }}
            >
              {/* Compact row: waveform + minimal controls */}
              <div style={{ position: 'relative' }}>
                {/* Half-height waveform — click to play/stop */}
                <canvas
                  ref={el => {
                    if (!el) return;
                    const ro = new ResizeObserver(() => drawSegmentWaveform(el, decodedBuffer, seg.start, seg.end));
                    ro.observe(el);
                    drawSegmentWaveform(el, decodedBuffer, seg.start, seg.end);
                  }}
                  style={{
                    width: '100%',
                    height: 60,
                    display: 'block',
                    cursor: 'pointer'
                  }}
                  onClick={() => isPlaying ? stopAllSegments() : playSegment(seg)}
                  title={isPlaying ? 'Stop' : 'Play'}
                />
                {/* Overlay: label top-left, buttons top-right */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none'
                  }}
                >
                  {/* Label — top left */}
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    left: 4,
                    fontSize: 10,
                    color: isPlaying ? '#8ecfff' : '#ccc',
                    textShadow: '0 0 4px #000, 0 0 4px #000',
                    maxWidth: 'calc(100% - 60px)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                    transition: 'color 0.15s'
                  }}>
                    {seg.label}
                    {seg.detectedFrequency ? ` · ${seg.detectedFrequency.toFixed(0)}Hz` : ''}
                  </span>
                  {/* Buttons — top right */}
                  <div style={{
                    position: 'absolute',
                    top: 2,
                    right: 3,
                    display: 'flex',
                    gap: 2,
                    pointerEvents: 'all'
                  }}>
                    <button
                      onClick={e => { e.stopPropagation(); removeSegment(seg.id); }}
                      style={{
                        background: 'rgba(80,30,30,0.85)',
                        color: '#eee',
                        padding: '1px 4px',
                        border: '1px solid #666',
                        borderRadius: 3,
                        fontSize: 11,
                        lineHeight: 1,
                        cursor: 'pointer'
                      }}
                      title='Delete segment'
                    >
                      🗑
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); toggleSegmentExpanded(seg.id); }}
                      style={{
                        background: 'rgba(40,40,80,0.85)',
                        color: '#aac',
                        padding: '1px 4px',
                        border: '1px solid #666',
                        borderRadius: 3,
                        fontSize: 10,
                        lineHeight: 1,
                        cursor: 'pointer'
                      }}
                      title={isExpanded ? 'Collapse' : 'Expand details'}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded details panel */}
              {isExpanded && (
                <div style={{ padding: 6, borderTop: '1px solid #444' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:4 }}>
                    <input
                      style={{ flex:1, background:'#111', color:'#eee', border:'1px solid #555', padding:'2px 4px', fontSize:12 }}
                      value={seg.label}
                      onChange={e => updateSegment(seg.id, { label: e.target.value })}
                    />
                    {seg.detectedFrequency && (
                      <span style={{ fontSize:10, opacity:0.7 }} title={frequencyToNote(seg.detectedFrequency)}>
                        🎵{seg.detectedFrequency.toFixed(0)}Hz
                      </span>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                    <label style={{ fontSize:11 }}>Start
                      <input
                        type='text'
                        value={seg.start}
                        onChange={e => {
                          const v = parseFloat(e.target.value.replace(/,/g,'.'));
                          if(!isNaN(v)) updateSegment(seg.id, { start: Math.max(0, v) });
                        }}
                        onKeyDown={e => adjustNumericInput(e, seg.start, v => updateSegment(seg.id, { start: Math.max(0, v) }))}
                        style={{ width:60, marginLeft:4, background:'#111', color:'#eee', border:'1px solid #555', padding:'2px 4px', fontSize:12 }}
                      />
                    </label>
                    <label style={{ fontSize:11 }}>End
                      <input
                        type='text'
                        value={seg.end}
                        onChange={e => {
                          const v = parseFloat(e.target.value.replace(/,/g,'.'));
                          if(!isNaN(v)) updateSegment(seg.id, { end: Math.max(0, v) });
                        }}
                        onKeyDown={e => adjustNumericInput(e, seg.end, v => updateSegment(seg.id, { end: Math.max(0, v) }))}
                        style={{ width:60, marginLeft:4, background:'#111', color:'#eee', border:'1px solid #555', padding:'2px 4px', fontSize:12 }}
                      />
                    </label>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', background:'#222', padding:6, borderRadius:4 }}>
                    <label style={{ fontSize:12 }}>
                      <input type='checkbox' checked={!!seg.loopEnabled} onChange={e => updateSegment(seg.id, { loopEnabled: e.target.checked })} style={{ marginRight:4 }} />
                      Loop
                    </label>
                    <label style={{ fontSize:12 }}>
                      <input type='checkbox' checked={seg.holdEnabled !== false} onChange={e => updateSegment(seg.id, { holdEnabled: e.target.checked })} style={{ marginRight:4 }} />
                      Hold
                    </label>
                    <div style={{ fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
                      Mode
                      <button type='button' onClick={() => updateSegment(seg.id, { loopMode: 'hold' })} style={{ background: (seg.loopMode||'hold')==='hold' ? '#4a9eff' : '#333', color:'#eee', border:'1px solid #555', padding:'2px 6px', borderRadius:3, cursor:'pointer' }}>On→Off</button>
                      <button type='button' onClick={() => updateSegment(seg.id, { loopMode: 'toggle' })} style={{ background: (seg.loopMode||'hold')==='toggle' ? '#4a9eff' : '#333', color:'#eee', border:'1px solid #555', padding:'2px 6px', borderRadius:3, cursor:'pointer' }}>On↔On</button>
                    </div>
                    <label style={{ fontSize:12 }}>
                      <input type='checkbox' checked={!!seg.reverse} onChange={e => updateSegment(seg.id, { reverse: e.target.checked })} style={{ marginRight:4 }} />
                      Reverse
                    </label>
                    <label style={{ fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
                      Speed
                      <input
                        type='text'
                        value={seg.speed ?? 1}
                        onChange={e => {
                          const v = parseFloat(e.target.value.replace(/,/g,'.'));
                          if(!isNaN(v)) updateSegment(seg.id, { speed: Math.max(-10, Math.min(10, v)) });
                        }}
                        onKeyDown={e => adjustNumericInput(e, seg.speed ?? 1, v => updateSegment(seg.id, { speed: Math.max(-10, Math.min(10, v)) }))}
                        style={{ width:70, background:'#111', color:'#eee', border:'1px solid #555', padding:'2px 4px', fontSize:12 }}
                      />
                    </label>
                    <button
                      type='button'
                      onClick={async () => {
                        if (!decodedBuffer) return;
                        const { detectPitch } = await import('../util/pitchDetection');
                        const freq = detectPitch(decodedBuffer, seg.start, seg.end);
                        updateSegment(seg.id, { detectedFrequency: freq });
                      }}
                      disabled={!decodedBuffer}
                      style={{ background:'#335', color:'#eee', border:'1px solid #555', padding:'2px 6px', borderRadius:3, fontSize:11, cursor: decodedBuffer ? 'pointer' : 'not-allowed' }}
                    >
                      🎵 Detect
                    </button>
                  </div>

                  {/* ── Granular FX ─────────────────────────────────────── */}
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #3a3a3a' }}>
                    <label
                      className='nodrag'
                      style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 4 }}
                    >
                      <input
                        type='checkbox'
                        checked={!!seg.grainEnabled}
                        onChange={e => updateSegment(seg.id, { grainEnabled: e.target.checked })}
                      />
                      <span style={{ fontWeight: 'bold', color: seg.grainEnabled ? '#4a9eff' : '#777', letterSpacing: 0.5 }}>
                        ✦ Granular FX
                      </span>
                    </label>
                    {seg.grainEnabled && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 4 }}>
                          {/* Grain Size */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: 9, opacity: 0.7 }}>Grain</div>
                            <div className='nodrag'>
                              <MidiKnob value={seg.grainSize ?? 100} min={5} max={500}
                                onChange={v => updateSegment(seg.id, { grainSize: v })}
                                persistKey={`sample:${data.id}:seg:${seg.id}:grainSize`} />
                            </div>
                            <div style={{ fontSize: 9 }}>{(seg.grainSize ?? 100).toFixed(0)}ms</div>
                          </div>
                          {/* Overlap */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: 9, opacity: 0.7 }}>Overlap</div>
                            <div className='nodrag'>
                              <MidiKnob value={seg.grainOverlap ?? 0.6} min={0} max={0.95}
                                onChange={v => updateSegment(seg.id, { grainOverlap: v })}
                                persistKey={`sample:${data.id}:seg:${seg.id}:grainOverlap`} />
                            </div>
                            <div style={{ fontSize: 9 }}>{((seg.grainOverlap ?? 0.6) * 100).toFixed(0)}%</div>
                          </div>
                          {/* Pitch – the scream */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: 9, opacity: 0.7, color: Math.abs(seg.grainPitch ?? 0) >= 12 ? '#ff8844' : undefined }}>Pitch 🔊</div>
                            <div className='nodrag'>
                              <MidiKnob value={seg.grainPitch ?? 0} min={-36} max={36}
                                onChange={v => updateSegment(seg.id, { grainPitch: v })}
                                persistKey={`sample:${data.id}:seg:${seg.id}:grainPitch`} />
                            </div>
                            <div style={{ fontSize: 9, color: Math.abs(seg.grainPitch ?? 0) >= 12 ? '#ff8844' : undefined }}>
                              {(seg.grainPitch ?? 0) >= 0 ? '+' : ''}{(seg.grainPitch ?? 0).toFixed(1)}st
                            </div>
                          </div>
                          {/* Spread */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: 9, opacity: 0.7 }}>Spread</div>
                            <div className='nodrag'>
                              <MidiKnob value={seg.grainSpread ?? 0.05} min={0} max={0.5}
                                onChange={v => updateSegment(seg.id, { grainSpread: v })}
                                persistKey={`sample:${data.id}:seg:${seg.id}:grainSpread`} />
                            </div>
                            <div style={{ fontSize: 9 }}>{((seg.grainSpread ?? 0.05) * 100).toFixed(0)}%</div>
                          </div>
                          {/* Speed */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: 9, opacity: 0.7 }}>Speed</div>
                            <div className='nodrag'>
                              <MidiKnob value={seg.grainSpeed ?? 0.1} min={-4} max={4}
                                onChange={v => updateSegment(seg.id, { grainSpeed: v })}
                                persistKey={`sample:${data.id}:seg:${seg.id}:grainSpeed`} />
                            </div>
                            <div style={{ fontSize: 9 }}>{(seg.grainSpeed ?? 0.1) >= 0 ? '+' : ''}{(seg.grainSpeed ?? 0.1).toFixed(2)}</div>
                          </div>
                          {/* Freeze */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <button
                              type='button'
                              className='nodrag'
                              onClick={() => updateSegment(seg.id, { grainFrozen: !seg.grainFrozen })}
                              style={{
                                background: seg.grainFrozen ? '#1c6bc7' : '#333',
                                color: '#fff',
                                border: `1px solid ${seg.grainFrozen ? '#4a9eff' : '#555'}`,
                                padding: '6px 4px',
                                borderRadius: 3,
                                cursor: 'pointer',
                                fontSize: 9,
                                fontWeight: 'bold',
                                boxShadow: seg.grainFrozen ? '0 0 6px rgba(74,158,255,0.4)' : 'none',
                                transition: 'all 0.15s',
                                width: '100%',
                              }}
                            >
                              {seg.grainFrozen ? '❄️ FROZEN' : '⏺ FREEZE'}
                            </button>
                          </div>
                        </div>
                        {Math.abs(seg.grainPitch ?? 0) >= 12 && (
                          <div style={{ fontSize: 9, color: '#ff4422', textAlign: 'center', opacity: 0.85 }}>
                            🔥 Scream zone – grain rate approaching audio frequency
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* React Flow target handle */}
              <Handle
                type='target'
                position={Position.Left}
                id={seg.id}
                style={{ top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          );
        })}
        {segments.length===0 && <div style={{ fontSize:12, opacity:0.7 }}>No segments yet. Add one.</div>}
      </div>
  <button onClick={addSegment} style={{ width:'100%', marginTop:4, background:'#222', color:'#eee', border:'1px solid #555', padding:'6px 8px', borderRadius:4 }}>Add Segment</button>

      {/* Main Output */}
      <Handle type='source' position={Position.Right} id='output' className='mainOutput' />
    </div>
  );
};

export default SampleFlowNode;
