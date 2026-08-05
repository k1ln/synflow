cmake_minimum_required(VERSION 3.22)

# Auto-bumped by build-all.sh (-DSYNFLOW_VERSION=x.y.z) so each build carries a
# visible version (plugin info + in-GUI badge); defaults for plain cmake builds.
set(SYNFLOW_VERSION "0.1.0" CACHE STRING "Synflow plugin version")
project(SynflowPlugin VERSION ${SYNFLOW_VERSION} LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE is fetched at configure time (into the gitignored build dir). Pinned tag.
include(FetchContent)
FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)

# CLAP support: JUCE has no native CLAP target, so layer it on via the free-audio
# clap-juce-extensions (it fetches the CLAP SDK itself). Opt-in: -DSYNFLOW_CLAP=ON
# so the default build stays lean and offline-buildable. Adds a .clap from the same
# AudioProcessor as the VST3/AU.
option(SYNFLOW_CLAP "Build the CLAP format via clap-juce-extensions" OFF)
if(SYNFLOW_CLAP)
    FetchContent_Declare(clap-juce-extensions
        GIT_REPOSITORY https://github.com/free-audio/clap-juce-extensions.git
        GIT_TAG main
        GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(clap-juce-extensions)
endif()

# DAWs split instruments (FL channel rack) from effects (mixer) by the plugin's
# declared category, so the universal player ships in two flavours from the same
# code: an INSTRUMENT (IS_SYNTH, MIDI->audio, no audio input) and an EFFECT
# (audio->audio). -DSYNFLOW_INSTRUMENT=ON builds the instrument; default is the effect.
# Distinct name/code/bundle so both can be installed side by side.
option(SYNFLOW_INSTRUMENT "Build the instrument flavour (FL channel rack) instead of the effect" OFF)
if(SYNFLOW_INSTRUMENT)
    set(SYNFLOW_IS_SYNTH TRUE)
    set(SYNFLOW_NAME "Synflow")
    set(SYNFLOW_CODE "Sfin")
    set(SYNFLOW_BUNDLE com.synflow.instrument)
    message(STATUS "Synflow: building INSTRUMENT flavour (channel rack)")
else()
    set(SYNFLOW_IS_SYNTH FALSE)
    set(SYNFLOW_NAME "Synflow FX")
    set(SYNFLOW_CODE "Sflw")
    set(SYNFLOW_BUNDLE com.synflow.player)
endif()

juce_add_plugin(Synflow
    VERSION ${SYNFLOW_VERSION}
    PRODUCT_NAME "${SYNFLOW_NAME}"
    COMPANY_NAME "Synflow"
    BUNDLE_ID ${SYNFLOW_BUNDLE}
    IS_SYNTH ${SYNFLOW_IS_SYNTH}
    NEEDS_MIDI_INPUT TRUE       # both flavours accept MIDI (notes drive instrument flows)
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synf
    PLUGIN_CODE ${SYNFLOW_CODE}
    FORMATS AU VST3 Standalone)

# Emit a .clap from the same AudioProcessor (universal player -> instrument + effect).
if(SYNFLOW_CLAP)
    clap_juce_extensions_plugin(TARGET Synflow
        CLAP_ID "com.synflow.player"
        CLAP_FEATURES instrument audio-effect synthesizer)
    message(STATUS "Synflow: CLAP format enabled")
endif()

# Embed the default flow + the wasm DSP modules (the SAME public/*.wasm the
# browser runs) -> BinaryData::default_flow_json / karplus_wasm / ladder_wasm /
# noise_wasm.
juce_add_binary_data(SynflowResources SOURCES
    resources/default_flow.json
    resources/karplus.wasm
    resources/ladder.wasm
    resources/noise.wasm
    resources/svf.wasm
    resources/envgen.wasm
    resources/freqshifter.wasm
    resources/fm.wasm
    resources/wavetable.wasm
    resources/granular.wasm
    resources/hardsync.wasm
    webui/index.html)

# Edit-mode editor bundle (the Synflow editor, built via `npm run build:plugin-ui`)
# in its OWN binary-data target + namespace, linked only by the plugin (keeps the
# render-test build fast). Embedded only if present.
set(EDITOR_DIR ${CMAKE_CURRENT_SOURCE_DIR}/webui/editor)
set(HAS_EDITOR FALSE)
if(EXISTS ${EDITOR_DIR}/editor.html AND EXISTS ${EDITOR_DIR}/editor.js)
    set(HAS_EDITOR TRUE)
    # Embed EVERY file Vite emitted (editor.html/js/css/png + all lazy chunks, incl.
    # the AssemblyScript compiler chunk that powers in-plugin worklet compilation).
    # CONFIGURE_DEPENDS re-globs on build so new chunks are picked up automatically.
    file(GLOB EDITOR_FILES CONFIGURE_DEPENDS ${EDITOR_DIR}/*)
    juce_add_binary_data(SynflowEditorBundle NAMESPACE EditorBinaryData HEADER_NAME EditorBinaryData.h
        SOURCES ${EDITOR_FILES})
    list(LENGTH EDITOR_FILES EDITOR_FILE_COUNT)
    message(STATUS "Synflow: embedding edit-mode editor bundle (${EDITOR_FILE_COUNT} files)")
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
elseif(WIN32)
    # static wasmtime on MSVC + the Windows system libs it depends on
    set(WASMTIME_LIBS ${WASMTIME_DIR}/lib/wasmtime.lib
        ws2_32 advapi32 userenv ntdll shell32 ole32 bcrypt)
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
    JUCE_VST3_CAN_REPLACE_VST2=0
    SYNFLOW_VERSION_STRING=${SYNFLOW_VERSION})  # stringified in PluginEditor.cpp

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
