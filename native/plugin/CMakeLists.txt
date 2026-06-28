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
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Synf
    PLUGIN_CODE Sflw
    FORMATS AU VST3 Standalone)

# Embed the default flow (saw-lead) as a preset -> BinaryData::default_flow_json.
juce_add_binary_data(SynflowResources SOURCES resources/default_flow.json)

target_sources(Synflow PRIVATE
    src/PluginProcessor.cpp
    src/PluginEditor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/src/AudioGraphManager.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../engine/src/FlowLoader.cpp)

target_include_directories(Synflow PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../engine/include)

target_compile_definitions(Synflow PUBLIC
    JUCE_WEB_BROWSER=0   # webview GUI lands in a later M5 step
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(Synflow
    PRIVATE
        SynflowResources
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)
