#include "synflow/FlowLoader.h"

#include <map>
#include <memory>

#include "synflow/Json.h"
#include "synflow/nodes/ADSRNode.h"
#include "synflow/nodes/BiquadFilterNode.h"
#include "synflow/nodes/ChorusNode.h"
#include "synflow/nodes/ClockNode.h"
#include "synflow/nodes/ArpeggiatorNode.h"
#include "synflow/nodes/AutomationNode.h"
#include "synflow/nodes/ButtonNode.h"
#include "synflow/nodes/ConstantNode.h"
#include "synflow/nodes/MicNode.h"
#include "synflow/nodes/MidiButtonNode.h"
#include "synflow/nodes/MidiKnobNode.h"
#include "synflow/nodes/OnOffButtonNode.h"
#include "synflow/nodes/RingModNode.h"
#include "synflow/nodes/IIRFilterNode.h"
#include "synflow/nodes/SequencerFrequencyNode.h"
#include "synflow/nodes/SpeedDividerNode.h"
#include "synflow/nodes/SwitchNode.h"
#include "synflow/nodes/DelayNode.h"
#include "synflow/nodes/DistortionNode.h"
#include "synflow/nodes/DynamicCompressorNode.h"
#include "synflow/nodes/GainNode.h"
#include "synflow/nodes/MasterOutNode.h"
#include "synflow/nodes/OscillatorNode.h"
#include "synflow/nodes/PassthroughNode.h"
#include "synflow/nodes/SequencerNode.h"

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
    if (type == "ADSRFlowNode") return std::make_unique<ADSRNode>();
    if (type == "ClockFlowNode") return std::make_unique<ClockNode>();
    if (type == "SequencerFlowNode") return std::make_unique<SequencerNode>();
    if (type == "ConstantFlowNode" || type == "FrequencyFlowNode") return std::make_unique<ConstantNode>();
    if (type == "SpeedDividerFlowNode") return std::make_unique<SpeedDividerNode>();
    if (type == "MidiKnobFlowNode") return std::make_unique<MidiKnobNode>();
    if (type == "MidiButtonFlowNode") return std::make_unique<MidiButtonNode>();
    if (type == "ButtonFlowNode" || type == "MouseTriggerButtonFlowNode")
        return std::make_unique<ButtonNode>();
    if (type == "OnOffButtonFlowNode") return std::make_unique<OnOffButtonNode>();
    if (type == "SwitchFlowNode") return std::make_unique<SwitchNode>();
    if (type == "SequencerFrequencyFlowNode") return std::make_unique<SequencerFrequencyNode>();
    if (type == "RingModFlowNode") return std::make_unique<RingModNode>();
    if (type == "IIRFilterFlowNode") return std::make_unique<IIRFilterNode>();
    if (type == "AutomationFlowNode") return std::make_unique<AutomationNode>();
    if (type == "ArpeggiatorFlowNode") return std::make_unique<ArpeggiatorNode>();
    if (type == "MicFlowNode") return std::make_unique<MicNode>();
    if (type == "LogFlowNode" || type == "EventFlowNode" || type == "CommandInFlowNode" || type == "CommandOutFlowNode")
        return std::make_unique<EventForwardNode>();
    return nullptr;
}

// Nodes whose OUTPUT is discrete control events (note on/off, triggers) rather
// than an audio/control signal. Their edges route through the sample-stamped
// event queue (connectEvent). ADSR/Automation are NOT here: natively they emit a
// continuous a-rate signal, so their output edges are audio. (See plan Bucket C.)
bool isEventEmitterType(const std::string& type) {
    return type == "ClockFlowNode" || type == "SequencerFlowNode"
        || type == "ConstantFlowNode" || type == "FrequencyFlowNode"
        || type == "SpeedDividerFlowNode"
        || type == "MidiKnobFlowNode" || type == "MidiButtonFlowNode"
        || type == "ButtonFlowNode" || type == "OnOffButtonFlowNode"
        || type == "MouseTriggerButtonFlowNode"
        || type == "SwitchFlowNode" || type == "SequencerFrequencyFlowNode"
        || type == "ArpeggiatorFlowNode"
        || type == "EventFlowNode" || type == "LogFlowNode"
        || type == "CommandInFlowNode" || type == "CommandOutFlowNode"
        || type == "AutomationFlowNode";
}

} // namespace

FlowLoadResult FlowLoader::loadInto(AudioGraphManager& graph, const std::string& jsonText,
                                    float sampleRate, int maxBlock,
                                    const NodeFactoryFn& extraFactory) {
    FlowLoadResult result;
    const JsonValue root = JsonParser::parse(jsonText);

    if (const JsonValue* name = root.find("name")) result.name = name->asString();

    std::map<std::string, int> idToIndex;
    std::map<int, INode*> indexToNode;
    std::map<std::string, bool> idIsEmitter; // source id -> routes edges as events
    int masterIndex = -1;
    int inputIndex = -1;

    // --- nodes ---
    if (const JsonValue* nodes = root.find("nodes"); nodes && nodes->isArray()) {
        for (const JsonValue& n : nodes->arr) {
            const std::string id = n.find("id") ? n.find("id")->asString() : "";
            const std::string type = n.find("type") ? n.find("type")->asString() : "";

            std::unique_ptr<INode> node = extraFactory ? extraFactory(type) : nullptr;
            if (!node) node = makeNode(type); // shell-provided nodes win, else built-in
            const bool supported = node != nullptr;
            if (!supported) { node = std::make_unique<PassthroughNode>(); result.unsupportedCount++; }
            node->id = id;

            // apply scalar + string params, detect input/output + host flags, from node.data
            bool isOutputFlag = false;
            bool isInputFlag = false;
            bool isTriggerFlag = false;
            bool isPitchFlag = false;
            std::string pitchParam;
            if (const JsonValue* data = n.find("data"); data && data->isObject()) {
                for (const auto& [key, val] : data->obj) {
                    if (val.isNumber()) node->setNamedParam(key, val.num);
                    else if (val.type == JsonValue::Type::String) node->setNamedParamStr(key, val.str);
                    else if (val.isArray() && !val.arr.empty() && val.arr.front().isNumber()) {
                        std::vector<double> nums;
                        nums.reserve(val.arr.size());
                        for (const auto& e : val.arr) nums.push_back(e.asNumber(0));
                        node->setArrayParam(key, nums);
                    } else if (val.isArray() && !val.arr.empty() && val.arr.front().isObject()) {
                        // object array (e.g. automation points {x,y}) -> [x0,y0,x1,y1,...]
                        std::vector<double> flat;
                        for (const auto& e : val.arr) {
                            if (const JsonValue* x = e.find("x")) flat.push_back(x->asNumber(0));
                            if (const JsonValue* y = e.find("y")) flat.push_back(y->asNumber(0));
                        }
                        if (!flat.empty()) node->setArrayParam(key, flat);
                    }
                    if (key == "isOutput" && val.asBool()) isOutputFlag = true;
                    if (key == "isInput" && val.asBool()) isInputFlag = true;
                    if (key == "isTrigger" && val.asBool()) isTriggerFlag = true;
                    if (key == "isPitch" && val.asBool()) isPitchFlag = true;
                    if (key == "pitchParam" && val.type == JsonValue::Type::String) pitchParam = val.str;
                }
            }

            INode* raw = node.get();
            const int index = graph.addNode(std::move(node));
            idToIndex[id] = index;
            indexToNode[index] = raw;
            idIsEmitter[id] = isEventEmitterType(type);
            result.nodeIndexById[id] = index;
            if (type == "MasterOutFlowNode" || isOutputFlag) masterIndex = index;
            if (isInputFlag || type == "MicFlowNode") inputIndex = index;
            if (isTriggerFlag && result.triggerNodeIndex < 0) result.triggerNodeIndex = index;
            if (isPitchFlag && result.pitchNodeIndex < 0) {
                result.pitchNodeIndex = index;
                if (!pitchParam.empty()) result.pitchParam = pitchParam;
            }
            // node.data.midiMapping {type:'cc'|'note', channel, number} -> route host MIDI
            if (const JsonValue* data = n.find("data"); data && data->isObject()) {
                if (const JsonValue* mm = data->find("midiMapping"); mm && mm->isObject()) {
                    const JsonValue* t = mm->find("type");
                    const bool isNote = t && t->asString() == "note";
                    const JsonValue* ch = mm->find("channel");
                    const JsonValue* num = mm->find("number");
                    if (num)
                        result.midiMaps.push_back({index, isNote, ch ? static_cast<int>(ch->asNumber(0)) : 0,
                                                   static_cast<int>(num->asNumber(0))});
                }
            }
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
            // Event-emitter sources (Clock/Sequencer) feed the event queue; all
            // other edges carry audio/control signal summed into input ports.
            if (idIsEmitter[src]) graph.connectEvent(si->second, fromPort, di->second, toPort, dstHandle);
            else graph.connect(si->second, fromPort, di->second, toPort);
            result.edgeCount++;
        }
    }

    if (masterIndex >= 0) graph.setMasterOutput(masterIndex, 0);
    if (inputIndex >= 0) { graph.setInputNode(inputIndex, 0); result.hasInput = true; }

    // flowKind: no trigger -> effect; trigger + pitch -> synth; trigger only -> drum.
    const bool hasTrigger = result.triggerNodeIndex >= 0;
    const bool hasPitch = result.pitchNodeIndex >= 0;
    result.kind = !hasTrigger ? FlowLoadResult::Effect
                              : (hasPitch ? FlowLoadResult::Synth : FlowLoadResult::Drum);

    graph.prepare(sampleRate, maxBlock);
    return result;
}

} // namespace synflow
