cmake_minimum_required(VERSION 3.22)
project(SynflowPlugin VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE is fetched at configure time (into the gitignored build dir). Pinned tag.
include(FetchContent)
FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)

# Universal player plugin: a synth that renders a Synflow flow JSON natively.
juce_add_plugin(Synflow
    PRODUCT_NAME "Synflow"
    COMPANY_NAME "Synflow"
    BUNDLE_ID com.synflow.player
    IS_SYNTH FALSE              # universal player: audio in + out + MIDI, so both
    NEEDS_MIDI_INPUT TRUE       # instrument flows (MIDI->audio) and effect flows
                               # (audio->audio) load in one plugin
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synf
    PLUGIN_CODE Sflw
    FORMATS AU VST3 Standalone)

# Embed the default flow + the wasm DSP modules (the SAME public/*.wasm the
# browser runs) -> BinaryData::default_flow_json / karplus_wasm / ladder_wasm /
# noise_wasm.
juce_add_binary_data(SynflowResources SOURCES
    resources/default_flow.json
    resources/karplus.wasm
    resources/ladder.wasm
    resources/noise.wasm
    resources/svf.wasm
    webui/index.html)

# Edit-mode editor bundle (the Synflow editor, built via `npm run build:plugin-ui`)
# in its OWN binary-data target + namespace, linked only by the plugin (keeps the
# render-test build fast). Embedded only if present.
set(EDITOR_DIR ${CMAKE_CURRENT_SOURCE_DIR}/webui/editor)
set(HAS_EDITOR FALSE)
if(EXISTS ${EDITOR_DIR}/editor.html AND EXISTS ${EDITOR_DIR}/editor.js)
    set(HAS_EDITOR TRUE)
    juce_add_binary_data(SynflowEditorBundle NAMESPACE EditorBinaryData HEADER_NAME EditorBinaryData.h SOURCES
        ${EDITOR_DIR}/editor.html
        ${EDITOR_DIR}/editor.js
        ${EDITOR_DIR}/editor.css
        ${EDITOR_DIR}/editor-exportPortableFlow.js
        ${EDITOR_DIR}/editor.png)
    message(STATUS "Synflow: embedding edit-mode editor bundle")
else()
    message(WARNING "Synflow: editor bundle missing (run `npm run build:plugin-ui`); edit mode disabled")
endif()

# wasmtime C API (fetched via ../third_party/fetch-wasmtime.sh) — only the plugin
# shell links it; the engine core stays wasm-free. Static-link it so the shipped
# plugin is self-contained (no dylib / rpath dependency).
set(WASMTIME_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/wasmtime)
if(APPLE)
    set(WASMTIME_LIBS ${WASMTIME_DIR}/lib/libwasmtime.a
        "-framework CoreFoundation" "-framework Security" "-framework SystemConfiguration")
else()
    set(WASMTIME_LIBS ${WASMTIME_DIR}/lib/libwasmtime.a pthread dl m)
endif()

target_sources(Synflow PRIVATE
    src/PluginProcessor.cpp
    src/PluginEditor.cpp
    src/WasmNodeFactory.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/src/AudioGraphManager.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/src/FlowLoader.cpp)

target_include_directories(Synflow PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/include
    ${WASMTIME_DIR}/include)

target_compile_definitions(Synflow PUBLIC
    JUCE_WEB_BROWSER=1   # webview GUI (serves the embedded page; DAW UI next)
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(Synflow
    PRIVATE
        SynflowResources
        ${WASMTIME_LIBS}
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)
if(HAS_EDITOR)
    target_link_libraries(Synflow PRIVATE SynflowEditorBundle)
    target_compile_definitions(Synflow PUBLIC SYNFLOW_HAS_EDITOR=1)
endif()

# Headless render test: drives the AudioProcessor with MIDI, no DAW needed.
juce_add_console_app(SynflowRenderTest PRODUCT_NAME "SynflowRenderTest")
target_sources(SynflowRenderTest PRIVATE
    test/render_test.cpp
    src/PluginProcessor.cpp
    src/PluginEditor.cpp
    src/WasmNodeFactory.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/src/AudioGraphManager.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/src/FlowLoader.cpp)
target_include_directories(SynflowRenderTest PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/include
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${WASMTIME_DIR}/include)
target_compile_definitions(SynflowRenderTest PUBLIC
    JUCE_WEB_BROWSER=1 JUCE_USE_CURL=0)
target_link_libraries(SynflowRenderTest
    PRIVATE
        SynflowResources
        ${WASMTIME_LIBS}
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)
