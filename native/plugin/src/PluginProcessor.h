#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <memory>
#include <vector>

#include "synflow/AudioGraphManager.h"

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

private:
    std::unique_ptr<synflow::AudioGraphManager> graph_;
    juce::String flowJson_, flowName_;
    int triggerNode_ = -1;          // node fed by host MIDI note gates (the ADSR)
    int pitchNode_ = -1;            // oscillator whose frequency follows MIDI pitch
    double sampleRate_ = 48000.0;
    int blockSize_ = 512;
    std::vector<float> scratch_;     // mono render buffer

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SynflowAudioProcessor)
};
