#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include <optional>

#include "PluginProcessor.h"

// The plugin GUI is a webview (the path toward reusing the existing DAW UI). For
// now it serves an embedded page that shows the loaded flow via the JS<->C++
// bridge, proving WebBrowserComponent + the resource provider + data injection
// work inside the plugin. The full DAW UI (in "native mode", no Web Audio) is the
// next step. Falls back to a label if the webview backend isn't available.
class SynflowAudioProcessorEditor : public juce::AudioProcessorEditor {
public:
    explicit SynflowAudioProcessorEditor(SynflowAudioProcessor&);
    void resized() override;

private:
    SynflowAudioProcessor& proc_;

#if JUCE_WEB_BROWSER
    std::optional<juce::WebBrowserComponent::Resource> provide(const juce::String& path);
    juce::WebBrowserComponent web_;
#else
    juce::Label fallback_;
#endif

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SynflowAudioProcessorEditor)
};
