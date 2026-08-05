#include "PluginEditor.h"

#include <thread>

#include "BinaryData.h"
#if SYNFLOW_HAS_EDITOR
#include "EditorBinaryData.h"
#endif

// Plugin version, injected by CMake (-DSYNFLOW_VERSION, auto-bumped by build-all.sh).
// Stringify so the unquoted x.y.z define becomes a C string literal. Fallback keeps
// other targets (render test) building.
#ifndef SYNFLOW_VERSION_STRING
#define SYNFLOW_VERSION_STRING 0.0.0
#endif
#define SYNFLOW_STR2(x) #x
#define SYNFLOW_STR(x) SYNFLOW_STR2(x)

#if JUCE_WEB_BROWSER
using Options = juce::WebBrowserComponent::Options;

// The public VibePlugin gallery (GitHub Pages): an index of AI-generated .vstai
// plugins + the .vstai documents themselves. We fetch it in C++ because the JUCE
// webview's resource-provider origin can't reliably issue cross-origin fetches (the
// web app fetches the same URLs directly). Sends CORS *, so no proxy is needed.
static constexpr const char* kGalleryBase = "https://k1ln.github.io/VibePlugin/gallery";

// Blocking HTTP GET -> body (empty on any non-2xx / failure). Call OFF the message thread.
static juce::String fetchUrlBody(const juce::String& url, int timeoutMs) {
    int status = 0;
    auto opts = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inAddress)
                    .withConnectionTimeoutMs(timeoutMs)
                    .withStatusCode(&status);
    if (auto in = juce::URL(url).createInputStream(opts)) {
        const juce::String body = in->readEntireStreamAsString();
        if (status >= 200 && status < 300) return body;
    }
    return {};
}

SynflowAudioProcessorEditor::SynflowAudioProcessorEditor(SynflowAudioProcessor& p)
    : juce::AudioProcessorEditor(&p),
      proc_(p),
      web_(Options{}
               .withNativeIntegrationEnabled()
               .withResourceProvider([this](const juce::String& path) { return provide(path); })
               .withInitialisationData("flowName", proc_.currentFlowName())
               .withInitialisationData("flowJson", proc_.currentFlowJson())
               .withInitialisationData("controls", proc_.exposedControlsJson())
               .withInitialisationData("version", SYNFLOW_STR(SYNFLOW_VERSION_STRING))
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
               })
               // On-screen piano / computer keyboard (play panel + editor): play a
               // MIDI note through the same routing the DAW's MIDI uses.
               .withEventListener("playNote", [this](juce::var p) {
                   proc_.hostNote(static_cast<int>(p.getProperty("note", 60)), true,
                                  static_cast<double>(p.getProperty("velocity", 1.0)));
               })
               .withEventListener("stopNote", [this](juce::var p) {
                   proc_.hostNote(static_cast<int>(p.getProperty("note", 60)), false, 0.0);
               })
               // Gallery browser (AiVstFlowNode): fetch the VibePlugin catalogue and
               // download a chosen .vstai, returning JSON to the webview to embed in
               // the node. Runs on a worker thread; completes on the message thread.
               .withNativeFunction("galleryIndex", [this](const juce::Array<juce::var>&,
                                                          juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                   juce::Component::SafePointer<SynflowAudioProcessorEditor> sp(this);
                   std::thread([sp, complete = std::move(complete)]() mutable {
                       const juce::String body = fetchUrlBody(juce::String(kGalleryBase) + "/data/index.json", 15000);
                       juce::MessageManager::callAsync([sp, complete = std::move(complete), body]() mutable {
                           if (sp == nullptr) return;
                           auto* o = new juce::DynamicObject();
                           if (body.isNotEmpty()) { o->setProperty("ok", true); o->setProperty("items", juce::JSON::parse(body)); }
                           else { o->setProperty("ok", false); o->setProperty("message", "Could not reach the gallery."); }
                           complete(juce::var(o));
                       });
                   }).detach();
               })
               .withNativeFunction("galleryLoad", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                   const juce::String slug = args.size() > 0 ? args[0].toString().trim() : juce::String();
                   juce::Component::SafePointer<SynflowAudioProcessorEditor> sp(this);
                   std::thread([sp, slug, complete = std::move(complete)]() mutable {
                       juce::String body;
                       if (slug.isNotEmpty())
                           body = fetchUrlBody(juce::String(kGalleryBase) + "/data/"
                                               + juce::URL::addEscapeChars(slug, false) + ".vstai", 20000);
                       juce::MessageManager::callAsync([sp, complete = std::move(complete), body]() mutable {
                           if (sp == nullptr) return;
                           auto* o = new juce::DynamicObject();
                           o->setProperty("ok", body.isNotEmpty());
                           if (body.isNotEmpty()) o->setProperty("json", body);
                           else o->setProperty("message", "Download failed.");
                           complete(juce::var(o));
                       });
                   }).detach();
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
