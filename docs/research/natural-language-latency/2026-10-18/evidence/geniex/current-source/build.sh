#!/usr/bin/env bash
set -euo pipefail

cd /workspace
research=artifacts/natural-language-latency/geniex-research
runtime="$research/runtime/geniex-bench-android-arm64-v0.9.1"
"${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android34-clang++" \
  -O2 -std=c++17 -static-libstdc++ \
  -I "$research/sdk/include" -I artifacts/natural-language-latency/llama.cpp/vendor/nlohmann \
  scripts/natural-language/mobile_latency/geniex/runner.cpp \
  -L "$runtime/lib" -lgeniex -Wl,-rpath,'$ORIGIN/../lib' \
  -o "$runtime/bin/finance-geniex-runner"
