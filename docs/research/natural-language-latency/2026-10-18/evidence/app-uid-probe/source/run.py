"""Install the isolated probe and verify inference under an Android app UID."""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import ARTIFACTS, ROOT, sha256, write_json

ADB = Path("C:/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe")
PACKAGE = "com.chacha.nlprobe"
MODEL_HASH = "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = ARTIFACTS / "app-uid-probe" / args.output
    output.mkdir(parents=True, exist_ok=False)
    build = ARTIFACTS / "app-uid-probe/build"
    prefix = [str(ADB), "-s", args.serial]

    def adb(*arguments, check=True):
        return subprocess.run(
            [*prefix, *arguments],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=check,
        )

    manifest = {
        "serial": args.serial,
        "package": PACKAGE,
        "apk_sha256": sha256(build / "probe.apk"),
        "runner_sha256": sha256(Path(__file__)),
        "scope": "Debug test APK; synthetic input; no application database access",
    }
    installed = False
    try:
        existing = adb("shell", "pm", "list", "packages", PACKAGE).stdout.strip()
        if existing:
            raise RuntimeError("Probe already installed; inspect it before replacing")
        install = adb("install", str(build / "probe.apk"))
        (output / "install.log").write_text(install.stdout, encoding="utf-8")
        installed = True
        print("Installed isolated probe APK", flush=True)
        adb("shell", "run-as", PACKAGE, "mkdir", "-p", "files")
        model = (
            ROOT / "artifacts/natural-language-mobile-instruct/Qwen3.5-4B-Q4_K_M.gguf"
        )
        before = time.perf_counter()
        with model.open("rb") as stream:
            subprocess.run(
                [
                    *prefix,
                    "exec-in",
                    "run-as",
                    PACKAGE,
                    "sh",
                    "-c",
                    "cat > files/model.gguf",
                ],
                stdin=stream,
                check=True,
            )
        manifest["model_copy_ms"] = (time.perf_counter() - before) * 1000
        device_hash = adb(
            "shell", "run-as", PACKAGE, "sha256sum", "files/model.gguf"
        ).stdout.split()[0]
        if device_hash != MODEL_HASH:
            raise ValueError("Application-private model checksum mismatch")
        manifest["model_sha256"] = device_hash
        print("Application-private model checksum verified", flush=True)
        adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            result = adb(
                "exec-out", "run-as", PACKAGE, "cat", "files/result.json", check=False
            )
            if result.returncode == 0:
                value = json.loads(result.stdout)
                if "total_ms" in value:
                    write_json(output / "result.json", value)
                    print(
                        json.dumps(
                            {
                                key: value.get(key)
                                for key in ("uid", "complete", "total_ms", "error")
                            }
                        ),
                        flush=True,
                    )
                    break
            time.sleep(1)
        else:
            raise TimeoutError("Application probe did not finish")
    except Exception as error:
        manifest["error"] = str(error)
        if isinstance(error, subprocess.CalledProcessError):
            manifest["command_stdout"] = error.stdout
            manifest["command_stderr"] = error.stderr
        raise
    finally:
        if installed:
            for name in ("result.json", "server.log"):
                result = adb(
                    "exec-out", "run-as", PACKAGE, "cat", "files/" + name, check=False
                )
                if result.returncode == 0:
                    (output / name).write_text(result.stdout, encoding="utf-8")
            adb("shell", "am", "force-stop", PACKAGE, check=False)
        write_json(output / "manifest.json", manifest)


if __name__ == "__main__":
    main()
