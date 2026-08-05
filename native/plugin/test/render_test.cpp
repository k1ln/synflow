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

#include <juce_audio_formats/juce_audio_formats.h>

#include "PluginProcessor.h"
#include "WasmNodeFactory.h"
#include "nodes/SampleNode.h"
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

    // Phase 4: an exposed knob is a real host-automatable parameter that drives
    // the engine. square-lead exposes Sustain (slot 2): sustain 0 -> the held
    // note decays to silence; sustain 1 -> it stays loud.
    bool knobOk = true;
    {
        std::string sl = readFileStr("../../packages/daw/flows/instruments/square-lead.json");
        if (sl.empty()) sl = readFileStr("packages/daw/flows/instruments/square-lead.json");
        if (sl.empty()) sl = readFileStr("../../../packages/daw/flows/instruments/square-lead.json");
        if (sl.empty()) { std::printf("[knob] square-lead.json not found -> SKIP\n"); }
        else {
            proc.loadFlow(juce::String::fromUTF8(sl.data(), static_cast<int>(sl.size())));
            const bool hasControls = proc.exposedControlsJson().contains("Sustain");
            const auto& params = proc.getParameters();
            auto sustainPeak = [&](float sv) -> double {
                if (params.size() > 2) params[2]->setValueNotifyingHost(sv); // Attack,Decay,Sustain,Release
                double peak = 0;
                for (int blk = 0; blk < 100; ++blk) {
                    juce::MidiBuffer midi;
                    if (blk == 0) midi.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
                    buf.clear();
                    proc.processBlock(buf, midi);
                    if (blk >= 70 && blk < 95) peak = std::max(peak, static_cast<double>(buf.getMagnitude(0, 0, BLK)));
                }
                return peak;
            };
            const double low = sustainPeak(0.0f);
            const double high = sustainPeak(1.0f);
            knobOk = hasControls && high > 0.1 && high > low * 4 + 0.01;
            std::printf("[knob] Sustain low(0)=%.4f high(1)=%.4f controls=%s -> %s\n",
                        low, high, hasControls ? "yes" : "NO", knobOk ? "PASS" : "FAIL");
        }
    }

    // Phase 5: universal player — an EFFECT flow processes host audio input
    // THROUGH the AudioProcessor (audio in -> engine inputNode -> out).
    bool effectOk = true;
    {
        std::string rj = readFileStr("../../packages/daw/flows/effects/reverb.json");
        if (rj.empty()) rj = readFileStr("packages/daw/flows/effects/reverb.json");
        if (rj.empty()) { std::printf("[effect-thru-plugin] reverb.json not found -> SKIP\n"); }
        else {
            proc.loadFlow(juce::String::fromUTF8(rj.data(), static_cast<int>(rj.size())));
            std::mt19937 rng(11);
            std::uniform_real_distribution<float> dist(-0.3f, 0.3f);
            double outPeak = 0;
            bool finite2 = true;
            for (int blk = 0; blk < 20; ++blk) {
                for (int ch = 0; ch < buf.getNumChannels(); ++ch)
                    for (int i = 0; i < BLK; ++i) buf.setSample(ch, i, dist(rng)); // host audio in
                juce::MidiBuffer midi;
                proc.processBlock(buf, midi);
                const float pk = buf.getMagnitude(0, 0, BLK); // output (dry+wet) overwrites buffer
                if (!std::isfinite(pk)) finite2 = false;
                outPeak = std::max(outPeak, static_cast<double>(pk));
            }
            effectOk = finite2 && outPeak > 0.01;
            std::printf("[effect-thru-plugin] reverb output peak=%.4f -> %s\n", outPeak, effectOk ? "PASS" : "FAIL");
        }
    }

    // Phase 6: the sampler decodes embedded base64 audio + plays it on trigger.
    bool sampleOk = true;
    {
        const int sampLen = 256;
        juce::AudioBuffer<float> wav(1, sampLen);
        for (int i = 0; i < sampLen; ++i) wav.setSample(0, i, std::sin(i * 0.1f) * 0.5f);
        juce::MemoryBlock wavBytes;
        {
            juce::WavAudioFormat fmt;
            std::unique_ptr<juce::AudioFormatWriter> w(
                fmt.createWriterFor(new juce::MemoryOutputStream(wavBytes, false), 48000.0, 1, 16, {}, 0));
            if (w) w->writeFromAudioSampleBuffer(wav, 0, sampLen);
        }
        const juce::String b64 = juce::Base64::toBase64(wavBytes.getData(), wavBytes.getSize());

        synflow::AudioGraphManager g(synflow::RuntimeMode::Plugin);
        auto sn = std::make_unique<synflowplugin::SampleNode>();
        sn->setNamedParamStr("arrayBuffer", b64.toStdString());
        const int si = g.addNode(std::move(sn));
        g.setMasterOutput(si, 0);
        g.prepare(SR, BLK);

        std::vector<float> out(static_cast<size_t>(sampLen * 2), 0.0f);
        g.queueInputEvent(si, 0, synflow::EventType::NoteOn, 1.0, 0);
        for (int i = 0; i < sampLen * 2; i += BLK)
            g.renderBlock(out.data() + i, std::min(BLK, sampLen * 2 - i), nullptr, 120.0, 0.0, true);

        double maxErr = 0;
        for (int i = 0; i < sampLen; ++i)
            maxErr = std::max(maxErr, std::abs(static_cast<double>(out[static_cast<size_t>(i)]) - wav.getSample(0, i)));
        sampleOk = maxErr < 0.001; // 16-bit WAV quantization tolerance
        std::printf("[sampler] decode+play maxErr=%.6f -> %s\n", maxErr, sampleOk ? "PASS" : "FAIL");
    }

    // Phase 7: a VibePlugin ".vstai" (AI VST) hosted as an AiVstFlowNode renders
    // through the plugin — MIDI note -> the module's noteOn -> audio out. The .vstai
    // ships the compiled WASM + params; we embed the wasm bytes in node.data.wasmBase64
    // exactly as the web editor would. Path via $SYNFLOW_VSTAI_TEST or a default; SKIP
    // if absent (the .vstai factory presets live in the VibePlugin repo, not vendored).
    bool vstaiOk = true;
    {
        const char* env = std::getenv("SYNFLOW_VSTAI_TEST");
        std::string vp = env ? env : "/Users/k/projects/VibePlugin/factory/plugins/additive-synth/additive.vstai";
        std::string vjson = readFileStr(vp);
        if (vjson.empty()) { std::printf("[vstai] %s not found -> SKIP\n", vp.c_str()); }
        else {
            const juce::var doc = juce::JSON::parse(juce::String::fromUTF8(vjson.data(), static_cast<int>(vjson.size())));
            const juce::String wasmB64 = doc.getProperty("wasmBase64", "").toString();
            const bool isInstr = static_cast<bool>(doc.getProperty("isInstrument", false));
            juce::var flow(new juce::DynamicObject());
            // node.data carries the module + (for a synth) the host-MIDI routing flags.
            auto* data = new juce::DynamicObject();
            data->setProperty("wasmBase64", wasmB64);
            // Param defaults ride in node.data as paramN (exactly what the web node writes).
            if (auto* ps = doc.getProperty("params", juce::var()).getArray())
                for (const auto& p : *ps)
                    data->setProperty("param" + juce::String((int) p.getProperty("index", 0)),
                                      (double) p.getProperty("value", p.getProperty("default", 0.0)));
            if (isInstr) { data->setProperty("isTrigger", true); data->setProperty("isPitch", true);
                           data->setProperty("pitchParam", "frequency"); data->setProperty("frequency", 220.0); }
            else data->setProperty("isInput", true); // effect insert: host audio flows into it
            auto* vnode = new juce::DynamicObject();
            vnode->setProperty("id", "vstai"); vnode->setProperty("type", "AiVstFlowNode");
            vnode->setProperty("data", juce::var(data));
            auto* mnode = new juce::DynamicObject();
            mnode->setProperty("id", "m"); mnode->setProperty("type", "MasterOutFlowNode");
            mnode->setProperty("data", juce::var(new juce::DynamicObject()));
            juce::Array<juce::var> nodes; nodes.add(juce::var(vnode)); nodes.add(juce::var(mnode));
            auto* edge = new juce::DynamicObject();
            edge->setProperty("source", "vstai"); edge->setProperty("sourceHandle", "output");
            edge->setProperty("target", "m"); edge->setProperty("targetHandle", "destination-input");
            juce::Array<juce::var> edges; edges.add(juce::var(edge));
            auto* root = new juce::DynamicObject();
            root->setProperty("name", "vstai"); root->setProperty("nodes", nodes); root->setProperty("edges", edges);
            proc.loadFlow(juce::JSON::toString(juce::var(root)));

            double onPeak = 0; bool vf = true;
            for (int blk = 0; blk < 120; ++blk) {
                juce::MidiBuffer midi;
                if (isInstr && blk == 0) midi.addEvent(juce::MidiMessage::noteOn(1, 57, static_cast<juce::uint8>(110)), 0);
                buf.clear();
                // For an effect, feed host audio so there's something to process.
                if (!isInstr) for (int ch = 0; ch < buf.getNumChannels(); ++ch)
                    for (int i = 0; i < BLK; ++i) buf.setSample(ch, i, std::sin(i * 0.25f) * 0.3f);
                proc.processBlock(buf, midi);
                const float pk = buf.getMagnitude(0, 0, BLK);
                if (!std::isfinite(pk)) vf = false;
                if (blk >= 5 && blk < 50) onPeak = std::max(onPeak, static_cast<double>(pk));
            }
            vstaiOk = vf && onPeak > 0.02;
            std::printf("[vstai] %s '%s' peak=%.4f -> %s\n", isInstr ? "synth" : "fx",
                        doc.getProperty("name", "").toString().toRawUTF8(), onPeak, vstaiOk ? "PASS" : "FAIL");
        }
    }

    const bool ok = sawOk && wasmOk && reverbOk && knobOk && effectOk && sampleOk && vstaiOk;
    std::printf("%s\n", ok ? "ALL PASS" : "FAILED");
    return ok ? 0 : 1;
}
