#pragma once

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualScriptSequencerNode. A code-driven step sequencer: each line is
// a step run when the clock ticks, the cursor advancing one line per tick (wrap).
// Lines hold semicolon-separated actions over a small DSL (send/on/off/pulse/ramp/
// array/random/set/inc/dec/goto/loop/repeat/wait/if/ifgoto/ifloop, init:/exec:/once:
// prefixes, inline if:). Expressions support numbers, $vars, @notes (e.g. @C4 -> Hz),
// arithmetic + - * / %, comparisons, and parens. Sub-tick timing (pulse/ramp/array)
// is sample-stamped from the clock BPM (the web used setTimeout/performance.now) ->
// deterministic + transport-locked. Every emit (immediate or scheduled) flows through
// one sample-stamped queue drained at block end.
//
// Ports:  clock/main-input -> 0, reset -> 1, in-K -> 2+K (value inputs -> $inK).
//         Output handles "out-N" / "#N" / trailing-integer -> port N.
class ScriptSequencerNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        if (h.rfind("reset", 0) == 0) return 1;
        if (h.rfind("in-", 0) == 0) return 2 + std::atoi(h.c_str() + 3);
        return 0; // clock / main-input
    }
    int outPortForHandle(const std::string& h) const override { return handlePort(h); }

    void prepare(float sr, int maxBlock) override { INode::prepare(sr, maxBlock); sr_ = sr; }

    void setNamedParamStr(const std::string& name, const std::string& v) override {
        if (name == "script") { script_ = v; splitLines(); }
    }
    void setNamedParam(const std::string& name, double v) override {
        if (name == "activeLine") active_ = static_cast<int>(v);
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        const double blockStart = ctx.blockStartSample;
        const double blockEnd = blockStart + ctx.frames;

        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.port == 1) { if (ev.type == EventType::NoteOn) reset(); }
                else if (ev.port >= 2) { vars_["in" + std::to_string(ev.port - 2)] = ev.value; }
                else if (ev.type == EventType::NoteOn) {        // clock tick
                    const double bpm = ev.value > 0 ? ev.value : ctx.bpm;
                    tickSamples_ = (60.0 / (bpm > 0 ? bpm : 120.0)) * sr_;
                    now_ = static_cast<double>(blockStart) + ev.sampleOffset;
                    onClockTick();
                }
            }
        }

        for (auto it = pending_.begin(); it != pending_.end();) {
            if (it->absSample >= blockStart && it->absSample < blockEnd) {
                const int off = static_cast<int>(std::lround(it->absSample - blockStart));
                ctx.sink->emitEvent(ctx.nodeIndex, it->port, it->type, it->value, std::max(0, off));
                it = pending_.erase(it);
            } else { ++it; }
        }
    }

private:
    struct Sched { double absSample; EventType type; int port; double value; };

    // ---- text helpers ----
    static std::string strip(const std::string& l) {
        std::string s = l;
        auto c = s.find("//"); if (c != std::string::npos) s = s.substr(0, c);
        size_t a = s.find_first_not_of(" \t\r\n");
        size_t b = s.find_last_not_of(" \t\r\n");
        return a == std::string::npos ? "" : s.substr(a, b - a + 1);
    }
    static std::string lower(std::string s) { for (char& c : s) c = static_cast<char>(std::tolower(c)); return s; }
    static bool startsWithCI(const std::string& s, const char* p) {
        size_t n = std::strlen(p);
        if (s.size() < n) return false;
        for (size_t i = 0; i < n; ++i) if (std::tolower(s[i]) != std::tolower(p[i])) return false;
        return true;
    }
    static std::string stripVar(const std::string& s) { return (!s.empty() && s[0] == '$') ? s.substr(1) : s; }
    static int handlePort(const std::string& h) {
        for (size_t i = 0; i < h.size(); ++i)
            if (std::isdigit(static_cast<unsigned char>(h[i]))) return std::atoi(h.c_str() + i);
        return 0;
    }
    void splitLines() {
        lines_.clear();
        size_t start = 0;
        for (size_t i = 0; i <= script_.size(); ++i)
            if (i == script_.size() || script_[i] == '\n') { lines_.push_back(script_.substr(start, i - start)); start = i + 1; }
        if (active_ >= static_cast<int>(lines_.size())) active_ = 0;
    }
    static std::vector<std::string> splitActions(const std::string& line) {
        std::vector<std::string> out; int depth = 0; std::string buf;
        for (char c : line) {
            if (c == '[') depth++; else if (c == ']') depth = std::max(0, depth - 1);
            if (c == ';' && depth == 0) { if (!strip(buf).empty()) out.push_back(strip(buf)); buf.clear(); }
            else buf += c;
        }
        if (!strip(buf).empty()) out.push_back(strip(buf));
        return out;
    }
    static std::vector<std::string> tokenize(const std::string& s) {
        std::vector<std::string> t; size_t i = 0;
        while (i < s.size()) {
            char c = s[i];
            if (c == ' ' || c == '\t') { i++; continue; }
            if (c == '[') { int d = 1; size_t j = i + 1; while (j < s.size() && d) { if (s[j] == '[') d++; else if (s[j] == ']') d--; j++; } t.push_back(s.substr(i, j - i)); i = j; }
            else { size_t j = i; while (j < s.size() && s[j] != ' ' && s[j] != '\t') j++; t.push_back(s.substr(i, j - i)); i = j; }
        }
        return t;
    }
    static double noteToHz(const std::string& tok) {
        if (tok.empty()) return NAN;
        static const int base[7] = {9, 11, 0, 2, 4, 5, 7}; // a b c d e f g
        char L = static_cast<char>(std::tolower(tok[0]));
        if (L < 'a' || L > 'g') return NAN;
        int semis = base[L - 'a']; size_t i = 1;
        if (i < tok.size() && (tok[i] == '#' || tok[i] == 'b')) { semis += (tok[i] == '#' ? 1 : -1); i++; }
        if (i >= tok.size()) return NAN;
        int sign = 1; if (tok[i] == '-') { sign = -1; i++; }
        if (i >= tok.size() || !std::isdigit(static_cast<unsigned char>(tok[i]))) return NAN;
        int oct = sign * std::atoi(tok.c_str() + i);
        int midi = (oct + 1) * 12 + semis;
        return 440.0 * std::pow(2.0, (midi - 69) / 12.0);
    }

    // ---- expression evaluator (precedence climbing) ----
    double resolveExpr(const std::string& in) { src_ = strip(in); pos_ = 0; return src_.empty() ? 0 : parseExpr(0); }
    void skipSp() { while (pos_ < src_.size() && (src_[pos_] == ' ' || src_[pos_] == '\t')) pos_++; }
    static bool isOpChar(char c) { return std::string("+-*/%<>=!").find(c) != std::string::npos; }
    double parsePrimary() {
        skipSp();
        if (pos_ >= src_.size()) return 0;
        char c = src_[pos_];
        if (c == '(') { pos_++; double v = parseExpr(0); skipSp(); if (pos_ < src_.size() && src_[pos_] == ')') pos_++; return v; }
        if (c == '-') { pos_++; return -parsePrimary(); }
        if (c == '+') { pos_++; return parsePrimary(); }
        if (c == '$') { size_t j = pos_ + 1; while (j < src_.size() && (std::isalnum((unsigned char)src_[j]) || src_[j] == '_')) j++; std::string n = src_.substr(pos_ + 1, j - pos_ - 1); pos_ = j; auto it = vars_.find(n); return it == vars_.end() ? 0 : it->second; }
        if (c == '@') { size_t j = pos_ + 1; while (j < src_.size() && src_[j] != ' ' && src_[j] != ')' && !isOpChar(src_[j])) j++; double hz = noteToHz(src_.substr(pos_ + 1, j - pos_ - 1)); pos_ = j; return std::isnan(hz) ? 0 : hz; }
        size_t j = pos_; while (j < src_.size() && (std::isdigit((unsigned char)src_[j]) || src_[j] == '.')) j++;
        double num = std::atof(src_.substr(pos_, j - pos_).c_str());
        if (j < src_.size() && std::isalpha((unsigned char)src_[j])) {
            size_t k = j; while (k < src_.size() && std::isalpha((unsigned char)src_[k])) k++;
            std::string u = src_.substr(j, k - j);
            if (u == "s") num *= 1000; else if (u == "t" || u == "b") num *= tickSamples_ / sr_ * 1000.0;
            j = k;
        }
        pos_ = j; return num;
    }
    int peekOp(std::string& op) {
        skipSp();
        if (pos_ >= src_.size()) return -1;
        std::string two = src_.substr(pos_, 2);
        if (two == "==" || two == "!=" || two == "<=" || two == ">=") { op = two; return 1; }
        char c = src_[pos_];
        if (std::string("+-*/%<>").find(c) != std::string::npos) { op = std::string(1, c); return 1; }
        return -1;
    }
    static int prec(const std::string& o) {
        if (o == "==" || o == "!=" || o == "<" || o == "<=" || o == ">" || o == ">=") return 1;
        if (o == "+" || o == "-") return 2;
        if (o == "*" || o == "/" || o == "%") return 3;
        return 0;
    }
    double parseExpr(int minPrec) {
        double lhs = parsePrimary();
        while (true) {
            std::string op;
            if (peekOp(op) < 0) break;
            int p = prec(op);
            if (p < minPrec) break;
            pos_ += op.size();
            double rhs = parseExpr(p + 1);
            if (op == "+") lhs += rhs; else if (op == "-") lhs -= rhs;
            else if (op == "*") lhs *= rhs; else if (op == "/") lhs = rhs == 0 ? 0 : lhs / rhs;
            else if (op == "%") lhs = rhs == 0 ? 0 : std::fmod(lhs, rhs);
            else if (op == "==") lhs = (lhs == rhs); else if (op == "!=") lhs = (lhs != rhs);
            else if (op == "<") lhs = (lhs < rhs); else if (op == "<=") lhs = (lhs <= rhs);
            else if (op == ">") lhs = (lhs > rhs); else if (op == ">=") lhs = (lhs >= rhs);
        }
        return lhs;
    }

    std::vector<double> parseList(const std::string& tok) {
        std::vector<double> v; std::string inner = tok;
        if (!inner.empty() && inner.front() == '[') inner = inner.substr(1);
        if (!inner.empty() && inner.back() == ']') inner.pop_back();
        size_t start = 0;
        for (size_t i = 0; i <= inner.size(); ++i)
            if (i == inner.size() || inner[i] == ',') { std::string e = strip(inner.substr(start, i - start)); if (!e.empty()) v.push_back(resolveExpr(e)); start = i + 1; }
        return v;
    }
    double parseDuration(const std::string& tok, double dfltSamples) {
        if (tok.empty()) return dfltSamples;
        size_t j = 0; while (j < tok.size() && (std::isdigit((unsigned char)tok[j]) || tok[j] == '.')) j++;
        if (j == 0) return dfltSamples;
        double v = std::atof(tok.substr(0, j).c_str());
        std::string u = tok.substr(j);
        if (u == "s") return v * sr_;
        if (u == "t" || u == "b") return v * tickSamples_;
        return v * 0.001 * sr_; // ms (default)
    }

    // ---- execution ----
    void reset() {
        active_ = 0; repeatRemaining_ = 0; waitRemaining_ = 0; onceFired_.clear(); pending_.clear(); inRepeat_ = false;
        for (size_t i = 0; i < lines_.size(); ++i) { std::string s = strip(lines_[i]); if (startsWithCI(s, "init:")) executeLine(strip(s.substr(5))); }
    }

    void onClockTick() {
        if (lines_.empty()) return;
        if (waitRemaining_ > 0) { waitRemaining_--; return; }
        jumped_ = false;
        int guard = 0;
        while (guard++ < static_cast<int>(lines_.size())) {
            std::string l = strip(lines_[static_cast<size_t>(active_)]);
            if (startsWithCI(l, "init:")) active_ = (active_ + 1) % static_cast<int>(lines_.size());
            else if (startsWithCI(l, "exec:")) { jumped_ = false; executeLine(strip(l.substr(5))); if (jumped_) { jumped_ = false; continue; } active_ = (active_ + 1) % static_cast<int>(lines_.size()); }
            else break;
        }
        executeLine(lines_[static_cast<size_t>(active_)]);
        if (repeatRemaining_ > 0) repeatRemaining_--;
        else { if (!jumped_) active_ = (active_ + 1) % static_cast<int>(lines_.size()); jumped_ = false; inRepeat_ = false; }
    }

    void executeLine(const std::string& raw) {
        std::string s = strip(raw);
        if (s.empty()) return;
        if (startsWithCI(s, "init:")) return;
        if (startsWithCI(s, "exec:")) { executeLine(strip(s.substr(5))); return; }
        if (startsWithCI(s, "once:")) { if (onceFired_.count(active_)) return; onceFired_.insert(active_); executeLine(strip(s.substr(5))); return; }
        if (startsWithCI(s, "if:")) { runInlineIf(strip(s.substr(3))); return; }
        bool skipNext = false; int pendingElse = -1; // -1 none, 0 false, 1 true
        for (auto& a : splitActions(s)) {
            std::string ta = strip(a);
            if (startsWithCI(ta, "else:")) { if (pendingElse == 0) executeAction(strip(ta.substr(5))); pendingElse = -1; continue; }
            if (skipNext) { skipNext = false; continue; }
            auto tk = tokenize(ta);
            if (tk.empty()) continue;
            std::string type = lower(tk[0]);
            if (type == "if") {
                std::string rest = strip(ta.substr(2));
                if (rest.find(':') != std::string::npos) { runInlineIf(rest); pendingElse = -1; }
                else { bool cond = resolveExpr(rest) != 0; skipNext = !cond; pendingElse = cond ? 1 : 0; }
                continue;
            }
            pendingElse = -1;
            executeAction(ta);
        }
    }

    void runInlineIf(const std::string& body) {
        size_t colon = std::string::npos;
        for (size_t i = 0; i < body.size(); ++i)
            if (body[i] == ':') { std::string b = lower(body.substr(i >= 4 ? i - 4 : 0, (i >= 4 ? 5 : i + 1))); if (b != "else:") { colon = i; break; } }
        if (colon == std::string::npos) return;
        std::string cond = strip(body.substr(0, colon));
        std::string after = strip(body.substr(colon + 1));
        std::string thenB = after, elseB;
        std::string lo = lower(after);
        size_t ep = lo.find("else:");
        if (ep != std::string::npos) { thenB = strip(after.substr(0, ep)); elseB = strip(after.substr(ep + 5)); }
        if (resolveExpr(cond) != 0) { if (!thenB.empty()) executeLine(thenB); }
        else if (!elseB.empty()) executeLine(elseB);
    }

    // every action's args start at tk[1] (tk[0] is the command)
    void executeAction(const std::string& raw) {
        auto tk = tokenize(strip(raw));
        if (tk.empty()) return;
        const std::string type = lower(tk[0]);
        auto arg = [&](size_t i) { return i < tk.size() ? tk[i] : std::string(); };
        auto joinFrom = [&](size_t i) { std::string r; for (size_t k = i; k < tk.size(); ++k) { if (k > i) r += " "; r += tk[k]; } return r; };

        if (type == "send") {
            if (!arg(2).empty() && arg(2).front() == '[') { emitArray(arg(1), parseList(arg(2)), tickSamples_); return; }
            emit(handlePort(arg(1)), EventType::Value, resolveExpr(joinFrom(2)));
        } else if (type == "on") {
            emit(handlePort(arg(1)), EventType::NoteOn, tk.size() > 2 ? resolveExpr(joinFrom(2)) : 1.0);
        } else if (type == "off") {
            emit(handlePort(arg(1)), EventType::NoteOff, 0.0);
        } else if (type == "set") {
            std::string var = stripVar(arg(1));
            size_t exprStart = (arg(2) == "=") ? 3 : 2;
            if (!var.empty()) vars_[var] = resolveExpr(joinFrom(exprStart));
        } else if (type == "inc" || type == "dec") {
            std::string var = stripVar(arg(1));
            double step = tk.size() > 2 ? resolveExpr(joinFrom(2)) : 1.0;
            if (!var.empty()) vars_[var] += (type == "inc" ? step : -step);
        } else if (type == "goto") {
            int t = std::atoi(arg(1).c_str());
            if (t >= 1 && !lines_.empty()) { active_ = std::max(0, std::min((int)lines_.size() - 1, t - 1)); jumped_ = true; }
        } else if (type == "loop") {
            active_ = 0; jumped_ = true;
        } else if (type == "ifgoto") {
            if (tk.size() >= 3) { double cond = resolveExpr(joinFromTo(tk, 1, tk.size() - 1)); if (cond != 0) { int t = std::atoi(tk.back().c_str()); if (t >= 1) { active_ = std::max(0, std::min((int)lines_.size() - 1, t - 1)); jumped_ = true; } } }
        } else if (type == "ifloop") {
            if (resolveExpr(joinFrom(1)) != 0) { active_ = 0; jumped_ = true; }
        } else if (type == "repeat") {
            if (!inRepeat_) { int n = std::atoi(arg(1).c_str()); if (n > 0) { repeatRemaining_ = n; inRepeat_ = true; } }
        } else if (type == "wait") {
            int n = std::atoi(arg(1).c_str()); if (n > 0) waitRemaining_ = n;
        } else if (type == "ramp") {
            std::string rg = arg(2); auto dd = rg.find("..");
            double from = 0, to = 1;
            if (dd != std::string::npos) { from = resolveExpr(rg.substr(0, dd)); to = resolveExpr(rg.substr(dd + 2)); }
            emitRamp(arg(1), from, to, parseDuration(arg(3), tickSamples_));
        } else if (type == "array" || type == "sendrandom") {
            std::vector<double> vals = parseList(arg(2));
            if (type == "sendrandom") for (size_t i = vals.size(); i > 1; --i) std::swap(vals[i - 1], vals[static_cast<size_t>(rnd() * i)]);
            double dur = tickSamples_;
            for (size_t i = 3; i < tk.size(); ++i) { double d = parseDuration(tk[i], -1); if (d > 0) dur = d; }
            emitArray(arg(1), vals, dur);
        } else if (type == "pulse") {
            const int port = handlePort(arg(1));
            if (!arg(2).empty() && arg(2).front() == '[') {
                std::vector<double> vals = parseList(arg(2));
                double pw = parseDuration(arg(3), tickSamples_ * 0.5);
                double total = tk.size() > 4 ? parseDuration(arg(4), tickSamples_) : tickSamples_;
                double stepS = total / std::max<size_t>(1, vals.size());
                for (size_t k = 0; k < vals.size(); ++k) { double on = now_ + k * stepS; pending_.push_back({on, EventType::NoteOn, port, vals[k]}); pending_.push_back({on + std::max(1.0, pw), EventType::NoteOff, port, 0}); }
            } else {
                double ms = parseDuration(arg(2), tickSamples_);
                pending_.push_back({now_, EventType::NoteOn, port, 1.0});
                pending_.push_back({now_ + std::max(1.0, ms), EventType::NoteOff, port, 0});
            }
        } else if (type == "random") {
            std::string target = arg(1), vtok = arg(2); double picked;
            if (!vtok.empty() && vtok.front() == '[') { auto items = parseList(vtok); if (items.empty()) return; picked = items[static_cast<size_t>(rnd() * items.size())]; }
            else if (vtok.find("..") != std::string::npos) { auto dd = vtok.find(".."); double a = resolveExpr(vtok.substr(0, dd)); double b = resolveExpr(vtok.substr(dd + 2)); picked = std::min(a, b) + rnd() * std::fabs(b - a); }
            else picked = rnd();
            if (!target.empty() && target[0] == '$') vars_[stripVar(target)] = picked;
            else emit(handlePort(target), EventType::Value, picked);
        }
        // print / unknown -> no-op
    }

    static std::string joinFromTo(const std::vector<std::string>& tk, size_t a, size_t b) { std::string r; for (size_t k = a; k < b; ++k) { if (k > a) r += " "; r += tk[k]; } return r; }

    void emit(int port, EventType t, double v) { pending_.push_back({now_, t, port, v}); }
    void emitArray(const std::string& h, const std::vector<double>& vals, double durSamples) {
        if (vals.empty()) return;
        const int port = handlePort(h);
        const double step = durSamples / vals.size();
        for (size_t k = 0; k < vals.size(); ++k) pending_.push_back({now_ + k * step, EventType::Value, port, vals[k]});
    }
    void emitRamp(const std::string& h, double from, double to, double durSamples) {
        const int port = handlePort(h);
        if (durSamples <= 0) { pending_.push_back({now_, EventType::Value, port, to}); return; }
        const double stepS = 0.016 * sr_; // ~60 Hz
        const int steps = std::max(1, static_cast<int>(std::ceil(durSamples / stepS)));
        for (int i = 0; i <= steps; ++i) { double t = std::min(1.0, i / static_cast<double>(steps)); pending_.push_back({now_ + i * stepS, EventType::Value, port, from + (to - from) * t}); }
    }

    double rnd() { rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5; return (rng_ & 0xFFFFFF) / static_cast<double>(0x1000000); }

    // state
    float sr_ = 48000.0f;
    std::string script_;
    std::vector<std::string> lines_;
    int active_ = 0, repeatRemaining_ = 0, waitRemaining_ = 0;
    bool jumped_ = false, inRepeat_ = false;
    double tickSamples_ = 24000.0, now_ = 0.0;
    std::map<std::string, double> vars_;
    std::set<int> onceFired_;
    std::vector<Sched> pending_;
    uint32_t rng_ = 0x12345678u;
    // expression evaluator scratch
    std::string src_;
    size_t pos_ = 0;
};

} // namespace synflow
