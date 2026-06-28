#include "WasmNodeFactory.h"

#include <cstdint>
#include <vector>

#include "BinaryData.h"
#include "nodes/ReverbNode.h"
#include "synflow/nodes/WasmKarplusNode.h"
#include "synflow/nodes/WasmLadderNode.h"
#include "synflow/nodes/WasmNoiseNode.h"
#include "synflow/nodes/WasmSvfDriveNode.h"

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
        if (type == "ReverbFlowNode")
            return std::make_unique<ReverbNode>();
        return nullptr;
    };
}

} // namespace synflowplugin
