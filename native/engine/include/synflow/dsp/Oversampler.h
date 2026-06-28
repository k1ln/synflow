#pragma once

#include <cmath>
#include <vector>

// Web Audio WaveShaper oversampling, ported from WebKit (Copyright 2011/2013
// Google Inc., BSD-3-Clause): DirectConvolver + UpSampler + DownSampler, used to
// 2x-oversample the waveshaping curve for anti-aliasing. Faithful port so the
// native engine matches Chrome sample-for-sample (incl. the inherent FIR latency
// of kernel/2 per stage, which is what makes the outputs align in a null-test).

namespace synflow {

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Causal FIR convolution with previous-block history. blockSize >= kernelSize.
class DirectConvolver {
public:
    explicit DirectConvolver(int blockSize) : block_(blockSize), buffer_(static_cast<size_t>(2 * blockSize), 0.0f) {}

    void process(const std::vector<float>& kernel, const float* source, float* dest) {
        const int B = block_;
        const int K = static_cast<int>(kernel.size());
        for (int i = 0; i < B; ++i) buffer_[static_cast<size_t>(B + i)] = source[i]; // into 2nd half
        for (int i = 0; i < B; ++i) {
            float sum = 0.0f;
            for (int j = 0; j < K; ++j) sum += buffer_[static_cast<size_t>(B + i - j)] * kernel[static_cast<size_t>(j)];
            dest[i] = sum;
        }
        for (int i = 0; i < B; ++i) buffer_[static_cast<size_t>(i)] = buffer_[static_cast<size_t>(B + i)]; // 2nd->1st
    }
    void reset() { std::fill(buffer_.begin(), buffer_.end(), 0.0f); }

private:
    int block_;
    std::vector<float> buffer_;
};

// 2x upsampler: even output = input delayed by kernel/2; odd output = FIR-interp.
class UpSampler {
public:
    explicit UpSampler(int inputBlockSize)
        : n_(inputBlockSize), conv_(inputBlockSize),
          inputBuffer_(static_cast<size_t>(2 * inputBlockSize), 0.0f),
          kernel_(kKernel), temp_(static_cast<size_t>(inputBlockSize), 0.0f) {
        initKernel();
    }

    // source[n] -> dest[2n]
    void process(const float* source, float* dest) {
        const int N = n_;
        const int halfSize = kKernel / 2;
        for (int i = 0; i < N; ++i) inputBuffer_[static_cast<size_t>(N + i)] = source[i];
        for (int i = 0; i < N; ++i) dest[2 * i] = inputBuffer_[static_cast<size_t>(N - halfSize + i)];
        conv_.process(kernel_, source, temp_.data());
        for (int i = 0; i < N; ++i) dest[2 * i + 1] = temp_[static_cast<size_t>(i)];
        for (int i = 0; i < N; ++i) inputBuffer_[static_cast<size_t>(i)] = inputBuffer_[static_cast<size_t>(N + i)];
    }
    void reset() { conv_.reset(); std::fill(inputBuffer_.begin(), inputBuffer_.end(), 0.0f); }
    int latencyFrames() const { return kKernel / 2; }

private:
    static constexpr int kKernel = 128;
    void initKernel() {
        const double alpha = 0.16, a0 = 0.5 * (1 - alpha), a1 = 0.5, a2 = 0.5 * alpha;
        const int n = kKernel, halfSize = n / 2;
        const double subOff = -0.5;
        for (int i = 0; i < n; ++i) {
            const double s = M_PI * (i - halfSize - subOff);
            const double sinc = (s == 0.0) ? 1.0 : std::sin(s) / s;
            const double x = (i - subOff) / n;
            const double window = a0 - a1 * std::cos(2.0 * M_PI * x) + a2 * std::cos(4.0 * M_PI * x);
            kernel_[static_cast<size_t>(i)] = static_cast<float>(sinc * window);
        }
    }
    int n_;
    DirectConvolver conv_;
    std::vector<float> inputBuffer_, kernel_, temp_;
};

// 2x downsampler (half-band): odd taps only via reducedKernel + 0.5 center tap.
class DownSampler {
public:
    explicit DownSampler(int inputBlockSize)
        : n_(inputBlockSize), conv_(inputBlockSize / 2),
          inputBuffer_(static_cast<size_t>(2 * inputBlockSize), 0.0f),
          reducedKernel_(kKernel / 2), temp_(static_cast<size_t>(inputBlockSize / 2), 0.0f) {
        initKernel();
    }

    // source[n] -> dest[n/2]
    void process(const float* source, float* dest) {
        const int N = n_;
        const int destN = N / 2;
        const int halfSize = kKernel / 2;
        for (int i = 0; i < N; ++i) inputBuffer_[static_cast<size_t>(N + i)] = source[i];
        for (int i = 0; i < destN; ++i) temp_[static_cast<size_t>(i)] = inputBuffer_[static_cast<size_t>((N - 1) + 2 * i)];
        conv_.process(reducedKernel_, temp_.data(), dest);
        for (int i = 0; i < destN; ++i) dest[i] += 0.5f * inputBuffer_[static_cast<size_t>((N - halfSize) + 2 * i)];
        for (int i = 0; i < N; ++i) inputBuffer_[static_cast<size_t>(i)] = inputBuffer_[static_cast<size_t>(N + i)];
    }
    void reset() { conv_.reset(); std::fill(inputBuffer_.begin(), inputBuffer_.end(), 0.0f); }
    int latencyFrames() const { return static_cast<int>(reducedKernel_.size()) / 2; }

private:
    static constexpr int kKernel = 256; // DownSampler's DefaultKernelSize
    void initKernel() {
        const double alpha = 0.16, a0 = 0.5 * (1 - alpha), a1 = 0.5, a2 = 0.5 * alpha;
        const int n = kKernel, halfSize = n / 2;
        const double sincScale = 0.5;
        for (int i = 1; i < n; i += 2) {
            const double s = sincScale * M_PI * (i - halfSize);
            double sinc = (s == 0.0) ? 1.0 : std::sin(s) / s;
            sinc *= sincScale;
            const double x = static_cast<double>(i) / n;
            const double window = a0 - a1 * std::cos(2.0 * M_PI * x) + a2 * std::cos(4.0 * M_PI * x);
            reducedKernel_[static_cast<size_t>((i - 1) / 2)] = static_cast<float>(sinc * window);
        }
    }
    int n_;
    DirectConvolver conv_;
    std::vector<float> inputBuffer_, reducedKernel_, temp_;
};

} // namespace synflow
