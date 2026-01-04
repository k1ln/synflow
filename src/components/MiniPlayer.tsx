import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square } from 'lucide-react';

interface MiniPlayerProps {
  audioSrc: string;
  title: string;
  onClose: () => void;
}

const MiniPlayer: React.FC<MiniPlayerProps> = ({ audioSrc, title, onClose }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const onCloseRef = useRef(onClose);
  const isDraggingRef = useRef(false);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Keep onClose ref up to date
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keep isDragging ref in sync
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    const audio = new Audio(audioSrc);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    // Use requestAnimationFrame to throttle time updates
    const handleTimeUpdate = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        if (!isDraggingRef.current) {
          setCurrentTime(audio.currentTime);
        }
      });
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e: Event) => {
      console.error('[MiniPlayer] Audio playback error:', audio.error);
      onCloseRef.current();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Auto-play on mount
    audio.play().then(() => {
      setIsPlaying(true);
    }).catch((e) => {
      console.error('[MiniPlayer] Auto-play failed:', e);
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
      audio.load();
    };
  }, [audioSrc]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.error('[MiniPlayer] Play failed:', e);
      });
    }
  };

  const handleStop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    onClose();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSliderMouseDown = () => {
    setIsDragging(true);
  };

  const handleSliderMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(false);
    handleSeek(e);
  };

  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    handleSeek(e);
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
        border: '1px solid #3a3a3a',
        borderRadius: 12,
        padding: '14px 20px',
        minWidth: 420,
        maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px 2px rgba(0, 255, 136, 0.15)',
        fontFamily: 'Inter, system-ui, sans-serif',
        backdropFilter: 'blur(10px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#e0e0e0',
          marginBottom: 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={title}
      >
        {title}
      </div>

      {/* Progress Bar */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 6,
          background: '#333',
          borderRadius: 3,
          cursor: 'pointer',
          marginBottom: 12,
        }}
        onClick={handleSeek}
        onMouseDown={handleSliderMouseDown}
        onMouseUp={handleSliderMouseUp}
        onMouseMove={handleSliderMouseMove}
        onMouseLeave={() => setIsDragging(false)}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${progressPercent}%`,
            background: 'linear-gradient(90deg, #00ff88 0%, #00cc6a 100%)',
            borderRadius: 3,
            transition: isDragging ? 'none' : 'width 0.1s ease-out',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${progressPercent}%`,
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            background: '#00ff88',
            borderRadius: '50%',
            boxShadow: '0 0 8px rgba(0, 255, 136, 0.6)',
            cursor: 'grab',
            opacity: isDragging ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
          onMouseDown={handleSliderMouseDown}
        />
      </div>

      {/* Controls and Time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Play/Pause Button */}
        <button
          onClick={togglePlayPause}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            background: isPlaying ? '#1a4d2e' : '#2d5b1f',
            border: '1px solid #3a7a28',
            borderRadius: 8,
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isPlaying ? '#245c38' : '#3a7a28';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isPlaying ? '#1a4d2e' : '#2d5b1f';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        {/* Stop Button */}
        <button
          onClick={handleStop}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            background: '#3a1212',
            border: '1px solid #5a1a1a',
            borderRadius: 8,
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#5a1a1a';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#3a1212';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Stop"
        >
          <Square size={18} />
        </button>

        {/* Time Display */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#888',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

export default MiniPlayer;
