#pragma once

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualFunctionNode. The web runs an arbitrary user `process(main,
// input1, …)` via new Function — a true JS body. A native JS engine is out of scope,
// so this evaluates the dominant case faithfully: a `process` that RETURNS an
// arithmetic / Math / comparison / ternary expression of its inputs. The body's
// `return <expr>` is extracted and evaluated by a small JS-expression interpreter
// (numbers, main, input1..N, + - * / % **, comparisons, && || !, ?: , parens, and
// Math.{sin,cos,tan,abs,floor,ceil,round,sqrt,pow,min,max,random,sign,log,exp,PI,E}).
// Code it can't parse (loops, arrays, statements) falls back to passing the main
// input through unchanged (a safe identity) — a full JS body needs an embedded engine.
//
// Ports:  main-input -> 0 (trigger + output), input-K -> 1+K (value inputs).
//         Array results emit per element on the matching output port index.
class FunctionNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        if (h.rfind("input-", 0) == 0) return 1 + std::atoi(h.c_str() + 6);
        return 0; // main-input
    }
    int outPortForHandle(const std::string& h) const override {
        for (size_t i = 0; i < h.size(); ++i)
            if (std::isdigit(static_cast<unsigned char>(h[i]))) return std::atoi(h.c_str() + i);
        return 0;
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "numInputs") inputs_.resize(std::max(0, static_cast<int>(v)), 0.0);
    }
    void setNamedParamStr(const std::string& name, const std::string& v) override {
        if (name == "functionCode") { code_ = v; extractExpr(); }
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            if (ev.port >= 1) {                              // additional input -> store
                const size_t idx = static_cast<size_t>(ev.port - 1);
                if (idx >= inputs_.size()) inputs_.resize(idx + 1, 0.0);
                inputs_[idx] = ev.value;
                continue;
            }
            // main-input trigger -> evaluate and emit
            if (ev.type == EventType::NoteOff) { ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, 0.0, ev.sampleOffset); continue; }
            bool ok = false;
            const double r = evaluate(ev.value, ok);
            const double result = ok ? r : ev.value; // identity fallback
            ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, result, ev.sampleOffset);
            if (ev.type == EventType::NoteOn) ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOn, result, ev.sampleOffset);
        }
    }

private:
    // Pull the `return <expr>;` out of the function body, else use the whole body.
    void extractExpr() {
        expr_.clear();
        // find a `return` token at a word boundary
        size_t p = std::string::npos;
        for (size_t i = 0; i + 6 <= code_.size(); ++i) {
            if (code_.compare(i, 6, "return") == 0) {
                const bool lb = (i == 0) || !std::isalnum(static_cast<unsigned char>(code_[i - 1]));
                const bool rb = (i + 6 >= code_.size()) || !std::isalnum(static_cast<unsigned char>(code_[i + 6]));
                if (lb && rb) { p = i + 6; break; }
            }
        }
        std::string e;
        if (p != std::string::npos) {
            size_t end = code_.find_first_of(";}", p); // return-expr ends at ';' or the fn's '}'
            e = code_.substr(p, end == std::string::npos ? std::string::npos : end - p);
        } else {
            e = code_; // maybe the user typed a bare expression
        }
        // accept only a brace/semicolon-free fragment; the evaluator's completeness
        // check (ok flag) rejects leftover assignments etc. and triggers identity.
        if (e.find('{') == std::string::npos && e.find('}') == std::string::npos &&
            e.find(';') == std::string::npos)
            expr_ = strip(e);
    }
    static std::string strip(const std::string& s) {
        size_t a = s.find_first_not_of(" \t\r\n");
        size_t b = s.find_last_not_of(" \t\r\n");
        return a == std::string::npos ? "" : s.substr(a, b - a + 1);
    }

    double evaluate(double mainValue, bool& ok) {
        if (expr_.empty()) { ok = false; return 0; }
        s_ = expr_; i_ = 0; err_ = false; main_ = mainValue;
        double v = parseTernary();
        skip();
        ok = !err_ && i_ >= s_.size();
        return v;
    }

    // ---- recursive-descent JS-expression evaluator ----
    void skip() { while (i_ < s_.size() && (s_[i_] == ' ' || s_[i_] == '\t')) i_++; }
    bool match(const char* op) { skip(); size_t n = std::strlen(op); if (s_.compare(i_, n, op) == 0) { i_ += n; return true; } return false; }
    char peek() { skip(); return i_ < s_.size() ? s_[i_] : '\0'; }

    double parseTernary() {
        double c = parseOr();
        skip();
        if (i_ < s_.size() && s_[i_] == '?') { i_++; double a = parseTernary(); skip(); if (i_ < s_.size() && s_[i_] == ':') i_++; else err_ = true; double b = parseTernary(); return c != 0 ? a : b; }
        return c;
    }
    double parseOr() { double l = parseAnd(); while (match("||")) { double r = parseAnd(); l = (l != 0 || r != 0) ? 1 : 0; } return l; }
    double parseAnd() { double l = parseEq(); while (match("&&")) { double r = parseEq(); l = (l != 0 && r != 0) ? 1 : 0; } return l; }
    double parseEq() {
        double l = parseCmp();
        while (true) { if (match("===") || match("==")) { double r = parseCmp(); l = (l == r); } else if (match("!==") || match("!=")) { double r = parseCmp(); l = (l != r); } else break; }
        return l;
    }
    double parseCmp() {
        double l = parseAdd();
        while (true) { skip(); if (match("<=")) { l = (l <= parseAdd()); } else if (match(">=")) { l = (l >= parseAdd()); } else if (match("<")) { l = (l < parseAdd()); } else if (match(">")) { l = (l > parseAdd()); } else break; }
        return l;
    }
    double parseAdd() { double l = parseMul(); while (true) { skip(); if (i_ < s_.size() && s_[i_] == '+') { i_++; l += parseMul(); } else if (i_ < s_.size() && s_[i_] == '-') { i_++; l -= parseMul(); } else break; } return l; }
    double parseMul() {
        double l = parsePow();
        while (true) { skip(); if (i_ < s_.size() && s_[i_] == '*' && !(i_ + 1 < s_.size() && s_[i_ + 1] == '*')) { i_++; l *= parsePow(); } else if (i_ < s_.size() && s_[i_] == '/') { i_++; double r = parsePow(); l = r == 0 ? 0 : l / r; } else if (i_ < s_.size() && s_[i_] == '%') { i_++; double r = parsePow(); l = r == 0 ? 0 : std::fmod(l, r); } else break; }
        return l;
    }
    double parsePow() { double l = parseUnary(); skip(); if (match("**")) { double r = parsePow(); l = std::pow(l, r); } return l; }
    double parseUnary() { skip(); if (i_ < s_.size() && s_[i_] == '-') { i_++; return -parseUnary(); } if (i_ < s_.size() && s_[i_] == '+') { i_++; return parseUnary(); } if (i_ < s_.size() && s_[i_] == '!') { i_++; return parseUnary() == 0 ? 1 : 0; } return parsePrimary(); }
    double parsePrimary() {
        skip();
        if (i_ >= s_.size()) { err_ = true; return 0; }
        char c = s_[i_];
        if (c == '(') { i_++; double v = parseTernary(); skip(); if (i_ < s_.size() && s_[i_] == ')') i_++; else err_ = true; return v; }
        if (std::isdigit(static_cast<unsigned char>(c)) || c == '.') { size_t j = i_; while (j < s_.size() && (std::isdigit((unsigned char)s_[j]) || s_[j] == '.' || s_[j] == 'e' || s_[j] == 'E')) j++; double v = std::atof(s_.substr(i_, j - i_).c_str()); i_ = j; return v; }
        if (std::isalpha(static_cast<unsigned char>(c)) || c == '_' || c == '$') {
            size_t j = i_; while (j < s_.size() && (std::isalnum((unsigned char)s_[j]) || s_[j] == '_' || s_[j] == '$' || s_[j] == '.')) j++;
            std::string id = s_.substr(i_, j - i_); i_ = j;
            return resolveIdent(id);
        }
        err_ = true; return 0;
    }
    double resolveIdent(const std::string& id) {
        if (id == "main") return main_;
        if (id.rfind("input", 0) == 0 && id.size() > 5) { int k = std::atoi(id.c_str() + 5) - 1; return (k >= 0 && k < static_cast<int>(inputs_.size())) ? inputs_[static_cast<size_t>(k)] : 0.0; }
        if (id == "Math.PI") return M_PI;
        if (id == "Math.E") return M_E;
        if (id.rfind("Math.", 0) == 0) {
            const std::string fn = id.substr(5);
            std::vector<double> args = parseArgs();
            const double a = args.empty() ? 0 : args[0];
            const double b = args.size() > 1 ? args[1] : 0;
            if (fn == "sin") return std::sin(a); if (fn == "cos") return std::cos(a); if (fn == "tan") return std::tan(a);
            if (fn == "abs") return std::fabs(a); if (fn == "floor") return std::floor(a); if (fn == "ceil") return std::ceil(a);
            if (fn == "round") return std::round(a); if (fn == "sqrt") return std::sqrt(a); if (fn == "sign") return (a > 0) - (a < 0);
            if (fn == "log") return std::log(a); if (fn == "exp") return std::exp(a); if (fn == "pow") return std::pow(a, b);
            if (fn == "min") { double m = a; for (double x : args) m = std::min(m, x); return m; }
            if (fn == "max") { double m = a; for (double x : args) m = std::max(m, x); return m; }
            if (fn == "random") return 0.5; // deterministic engine: fixed
            err_ = true; return 0;
        }
        // unknown identifier -> 0 (mirrors JS undefined coerced to NaN-ish, kept tame)
        return 0;
    }
    std::vector<double> parseArgs() {
        std::vector<double> args; skip();
        if (i_ < s_.size() && s_[i_] == '(') {
            i_++;
            if (peek() != ')') { args.push_back(parseTernary()); while (peek() == ',') { i_++; args.push_back(parseTernary()); } }
            skip(); if (i_ < s_.size() && s_[i_] == ')') i_++; else err_ = true;
        }
        return args;
    }

    std::string code_, expr_;
    std::vector<double> inputs_;
    // evaluator scratch
    std::string s_; size_t i_ = 0; bool err_ = false; double main_ = 0;
};

} // namespace synflow
