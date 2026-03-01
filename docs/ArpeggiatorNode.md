# Arpeggiator Node

The Arpeggiator node creates arpeggiated patterns from an incoming frequency signal, triggered by a clock input.

## Features

- **Clock-driven**: Receives clock pulses to advance through the arpeggio pattern
- **Independent frequency input**: Base frequency can change dynamically during arpeggiation
- **Configurable note count**: 1-9 notes per arpeggio
- **Multiple arpeggio modes**: Various patterns for musical expression
- **Octave spread control**: Adjust the range of arpeggiated notes

## Inputs

### clock-input (orange handle, left side, top)
- Receives clock pulses from a Clock node or other timing source
- Each pulse advances the arpeggiator to the next step in the pattern
- BPM/speed metadata is extracted if provided

### freq-input (green handle, left side, middle)
- Receives the base frequency for arpeggiation
- Can be connected to Frequency nodes, MIDI nodes, or other frequency sources
- Frequency changes take effect immediately without interrupting the pattern

### reset-input (red handle, left side, bottom)
- Resets the arpeggiator to step 0
- Useful for synchronizing with other sequencers or starting fresh

## Output

### main-output (blue handle, right side)
- Emits arpeggiated frequency values on each clock pulse
- Can be connected to oscillator frequency inputs, ADSR triggers, etc.
- Payload includes:
  - `frequency`: The current arpeggiated frequency (Hz)
  - `value`: Same as frequency (for compatibility)
  - `step`: Current step index (0-based)
  - `bpm`: BPM from clock input (if available)
  - `nodeId`: ID of the arpeggiator node

## Parameters

### Notes (1-9)
- Number of notes in the arpeggio
- Range: 1-9 notes
- Default: 4

### Pattern
Available modes:
- **Ascending**: Notes played from low to high, then repeat
- **Descending**: Notes played from high to low, then repeat
- **Up-Down (no repeat)**: Ping-pong pattern without repeating the top/bottom notes
- **Down-Up (no repeat)**: Reverse ping-pong without repeating endpoints
- **Up-Down (repeat)**: Ping-pong pattern repeating the top/bottom notes
- **Down-Up (repeat)**: Reverse ping-pong repeating endpoints
- **Chord (all notes)**: Cycles through all notes (can be used to emit all simultaneously)
- **Random**: Randomly selects notes from the arpeggio
- **Random Walk**: Moves up or down one step randomly (creates smoother random melodies)

### Octave Spread
- Controls how many octaves the arpeggio spans
- Range: 0.25 to 4 octaves
- Default: 1 octave
- 0.25 = quarter octave (3 semitones)
- 1 = one octave (12 semitones)
- 2 = two octaves (24 semitones)

## Usage Example

### Basic Arpeggio
1. Create a Clock node and set the BPM
2. Create a Frequency node with your base note (e.g., A4 = 440Hz)
3. Create an Arpeggiator node
4. Connect Clock → Arpeggiator clock-input
5. Connect Frequency → Arpeggiator freq-input
6. Connect Arpeggiator → Oscillator frequency input
7. Connect Arpeggiator → ADSR trigger to create note envelopes

### Dynamic Chord Changes
1. Use a Sequencer node to output different frequencies
2. Connect Sequencer → Arpeggiator freq-input
3. The arpeggio pattern will update to the new base frequency each time the sequencer changes

### Synced Multi-Arpeggiator
1. Use one Clock node
2. Create multiple Arpeggiators with different settings
3. Connect the same Clock to all Arpeggiators
4. Each will stay in sync but can have different note counts and patterns

## Tips

- Use "Chord" mode with a very fast clock to create thick chord textures
- Combine "Random Walk" mode with longer note counts for ambient, evolving patterns
- Set Octave Spread to 2+ for dramatic, wide-ranging arpeggios
- Connect the reset-input to a button for manual pattern restart
- Use multiple Arpeggiators at different octave spreads for layered sounds

## Technical Notes

- The arpeggiator calculates note frequencies using equal temperament tuning (A4 = 440Hz)
- Notes are spaced evenly across the octave spread using semitone intervals
- Frequency changes on freq-input do not reset the current step position
- Clock BPM metadata is passed through to downstream nodes
- Pattern state persists across flow saves/loads
