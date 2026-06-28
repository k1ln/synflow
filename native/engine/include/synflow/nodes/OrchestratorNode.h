#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket D — VirtualOrchestratorNode. A multi-row timeline sequencer. Each clock tick
// advances the playhead by one beat (60/tempo s); events/notes whose time range is
// crossed fire a NoteOn (+ Value frequency) on their row's output, with a NoteOff
// scheduled at the event's end. Each row drives one output port (row index); the web
// uses per-event handles (rowId-eventId) which the FlowLoader maps to the row port by
// longest-id-prefix. event + pianoroll rows are supported here; AUDIO-segment rows
// need a decoded-buffer player and are handled at the plugin shell (deferred). The web
// schedules OFFs with setTimeout; natively they are sample-stamped -> deterministic.
//
// Ports:  clock/main-input -> 0, restart -> 1, setPosition -> 2. Output: row k -> port k.
class OrchestratorNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        if (h.rfind("restart", 0) == 0) return 1;
        if (h.rfind("setPosition", 0) == 0 || h.rfind("set-position", 0) == 0) return 2;
        return 0; // clock / main-input
    }
    int outPortForHandle(const std::string& h) const override {
        // handle is "rowId" or "rowId-eventId": match the longest row id that prefixes it.
        int best = -1; size_t bestLen = 0;
        for (size_t i = 0; i < rows_.size(); ++i) {
            const std::string& rid = rows_[i].id;
            if (!rid.empty() && h.rfind(rid, 0) == 0 && rid.size() > bestLen) { best = static_cast<int>(i); bestLen = rid.size(); }
        }
        return best >= 0 ? best : 0;
    }

    void prepare(float sr, int maxBlock) override { INode::prepare(sr, maxBlock); sr_ = sr; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "duration") duration_ = v;
        else if (name == "tempo") tempo_ = v;
    }
    void setJsonParam(const std::string& name, const JsonValue& v) override {
        if (name != "rows" || !v.isArray()) return;
        rows_.clear();
        for (const JsonValue& r : v.arr) {
            Row row;
            if (const JsonValue* id = r.find("id")) row.id = id->asString();
            if (const JsonValue* t = r.find("type")) row.type = t->asString();
            if (const JsonValue* m = r.find("muted")) row.muted = m->asBool();
            if (const JsonValue* mm = r.find("monoMode")) row.mono = mm->asBool();
            auto loadEvents = [&](const char* key, bool pianoroll) {
                if (const JsonValue* arr = r.find(key); arr && arr->isArray())
                    for (const JsonValue& e : arr->arr) {
                        Ev ev;
                        if (const JsonValue* s = e.find("startTime")) ev.start = s->asNumber(0);
                        if (const JsonValue* d = e.find("duration")) ev.dur = d->asNumber(0);
                        if (const JsonValue* vel = e.find("velocity")) ev.vel = vel->asNumber(100);
                        if (pianoroll) { if (const JsonValue* p = e.find("pitch")) ev.freq = 440.0 * std::pow(2.0, (p->asNumber(69) - 69) / 12.0); }
                        else { if (const JsonValue* f = e.find("frequency")) ev.freq = f->asNumber(0); }
                        row.events.push_back(ev);
                    }
            };
            if (row.type == "pianoroll") loadEvents("notes", true);
            else loadEvents("events", false); // 'event' rows (audio rows have no event stream here)
            rows_.push_back(row);
        }
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        const double blockStart = ctx.blockStartSample;
        const double blockEnd = blockStart + ctx.frames;

        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.port == 1) { if (ev.type == EventType::NoteOn) pos_ = 0; }
                else if (ev.port == 2) { if (ev.type == EventType::Value) pos_ = std::max(0.0, std::min(1.0, ev.value)) * duration_; }
                else if (ev.type == EventType::NoteOn) {           // clock beat
                    const double bpm = ev.value > 0 ? ev.value : (tempo_ > 0 ? tempo_ : ctx.bpm);
                    advance(60.0 / (bpm > 0 ? bpm : 120.0), static_cast<double>(blockStart) + ev.sampleOffset);
                }
            }
        }

        for (auto it = pending_.begin(); it != pending_.end();) {
            if (it->absSample >= blockStart && it->absSample < blockEnd) {
                const int off = static_cast<int>(std::lround(it->absSample - blockStart));
                if (it->type == EventType::NoteOn) {
                    ctx.sink->emitEvent(ctx.nodeIndex, it->port, EventType::Value, it->freq, off);
                    ctx.sink->emitEvent(ctx.nodeIndex, it->port, EventType::NoteOn, it->vel, off);
                } else {
                    ctx.sink->emitEvent(ctx.nodeIndex, it->port, EventType::NoteOff, 0.0, off);
                }
                it = pending_.erase(it);
            } else { ++it; }
        }
    }

private:
    struct Ev { double start = 0, dur = 0, freq = 0, vel = 100; };
    struct Row { std::string id, type; bool muted = false, mono = false; std::vector<Ev> events; int activeIdx = -1; };
    struct Sched { double absSample; EventType type; int port; double freq; double vel; };

    static bool crossed(double from, double to, double s, double e) { return from < e && to > s; }

    void advance(double beatSec, double nowSample) {
        if (duration_ <= 0) duration_ = 60.0;
        const double oldPos = pos_;
        double newPos = pos_ + beatSec;
        if (newPos >= duration_) newPos = duration_; // (loop handled after firing)
        for (size_t k = 0; k < rows_.size(); ++k) {
            Row& row = rows_[k];
            if (row.muted) continue;
            for (size_t ei = 0; ei < row.events.size(); ++ei) {
                const Ev& e = row.events[ei];
                if (!crossed(oldPos, newPos, e.start, e.start + e.dur)) continue;
                if (row.mono && row.activeIdx >= 0)
                    pending_.push_back({nowSample, EventType::NoteOff, static_cast<int>(k), 0, 0}); // cut previous
                row.activeIdx = static_cast<int>(ei);
                pending_.push_back({nowSample, EventType::NoteOn, static_cast<int>(k), e.freq, e.vel});
                double offSamp = nowSample + std::max(0.0, (e.start + e.dur - newPos)) * sr_;
                if (offSamp <= nowSample) offSamp = nowSample + 1;
                pending_.push_back({offSamp, EventType::NoteOff, static_cast<int>(k), 0, 0});
            }
        }
        pos_ = newPos;
        if (pos_ >= duration_) { pos_ = 0; for (auto& r : rows_) r.activeIdx = -1; }
    }

    float sr_ = 48000.0f;
    double duration_ = 60.0, tempo_ = 120.0, pos_ = 0.0;
    std::vector<Row> rows_;
    std::vector<Sched> pending_;
};

} // namespace synflow
