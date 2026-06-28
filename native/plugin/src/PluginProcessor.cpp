#include "PluginProcessor.h"

#include <cmath>

#include "BinaryData.h"
#include "PluginEditor.h"
#include "WasmNodeFactory.h"
#include "synflow/FlowLoader.h"
#include "synflow/Json.h"
#include "synflow/nodes/ADSRNode.h"
#include "synflow/nodes/OscillatorNode.h"

using namespace synflow;

SynflowAudioProcessor::SynflowAudioProcessor()
    : juce::AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
    flowJson_ = juce::String::fromUTF8(BinaryData::default_flow_json, BinaryData::default_flow_jsonSize);
}

bool SynflowAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    const auto& out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo()) return false;
    return layouts.getMainInputChannelSet().isDisabled(); // synth: no audio input
}

void SynflowAudioProcessor::loadFlow(const juce::String& json) {
    flowJson_ = json;
    auto g = std::make_unique<AudioGraphManager>(RuntimeMode::Plugin);
    FlowLoadResult res = FlowLoader::loadInto(*g, json.toStdString(), static_cast<float>(sampleRate_),
                                              blockSize_, synflowplugin::makeWasmFactory());
    flowName_ = juce::String(res.name);

    // Find the host-note targets: the ADSR gate trigger and a pitch oscillator.
    triggerNode_ = pitchNode_ = -1;
    for (int i = 0; i < g->size(); ++i) {
        if (triggerNode_ < 0 && dynamic_cast<ADSRNode*>(g->node(i))) triggerNode_ = i;
        if (pitchNode_ < 0 && dynamic_cast<OscillatorNode*>(g->node(i))) pitchNode_ = i;
    }
    graph_ = std::move(g);
}

void SynflowAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    scratch_.assign(static_cast<size_t>(samplesPerBlock), 0.0f);
    loadFlow(flowJson_);
}

static inline double midiToHz(int note) { return 440.0 * std::pow(2.0, (note - 69) / 12.0); }

void SynflowAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
    juce::ScopedNoDenormals noDenormals;
    const int numSamples = buffer.getNumSamples();
    buffer.clear();
    if (!graph_) return;

    // Transport from the host playhead (Plugin mode: we never invent it).
    double bpm = 120.0, ppq = 0.0;
    bool playing = false;
    if (auto* ph = getPlayHead()) {
        if (auto pos = ph->getPosition()) {
            if (auto b = pos->getBpm()) bpm = *b;
            if (auto p = pos->getPpqPosition()) ppq = *p;
            playing = pos->getIsPlaying();
        }
    }

    // MIDI notes -> sample-accurate gate events (+ monophonic pitch follow).
    for (const auto meta : midi) {
        const auto msg = meta.getMessage();
        const int off = meta.samplePosition;
        if (msg.isNoteOn()) {
            if (pitchNode_ >= 0) graph_->node(pitchNode_)->setNamedParam("frequency", midiToHz(msg.getNoteNumber()));
            if (triggerNode_ >= 0) graph_->queueInputEvent(triggerNode_, 0, EventType::NoteOn, msg.getFloatVelocity(), off);
        } else if (msg.isNoteOff()) {
            if (triggerNode_ >= 0) graph_->queueInputEvent(triggerNode_, 0, EventType::NoteOff, 0.0, off);
        }
    }

    if (static_cast<int>(scratch_.size()) < numSamples) scratch_.assign(static_cast<size_t>(numSamples), 0.0f);
    graph_->renderBlock(scratch_.data(), numSamples, nullptr, bpm, ppq, playing);

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        buffer.copyFrom(ch, 0, scratch_.data(), numSamples);
}

void SynflowAudioProcessor::getStateInformation(juce::MemoryBlock& dest) {
    dest.replaceAll(flowJson_.toRawUTF8(), flowJson_.getNumBytesAsUTF8());
}

void SynflowAudioProcessor::setStateInformation(const void* data, int sizeInBytes) {
    const juce::String json = juce::String::fromUTF8(static_cast<const char*>(data), sizeInBytes);
    if (json.isNotEmpty()) loadFlow(json);
}

juce::AudioProcessorEditor* SynflowAudioProcessor::createEditor() {
    return new SynflowAudioProcessorEditor(*this);
}

// JUCE plugin entry point.
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    return new SynflowAudioProcessor();
}
