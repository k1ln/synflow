#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

// Minimal placeholder editor. The real GUI (the existing DAW UI in a webview)
// lands in a later M5 step; this keeps the plugin loadable + shows the flow name.
class SynflowAudioProcessorEditor : public juce::AudioProcessorEditor {
public:
    explicit SynflowAudioProcessorEditor(SynflowAudioProcessor&);
    void paint(juce::Graphics&) override;
    void resized() override;

private:
    SynflowAudioProcessor& proc_;
    juce::Label title_, subtitle_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SynflowAudioProcessorEditor)
};
