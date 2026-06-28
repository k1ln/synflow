#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

#include "../Node.h"

// Bucket B — DynamicCompressorFlowNode. A faithful port of the Web Audio
// DynamicsCompressor algorithm so output matches Chrome sample-for-sample
// (lookahead pre-delay + adaptive release + perceptual makeup gain). Verified
// against real Chrome via native/parity (compressor: was 0.8 dB error -> parity).
//
// Ported from WebKit's DynamicsCompressorKernel.cpp / DynamicsCompressor.cpp
// (Copyright (C) 2011 Google Inc., BSD-3-Clause). Adapted to a single channel
// (Web Audio runs the compressor in stereo, but for a mono signal the detector
// max and the L=R downmix reduce to the mono computation, so output matches).

namespace synflow {

class DynamicCompressorNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sampleRate, int maxBlock) override {
        INode::prepare(sampleRate, maxBlock);
        sr_ = sampleRate;
        preDelay_.assign(kMaxPreDelayFrames, 0.0f);
        // reset()
        detectorAverage_ = 0.0f;
        compressorGain_ = 1.0f;
        preDelayReadIndex_ = 0;
        preDelayWriteIndex_ = kDefaultPreDelayFrames;
        lastPreDelayFrames_ = kDefaultPreDelayFrames;
        maxAttackCompressionDiffDb_ = -1.0f;
        // invalidate curve cache so it recomputes on first process
        cDbThreshold_ = cDbKnee_ = cRatio_ = -1e9f;
    }

    void setNamedParam(const std::string& name, double value) override {
        const float v = static_cast<float>(value);
        if (name == "threshold") threshold_ = v;
        else if (name == "knee") knee_ = v;
        else if (name == "ratio") ratio_ = v;
        else if (name == "attack") attack_ = v;
        else if (name == "release") release_ = v;
    }

    void process(const ProcessContext& ctx) override {
        const float sampleRate = sr_;
        const float dryMix = 1.0f - kEffectBlend;
        const float wetMix = kEffectBlend;

        const float k = updateStaticCurveParameters(threshold_, knee_, ratio_);

        // Makeup gain (perceptual tuning, exponent 0.6).
        float fullRangeMakeupGain = std::pow(1.0f / saturate(1.0f, k), 0.6f);
        const float masterLinearGain = decibelsToLinear(kPostGain) * fullRangeMakeupGain;

        const float attackTime = std::max(0.001f, attack_);
        const float attackFrames = attackTime * sampleRate;
        const float releaseFrames = sampleRate * release_;
        const float satReleaseFrames = 0.0025f * sampleRate;

        // 4th-order adaptive-release curve through the four release zones.
        const float y1 = releaseFrames * 0.09f, y2 = releaseFrames * 0.16f;
        const float y3 = releaseFrames * 0.42f, y4 = releaseFrames * 0.98f;
        const float kA = 0.9999999999999998f * y1 + 1.8432219684323923e-16f * y2 - 1.9373394351676423e-16f * y3 + 8.824516011816245e-18f * y4;
        const float kB = -1.5788320352845888f * y1 + 2.3305837032074286f * y2 - 0.9141194204840429f * y3 + 0.1623677525612032f * y4;
        const float kC = 0.5334142869106424f * y1 - 1.272736789213631f * y2 + 0.9258856042207512f * y3 - 0.18656310191776226f * y4;
        const float kD = 0.08783463138207234f * y1 - 0.1694162967925622f * y2 + 0.08588057951595272f * y3 - 0.00429891410546283f * y4;
        const float kE = -0.042416883008123074f * y1 + 0.1115693827987602f * y2 - 0.09764676325265872f * y3 + 0.028494263462021576f * y4;

        setPreDelayTime(kPreDelayTime);

        const float halfPi = 0.5f * 3.14159265358979323846f;
        const int nDivisionFrames = 32;
        int frameIndex = 0;
        const int total = ctx.frames;

        while (frameIndex < total) {
            const int divFrames = std::min(nDivisionFrames, total - frameIndex);

            // ---- per-division desired gain + envelope rate ----
            if (std::isnan(detectorAverage_) || std::isinf(detectorAverage_)) detectorAverage_ = 1.0f;
            const float desiredGain = detectorAverage_;
            const float scaledDesiredGain = std::asin(desiredGain) / halfPi;

            float envelopeRate;
            const bool isReleasing = scaledDesiredGain > compressorGain_;
            float compressionDiffDb = linearToDecibels(compressorGain_ / scaledDesiredGain);

            if (isReleasing) {
                maxAttackCompressionDiffDb_ = -1.0f;
                if (std::isnan(compressionDiffDb) || std::isinf(compressionDiffDb)) compressionDiffDb = -1.0f;
                float x = std::min(0.0f, std::max(-12.0f, compressionDiffDb));
                x = 0.25f * (x + 12.0f);
                const float x2 = x * x, x3 = x2 * x, x4 = x2 * x2;
                const float relFrames = kA + kB * x + kC * x2 + kD * x3 + kE * x4;
                const float dbPerFrame = 5.0f /* kSpacingDb */ / relFrames;
                envelopeRate = decibelsToLinear(dbPerFrame);
            } else {
                if (std::isnan(compressionDiffDb) || std::isinf(compressionDiffDb)) compressionDiffDb = 1.0f;
                if (maxAttackCompressionDiffDb_ == -1.0f || maxAttackCompressionDiffDb_ < compressionDiffDb)
                    maxAttackCompressionDiffDb_ = compressionDiffDb;
                const float effAttenDiffDb = std::max(0.5f, maxAttackCompressionDiffDb_);
                const float x = 0.25f / effAttenDiffDb;
                envelopeRate = 1.0f - std::pow(x, 1.0f / attackFrames);
            }

            // ---- inner sample loop ----
            int rIdx = preDelayReadIndex_, wIdx = preDelayWriteIndex_;
            float detAvg = detectorAverage_, compGain = compressorGain_;
            for (int n = 0; n < divFrames; ++n) {
                const float undelayed = in[0][static_cast<size_t>(frameIndex)];
                preDelay_[static_cast<size_t>(wIdx)] = undelayed;
                const float absInput = std::fabs(undelayed);

                const float shapedInput = saturate(absInput, k);
                const float attenuation = absInput <= 0.0001f ? 1.0f : shapedInput / absInput;
                float attenuationDb = -linearToDecibels(attenuation);
                attenuationDb = std::max(2.0f, attenuationDb);
                const float satReleaseRate = decibelsToLinear(attenuationDb / satReleaseFrames) - 1.0f;
                const float rate = (attenuation > detAvg) ? satReleaseRate : 1.0f;
                detAvg += (attenuation - detAvg) * rate;
                detAvg = std::min(1.0f, detAvg);
                if (std::isnan(detAvg) || std::isinf(detAvg)) detAvg = 1.0f;

                if (envelopeRate < 1.0f) {
                    compGain += (scaledDesiredGain - compGain) * envelopeRate;
                } else {
                    compGain *= envelopeRate;
                    compGain = std::min(1.0f, compGain);
                }

                const float postWarp = std::sin(halfPi * compGain);
                const float totalGain = dryMix + wetMix * masterLinearGain * postWarp;
                out[0][static_cast<size_t>(frameIndex)] = preDelay_[static_cast<size_t>(rIdx)] * totalGain;

                ++frameIndex;
                rIdx = (rIdx + 1) & kMaxPreDelayFramesMask;
                wIdx = (wIdx + 1) & kMaxPreDelayFramesMask;
            }
            preDelayReadIndex_ = rIdx;
            preDelayWriteIndex_ = wIdx;
            detectorAverage_ = flushDenorm(detAvg);
            compressorGain_ = flushDenorm(compGain);
        }
    }

private:
    static constexpr int kMaxPreDelayFrames = 1024;
    static constexpr int kMaxPreDelayFramesMask = kMaxPreDelayFrames - 1;
    static constexpr int kDefaultPreDelayFrames = 256;
    static constexpr float kPreDelayTime = 0.006f;
    static constexpr float kPostGain = 0.0f;
    static constexpr float kEffectBlend = 1.0f;

    static float linearToDecibels(float linear) { return 20.0f * std::log10(linear); }
    static float decibelsToLinear(float db) { return std::pow(10.0f, 0.05f * db); }
    static float flushDenorm(float x) { return std::fabs(x) < 1e-30f ? 0.0f : x; }

    void setPreDelayTime(float preDelayTime) {
        int preDelayFrames = static_cast<int>(preDelayTime * sr_);
        if (preDelayFrames > kMaxPreDelayFrames - 1) preDelayFrames = kMaxPreDelayFrames - 1;
        if (lastPreDelayFrames_ != preDelayFrames) {
            lastPreDelayFrames_ = preDelayFrames;
            std::fill(preDelay_.begin(), preDelay_.end(), 0.0f);
            preDelayReadIndex_ = 0;
            preDelayWriteIndex_ = preDelayFrames;
        }
    }

    float kneeCurve(float x, float k) {
        if (x < linearThreshold_) return x;
        return linearThreshold_ + (1.0f - std::exp(-k * (x - linearThreshold_))) / k;
    }
    float saturate(float x, float k) {
        if (x < kneeThreshold_) return kneeCurve(x, k);
        const float xDb = linearToDecibels(x);
        const float yDb = ykneeThresholdDb_ + slope_ * (xDb - kneeThresholdDb_);
        return decibelsToLinear(yDb);
    }
    float slopeAt(float x, float k) {
        if (x < linearThreshold_) return 1.0f;
        const float x2 = x * 1.001f;
        const float xDb = linearToDecibels(x), x2Db = linearToDecibels(x2);
        const float yDb = linearToDecibels(kneeCurve(x, k)), y2Db = linearToDecibels(kneeCurve(x2, k));
        return (y2Db - yDb) / (x2Db - xDb);
    }
    float kAtSlope(float desiredSlope) {
        const float xDb = cDbThreshold_ + cDbKnee_;
        const float x = decibelsToLinear(xDb);
        float minK = 0.1f, maxK = 10000.0f, k = 5.0f;
        for (int i = 0; i < 15; ++i) {
            if (slopeAt(x, k) < desiredSlope) maxK = k; else minK = k;
            k = std::sqrt(minK * maxK);
        }
        return k;
    }
    float updateStaticCurveParameters(float dbThreshold, float dbKnee, float ratio) {
        if (dbThreshold != cDbThreshold_ || dbKnee != cDbKnee_ || ratio != cRatio_) {
            cDbThreshold_ = dbThreshold;
            linearThreshold_ = decibelsToLinear(dbThreshold);
            cDbKnee_ = dbKnee;
            cRatio_ = ratio;
            slope_ = 1.0f / ratio;
            const float k = kAtSlope(1.0f / ratio);
            kneeThresholdDb_ = dbThreshold + dbKnee;
            kneeThreshold_ = decibelsToLinear(kneeThresholdDb_);
            ykneeThresholdDb_ = linearToDecibels(kneeCurve(kneeThreshold_, k));
            K_ = k;
        }
        return K_;
    }

    // params (flow / Web Audio defaults)
    float sr_ = 48000.0f;
    float threshold_ = -24.0f, knee_ = 30.0f, ratio_ = 12.0f, attack_ = 0.003f, release_ = 0.25f;

    // static-curve cache
    float cDbThreshold_ = -1e9f, cDbKnee_ = -1e9f, cRatio_ = -1e9f;
    float linearThreshold_ = 0, kneeThresholdDb_ = 0, kneeThreshold_ = 0, ykneeThresholdDb_ = 0, slope_ = 0, K_ = 0;

    // pre-delay (lookahead)
    std::vector<float> preDelay_;
    int preDelayReadIndex_ = 0, preDelayWriteIndex_ = kDefaultPreDelayFrames, lastPreDelayFrames_ = kDefaultPreDelayFrames;

    // dynamics state
    float detectorAverage_ = 0, compressorGain_ = 1, maxAttackCompressionDiffDb_ = -1;
};

} // namespace synflow
