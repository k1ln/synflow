#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualMidiFileNode. Plays a pre-parsed MIDI file (the editor parses
// the SMF; the flow JSON carries the ParsedMidiFile in node.data.midiFile). Each
// clock tick advances the play head by ticksPerClock MIDI ticks (default
// ticksPerBeat/subdivision); notes whose startTick falls in the advanced range fire
// a NoteOn (+ Value frequency) on main-output at their exact sample, with a NoteOff
// scheduled durationTicks later. Tempo changes emit on tempo-output. The web spreads
// sub-tick timing via setTimeout/performance.now; natively it's sample-stamped from
// the clock's BPM -> transport-locked + reproducible.
//
// Ports:  clock/main-input -> 0, reset -> 1.  Outputs main-output -> 0, tempo-output -> 1.
class MidiFileNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        return h.rfind("reset", 0) == 0 ? 1 : 0; // reset -> 1; clock/main-input -> 0
    }
    int outPortForHandle(const std::string& h) const override {
        return h.rfind("tempo", 0) == 0 ? 1 : 0; // tempo-output -> 1; main-output -> 0
    }

    void prepare(float sr, int maxBlock) override { INode::prepare(sr, maxBlock); sr_ = sr; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "subdivision") subdivision_ = std::max(1, static_cast<int>(v));
        else if (name == "ticksPerClock") ticksPerClock_ = std::max(0, static_cast<int>(v));
        else if (name == "transpose") transpose_ = static_cast<int>(v);
        else if (name == "loop") loop_ = (v != 0.0);
        else if (name == "singleVoiceMode") singleVoice_ = (v != 0.0);
    }

    void setJsonParam(const std::string& name, const JsonValue& v) override {
        if (name != "midiFile" || !v.isObject()) return;
        if (const JsonValue* tpb = v.find("ticksPerBeat")) ticksPerBeat_ = std::max(1, static_cast<int>(tpb->asNumber(480)));
        if (const JsonValue* tt = v.find("totalTicks")) totalTicks_ = static_cast<long>(tt->asNumber(0));
        notes_.clear();
        if (const JsonValue* tracks = v.find("tracks"); tracks && tracks->isArray()) {
            for (const JsonValue& tr : tracks->arr) {
                const JsonValue* notes = tr.find("notes");
                if (!notes || !notes->isArray()) continue;
                for (const JsonValue& n : notes->arr) {
                    Note note;
                    if (const JsonValue* x = n.find("note")) note.note = static_cast<int>(x->asNumber(0));
                    if (const JsonValue* x = n.find("velocity")) note.velocity = x->asNumber(100);
                    if (const JsonValue* x = n.find("startTick")) note.startTick = static_cast<long>(x->asNumber(0));
                    if (const JsonValue* x = n.find("durationTicks")) note.durationTicks = static_cast<long>(x->asNumber(0));
                    if (const JsonValue* x = n.find("channel")) note.channel = static_cast<int>(x->asNumber(0));
                    notes_.push_back(note);
                }
            }
        }
        std::stable_sort(notes_.begin(), notes_.end(),
                         [](const Note& a, const Note& b) { return a.startTick < b.startTick; });
        tempo_.clear();
        if (const JsonValue* tcs = v.find("tempoChanges"); tcs && tcs->isArray()) {
            for (const JsonValue& tc : tcs->arr) {
                Tempo t;
                if (const JsonValue* x = tc.find("tick")) t.tick = static_cast<long>(x->asNumber(0));
                if (const JsonValue* x = tc.find("bpm")) t.bpm = x->asNumber(120);
                tempo_.push_back(t);
            }
        }
        rewind();
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        const double blockStart = ctx.blockStartSample;
        const double blockEnd = blockStart + ctx.frames;

        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.port == 1) {              // reset
                    if (ev.type == EventType::NoteOn) { rewind(); flushOffs(ctx, blockStart, true); }
                } else if (ev.type == EventType::NoteOn && !notes_.empty()) {
                    advance(ctx, static_cast<double>(blockStart) + ev.sampleOffset,
                            ev.value > 0 ? ev.value : ctx.bpm);
                }
            }
        }

        // Drain scheduled note-ons / note-offs / tempo that land in this block.
        for (auto it = pending_.begin(); it != pending_.end();) {
            if (it->absSample >= blockStart && it->absSample < blockEnd) {
                const int off = static_cast<int>(std::lround(it->absSample - blockStart));
                if (it->type == EventType::Value)
                    ctx.sink->emitEvent(ctx.nodeIndex, it->port, EventType::Value, it->value, off);
                else if (it->type == EventType::NoteOn) {
                    ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, it->value, off);   // frequency
                    ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOn, it->velocity, off); // gate
                } else { // NoteOff
                    ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, it->value, off);
                }
                it = pending_.erase(it);
            } else {
                ++it;
            }
        }
    }

private:
    struct Note { int note = 60; double velocity = 100; long startTick = 0, durationTicks = 0; int channel = 0; };
    struct Tempo { long tick = 0; double bpm = 120; };
    struct Sched { double absSample; EventType type; int port; double value; double velocity; };

    static double midiToHz(int note) { return 440.0 * std::pow(2.0, (note - 69) / 12.0); }

    void rewind() { currentTick_ = 0; noteIndex_ = 0; tempoIndex_ = 0; }

    int ticksPerClock() const {
        if (ticksPerClock_ > 0) return ticksPerClock_;
        return std::max(1, ticksPerBeat_ / subdivision_);
    }

    void flushOffs(const ProcessContext& ctx, double atSample, bool clearPending) {
        // emit OFFs for everything still scheduled-on this block boundary (reset)
        for (const auto& s : pending_)
            if (s.type == EventType::NoteOff)
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, s.value, 0);
        if (clearPending) { pending_.clear(); (void)atSample; }
    }

    void advance(const ProcessContext& ctx, double clockSample, double bpm) {
        if (bpm <= 0) bpm = 120.0;
        const double samplesPerTick = (60.0 / bpm) * sr_ / ticksPerBeat_;
        const long adv = ticksPerClock();
        const long startTick = currentTick_;
        const long endTick = startTick + adv;

        // notes whose start falls in [startTick, endTick)
        while (noteIndex_ < static_cast<int>(notes_.size()) && notes_[static_cast<size_t>(noteIndex_)].startTick < endTick) {
            const Note& n = notes_[static_cast<size_t>(noteIndex_)];
            if (n.startTick >= startTick) {
                long dur = n.durationTicks > 0 ? n.durationTicks : 120;
                const double onAbs = clockSample + (n.startTick - startTick) * samplesPerTick;
                double durSamp = dur * samplesPerTick;
                durSamp = std::max(durSamp, 0.05 * sr_); // 50 ms floor (mirrors web)
                const double freq = midiToHz(n.note + transpose_);
                if (singleVoice_) {
                    // kill any previously scheduled sustained note at/after this on
                    for (auto& s : pending_) if (s.type == EventType::NoteOff && s.absSample > onAbs) s.absSample = onAbs;
                }
                pending_.push_back({onAbs, EventType::NoteOn, 0, freq, n.velocity});
                pending_.push_back({onAbs + durSamp, EventType::NoteOff, 0, freq, 0});
            }
            noteIndex_++;
        }

        // tempo changes in range -> last one wins, emit on tempo-output (port 1)
        double lastBpm = 0; bool hasTempo = false;
        while (tempoIndex_ < static_cast<int>(tempo_.size()) && tempo_[static_cast<size_t>(tempoIndex_)].tick < endTick) {
            if (tempo_[static_cast<size_t>(tempoIndex_)].tick >= startTick) { lastBpm = tempo_[static_cast<size_t>(tempoIndex_)].bpm; hasTempo = true; }
            tempoIndex_++;
        }
        if (hasTempo) pending_.push_back({clockSample, EventType::Value, 1, lastBpm, 0});

        currentTick_ = endTick;
        if (totalTicks_ > 0 && currentTick_ >= totalTicks_) {
            if (loop_) rewind();
            else noteIndex_ = static_cast<int>(notes_.size());
        }
    }

    float sr_ = 48000.0f;
    int ticksPerBeat_ = 480;
    long totalTicks_ = 0;
    int subdivision_ = 1, ticksPerClock_ = 0, transpose_ = 0;
    bool loop_ = true, singleVoice_ = false;
    long currentTick_ = 0;
    int noteIndex_ = 0, tempoIndex_ = 0;
    std::vector<Note> notes_;
    std::vector<Tempo> tempo_;
    std::vector<Sched> pending_;
};

} // namespace synflow
