#include "PluginEditor.h"

SynflowAudioProcessorEditor::SynflowAudioProcessorEditor(SynflowAudioProcessor& p)
    : juce::AudioProcessorEditor(&p), proc_(p) {
    title_.setText("Synflow", juce::dontSendNotification);
    title_.setFont(juce::FontOptions(28.0f, juce::Font::bold));
    title_.setJustificationType(juce::Justification::centred);
    addAndMakeVisible(title_);

    juce::String name = proc_.currentFlowName();
    subtitle_.setText(name.isNotEmpty() ? name : juce::String("native engine"), juce::dontSendNotification);
    subtitle_.setJustificationType(juce::Justification::centred);
    subtitle_.setColour(juce::Label::textColourId, juce::Colours::grey);
    addAndMakeVisible(subtitle_);

    setSize(420, 240);
}

void SynflowAudioProcessorEditor::paint(juce::Graphics& g) {
    g.fillAll(juce::Colour(0xff1b1b1f));
}

void SynflowAudioProcessorEditor::resized() {
    auto r = getLocalBounds().reduced(20);
    title_.setBounds(r.removeFromTop(120));
    subtitle_.setBounds(r.removeFromTop(40));
}
