"""Build an isolated Android UID capability probe with local SDK tools."""

import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from application_context import build_context
from backend import ARTIFACTS, ROOT, contract, sha256, write_json
from guarded_catalog import GuardedCatalogClient

SDK = Path("C:/Users/bjcha/AppData/Local/Android/Sdk")
JDK = Path("C:/Program Files/Android/Android Studio/jbr")
BUILD_TOOLS = SDK / "build-tools/36.1.0"
ANDROID_JAR = SDK / "platforms/android-36/android.jar"
OUTPUT = ARTIFACTS / "app-uid-probe/build"
RUNTIME = ARTIFACTS / "snapdragon-b11669/llama-b11669"


def run(*arguments):
    environment = {**os.environ, "JAVA_HOME": str(JDK)}
    subprocess.run([str(a) for a in arguments], env=environment, check=True)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=False)
    classes = OUTPUT / "classes"
    classes.mkdir()
    assets = OUTPUT / "assets"
    assets.mkdir()
    template = (
        ROOT / "artifacts/natural-language-mobile-instruct/upstream-chat_template.jinja"
    )
    shutil.copyfile(template, assets / "template.jinja")
    client = GuardedCatalogClient(0, sparse=True, gate_examples=True)
    context = build_context({"context_variant": "default"})["context"]
    requests = []
    for label, stage in zip(("gate", "fields"), client.preload_clients, strict=True):
        body = stage.body_for("0", context)
        body["messages"][1]["content"] = contract.compact_json(
            {"text": "", "amount_candidates": []}
        )
        body.update(grammar='root ::= "OK"\n', max_tokens=4, cache_prompt=True)
        requests.append({"name": "prime_" + label, "request": body})
    probes = json.loads(
        (ROOT / "scripts/natural-language/mobile_instruct/probes.json").read_text(
            encoding="utf-8"
        )
    )
    text = next(row["text"] for row in probes if row["id"] == "ordinary_single_control")
    for label, stage in zip(("gate", "fields"), client.preload_clients, strict=True):
        requests.append({"name": label, "request": stage.body_for(text, context)})
    write_json(assets / "requests.json", requests)
    write_json(OUTPUT / "context.json", context)
    run(
        JDK / "bin/javac.exe",
        "--release",
        "8",
        "-cp",
        ANDROID_JAR,
        "-d",
        classes,
        HERE / "MainActivity.java",
    )
    run(
        BUILD_TOOLS / "d8.bat",
        "--lib",
        ANDROID_JAR,
        "--min-api",
        "28",
        "--output",
        OUTPUT,
        *sorted(classes.rglob("*.class")),
    )
    unsigned = OUTPUT / "unsigned.apk"
    run(
        BUILD_TOOLS / "aapt2.exe",
        "link",
        "-o",
        unsigned,
        "--manifest",
        HERE / "AndroidManifest.xml",
        "-I",
        ANDROID_JAR,
        "-A",
        assets,
    )
    with zipfile.ZipFile(unsigned, "a", compression=zipfile.ZIP_DEFLATED) as apk:
        apk.write(OUTPUT / "classes.dex", "classes.dex")
        for library in sorted((RUNTIME / "lib").glob("*.so")):
            apk.write(library, "lib/arm64-v8a/" + library.name)
        apk.write(RUNTIME / "bin/llama-server", "lib/arm64-v8a/libllama-server.so")
    aligned = OUTPUT / "aligned.apk"
    run(BUILD_TOOLS / "zipalign.exe", "-P", "16", "4", unsigned, aligned)
    key = OUTPUT / "probe.keystore"
    run(
        JDK / "bin/keytool.exe",
        "-genkeypair",
        "-keystore",
        key,
        "-storepass",
        "android",
        "-keypass",
        "android",
        "-alias",
        "probe",
        "-dname",
        "CN=Local Runtime Probe",
        "-keyalg",
        "RSA",
        "-validity",
        "30",
    )
    signed = OUTPUT / "probe.apk"
    run(
        BUILD_TOOLS / "apksigner.bat",
        "sign",
        "--ks",
        key,
        "--ks-pass",
        "pass:android",
        "--key-pass",
        "pass:android",
        "--out",
        signed,
        aligned,
    )
    run(BUILD_TOOLS / "apksigner.bat", "verify", signed)
    write_json(
        OUTPUT / "manifest.json",
        {
            "apk_sha256": sha256(signed),
            "apk_bytes": signed.stat().st_size,
            "template_sha256": sha256(template),
            "source_hashes": {
                path.name: sha256(path) for path in HERE.iterdir() if path.is_file()
            },
            "requests_sha256": sha256(assets / "requests.json"),
            "scope": "Debug-only APK; synthetic input; no finance database access",
        },
    )
    print(str(signed), flush=True)


if __name__ == "__main__":
    main()
