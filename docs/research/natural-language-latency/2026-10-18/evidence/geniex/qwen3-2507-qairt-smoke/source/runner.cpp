// Run independent local requests through the pinned GenieX C API.
#include "geniex.h"
#include "json.hpp"

#include <chrono>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <unistd.h>

using json = nlohmann::json;
using Clock = std::chrono::steady_clock;

static double milliseconds(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

static void emit(const json& value) {
    std::cout << "BENCH_JSON " << value.dump() << std::endl;
}

static void require_success(int32_t code, const char* operation) {
    if (code != GENIEX_SUCCESS) {
        throw std::runtime_error(std::string(operation) + ": " + std::to_string(code));
    }
}

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    const auto process_start = Clock::now();
    emit({{"event", "started"}, {"pid", getpid()}});
    geniex_LLM* model = nullptr;
    bool initialized = false;
    try {
        std::ifstream input(argv[1]);
        if (!input) throw std::runtime_error("Cannot open request file");
        const auto configuration = json::parse(input);
        const auto plugin = configuration.at("plugin").get<std::string>();
        const auto model_path = configuration.at("model_path").get<std::string>();
        geniex_set_log_level(GENIEX_LOG_LEVEL_ERROR);
        require_success(geniex_init(), "init");
        initialized = true;
        geniex_LlmCreateInput creation{};
        creation.model_path = model_path.c_str();
        creation.plugin_id = plugin.c_str();
        creation.device_id = plugin == "qairt" ? "NPU" : "HTP0";
        creation.config.n_ctx = plugin == "qairt" ? 0 : 4096;
        creation.config.n_gpu_layers = plugin == "qairt" ? 0 : 99;
        creation.config.n_threads = 4;
        creation.config.n_threads_batch = 4;
        creation.config.n_batch = 512;
        creation.config.n_ubatch = 512;
        creation.config.n_seq_max = 1;
        creation.config.power_mode = GENIEX_POWER_MODE_BALANCED;
        require_success(geniex_llm_create(&creation, &model), "create");
        const auto* plugin_version = geniex_get_plugin_version(plugin.c_str());
        emit({{"event", "ready"}, {"load_ms", milliseconds(process_start)},
              {"sdk_version", geniex_version()},
              {"plugin_version", plugin_version ? plugin_version : "unknown"}});
        for (const auto& request : configuration.at("requests")) {
            const auto start = Clock::now();
            require_success(geniex_llm_reset(model), "reset");
            const auto prompt = request.at("prompt").get<std::string>();
            const auto grammar = request.at("grammar").get<std::string>();
            geniex_SamplerConfig sampler{};
            // Zero defers to bundle defaults in QAIRT. Negative is greedy.
            sampler.temperature = -1.0f;
            sampler.top_k = 1;
            sampler.top_p = 1.0f;
            sampler.repetition_penalty = 1.0f;
            sampler.seed = 42;
            sampler.grammar_string = grammar.c_str();
            geniex_GenerationConfig generation{};
            generation.max_tokens = 256;
            generation.sampler_config = &sampler;
            geniex_LlmGenerateInput query{};
            query.prompt_utf8 = prompt.c_str();
            query.config = &generation;
            geniex_LlmGenerateOutput output{};
            const auto code = geniex_llm_generate(model, &query, &output);
            const auto& profile = output.profile_data;
            json result = {
                {"event", "result"}, {"id", request.at("id")}, {"code", code},
                {"elapsed_ms", milliseconds(start)},
                {"process_elapsed_ms", milliseconds(process_start)},
                {"response", output.full_text ? output.full_text : ""},
                {"stop_reason", profile.stop_reason ? profile.stop_reason : "unknown"},
                {"profile", {{"ttft_us", profile.ttft}, {"prompt_us", profile.prompt_time},
                             {"decode_us", profile.decode_time}, {"prompt_tokens", profile.prompt_tokens},
                             {"generated_tokens", profile.generated_tokens}}},
            };
            geniex_free(output.full_text);
            emit(result);
            require_success(code, "generate");
        }
        require_success(geniex_llm_destroy(model), "destroy");
        model = nullptr;
        require_success(geniex_deinit(), "deinit");
        return 0;
    } catch (const std::exception& error) {
        emit({{"event", "error"}, {"error", error.what()}});
        if (model) geniex_llm_destroy(model);
        if (initialized) geniex_deinit();
        return 1;
    }
}
