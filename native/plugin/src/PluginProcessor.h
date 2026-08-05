#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <array>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "synflow/AudioGraphManager.h"
#include "synflow/FlowLoader.h"

// M5 — JUCE plugin shell. Wraps the native AudioGraphManager (RuntimeMode::Plugin)
// in an AudioProcessor: the host hands us processBlock + playhead, we render the
// flow's audio in C++ and translate incoming MIDI notes into sample-accurate
// gate events for the instrument's trigger node. Plugin state = the flow JSON.
class SynflowAudioProcessor : public juce::AudioProcessor {
public:
    SynflowAudioProcessor();
    ~SynflowAudioProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Synflow"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    // (Re)build the native graph from a flow JSON. Thread: message thread only.
    void loadFlow(const juce::String& json);
    juce::String currentFlowName() const { return flowName_; }
    juce::String currentFlowJson() const { return flowJson_; }

    // The flow's exposed controls, as JSON, for the webview to render (label/
    // range/value/slot per knob). Slot == the host parameter it's bound to.
    juce::String exposedControlsJson() const { return controlsJson_; }

    // Editor (edit-mode) bridge — called from the webview event listeners.
    // Set any node param by flow-node id (number or string value).
    void editorSetParam(const juce::String& nodeId, const juce::String& key, const juce::var& value);
    // Live note from the editor keyboard: gate the flow's trigger node by id.
    void editorNote(const juce::String& nodeId, bool noteOn, const juce::var& payload);
    // Play a MIDI note from the webview (on-screen piano / computer keyboard) via
    // the SAME routing host MIDI uses (pitchNode_ + triggerNode_), so the in-GUI
    // keyboard is identical to playing from the DAW.
    void hostNote(int midiNote, bool noteOn, double velocity);

private:
    // A generic host parameter (0..1) the loaded flow binds an exposed knob to.
    struct KnobBinding {
        int slot = -1;          // index into knobParams_
        int nodeIndex = -1;     // engine node the param drives
        std::string param;      // node param name
        float min = 0, max = 1;
        float lastApplied = -1; // avoid re-applying unchanged values
    };

    static constexpr int kMaxKnobs = 24;

    // Guards the live graph + its derived routing (graph_/triggerNode_/pitchNode_/
    // pitchParam_/midiMaps_/knobBindings_) against concurrent access: loadFlow and
    // the editor bridge mutate them on the message thread while processBlock renders
    // on the audio thread. processBlock try-locks (renders silence on the rare miss);
    // message-thread writers take the blocking lock for the brief swap.
    juce::SpinLock graphLock_;
    std::unique_ptr<synflow::AudioGraphManager> graph_;
    juce::String flowJson_, flowName_, controlsJson_;
    std::map<std::string, int> nodeIndexById_; // flow node id -> graph index (for editor edits)
    std::array<juce::AudioParameterFloat*, kMaxKnobs> knobParams_{};
    std::vector<KnobBinding> knobBindings_;
    int triggerNode_ = -1;          // node.data.isTrigger (host MIDI note gate)
    int pitchNode_ = -1;            // node.data.isPitch (follows MIDI pitch)
    std::string pitchParam_ = "frequency";
    std::vector<synflow::FlowLoadResult::MidiMap> midiMaps_; // MidiKnob/MidiButton routing
    double sampleRate_ = 48000.0;
    int blockSize_ = 512;
    std::vector<float> scratch_;     // mono render buffer
    std::vector<float> monoIn_;      // mono host input (effect flows)

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SynflowAudioProcessor)
};
