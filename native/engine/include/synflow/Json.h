#pragma once

// Minimal, dependency-free JSON parser — enough to read Synflow flow JSON
// (objects/arrays/strings/numbers/bool/null). Kept tiny on purpose; at the
// plugin-shell stage this can be swapped for juce::JSON. Not a general-purpose
// JSON library — no streaming, modest error reporting.

#include <cstdlib>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace synflow {

struct JsonValue {
    enum class Type { Null, Bool, Number, String, Array, Object };
    Type type = Type::Null;
    bool b = false;
    double num = 0.0;
    std::string str;
    std::vector<JsonValue> arr;
    std::map<std::string, JsonValue> obj;

    bool isObject() const { return type == Type::Object; }
    bool isArray() const { return type == Type::Array; }
    bool isNumber() const { return type == Type::Number; }

    const JsonValue* find(const std::string& key) const {
        auto it = obj.find(key);
        return it == obj.end() ? nullptr : &it->second;
    }
    double asNumber(double dflt = 0.0) const { return type == Type::Number ? num : dflt; }
    bool asBool(bool dflt = false) const { return type == Type::Bool ? b : dflt; }
    std::string asString(const std::string& dflt = "") const { return type == Type::String ? str : dflt; }
};

class JsonParser {
public:
    static JsonValue parse(const std::string& text) {
        JsonParser p(text);
        p.skipWs();
        JsonValue v = p.parseValue();
        p.skipWs();
        return v;
    }

private:
    explicit JsonParser(const std::string& t) : s_(t) {}
    const std::string& s_;
    size_t i_ = 0;

    [[noreturn]] void fail(const std::string& msg) {
        throw std::runtime_error("JSON parse error at " + std::to_string(i_) + ": " + msg);
    }
    char peek() { return i_ < s_.size() ? s_[i_] : '\0'; }
    char next() { return i_ < s_.size() ? s_[i_++] : '\0'; }
    void skipWs() {
        while (i_ < s_.size()) {
            char c = s_[i_];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i_++;
            else break;
        }
    }

    JsonValue parseValue() {
        skipWs();
        char c = peek();
        switch (c) {
            case '{': return parseObject();
            case '[': return parseArray();
            case '"': { JsonValue v; v.type = JsonValue::Type::String; v.str = parseString(); return v; }
            case 't': case 'f': return parseBool();
            case 'n': return parseNull();
            default:  return parseNumber();
        }
    }

    JsonValue parseObject() {
        JsonValue v; v.type = JsonValue::Type::Object;
        next(); // {
        skipWs();
        if (peek() == '}') { next(); return v; }
        while (true) {
            skipWs();
            if (peek() != '"') fail("expected key string");
            std::string key = parseString();
            skipWs();
            if (next() != ':') fail("expected ':'");
            v.obj[key] = parseValue();
            skipWs();
            char c = next();
            if (c == ',') continue;
            if (c == '}') break;
            fail("expected ',' or '}'");
        }
        return v;
    }

    JsonValue parseArray() {
        JsonValue v; v.type = JsonValue::Type::Array;
        next(); // [
        skipWs();
        if (peek() == ']') { next(); return v; }
        while (true) {
            v.arr.push_back(parseValue());
            skipWs();
            char c = next();
            if (c == ',') continue;
            if (c == ']') break;
            fail("expected ',' or ']'");
        }
        return v;
    }

    std::string parseString() {
        if (next() != '"') fail("expected '\"'");
        std::string out;
        while (true) {
            char c = next();
            if (c == '\0') fail("unterminated string");
            if (c == '"') break;
            if (c == '\\') {
                char e = next();
                switch (e) {
                    case '"': out += '"'; break;
                    case '\\': out += '\\'; break;
                    case '/': out += '/'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'n': out += '\n'; break;
                    case 'r': out += '\r'; break;
                    case 't': out += '\t'; break;
                    case 'u': {
                        unsigned cp = 0;
                        for (int k = 0; k < 4; ++k) {
                            char h = next();
                            cp <<= 4;
                            if (h >= '0' && h <= '9') cp |= unsigned(h - '0');
                            else if (h >= 'a' && h <= 'f') cp |= unsigned(h - 'a' + 10);
                            else if (h >= 'A' && h <= 'F') cp |= unsigned(h - 'A' + 10);
                            else fail("bad \\u escape");
                        }
                        // minimal UTF-8 encode of the BMP code point
                        if (cp < 0x80) out += char(cp);
                        else if (cp < 0x800) { out += char(0xC0 | (cp >> 6)); out += char(0x80 | (cp & 0x3F)); }
                        else { out += char(0xE0 | (cp >> 12)); out += char(0x80 | ((cp >> 6) & 0x3F)); out += char(0x80 | (cp & 0x3F)); }
                        break;
                    }
                    default: fail("bad escape");
                }
            } else {
                out += c;
            }
        }
        return out;
    }

    JsonValue parseNumber() {
        size_t start = i_;
        if (peek() == '-' || peek() == '+') next();
        while (true) {
            char c = peek();
            if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') next();
            else break;
        }
        if (i_ == start) fail("invalid number");
        JsonValue v; v.type = JsonValue::Type::Number;
        v.num = std::strtod(s_.c_str() + start, nullptr);
        return v;
    }

    JsonValue parseBool() {
        JsonValue v; v.type = JsonValue::Type::Bool;
        if (s_.compare(i_, 4, "true") == 0) { i_ += 4; v.b = true; }
        else if (s_.compare(i_, 5, "false") == 0) { i_ += 5; v.b = false; }
        else fail("invalid bool");
        return v;
    }

    JsonValue parseNull() {
        if (s_.compare(i_, 4, "null") == 0) { i_ += 4; return JsonValue{}; }
        fail("invalid null");
    }
};

} // namespace synflow
