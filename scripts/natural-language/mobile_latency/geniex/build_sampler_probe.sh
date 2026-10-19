#!/usr/bin/env bash
set -euo pipefail

cd /workspace
research=artifacts/natural-language-latency/geniex-research
runtime="$research/runtime/geniex-bench-android-arm64-v0.9.1"
"${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android34-clang++" \
  -O2 -std=c++20 -static-libstdc++ \
  -I "$research/proc/include" -I artifacts/natural-language-latency/llama.cpp/vendor/nlohmann \
  -I "$research/proc/third-party/xtensor/include" -I "$research/proc/third-party/xtl/include" \
  scripts/natural-language/mobile_latency/geniex/sampler_probe.cpp \
  -L "$runtime/lib/qairt" -lgeniex-proc -Wl,-rpath,'$ORIGIN/../lib/qairt' \
  -o "$runtime/bin/finance-geniex-sampler-probe"
