#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <vector>

struct Shape {
    int64_t width;
    int64_t rows;
    int64_t slices;
};

static void verify(ggml_backend_t backend, Shape shape) {
    ggml_init_params params = {ggml_tensor_overhead() * 2, nullptr, true};
    ggml_context * context = ggml_init(params);
    if (!context) {
        throw std::runtime_error("Context allocation failed");
    }
    ggml_tensor * tensor = ggml_new_tensor_3d(
        context, GGML_TYPE_Q4_0, shape.width, shape.rows, shape.slices);
    ggml_set_name(tensor, "repack-parity-weight");
    ggml_backend_buffer_t buffer = ggml_backend_alloc_ctx_tensors(context, backend);
    if (!buffer) {
        ggml_free(context);
        throw std::runtime_error("Backend buffer allocation failed");
    }
    ggml_backend_buffer_set_usage(buffer, GGML_BACKEND_BUFFER_USAGE_WEIGHTS);
    const size_t size = ggml_nbytes(tensor);
    const size_t packed_size = ggml_backend_buft_get_alloc_size(
        ggml_backend_get_default_buffer_type(backend), tensor);
    std::vector<uint8_t> source(size), result(size), reference(packed_size);
    uint32_t state = 0x18307295;
    for (auto & byte : source) {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        byte = static_cast<uint8_t>(state);
    }
    bool first = true;
    for (const char * threads : {"1", "2", "4", "8", "0", "invalid"}) {
        setenv("GGML_HEXAGON_REPACK_THREADS", threads, 1);
        // Compare the physical packed bytes as well as the public round trip.
        std::memset(tensor->data, 0xA5, packed_size);
        const auto start = std::chrono::steady_clock::now();
        ggml_backend_tensor_set(tensor, source.data(), 0, size);
        const double elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - start).count();
        ggml_backend_tensor_get(tensor, result.data(), 0, size);
        const bool roundtrip = source == result;
        const bool parity = first || std::memcmp(reference.data(), tensor->data, packed_size) == 0;
        if (first) {
            std::memcpy(reference.data(), tensor->data, packed_size);
            first = false;
        }
        std::printf("{\"width\":%lld,\"rows\":%lld,\"slices\":%lld,"
                    "\"threads\":\"%s\",\"bytes\":%zu,\"elapsed_ms\":%.6f,"
                    "\"roundtrip\":%s,\"packed_equal\":%s}\n",
                    static_cast<long long>(shape.width), static_cast<long long>(shape.rows),
                    static_cast<long long>(shape.slices), threads, size, elapsed,
                    roundtrip ? "true" : "false", parity ? "true" : "false");
        if (!roundtrip || !parity) {
            ggml_backend_buffer_free(buffer);
            ggml_free(context);
            throw std::runtime_error("Weight parity failure");
        }
    }
    ggml_backend_buffer_free(buffer);
    ggml_free(context);
}

int main(int argc, char ** argv) {
    if (argc != 2) {
        std::fprintf(stderr, "Usage: repack-roundtrip LIBRARY_DIRECTORY\n");
        return 2;
    }
    ggml_backend_load_all_from_path(argv[1]);
    ggml_backend_t backend = ggml_backend_init_by_name("HTP0", nullptr);
    if (!backend) {
        std::fprintf(stderr, "HTP0 backend initialization failed\n");
        return 2;
    }
    try {
        for (const Shape shape : std::array<Shape, 9>{{
                 {32, 32, 1}, {1024, 31, 1}, {1024, 33, 1},
                 {1024, 2048, 1}, {4096, 4096, 1}, {4096, 3072, 1},
                 {4096, 3136, 1}, {4096, 4097, 1}, {1024, 2048, 2}}}) {
            verify(backend, shape);
        }
    } catch (const std::exception & error) {
        std::fprintf(stderr, "%s\n", error.what());
        ggml_backend_free(backend);
        return 1;
    }
    ggml_backend_free(backend);
    return 0;
}
