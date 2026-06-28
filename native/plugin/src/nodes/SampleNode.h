#pragma once

#include <juce_audio_formats/juce_audio_formats.h>

#include <algorithm>
#include <memory>
#include <string>

#include "synflow/Node.h"

namespace synflowplugin {

// Bucket — VirtualSampleFlowNode (basic). Portable flows embed the sample as a
// base64 audio file in node.data.arrayBuffer; this decodes it (juce
// AudioFormatManager: WAV/AIFF/...) to a mono PCM buffer and plays it one-shot
// from the start on each NoteOn. Plugin-side (needs juce decoding).
// Refinements vs the web node: multi-segment triggers, loop modes, pitch/reverse.
class SampleNode : public synflow::INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 1; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "gain") gain_ = static_cast<float>(v);
    }
    void setNamedParamStr(const std::string& name, const std::string& value) override {
        if ((name == "arrayBuffer" || name == "audio" || name == "sample") && !value.empty()) decode(value);
    }

    void process(const synflow::ProcessContext& ctx) override {
        const int frames = ctx.frames;
        float* o = out[0].data();
        std::fill(o, o + frames, 0.0f);

        int ei = 0;
        const auto* ev = ctx.inEvents;
        const int len = buffer_.getNumSamples();
        const float* src = len > 0 ? buffer_.getReadPointer(0) : nullptr;
        for (int i = 0; i < frames; ++i) {
            while (ev && ei < static_cast<int>(ev->size()) && (*ev)[static_cast<size_t>(ei)].sampleOffset <= i) {
                if ((*ev)[static_cast<size_t>(ei)].type == synflow::EventType::NoteOn) { playPos_ = 0; playing_ = true; }
                ++ei;
            }
            if (playing_ && src && playPos_ < len) o[i] += src[playPos_++] * gain_;
            else playing_ = false;
        }
    }

private:
    void decode(const std::string& b64) {
        juce::MemoryOutputStream decoded;
        if (!juce::Base64::convertFromBase64(decoded, juce::String(b64))) return;
        juce::AudioFormatManager fm;
        fm.registerBasicFormats();
        auto stream = std::make_unique<juce::MemoryInputStream>(decoded.getData(), decoded.getDataSize(), false);
        std::unique_ptr<juce::AudioFormatReader> reader(fm.createReaderFor(std::move(stream)));
        if (!reader) return;
        const int n = static_cast<int>(reader->lengthInSamples);
        buffer_.setSize(1, n);
        reader->read(&buffer_, 0, n, 0, true, true); // sum to mono (ch 0)
        playing_ = false;
        playPos_ = 0;
    }

    juce::AudioBuffer<float> buffer_;
    int playPos_ = 0;
    bool playing_ = false;
    float gain_ = 1.0f;
};

} // namespace synflowplugin
