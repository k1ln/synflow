// Headless proof that the plugin renders: construct the AudioProcessor, send a
// MIDI note, and check it produces an enveloped tone that decays to silence after
// note-off — exercising the full host glue (MIDI -> events, transport, render,
// channel fan-out) without a DAW.
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <random>
#include <sstream>
#include <thread>
#include <vector>

#include "PluginProcessor.h"
#include "WasmNodeFactory.h"
#include "synflow/AudioGraphManager.h"
#include "synflow/FlowLoader.h"

static std::string readFileStr(const std::string& p) {
    std::ifstream f(p);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

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

    // Phase 3: Reverb (juce::dsp::Convolution) at engine level — feed noise, then
    // silence; expect a decaying tail after the input stops (convolution active).
    bool reverbOk = true;
    {
        using namespace synflow;
        std::string rjson = readFileStr("../../packages/daw/flows/effects/reverb.json");
        if (rjson.empty()) rjson = readFileStr("packages/daw/flows/effects/reverb.json");
        if (rjson.empty()) rjson = readFileStr("../../../packages/daw/flows/effects/reverb.json");
        if (rjson.empty()) { std::printf("[reverb] reverb.json not found -> SKIP\n"); }
        else {
            AudioGraphManager g(RuntimeMode::Plugin);
            FlowLoader::loadInto(g, rjson, SR, BLK, synflowplugin::makeShellFactory());
            std::this_thread::sleep_for(std::chrono::milliseconds(400)); // let the IR load (async)

            std::mt19937 rng(7);
            std::uniform_real_distribution<float> dist(-0.3f, 0.3f);
            std::vector<float> in(BLK), out(BLK);
            const int inputBlocks = 200, totalBlocks = 360;
            double tailEnergy = 0;
            bool rfinite = true;
            for (int blk = 0; blk < totalBlocks; ++blk) {
                for (int i = 0; i < BLK; ++i) in[static_cast<size_t>(i)] = (blk < inputBlocks) ? dist(rng) : 0.0f;
                std::fill(out.begin(), out.end(), 0.0f);
                g.renderBlock(out.data(), BLK, in.data(), 120.0, 0.0, true);
                for (float x : out) if (!std::isfinite(x)) rfinite = false;
                if (blk >= inputBlocks + 30 && blk < inputBlocks + 120)
                    for (float x : out) tailEnergy += static_cast<double>(x) * x;
            }
            const double tailRms = std::sqrt(tailEnergy / (90.0 * BLK));
            reverbOk = rfinite && tailRms > 1e-4;
            std::printf("[reverb] tailRmsAfterInput=%.6f  -> %s\n", tailRms, reverbOk ? "PASS" : "FAIL");
        }
    }

    const bool ok = sawOk && wasmOk && reverbOk;
    std::printf("%s\n", ok ? "ALL PASS" : "FAILED");
    return ok ? 0 : 1;
}
