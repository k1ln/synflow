#pragma once

namespace synflow {

// How the native C++ engine is being driven. The same AudioGraphManager runs in
// both, but the host context differs and the engine adapts:
//
//   Standalone — a native app (e.g. the native DAW). The engine owns the audio
//                device and the transport/clock; it pulls its own time.
//   Plugin     — hosted inside another DAW as VST3/AU/AAX/CLAP. The host hands
//                us each processBlock + the playhead (tempo/ppq/playState); the
//                engine must NOT own the device or invent transport.
//
// The web build does not use this at all — @synflow/core stays on Web Audio,
// untouched. This enum exists only in the native engine.
enum class RuntimeMode {
    Standalone,
    Plugin,
};

inline const char* toString(RuntimeMode m) {
    return m == RuntimeMode::Standalone ? "Standalone" : "Plugin";
}

} // namespace synflow
