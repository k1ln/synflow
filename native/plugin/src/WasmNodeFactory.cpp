#include "WasmNodeFactory.h"

#include <cstdint>
#include <vector>

#include "BinaryData.h"
#include "nodes/ReverbNode.h"
#include "nodes/SampleNode.h"
#include "synflow/nodes/WasmKarplusNode.h"
#include "synflow/nodes/WasmLadderNode.h"
#include "synflow/nodes/WasmEnvGenNode.h"
#include "synflow/nodes/WasmFMNode.h"
#include "synflow/nodes/WasmGranularNode.h"
#include "synflow/nodes/WasmHardSyncNode.h"
#include "synflow/nodes/WasmFreqShifterNode.h"
#include "synflow/nodes/WasmNoiseNode.h"
#include "synflow/nodes/WasmSvfDriveNode.h"
#include "synflow/nodes/WasmWavetableNode.h"

namespace synflowplugin {
using namespace synflow;

static std::vector<uint8_t> bytes(const char* data, int size) {
    return std::vector<uint8_t>(reinterpret_cast<const uint8_t*>(data),
                                reinterpret_cast<const uint8_t*>(data) + size);
}

NodeFactoryFn makeShellFactory() {
    return [](const std::string& type) -> std::unique_ptr<INode> {
        if (type == "KarplusFlowNode")
            return std::make_unique<WasmKarplusNode>(bytes(BinaryData::karplus_wasm, BinaryData::karplus_wasmSize));
        if (type == "LadderFilterFlowNode")
            return std::make_unique<WasmLadderNode>(bytes(BinaryData::ladder_wasm, BinaryData::ladder_wasmSize));
        if (type == "NoiseFlowNode")
            return std::make_unique<WasmNoiseNode>(bytes(BinaryData::noise_wasm, BinaryData::noise_wasmSize));
        if (type == "SvfDriveFilterFlowNode")
            return std::make_unique<WasmSvfDriveNode>(bytes(BinaryData::svf_wasm, BinaryData::svf_wasmSize));
        if (type == "EnvGenFlowNode")
            return std::make_unique<WasmEnvGenNode>(bytes(BinaryData::envgen_wasm, BinaryData::envgen_wasmSize));
        if (type == "AudioSignalFreqShifterFlowNode" || type == "FrequencyShifterFlowNode")
            return std::make_unique<WasmFreqShifterNode>(bytes(BinaryData::freqshifter_wasm, BinaryData::freqshifter_wasmSize));
        if (type == "FMFlowNode")
            return std::make_unique<WasmFMNode>(bytes(BinaryData::fm_wasm, BinaryData::fm_wasmSize));
        if (type == "WavetableFlowNode")
            return std::make_unique<WasmWavetableNode>(bytes(BinaryData::wavetable_wasm, BinaryData::wavetable_wasmSize));
        if (type == "GranularFlowNode")
            return std::make_unique<WasmGranularNode>(bytes(BinaryData::granular_wasm, BinaryData::granular_wasmSize));
        if (type == "AudioWorkletOscillatorFlowNode")
            return std::make_unique<WasmHardSyncNode>(bytes(BinaryData::hardsync_wasm, BinaryData::hardsync_wasmSize));
        if (type == "ReverbFlowNode")
            return std::make_unique<ReverbNode>();
        if (type == "SampleFlowNode" || type == "AudioBufferSourceFlowNode")
            return std::make_unique<SampleNode>();
        return nullptr;
    };
}

} // namespace synflowplugin
