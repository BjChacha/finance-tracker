#include <jni.h>
#include <cstdio>
#include <string>
#include <vector>

int llama_server(int argc, char **argv);
void llama_server_terminate();

extern "C" JNIEXPORT jint JNICALL
Java_com_chacha_nlprobe_MainActivity_runNativeServer(
    JNIEnv *env, jclass, jobjectArray arguments, jstring log_path) {
    const char *path = env->GetStringUTFChars(log_path, nullptr);
    if (path == nullptr) return 90;
    FILE *log = std::freopen(path, "w", stderr);
    env->ReleaseStringUTFChars(log_path, path);
    if (log == nullptr) return 91;
    const jsize count = env->GetArrayLength(arguments);
    std::vector<std::string> strings;
    strings.reserve(count);
    for (jsize index = 0; index < count; ++index) {
        auto item = static_cast<jstring>(env->GetObjectArrayElement(arguments, index));
        const char *value = env->GetStringUTFChars(item, nullptr);
        if (value == nullptr) return 92;
        strings.emplace_back(value);
        env->ReleaseStringUTFChars(item, value);
        env->DeleteLocalRef(item);
    }
    std::vector<char *> pointers;
    pointers.reserve(count + 1);
    for (auto &value : strings) pointers.push_back(value.data());
    pointers.push_back(nullptr);
    return llama_server(count, pointers.data());
}

extern "C" JNIEXPORT void JNICALL
Java_com_chacha_nlprobe_MainActivity_stopNativeServer(JNIEnv *, jclass) {
    llama_server_terminate();
}
