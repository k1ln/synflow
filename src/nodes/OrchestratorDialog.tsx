import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  OrchestratorData,
  OrchestratorRow,
  AudioSegmentEvent,
  FrequencyGateEvent,
  MusicNote,
  GridGranularityType,
  GRANULARITY_DIVISOR
} from '../types/OrchestratorTypes';
import './OrchestratorDialog.css';

interface OrchestratorDialogProps {
  orchestratorData: OrchestratorData;
  nodeId: string;
  onClose: () => void;
  onChange: (data: OrchestratorData) => void;
}

const OrchestratorDialog: React.FC<OrchestratorDialogProps> = ({
  orchestratorData,
  nodeId,
  onClose,
  onChange
}) => {
  const [data, setData] = useState<OrchestratorData>(orchestratorData);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(data.zoom || 80); // pixels per beat
  const [scrollX, setScrollX] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingEvent, setDraggingEvent] = useState<{
    rowId: string;
    eventId: string;
    type: 'move' | 'resizeEnd';
    startX: number;
    startTime: number;
  } | null>(null);

  // Conversion helpers
  const beatToPixels = (beat: number): number => beat * zoomLevel;
  const pixelsToBeat = (px: number): number => px / zoomLevel;
  const secondsToBeat = (seconds: number): number =>
    (seconds / 60) * (data.tempo || 120); // convert to beats
  const beatsToSeconds = (beats: number): number =>
    (beats * 60) / (data.tempo || 120); // convert to seconds

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      let displayWidth = rect.width;
      let displayHeight = rect.height;

      // Fallback to parent container if canvas hasn't been laid out yet
      if (displayWidth === 0 || displayHeight === 0) {
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          displayWidth = Math.max(containerRect.width - 150 - 200, 400); // subtract sidebars
          displayHeight = Math.max(containerRect.height, 300);
        } else {
          displayWidth = 1000;
          displayHeight = 600;
        }
      }

      // Ensure minimum dimensions
      displayWidth = Math.max(displayWidth, 400);
      displayHeight = Math.max(displayHeight, 300);

      const bufferWidth = displayWidth * dpr;
      const bufferHeight = displayHeight * dpr;

      canvas.width = bufferWidth;
      canvas.height = bufferHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      // Draw grid and measures
      drawGrid(ctx, displayWidth, displayHeight);

      // Draw rows and events
      data.rows.forEach((row, rowIdx) => {
        drawRow(ctx, row, rowIdx, displayWidth, displayHeight);
      });

      // Draw playhead
      drawPlayhead(ctx, displayHeight);
    };

    // Initial draw on next frame
    requestAnimationFrame(() => {
      resizeCanvas();
    });

    // Setup resize observer for responsive canvas
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        resizeCanvas();
      });
    });
    
    if (canvas) {
      resizeObserver.observe(canvas);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [data, zoomLevel, scrollX]);

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const beatWidth = beatToPixels(1);
    const measuresPerView = 4;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Grid lines at granularity
    const granularity = GRANULARITY_DIVISOR[data.gridGranularity || 'quarter'];
    const gridSpacing = beatWidth * granularity;

    let x = -scrollX;
    let beatCounter = 0;

    while (x < width) {
      if (data.snapToGrid && beatCounter % Math.round(1 / granularity) === 0) {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
      }

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      x += gridSpacing;
      beatCounter += granularity;
    }

    // Draw measure markers
    const beatsPerMeasure = data.timeSignature.beats;
    const measureSpacing = beatToPixels(beatsPerMeasure);
    x = -scrollX;
    let measureNum = 0;

    ctx.fillStyle = '#00ff88';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    while (x < width) {
      ctx.fillText(`${measureNum}`, x + 3, 15);
      x += measureSpacing;
      measureNum++;
    }
  };

  const drawRow = (
    ctx: CanvasRenderingContext2D,
    row: OrchestratorRow,
    rowIdx: number,
    width: number,
    height: number
  ) => {
    const rowHeight = 50;
    const rowY = 30 + rowIdx * rowHeight;

    // Row background
    ctx.fillStyle = rowIdx % 2 === 0 ? '#202020' : '#1a1a1a';
    ctx.fillRect(0, rowY, width, rowHeight);

    // Row label
    ctx.fillStyle = '#aaa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row.label, 140, rowY + 25);

    // Draw events based on type
    if (row.type === 'audio' && row.audioSegments) {
      row.audioSegments.forEach((seg) => {
        drawAudioSegment(ctx, seg, rowY, rowHeight);
      });
    } else if (row.type === 'event' && row.events) {
      row.events.forEach((evt) => {
        drawEventBar(ctx, evt, rowY, rowHeight);
      });
    } else if (row.type === 'pianoroll' && row.notes) {
      row.notes.forEach((note) => {
        drawNoteBar(ctx, note, rowY, rowHeight);
      });
    }
  };

  const drawAudioSegment = (
    ctx: CanvasRenderingContext2D,
    seg: AudioSegmentEvent,
    rowY: number,
    rowHeight: number
  ) => {
    const startPx = beatToPixels(secondsToBeat(seg.startTime)) - scrollX;
    const widthPx = beatToPixels(secondsToBeat(seg.duration));

    const isSelected = selectedEvent === seg.id;
    ctx.fillStyle = isSelected ? '#2d8fcc' : '#4a9eff';
    ctx.fillRect(startPx + 150, rowY + 10, widthPx, rowHeight - 20);

    ctx.strokeStyle = isSelected ? '#0055aa' : '#2d7acc';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(startPx + 150, rowY + 10, widthPx, rowHeight - 20);

    // Resize handle
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(startPx + 150 + widthPx - 8, rowY + 10, 8, rowHeight - 20);

    // Speed/reverse indicator
    if (seg.speed !== 1 || seg.reverse) {
      ctx.fillStyle = '#ffd43b';
      ctx.font = '9px monospace';
      ctx.fillText(`${seg.speed?.toFixed(1)}x ${seg.reverse ? 'R' : ''}`, startPx + 155, rowY + 20);
    }
  };

  const drawEventBar = (
    ctx: CanvasRenderingContext2D,
    evt: FrequencyGateEvent,
    rowY: number,
    rowHeight: number
  ) => {
    const startPx = beatToPixels(secondsToBeat(evt.startTime)) - scrollX;
    const widthPx = beatToPixels(secondsToBeat(evt.duration));

    const isSelected = selectedEvent === evt.id;
    ctx.fillStyle = isSelected ? '#6fdd6f' : '#90ee90';
    ctx.fillRect(startPx + 150, rowY + 15, widthPx, rowHeight - 30);

    ctx.strokeStyle = isSelected ? '#40aa40' : '#60bb60';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(startPx + 150, rowY + 15, widthPx, rowHeight - 30);

    // Resize handle
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(startPx + 150 + widthPx - 8, rowY + 15, 8, rowHeight - 30);

    // Frequency display
    ctx.fillStyle = '#000';
    ctx.font = '10px monospace';
    ctx.fillText(`${evt.frequency.toFixed(0)}Hz`, startPx + 155, rowY + 25);
  };

  const drawNoteBar = (
    ctx: CanvasRenderingContext2D,
    note: MusicNote,
    rowY: number,
    rowHeight: number
  ) => {
    const startPx = beatToPixels(secondsToBeat(note.startTime)) - scrollX;
    const widthPx = beatToPixels(secondsToBeat(note.duration));

    const isSelected = selectedEvent === note.id;
    ctx.fillStyle = isSelected ? '#b070cc' : '#dda0dd';
    ctx.fillRect(startPx + 150, rowY + 12, widthPx, rowHeight - 24);

    ctx.strokeStyle = isSelected ? '#7d2fb8' : '#b070b0';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(startPx + 150, rowY + 12, widthPx, rowHeight - 24);

    // Resize handle
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(startPx + 150 + widthPx - 8, rowY + 12, 8, rowHeight - 24);

    // Note display
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText(`${note.pitch}`, startPx + 155, rowY + 24);
  };

  const drawPlayhead = (ctx: CanvasRenderingContext2D, height: number) => {
    const playheadPx = beatToPixels(secondsToBeat(data.currentPosition * data.duration)) - scrollX;

    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(playheadPx, 0);
    ctx.lineTo(playheadPx, height);
    ctx.stroke();
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left + scrollX;
    const y = e.clientY - rect.top;

    // Check if clicking on an event
    let hitEvent = false;
    for (let rowIdx = 0; rowIdx < data.rows.length; rowIdx++) {
      const row = data.rows[rowIdx];
      const rowY = 30 + rowIdx * 50;

      if (row.type === 'audio' && row.audioSegments) {
        for (const seg of row.audioSegments) {
          const startPx = beatToPixels(secondsToBeat(seg.startTime));
          const widthPx = beatToPixels(secondsToBeat(seg.duration));
          if (x >= startPx + 150 && x <= startPx + 150 + widthPx &&
              y >= rowY + 10 && y <= rowY + 40) {
            setSelectedRow(row.id);
            setSelectedEvent(seg.id);
            hitEvent = true;
            break;
          }
        }
      }
    }

    if (!hitEvent) {
      setSelectedRow(null);
      setSelectedEvent(null);
      // Click on timeline to seek
      const beatClicked = pixelsToBeat(x - 150);
      const secondsClicked = beatsToSeconds(beatClicked);
      const newPosition = Math.max(0, Math.min(1, secondsClicked / data.duration));
      setData({ ...data, currentPosition: newPosition });
      onChange({ ...data, currentPosition: newPosition });
    }
  };

  const handleAddRow = (rowType: 'audio' | 'event' | 'pianoroll' = 'event') => {
    const newRow: OrchestratorRow = {
      id: Math.random().toString(36).slice(2, 10),
      label: `Row ${data.rows.length + 1} (${rowType})`,
      type: rowType,
      volume: 1
    };

    // Initialize appropriate array based on type
    if (rowType === 'audio') {
      newRow.audioSegments = [];
    } else if (rowType === 'event') {
      newRow.events = [];
    } else if (rowType === 'pianoroll') {
      newRow.notes = [];
    }

    const newData = { ...data, rows: [...data.rows, newRow] };
    setData(newData);
    onChange(newData);
  };

  const handleDeleteRow = (rowId: string) => {
    const newData = {
      ...data,
      rows: data.rows.filter((r) => r.id !== rowId)
    };
    setData(newData);
    onChange(newData);
  };

  const handleUpdateEventProperty = (property: string, value: any) => {
    if (!selectedRow || !selectedEvent) return;

    const updatedData = { ...data };
    const rowIdx = data.rows.findIndex(r => r.id === selectedRow);
    if (rowIdx === -1) return;

    const row = updatedData.rows[rowIdx];

    if (row.type === 'audio' && row.audioSegments) {
      const segIdx = row.audioSegments.findIndex(s => s.id === selectedEvent);
      if (segIdx !== -1) {
        (row.audioSegments[segIdx] as any)[property] = value;
      }
    } else if (row.type === 'event' && row.events) {
      const evtIdx = row.events.findIndex(e => e.id === selectedEvent);
      if (evtIdx !== -1) {
        (row.events[evtIdx] as any)[property] = value;
      }
    } else if (row.type === 'pianoroll' && row.notes) {
      const noteIdx = row.notes.findIndex(n => n.id === selectedEvent);
      if (noteIdx !== -1) {
        (row.notes[noteIdx] as any)[property] = value;
      }
    }

    setData(updatedData);
    onChange(updatedData);
  };

  const handleDeleteEvent = () => {
    if (!selectedRow || !selectedEvent) return;

    const updatedData = { ...data };
    const rowIdx = data.rows.findIndex(r => r.id === selectedRow);
    if (rowIdx === -1) return;

    const row = updatedData.rows[rowIdx];

    if (row.type === 'audio' && row.audioSegments) {
      row.audioSegments = row.audioSegments.filter(s => s.id !== selectedEvent);
    } else if (row.type === 'event' && row.events) {
      row.events = row.events.filter(e => e.id !== selectedEvent);
    } else if (row.type === 'pianoroll' && row.notes) {
      row.notes = row.notes.filter(n => n.id !== selectedEvent);
    }

    setData(updatedData);
    onChange(updatedData);
    setSelectedEvent(null);
    setSelectedRow(null);
  };

  const getSelectedEventData = () => {
    if (!selectedRow || !selectedEvent) return null;

    const row = data.rows.find(r => r.id === selectedRow);
    if (!row) return null;

    if (row.type === 'audio' && row.audioSegments) {
      return row.audioSegments.find(s => s.id === selectedEvent);
    } else if (row.type === 'event' && row.events) {
      return row.events.find(e => e.id === selectedEvent);
    } else if (row.type === 'pianoroll' && row.notes) {
      return row.notes.find(n => n.id === selectedEvent);
    }
    return null;
  };

  const selectedEventData = getSelectedEventData();
  const selectedRowData = data.rows.find(r => r.id === selectedRow);

  const handleScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      setZoomLevel(Math.max(20, Math.min(200, zoomLevel * delta)));
      e.preventDefault();
    } else {
      // Horizontal scroll
      setScrollX(Math.max(0, scrollX + e.deltaY));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left + scrollX;
    const y = e.clientY - rect.top;

    // Check if clicking on an event (with resize handle on the right)
    for (let rowIdx = 0; rowIdx < data.rows.length; rowIdx++) {
      const row = data.rows[rowIdx];
      const rowY = 30 + rowIdx * 50;

      if (row.type === 'audio' && row.audioSegments) {
        for (const seg of row.audioSegments) {
          const startPx = beatToPixels(secondsToBeat(seg.startTime));
          const widthPx = beatToPixels(secondsToBeat(seg.duration));
          const eventLeft = startPx + 150;
          const eventRight = eventLeft + widthPx;
          const eventTop = rowY + 10;
          const eventBottom = rowY + 40;

          // Check if over event
          if (x >= eventLeft && x <= eventRight && y >= eventTop && y <= eventBottom) {
            const resizeHandleWidth = 10;
            if (x >= eventRight - resizeHandleWidth) {
              // Resize mode
              setDraggingEvent({
                rowId: row.id,
                eventId: seg.id,
                type: 'resizeEnd',
                startX: e.clientX,
                startTime: seg.duration
              });
            } else {
              // Move mode
              setDraggingEvent({
                rowId: row.id,
                eventId: seg.id,
                type: 'move',
                startX: e.clientX,
                startTime: seg.startTime
              });
            }
            setSelectedRow(row.id);
            setSelectedEvent(seg.id);
            return;
          }
        }
      } else if (row.type === 'event' && row.events) {
        for (const evt of row.events) {
          const startPx = beatToPixels(secondsToBeat(evt.startTime));
          const widthPx = beatToPixels(secondsToBeat(evt.duration));
          const eventLeft = startPx + 150;
          const eventRight = eventLeft + widthPx;
          const eventTop = rowY + 15;
          const eventBottom = rowY + 45;

          if (x >= eventLeft && x <= eventRight && y >= eventTop && y <= eventBottom) {
            const resizeHandleWidth = 10;
            if (x >= eventRight - resizeHandleWidth) {
              setDraggingEvent({
                rowId: row.id,
                eventId: evt.id,
                type: 'resizeEnd',
                startX: e.clientX,
                startTime: evt.duration
              });
            } else {
              setDraggingEvent({
                rowId: row.id,
                eventId: evt.id,
                type: 'move',
                startX: e.clientX,
                startTime: evt.startTime
              });
            }
            setSelectedRow(row.id);
            setSelectedEvent(evt.id);
            return;
          }
        }
      } else if (row.type === 'pianoroll' && row.notes) {
        for (const note of row.notes) {
          const startPx = beatToPixels(secondsToBeat(note.startTime));
          const widthPx = beatToPixels(secondsToBeat(note.duration));
          const eventLeft = startPx + 150;
          const eventRight = eventLeft + widthPx;
          const eventTop = rowY + 12;
          const eventBottom = rowY + 38;

          if (x >= eventLeft && x <= eventRight && y >= eventTop && y <= eventBottom) {
            const resizeHandleWidth = 10;
            if (x >= eventRight - resizeHandleWidth) {
              setDraggingEvent({
                rowId: row.id,
                eventId: note.id,
                type: 'resizeEnd',
                startX: e.clientX,
                startTime: note.duration
              });
            } else {
              setDraggingEvent({
                rowId: row.id,
                eventId: note.id,
                type: 'move',
                startX: e.clientX,
                startTime: note.startTime
              });
            }
            setSelectedRow(row.id);
            setSelectedEvent(note.id);
            return;
          }
        }
      }
    }

    // Not on event - deselect
    setSelectedRow(null);
    setSelectedEvent(null);
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left + scrollX;
    const y = e.clientY - rect.top;

    // Determine which row was clicked
    const rowIdx = Math.floor((y - 30) / 50);
    if (rowIdx < 0 || rowIdx >= data.rows.length) return;

    const row = data.rows[rowIdx];
    const clickTimeBeat = pixelsToBeat(x - 150);
    const clickTimeSeconds = beatsToSeconds(Math.max(0, clickTimeBeat));

    // Create a new event based on row type
    const updatedData = { ...data };
    const newEventId = Math.random().toString(36).slice(2, 10);

    if (row.type === 'audio' && row.audioSegments) {
      const newSegment = {
        id: newEventId,
        startTime: clickTimeSeconds,
        duration: 1.0,
        audioSrc: '',
        speed: 1,
        reverse: false,
        volume: 1
      };
      updatedData.rows[rowIdx].audioSegments = [...(row.audioSegments || []), newSegment];
    } else if (row.type === 'event' && row.events) {
      const newEvent = {
        id: newEventId,
        startTime: clickTimeSeconds,
        duration: 1.0,
        frequency: 440,
        gateValue: 1
      };
      updatedData.rows[rowIdx].events = [...(row.events || []), newEvent];
    } else if (row.type === 'pianoroll' && row.notes) {
      const newNote = {
        id: newEventId,
        startTime: clickTimeSeconds,
        duration: 0.5,
        pitch: 60, // C4 in MIDI
        velocity: 0.8
      };
      updatedData.rows[rowIdx].notes = [...(row.notes || []), newNote];
    }

    setData(updatedData);
    onChange(updatedData);
    setSelectedRow(row.id);
    setSelectedEvent(newEventId);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingEvent) return;

    const deltaX = e.clientX - draggingEvent.startX;
    const deltaBeat = pixelsToBeat(deltaX);

    const updatedData = { ...data };
    const rowIdx = data.rows.findIndex(r => r.id === draggingEvent.rowId);
    if (rowIdx === -1) return;

    const row = updatedData.rows[rowIdx];

    if (draggingEvent.type === 'move') {
      const newStartTime = Math.max(0, draggingEvent.startTime + beatsToSeconds(deltaBeat));

      if (row.type === 'audio' && row.audioSegments) {
        const segIdx = row.audioSegments.findIndex(s => s.id === draggingEvent.eventId);
        if (segIdx !== -1) {
          row.audioSegments[segIdx].startTime = newStartTime;
        }
      } else if (row.type === 'event' && row.events) {
        const evtIdx = row.events.findIndex(e => e.id === draggingEvent.eventId);
        if (evtIdx !== -1) {
          row.events[evtIdx].startTime = newStartTime;
        }
      } else if (row.type === 'pianoroll' && row.notes) {
        const noteIdx = row.notes.findIndex(n => n.id === draggingEvent.eventId);
        if (noteIdx !== -1) {
          row.notes[noteIdx].startTime = newStartTime;
        }
      }
    } else if (draggingEvent.type === 'resizeEnd') {
      const newDuration = Math.max(0.1, draggingEvent.startTime + beatsToSeconds(deltaBeat));

      if (row.type === 'audio' && row.audioSegments) {
        const segIdx = row.audioSegments.findIndex(s => s.id === draggingEvent.eventId);
        if (segIdx !== -1) {
          row.audioSegments[segIdx].duration = newDuration;
        }
      } else if (row.type === 'event' && row.events) {
        const evtIdx = row.events.findIndex(e => e.id === draggingEvent.eventId);
        if (evtIdx !== -1) {
          row.events[evtIdx].duration = newDuration;
        }
      } else if (row.type === 'pianoroll' && row.notes) {
        const noteIdx = row.notes.findIndex(n => n.id === draggingEvent.eventId);
        if (noteIdx !== -1) {
          row.notes[noteIdx].duration = newDuration;
        }
      }
    }

    setData(updatedData);
    onChange(updatedData);
  };

  const handleCanvasMouseUp = () => {
    setDraggingEvent(null);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const currentTimeSeconds = data.currentPosition * data.duration;

  return (
    <div className="orchestrator-dialog">
      {/* Top bar */}
      <div className="orchestrator-top-bar">
        <h2>Orchestrator Editor - {nodeId}</h2>
        <div className="orchestrator-controls">
            <div className="time-display">
              {formatTime(currentTimeSeconds)} / {formatTime(data.duration)}
            </div>
            <div className="time-signature-control">
              <label>Time Signature:</label>
              <select
                value={data.timeSignature.beats}
                onChange={(e) => {
                  const beats = parseInt(e.target.value);
                  setData({
                    ...data,
                    timeSignature: { ...data.timeSignature, beats }
                  });
                }}
              >
                <option value="3">3/4</option>
                <option value="4">4/4</option>
                <option value="6">6/8</option>
              </select>
            </div>
            <div className="snap-control">
              <label>
                <input
                  type="checkbox"
                  checked={data.snapToGrid ?? true}
                  onChange={(e) =>
                    setData({ ...data, snapToGrid: e.target.checked })
                  }
                />
                Snap to Grid
              </label>
            </div>
            <div className="granularity-control">
              <label>Grid:</label>
              <select
                value={data.gridGranularity || 'quarter'}
                onChange={(e) =>
                  setData({
                    ...data,
                    gridGranularity: e.target.value as GridGranularityType
                  })
                }
              >
                <option value="beat">Beat</option>
                <option value="half">Half</option>
                <option value="quarter">Quarter</option>
                <option value="eighth">Eighth</option>
                <option value="sixteenth">Sixteenth</option>
              </select>
            </div>
            <div className="zoom-control">
              <button onClick={() => setZoomLevel(Math.max(20, zoomLevel - 10))}>−</button>
              <span>{zoomLevel}px/beat</span>
              <button onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}>+</button>
            </div>
          </div>
          <button onClick={onClose} className="close-button">
            ✕ Close
          </button>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="orchestrator-canvas-container"
          onWheel={handleScroll}
        >
          <div className="row-labels">
            {data.rows.map((row) => (
              <div key={row.id} className="row-label" style={{ height: '50px' }}>
                {row.label}
              </div>
            ))}
          </div>
          <canvas
            ref={canvasRef}
            className="orchestrator-canvas"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onDoubleClick={handleCanvasDoubleClick}
            style={{
              display: 'block',
              border: '1px solid #333',
              cursor: draggingEvent ? (draggingEvent.type === 'resizeEnd' ? 'ew-resize' : 'grab') : 'crosshair'
            }}
          />
          <div className="orchestrator-row-panel">
            <h3>Rows</h3>
            <button onClick={() => handleAddRow('audio')} style={{ background: '#4a9eff' }}>+ Audio Row</button>
            <button onClick={() => handleAddRow('event')} style={{ background: '#90ee90' }}>+ Event Row</button>
            <button onClick={() => handleAddRow('pianoroll')} style={{ background: '#dda0dd' }}>+ Piano Roll</button>
            <div className="row-list">
              {data.rows.map((row, idx) => (
                <div key={row.id} className="row-item">
                  <span>{row.label} ({row.type})</span>
                  <button onClick={() => handleDeleteRow(row.id)}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Properties Panel */}
          <div className="orchestrator-properties-panel">
            {selectedEventData && selectedRowData ? (
              <>
                <h3>Event Properties</h3>
                
                {selectedRowData.type === 'event' && (
                  <>
                    <div className="property-field">
                      <label>Frequency (Hz)</label>
                      <input
                        type="number"
                        value={(selectedEventData as any).frequency || 440}
                        onChange={(e) => handleUpdateEventProperty('frequency', parseFloat(e.target.value))}
                        min="20"
                        max="20000"
                        step="1"
                      />
                    </div>
                    <div className="property-field">
                      <label>Gate Value</label>
                      <input
                        type="number"
                        value={(selectedEventData as any).gateValue || 1}
                        onChange={(e) => handleUpdateEventProperty('gateValue', parseFloat(e.target.value))}
                        min="0"
                        max="1"
                        step="0.1"
                      />
                    </div>
                  </>
                )}

                {selectedRowData.type === 'pianoroll' && (
                  <>
                    <div className="property-field">
                      <label>MIDI Note (0-127)</label>
                      <input
                        type="number"
                        value={(selectedEventData as any).pitch || 60}
                        onChange={(e) => handleUpdateEventProperty('pitch', parseInt(e.target.value))}
                        min="0"
                        max="127"
                        step="1"
                      />
                    </div>
                    <div className="property-field">
                      <label>Velocity</label>
                      <input
                        type="number"
                        value={(selectedEventData as any).velocity || 0.8}
                        onChange={(e) => handleUpdateEventProperty('velocity', parseFloat(e.target.value))}
                        min="0"
                        max="1"
                        step="0.1"
                      />
                    </div>
                  </>
                )}

                {selectedRowData.type === 'audio' && (
                  <>
                    <div className="property-field">
                      <label>Audio Source</label>
                      <input
                        type="text"
                        value={(selectedEventData as any).audioSrc || ''}
                        onChange={(e) => handleUpdateEventProperty('audioSrc', e.target.value)}
                        placeholder="URL or path"
                      />
                    </div>
                    <div className="property-field">
                      <label>Speed</label>
                      <input
                        type="number"
                        value={(selectedEventData as any).speed || 1}
                        onChange={(e) => handleUpdateEventProperty('speed', parseFloat(e.target.value))}
                        min="0.1"
                        max="4"
                        step="0.1"
                      />
                    </div>
                    <div className="property-field">
                      <label>Volume</label>
                      <input
                        type="number"
                        value={(selectedEventData as any).volume || 1}
                        onChange={(e) => handleUpdateEventProperty('volume', parseFloat(e.target.value))}
                        min="0"
                        max="2"
                        step="0.1"
                      />
                    </div>
                    <div className="property-field">
                      <label>
                        <input
                          type="checkbox"
                          checked={(selectedEventData as any).reverse || false}
                          onChange={(e) => handleUpdateEventProperty('reverse', e.target.checked)}
                        />
                        {' '}Reverse
                      </label>
                    </div>
                  </>
                )}

                <div className="property-field">
                  <label>Start Time (s)</label>
                  <input
                    type="number"
                    value={(selectedEventData as any).startTime || 0}
                    onChange={(e) => handleUpdateEventProperty('startTime', parseFloat(e.target.value))}
                    min="0"
                    step="0.1"
                  />
                </div>

                <div className="property-field">
                  <label>Duration (s)</label>
                  <input
                    type="number"
                    value={(selectedEventData as any).duration || 1}
                    onChange={(e) => handleUpdateEventProperty('duration', parseFloat(e.target.value))}
                    min="0.1"
                    step="0.1"
                  />
                </div>

                <div className="property-field">
                  <button onClick={handleDeleteEvent}>Delete Event</button>
                </div>
              </>
            ) : (
              <div style={{ color: '#666', fontSize: '11px', textAlign: 'center', marginTop: '20px' }}>
                Select an event to edit properties
              </div>
            )}
          </div>
        </div>
      </div>
  );
};

export default OrchestratorDialog;
