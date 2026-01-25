# First Steps — Quick Demo Tutorial

This short tutorial shows how to load the demo patch, press Play, and test a simple signal chain (MIDI → ADSR → Oscillator → Gain → Master). It assumes you have the app open in a browser and a MIDI controller available.

Overview of the demo patch (nodes & connections):
- `MidiFlowNote` (source of note on/off and frequency)
  - sends note events to `ADSRFlowNode` (main-input)
  - sends frequency to `OscillatorFlowNode` (frequency)
  - also forwards a raw `output` to `LogFlowNode` for debugging
- `ADSRFlowNode` → `GainFlowNode` (`gain` input)
- `OscillatorFlowNode` → `GainFlowNode` (`main-input`)
- `GainFlowNode` → `MasterOutFlowNode` (`destination-input`)
- `LogFlowNode` is attached to receive messages for debugging

Quick start steps

1. Connect your MIDI device and allow Web MIDI access in the browser when prompted.
2. Load the demo patch:
   - If your UI has an "Import" or "Load flow" option, paste the provided JSON (the object you shared) or save it as a `.json` file and load it.
   - After loading, you should see the nodes positioned roughly as in the patch.
3. Verify `MidiFlowNote` is using your device:
   - Open the `MidiFlowNote` node UI and set the `Device` dropdown to your controller (e.g. "Arturia MiniLab mkII").
   - If you don’t see devices, ensure Web MIDI permission was granted and the device is connected.
4. Press Play / start audio:
   - Click the app's Play/Start button (the control that resumes/starts the AudioContext). You may be prompted by the browser to allow audio playback.
5. Test a note from your MIDI keyboard:
   - Press a key. Expected behavior:
     - `MidiFlowNote` emits a note-on; `ADSRFlowNode` receives a trigger on its `main-input` and schedules the envelope.
     - `OscillatorFlowNode` receives the frequency and starts producing a waveform.
     - `GainFlowNode` is driven by the ADSR output and the oscillator audio; you should hear sound routed to `MasterOut`.
6. Inspect and tweak:
   - Open the `ADSRFlowNode` controls and change `attack`, `decay`, `sustain`, `release` to hear different articulations.
   - Adjust the oscillator `frequency` knob or the `freqMidiMapping` if you want to control it via a MIDI CC.
   - Use `LogFlowNode` to see message payloads (note numbers, velocities, frequency) for debugging.

Connecting a Button to ADSR (manual trigger)

- If you want to trigger the ADSR with an on-screen or external button instead of `MidiFlowNote`:
  1. Add or use a `ButtonFlowNode` or `MidiButtonFlowNode` in the flow.
  2. Connect its output (e.g., `main-output` or `output`) to the `ADSRFlowNode` `main-input`.
  3. For a `MidiButtonFlowNode`, right-click the node to start MIDI learn and press the physical control to map it.
  4. Press the button — `ADSR` should receive the trigger and the oscillator/gain chain will sound.

Saving and sharing

- Save or export the flow after you are happy with the patch so you can re-open it later. Use the app's Save / Export function to persist the JSON.

Troubleshooting

- No sound:
  - Ensure the app is un-muted and the browser AudioContext is started (press Play).
  - Verify node connections: `Oscillator` → `Gain` → `MasterOut`.
  - Check `GainFlowNode` gain value is non-zero.
- MIDI not working:
  - Confirm the browser supports Web MIDI and you allowed the page to access MIDI devices.
  - Try re-plugging the device and reloading the page.
- ADSR doesn't trigger:
  - Confirm `MidiFlowNote` sends its `note-on` events to `ADSRFlowNode` (inspect `LogFlowNode` to verify events).

Advanced ideas (next steps)

- Map a MIDI knob to the oscillator or gain (use `MidiKnob` nodes or `freqMidiMapping` on the oscillator).
- Add an LFO to modulate `detune` or `gain` for vibrato/tremolo.
- Use `SampleFlowNode` for sample playback and trigger it from the same MIDI triggers.

Demo patch JSON

- Use the JSON object you provided to import this exact patch into the app. If you want, I can write a small `demo-patch.json` file in the repo with that content so it's available from the project's `docs/` directory — tell me if you'd like me to add it.

If you'd like, I can:
- Save the JSON as `docs/demo-patch.json` in the repo now.
- Create an in-app quick tutorial overlay that highlights nodes and steps.

Which would you like next?