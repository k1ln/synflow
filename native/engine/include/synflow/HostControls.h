#pragma once

#include <string>
#include <vector>

#include "Json.h"

// Port of src/host/flowKnobs.ts — collects a flow's host-exposed controls from
// node.data.knobs / node.data.options (what the author wired "to the outside").
// Engine-side + juce-free; the plugin maps these to host-automatable parameters
// and the webview renders them. The live value is node.data[param] (so tweaks
// persist), falling back to the declared default.
namespace synflow {

struct ExposedKnob {
    std::string nodeId, param, label;
    double min = 0.0, max = 1.0, defValue = 0.0;
    double norm() const { const double r = (max - min) != 0 ? (max - min) : 1.0;
                          double v = (defValue - min) / r; return v < 0 ? 0 : (v > 1 ? 1 : v); }
};

struct ExposedOption {
    std::string nodeId, param, label, value;
    std::vector<std::string> choiceValues, choiceLabels;
};

struct HostControls {
    std::vector<ExposedKnob> knobs;
    std::vector<ExposedOption> options;
};

inline HostControls extractHostControls(const JsonValue& root) {
    HostControls hc;
    const JsonValue* nodes = root.find("nodes");
    if (!nodes || !nodes->isArray()) return hc;

    for (const JsonValue& n : nodes->arr) {
        const JsonValue* id = n.find("id");
        const JsonValue* data = n.find("data");
        if (!id || !data || !data->isObject()) continue;
        const std::string nodeId = id->asString();

        if (const JsonValue* knobs = data->find("knobs"); knobs && knobs->isArray()) {
            for (const JsonValue& k : knobs->arr) {
                ExposedKnob ek;
                ek.nodeId = nodeId;
                ek.param = k.find("param") ? k.find("param")->asString() : "";
                ek.label = k.find("label") ? k.find("label")->asString() : ek.param;
                ek.min = k.find("min") ? k.find("min")->asNumber(0.0) : 0.0;
                ek.max = k.find("max") ? k.find("max")->asNumber(1.0) : 1.0;
                const JsonValue* live = data->find(ek.param);
                ek.defValue = (live && live->isNumber()) ? live->num
                              : (k.find("default") ? k.find("default")->asNumber(ek.min) : ek.min);
                if (!ek.param.empty()) hc.knobs.push_back(ek);
            }
        }

        if (const JsonValue* opts = data->find("options"); opts && opts->isArray()) {
            for (const JsonValue& o : opts->arr) {
                ExposedOption eo;
                eo.nodeId = nodeId;
                eo.param = o.find("param") ? o.find("param")->asString() : "";
                eo.label = o.find("label") ? o.find("label")->asString() : eo.param;
                if (const JsonValue* ch = o.find("choices"); ch && ch->isArray()) {
                    for (const JsonValue& c : ch->arr) {
                        if (c.type == JsonValue::Type::String) { eo.choiceValues.push_back(c.str); eo.choiceLabels.push_back(c.str); }
                        else if (c.isObject()) {
                            const std::string v = c.find("value") ? c.find("value")->asString() : "";
                            eo.choiceValues.push_back(v);
                            eo.choiceLabels.push_back(c.find("label") ? c.find("label")->asString() : v);
                        }
                    }
                }
                const JsonValue* live = data->find(eo.param);
                eo.value = live ? live->asString()
                                : (o.find("default") ? o.find("default")->asString()
                                   : (eo.choiceValues.empty() ? std::string() : eo.choiceValues[0]));
                if (!eo.param.empty()) hc.options.push_back(eo);
            }
        }
    }
    return hc;
}

} // namespace synflow
