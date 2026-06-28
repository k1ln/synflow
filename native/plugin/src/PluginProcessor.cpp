#include "PluginProcessor.h"

#include <cmath>

#include "BinaryData.h"
#include "PluginEditor.h"
#include "WasmNodeFactory.h"
#include "synflow/FlowLoader.h"
#include "synflow/HostControls.h"
#include "synflow/Json.h"

using namespace synflow;

// Instrument build (IS_SYNTH) is a generator (FL channel rack): no main audio input,
// just MIDI -> audio. Effect build keeps the audio input (mixer / effect flows).
#if JucePlugin_IsSynth
SynflowAudioProcessor::SynflowAudioProcessor()
    : juce::AudioProcessor(BusesProperties()
                               .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
#else
SynflowAudioProcessor::SynflowAudioProcessor()
    : juce::AudioProcessor(BusesProperties()
                               .withInput("Input", juce::AudioChannelSet::stereo(), true)
                               .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
#endif
    // A fixed pool of generic 0..1 host parameters; each loaded flow binds its
    // exposed knobs to the first N slots (VST/AU need a stable param layout).
    for (int i = 0; i < kMaxKnobs; ++i) {
        auto* p = new juce::AudioParameterFloat(
            juce::ParameterID("k" + juce::String(i), 1),
            "Param " + juce::String(i + 1), juce::NormalisableRange<float>(0.0f, 1.0f), 0.0f);
        knobParams_[static_cast<size_t>(i)] = p;
        addParameter(p);
    }
    flowJson_ = juce::String::fromUTF8(BinaryData::default_flow_json, BinaryData::default_flow_jsonSize);
}

bool SynflowAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    const auto& out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo()) return false;
    // Universal player: an audio input is optional (effect flows use it,
    // instruments ignore it); when present it must match the output width.
    const auto& in = layouts.getMainInputChannelSet();
    return in.isDisabled() || in == out;
}

void SynflowAudioProcessor::loadFlow(const juce::String& json) {
    flowJson_ = json;
    const std::string js = json.toStdString();
    auto g = std::make_unique<AudioGraphManager>(RuntimeMode::Plugin);
    FlowLoadResult res = FlowLoader::loadInto(*g, js, static_cast<float>(sampleRate_),
                                              blockSize_, synflowplugin::makeShellFactory());
    flowName_ = juce::String(res.name);
    triggerNode_ = res.triggerNodeIndex; // node.data.isTrigger (flow-declared)
    pitchNode_ = res.pitchNodeIndex;     // node.data.isPitch
    pitchParam_ = res.pitchParam;
    nodeIndexById_ = res.nodeIndexById;
    midiMaps_ = res.midiMaps;

    // Build the control surface the webview renders: exposed knobs (bound to the
    // host-param pool) + the flow's Button nodes (momentary triggers).
    const JsonValue root = JsonParser::parse(js);
    const HostControls hc = extractHostControls(root);
    knobBindings_.clear();
    juce::String knobs = "[";
    int slot = 0;
    for (const ExposedKnob& k : hc.knobs) {
        if (slot >= kMaxKnobs) break;
        auto it = res.nodeIndexById.find(k.nodeId);
        if (it == res.nodeIndexById.end()) continue;
        knobBindings_.push_back({slot, it->second, k.param, static_cast<float>(k.min), static_cast<float>(k.max), -1.0f});
        knobParams_[static_cast<size_t>(slot)]->setValueNotifyingHost(static_cast<float>(k.norm()));
        if (slot) knobs += ",";
        knobs += "{\"slot\":" + juce::String(slot)
               + ",\"label\":" + juce::JSON::toString(juce::var(juce::String(k.label)))
               + ",\"min\":" + juce::String(k.min) + ",\"max\":" + juce::String(k.max)
               + ",\"value\":" + juce::String(k.defValue) + "}";
        ++slot;
    }
    knobs += "]";

    juce::String buttons = "[";
    int nbtn = 0;
    if (const JsonValue* nodes = root.find("nodes"); nodes && nodes->isArray()) {
        for (const JsonValue& n : nodes->arr) {
            const std::string t = n.find("type") ? n.find("type")->asString() : "";
            if (t != "ButtonFlowNode" && t != "OnOffButtonFlowNode" && t != "MouseTriggerButtonFlowNode") continue;
            const std::string id = n.find("id") ? n.find("id")->asString() : "";
            const JsonValue* data = n.find("data");
            const std::string label = (data && data->find("label")) ? data->find("label")->asString() : "Trigger";
            if (id.empty()) continue;
            if (nbtn) buttons += ",";
            buttons += "{\"id\":" + juce::JSON::toString(juce::var(juce::String(id)))
                     + ",\"label\":" + juce::JSON::toString(juce::var(juce::String(label))) + "}";
            ++nbtn;
        }
    }
    buttons += "]";
    controlsJson_ = "{\"knobs\":" + knobs + ",\"buttons\":" + buttons + "}";

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
    if (!graph_) { buffer.clear(); return; }

    // Capture host audio input (effect flows) as mono BEFORE we overwrite the
    // buffer. Instrument flows have no inputNode, so renderBlock ignores it.
    const int numIn = getTotalNumInputChannels();
    const float* inPtr = nullptr;
    if (numIn > 0) {
        if (static_cast<int>(monoIn_.size()) < numSamples) monoIn_.assign(static_cast<size_t>(numSamples), 0.0f);
        for (int i = 0; i < numSamples; ++i) {
            float s = 0.0f;
            for (int ch = 0; ch < numIn; ++ch) s += buffer.getSample(ch, i);
            monoIn_[static_cast<size_t>(i)] = s / static_cast<float>(numIn);
        }
        inPtr = monoIn_.data();
    }

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
            if (pitchNode_ >= 0) graph_->node(pitchNode_)->setNamedParam(pitchParam_, midiToHz(msg.getNoteNumber()));
            if (triggerNode_ >= 0) graph_->queueInputEvent(triggerNode_, 0, EventType::NoteOn, msg.getFloatVelocity(), off);
        } else if (msg.isNoteOff()) {
            if (triggerNode_ >= 0) graph_->queueInputEvent(triggerNode_, 0, EventType::NoteOff, 0.0, off);
        }

        // Route to the flow's own MIDI nodes (live "input steers it"):
        //   MidiButton (mapped note) -> NoteOn/Off trigger; MidiKnob (mapped CC)
        //   -> raw CC value the node maps + steers a param with.
        for (const auto& mm : midiMaps_) {
            if (mm.isNote && (msg.isNoteOn() || msg.isNoteOff()) && msg.getNoteNumber() == mm.number)
                graph_->queueInputEvent(mm.nodeIndex, 0, msg.isNoteOn() ? EventType::NoteOn : EventType::NoteOff, msg.getFloatVelocity(), off);
            else if (!mm.isNote && msg.isController() && msg.getControllerNumber() == mm.number)
                graph_->queueInputEvent(mm.nodeIndex, 0, EventType::Value, msg.getControllerValue(), off);
        }
    }

    // Apply any changed exposed-knob host params to the engine.
    for (auto& b : knobBindings_) {
        const float v01 = knobParams_[static_cast<size_t>(b.slot)]->get();
        if (v01 != b.lastApplied) {
            b.lastApplied = v01;
            graph_->node(b.nodeIndex)->setNamedParam(b.param, b.min + v01 * (b.max - b.min));
        }
    }

    if (static_cast<int>(scratch_.size()) < numSamples) scratch_.assign(static_cast<size_t>(numSamples), 0.0f);
    graph_->renderBlock(scratch_.data(), numSamples, inPtr, bpm, ppq, playing);

    buffer.clear();
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        buffer.copyFrom(ch, 0, scratch_.data(), numSamples);
}

void SynflowAudioProcessor::editorSetParam(const juce::String& nodeId, const juce::String& key, const juce::var& value) {
    if (!graph_) return;
    auto it = nodeIndexById_.find(nodeId.toStdString());
    if (it == nodeIndexById_.end()) return;
    auto* node = graph_->node(it->second);
    if (value.isString()) node->setNamedParamStr(key.toStdString(), value.toString().toStdString());
    else node->setNamedParam(key.toStdString(), static_cast<double>(value));
}

void SynflowAudioProcessor::editorNote(const juce::String& nodeId, bool noteOn, const juce::var& payload) {
    if (!graph_) return;
    auto it = nodeIndexById_.find(nodeId.toStdString());
    if (it == nodeIndexById_.end()) return;
    const double vel = payload.hasProperty("velocity") ? static_cast<double>(payload.getProperty("velocity", 1.0)) : 1.0;
    graph_->queueInputEvent(it->second, 0, noteOn ? EventType::NoteOn : EventType::NoteOff, vel, 0);
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
