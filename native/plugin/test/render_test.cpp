// Headless proof that the plugin renders: construct the AudioProcessor, send a
// MIDI note, and check it produces an enveloped tone that decays to silence after
// note-off — exercising the full host glue (MIDI -> events, transport, render,
// channel fan-out) without a DAW.
#include <cmath>
#include <cstdio>

#include "PluginProcessor.h"

int main() {
    juce::ScopedJuceInitialiser_GUI juceInit; // message manager for JUCE objects

    SynflowAudioProcessor proc;
    const double SR = 48000.0;
    const int BLK = 512;
    proc.prepareToPlay(SR, BLK);

    juce::AudioBuffer<float> buf(2, BLK);
    double peakDuringNote = 0, peakAfterRelease = 0;
    bool channelsMatch = true, finite = true;

    for (int blk = 0; blk < 200; ++blk) {
        juce::MidiBuffer midi;
        if (blk == 0)   midi.addEvent(juce::MidiMessage::noteOn(1, 69, static_cast<juce::uint8>(100)), 0);
        if (blk == 100) midi.addEvent(juce::MidiMessage::noteOff(1, 69), 0);
        buf.clear();
        proc.processBlock(buf, midi);

        const float pk = buf.getMagnitude(0, 0, BLK);
        if (!std::isfinite(pk)) finite = false;
        if (blk >= 10 && blk < 90) peakDuringNote = std::max<double>(peakDuringNote, pk);
        if (blk >= 160) peakAfterRelease = std::max<double>(peakAfterRelease, pk);
        for (int i = 0; i < BLK; ++i)
            if (buf.getSample(0, i) != buf.getSample(1, i)) channelsMatch = false;
    }

    const bool sawOk = finite && channelsMatch && peakDuringNote > 0.05 && peakAfterRelease < 1e-3;
    std::printf("[saw-lead] peakDuringNote=%.4f  peakAfterRelease=%.6f  stereoFanOut=%s  -> %s\n",
                peakDuringNote, peakAfterRelease, channelsMatch ? "ok" : "MISMATCH", sawOk ? "PASS" : "FAIL");

    // Phase 2: a wasm-backed flow (Noise via wasmtime) renders inside the plugin.
    const char* noiseFlow =
        R"JSON({"name":"Noise","nodes":[
          {"id":"n","type":"NoiseFlowNode","data":{"gain":0.5}},
          {"id":"m","type":"MasterOutFlowNode","data":{"isOutput":true}}],
         "edges":[{"source":"n","sourceHandle":"output","target":"m","targetHandle":"destination-input"}]})JSON";
    proc.loadFlow(juce::String::fromUTF8(noiseFlow));
    double noisePeak = 0;
    bool noiseFinite = true;
    for (int blk = 0; blk < 20; ++blk) {
        juce::MidiBuffer midi;
        buf.clear();
        proc.processBlock(buf, midi);
        const float pk = buf.getMagnitude(0, 0, BLK);
        if (!std::isfinite(pk)) noiseFinite = false;
        noisePeak = std::max<double>(noisePeak, pk);
    }
    const bool wasmOk = noiseFinite && noisePeak > 0.05;
    std::printf("[wasm Noise] peak=%.4f  -> %s\n", noisePeak, wasmOk ? "PASS" : "FAIL");

    const bool ok = sawOk && wasmOk;
    std::printf("%s\n", ok ? "ALL PASS" : "FAILED");
    return ok ? 0 : 1;
}
