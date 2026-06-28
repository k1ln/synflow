import React from 'react';

export function TransportBar({
  isPlaying, bpm, onPlay, onStop, onBpm,
}: {
  isPlaying: boolean;
  bpm: number;
  onPlay: () => void;
  onStop: () => void;
  onBpm: (bpm: number) => void;
}) {
  return (
    <div className="transport">
      <button className="play" onClick={isPlaying ? onStop : onPlay}>
        {isPlaying ? '■ Stop' : '▶ Play'}
      </button>
      <label className="bpm">
        BPM
        <input
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={(e) => onBpm(Math.max(40, Math.min(300, parseInt(e.target.value, 10) || bpm)))}
        />
      </label>
      <span className="brand">Mothscilla</span>
    </div>
  );
}
