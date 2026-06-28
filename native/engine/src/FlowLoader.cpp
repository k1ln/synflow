#include "synflow/FlowLoader.h"

#include <map>
#include <memory>

#include "synflow/Json.h"
#include "synflow/nodes/BiquadFilterNode.h"
#include "synflow/nodes/ChorusNode.h"
#include "synflow/nodes/DelayNode.h"
#include "synflow/nodes/DistortionNode.h"
#include "synflow/nodes/DynamicCompressorNode.h"
#include "synflow/nodes/GainNode.h"
#include "synflow/nodes/MasterOutNode.h"
#include "synflow/nodes/OscillatorNode.h"
#include "synflow/nodes/PassthroughNode.h"

namespace synflow {

namespace {

// type string -> INode. Mirrors the TS VirtualNodeFactory switch. Returns
// nullptr for unknown types so the loader can count + stub them.
std::unique_ptr<INode> makeNode(const std::string& type) {
    if (type == "OscillatorFlowNode") return std::make_unique<OscillatorNode>();
    if (type == "GainFlowNode") return std::make_unique<GainNode>();
    if (type == "MasterOutFlowNode") return std::make_unique<MasterOutNode>();
    if (type == "BiquadFilterFlowNode") return std::make_unique<BiquadFilterNode>();
    if (type == "DelayFlowNode") return std::make_unique<DelayNode>();
    if (type == "DistortionFlowNode") return std::make_unique<DistortionNode>();
    if (type == "DynamicCompressorFlowNode") return std::make_unique<DynamicCompressorNode>();
    if (type == "ChorusFlowNode") return std::make_unique<ChorusNode>();
    return nullptr;
}

} // namespace

FlowLoadResult FlowLoader::loadInto(AudioGraphManager& graph, const std::string& jsonText,
                                    float sampleRate, int maxBlock) {
    FlowLoadResult result;
    const JsonValue root = JsonParser::parse(jsonText);

    if (const JsonValue* name = root.find("name")) result.name = name->asString();

    std::map<std::string, int> idToIndex;
    std::map<int, INode*> indexToNode;
    int masterIndex = -1;
    int inputIndex = -1;

    // --- nodes ---
    if (const JsonValue* nodes = root.find("nodes"); nodes && nodes->isArray()) {
        for (const JsonValue& n : nodes->arr) {
            const std::string id = n.find("id") ? n.find("id")->asString() : "";
            const std::string type = n.find("type") ? n.find("type")->asString() : "";

            std::unique_ptr<INode> node = makeNode(type);
            const bool supported = node != nullptr;
            if (!supported) { node = std::make_unique<PassthroughNode>(); result.unsupportedCount++; }
            node->id = id;

            // apply scalar + string params, detect input/output, from node.data
            bool isOutputFlag = false;
            bool isInputFlag = false;
            if (const JsonValue* data = n.find("data"); data && data->isObject()) {
                for (const auto& [key, val] : data->obj) {
                    if (val.isNumber()) node->setNamedParam(key, val.num);
                    else if (val.type == JsonValue::Type::String) node->setNamedParamStr(key, val.str);
                    if (key == "isOutput" && val.asBool()) isOutputFlag = true;
                    if (key == "isInput" && val.asBool()) isInputFlag = true;
                }
            }

            INode* raw = node.get();
            const int index = graph.addNode(std::move(node));
            idToIndex[id] = index;
            indexToNode[index] = raw;
            if (type == "MasterOutFlowNode" || isOutputFlag) masterIndex = index;
            if (isInputFlag) inputIndex = index;
            result.nodeCount++;
        }
    }

    // --- edges ---  source/target are node ids; *Handle are port names.
    if (const JsonValue* edges = root.find("edges"); edges && edges->isArray()) {
        for (const JsonValue& e : edges->arr) {
            const std::string src = e.find("source") ? e.find("source")->asString() : "";
            const std::string dst = e.find("target") ? e.find("target")->asString() : "";
            const std::string srcHandle = e.find("sourceHandle") ? e.find("sourceHandle")->asString() : "output";
            const std::string dstHandle = e.find("targetHandle") ? e.find("targetHandle")->asString() : "main-input";

            auto si = idToIndex.find(src);
            auto di = idToIndex.find(dst);
            if (si == idToIndex.end() || di == idToIndex.end()) continue; // dangling edge

            const int fromPort = indexToNode[si->second]->outPortForHandle(srcHandle);
            const int toPort = indexToNode[di->second]->inPortForHandle(dstHandle);
            graph.connect(si->second, fromPort, di->second, toPort);
            result.edgeCount++;
        }
    }

    if (masterIndex >= 0) graph.setMasterOutput(masterIndex, 0);
    if (inputIndex >= 0) { graph.setInputNode(inputIndex, 0); result.hasInput = true; }
    graph.prepare(sampleRate, maxBlock);
    return result;
}

} // namespace synflow
