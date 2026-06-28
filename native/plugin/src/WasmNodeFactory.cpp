#include "WasmNodeFactory.h"

#include <cstdint>
#include <vector>

#include "BinaryData.h"
#include "synflow/nodes/WasmKarplusNode.h"
#include "synflow/nodes/WasmLadderNode.h"
#include "synflow/nodes/WasmNoiseNode.h"

namespace synflowplugin {
using namespace synflow;

static std::vector<uint8_t> bytes(const char* data, int size) {
    return std::vector<uint8_t>(reinterpret_cast<const uint8_t*>(data),
                                reinterpret_cast<const uint8_t*>(data) + size);
}

NodeFactoryFn makeWasmFactory() {
    return [](const std::string& type) -> std::unique_ptr<INode> {
        if (type == "KarplusFlowNode")
            return std::make_unique<WasmKarplusNode>(bytes(BinaryData::karplus_wasm, BinaryData::karplus_wasmSize));
        if (type == "LadderFilterFlowNode")
            return std::make_unique<WasmLadderNode>(bytes(BinaryData::ladder_wasm, BinaryData::ladder_wasmSize));
        if (type == "NoiseFlowNode")
            return std::make_unique<WasmNoiseNode>(bytes(BinaryData::noise_wasm, BinaryData::noise_wasmSize));
        return nullptr;
    };
}

} // namespace synflowplugin
