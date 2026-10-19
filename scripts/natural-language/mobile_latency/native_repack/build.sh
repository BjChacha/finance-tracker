#!/usr/bin/env bash
set -euo pipefail

cd /workspace/artifacts/natural-language-latency/llama.cpp
cp docs/backend/snapdragon/CMakeUserPresets.json CMakeUserPresets.json
cmake --preset arm64-android-snapdragon-release -B build-repack \
  -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_SERVER=ON -DGGML_BACKEND_DL=ON \
  -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF
cmake --build build-repack --parallel 6 --target llama-server ggml-hexagon ggml-cpu

"${ANDROID_NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android34-clang++" \
  -O2 -std=c++17 -static-libstdc++ -I ggml/include \
  /workspace/scripts/natural-language/mobile_latency/native_repack/roundtrip.cpp \
  -L build-repack/bin -lggml -lggml-base -Wl,-rpath,'$ORIGIN/../lib' \
  -o build-repack/bin/repack-roundtrip
