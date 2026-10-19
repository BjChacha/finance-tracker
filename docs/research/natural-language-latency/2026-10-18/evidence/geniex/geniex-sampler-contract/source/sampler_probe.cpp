// Reproduce sampler state transitions without loading model weights or QNN.
#include "geniex-proc/sampler.h"
#include "json.hpp"

#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using json = nlohmann::json;

int main(int argc, char** argv) {
    if (argc != 3) return 2;
    try {
        auto tokenizer = geniex::Tokenizer::from_file(argv[1], argv[2]);
        const auto tokens = tokenizer->encode("OK");
        if (tokens.size() != 1) throw std::runtime_error("Expected a single OK token");
        const int32_t ok = tokens[0];
        const int32_t eos = tokenizer->token_eos();
        if (eos < 0) throw std::runtime_error("Missing EOS token");
        const auto prompt = tokenizer->encode(
            "<|im_start|>user\nReply with only the word OK.<|im_end|>\n"
            "<|im_start|>assistant\n");
        geniex_sampler_params params;
        params.temp = -1.0f;
        params.top_k = 1;
        params.penalty_repeat = 1.0f;
        params.eog_tokens = {eos};
        std::vector<float> logits(tokenizer->vocab_size(), -100.0f);
        auto attach = [&](geniex::Sampler& sampler) {
            sampler.set_grammar(std::make_unique<geniex::Grammar>(
                "root ::= \"OK\"\n", *tokenizer));
        };
        auto run = [&](const char* name, bool expect_error, auto action) {
            bool threw = false;
            std::string message;
            try {
                action();
            } catch (const std::exception& error) {
                threw = true;
                message = error.what();
            }
            std::cout << json({{"case", name}, {"threw", threw},
                               {"expected_error", expect_error},
                               {"matched", threw == expect_error}, {"message", message}}).dump()
                      << std::endl;
            return threw == expect_error;
        };
        bool passed = true;
        passed &= run("prompt_without_grammar", false, [&] {
            geniex::Sampler sampler(params);
            sampler.init(prompt);
        });
        passed &= run("prompt_with_grammar", true, [&] {
            geniex::Sampler sampler(params);
            attach(sampler);
            sampler.init(prompt);
        });
        passed &= run("sample_advances_grammar_without_explicit_accept", false, [&] {
            geniex::Sampler sampler(params);
            sampler.init(prompt);
            attach(sampler);
            std::fill(logits.begin(), logits.end(), -100.0f);
            logits[ok] = 100.0f;
            if (sampler.sample(logits) != ok) throw std::runtime_error("Wrong OK token");
            std::fill(logits.begin(), logits.end(), -100.0f);
            logits[eos] = 100.0f;
            if (sampler.sample(logits) != eos) throw std::runtime_error("Wrong EOS token");
        });
        passed &= run("sample_then_explicit_accept_repeats_token", true, [&] {
            geniex::Sampler sampler(params);
            attach(sampler);
            std::fill(logits.begin(), logits.end(), -100.0f);
            logits[ok] = 100.0f;
            sampler.accept(sampler.sample(logits));
        });
        return passed ? 0 : 1;
    } catch (const std::exception& error) {
        std::cerr << error.what() << std::endl;
        return 1;
    }
}
