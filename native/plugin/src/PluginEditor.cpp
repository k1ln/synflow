#include "PluginEditor.h"

#include "BinaryData.h"
#if SYNFLOW_HAS_EDITOR
#include "EditorBinaryData.h"
#endif

#if JUCE_WEB_BROWSER
using Options = juce::WebBrowserComponent::Options;

SynflowAudioProcessorEditor::SynflowAudioProcessorEditor(SynflowAudioProcessor& p)
    : juce::AudioProcessorEditor(&p),
      proc_(p),
      web_(Options{}
               .withNativeIntegrationEnabled()
               .withResourceProvider([this](const juce::String& path) { return provide(path); })
               .withInitialisationData("flowName", proc_.currentFlowName())
               .withInitialisationData("flowJson", proc_.currentFlowJson())
               .withInitialisationData("controls", proc_.exposedControlsJson())
               .withEventListener("setParam", [this](juce::var payload) {
                   const int slot = static_cast<int>(payload.getProperty("slot", -1));
                   const double v = static_cast<double>(payload.getProperty("value", 0.0));
                   const auto& params = proc_.getParameters();
                   if (slot >= 0 && slot < params.size())
                       params[slot]->setValueNotifyingHost(static_cast<float>(juce::jlimit(0.0, 1.0, v)));
               })
               // Edit-mode bridge: the in-webview Synflow editor (NativeFlowEngine)
               // ships graph + live changes to the C++ engine.
               .withEventListener("loadFlow", [this](juce::var payload) {
                   proc_.loadFlow(juce::JSON::toString(payload.getProperty("flow", juce::var())));
               })
               .withEventListener("setParamByName", [this](juce::var p) {
                   proc_.editorSetParam(p.getProperty("nodeId", "").toString(),
                                        p.getProperty("key", "").toString(),
                                        p.getProperty("value", juce::var()));
               })
               .withEventListener("noteOn", [this](juce::var p) {
                   proc_.editorNote(p.getProperty("nodeId", "").toString(), true, p.getProperty("payload", juce::var()));
               })
               .withEventListener("noteOff", [this](juce::var p) {
                   proc_.editorNote(p.getProperty("nodeId", "").toString(), false, p.getProperty("payload", juce::var()));
               })) {
    addAndMakeVisible(web_);
    web_.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    setResizable(true, true);
    setSize(900, 600);
}

void SynflowAudioProcessorEditor::resized() { web_.setBounds(getLocalBounds()); }

static juce::WebBrowserComponent::Resource makeResource(const char* data, int size, const char* mime) {
    const auto* d = reinterpret_cast<const std::byte*>(data);
    return { std::vector<std::byte>(d, d + size), juce::String(mime) };
}

static const char* mimeForFile(const juce::String& file) {
    if (file.endsWithIgnoreCase(".html")) return "text/html";
    if (file.endsWithIgnoreCase(".js") || file.endsWithIgnoreCase(".mjs")) return "text/javascript";
    if (file.endsWithIgnoreCase(".css")) return "text/css";
    if (file.endsWithIgnoreCase(".wasm")) return "application/wasm";
    if (file.endsWithIgnoreCase(".json")) return "application/json";
    if (file.endsWithIgnoreCase(".png")) return "image/png";
    if (file.endsWithIgnoreCase(".svg")) return "image/svg+xml";
    if (file.endsWithIgnoreCase(".woff2")) return "font/woff2";
    return "application/octet-stream";
}

std::optional<juce::WebBrowserComponent::Resource>
SynflowAudioProcessorEditor::provide(const juce::String& path) {
    const auto file = (path == "/") ? juce::String("index.html")
                                    : path.fromFirstOccurrenceOf("/", false, false);
    // Play panel (default view).
    if (file == "index.html")
        return makeResource(BinaryData::index_html, BinaryData::index_htmlSize, "text/html");
#if SYNFLOW_HAS_EDITOR
    // Edit-mode: serve ANY file from the embedded editor bundle by its original
    // filename — editor.html/js/css/png plus every lazy chunk Vite emitted (incl.
    // the AssemblyScript compiler chunk used to compile worklets inside the plugin).
    for (int i = 0; i < EditorBinaryData::namedResourceListSize; ++i) {
        if (file == juce::String(EditorBinaryData::originalFilenames[i])) {
            int size = 0;
            const char* data = EditorBinaryData::getNamedResource(EditorBinaryData::namedResourceList[i], size);
            if (data != nullptr)
                return makeResource(data, size, mimeForFile(file));
        }
    }
#endif
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
