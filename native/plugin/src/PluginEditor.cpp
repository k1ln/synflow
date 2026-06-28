#include "PluginEditor.h"

#include "BinaryData.h"

#if JUCE_WEB_BROWSER
using Options = juce::WebBrowserComponent::Options;

SynflowAudioProcessorEditor::SynflowAudioProcessorEditor(SynflowAudioProcessor& p)
    : juce::AudioProcessorEditor(&p),
      proc_(p),
      web_(Options{}
               .withNativeIntegrationEnabled()
               .withResourceProvider([this](const juce::String& path) { return provide(path); })
               .withInitialisationData("flowName", proc_.currentFlowName())
               .withInitialisationData("flowJson", proc_.currentFlowJson())) {
    addAndMakeVisible(web_);
    web_.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    setResizable(true, true);
    setSize(900, 600);
}

void SynflowAudioProcessorEditor::resized() { web_.setBounds(getLocalBounds()); }

std::optional<juce::WebBrowserComponent::Resource>
SynflowAudioProcessorEditor::provide(const juce::String& path) {
    const auto file = (path == "/") ? juce::String("index.html")
                                    : path.fromFirstOccurrenceOf("/", false, false);
    if (file == "index.html") {
        const auto* d = reinterpret_cast<const std::byte*>(BinaryData::index_html);
        return juce::WebBrowserComponent::Resource{
            std::vector<std::byte>(d, d + BinaryData::index_htmlSize), "text/html"};
    }
    return std::nullopt;
}

#else // webview backend unavailable -> simple label

SynflowAudioProcessorEditor::SynflowAudioProcessorEditor(SynflowAudioProcessor& p)
    : juce::AudioProcessorEditor(&p), proc_(p) {
    fallback_.setText("Synflow — " + proc_.currentFlowName(), juce::dontSendNotification);
    fallback_.setJustificationType(juce::Justification::centred);
    addAndMakeVisible(fallback_);
    setSize(420, 200);
}

void SynflowAudioProcessorEditor::resized() { fallback_.setBounds(getLocalBounds()); }

#endif
