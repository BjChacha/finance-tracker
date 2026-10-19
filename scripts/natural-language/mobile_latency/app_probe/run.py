"""Install the isolated probe and verify inference under an Android app UID."""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from backend import ARTIFACTS, sha256, write_json

ADB = Path("C:/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe")
PACKAGE = "com.chacha.nlprobe"
MODEL_HASH = "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--reuse-installed", action="store_true")
    parser.add_argument("--replace-known-installed", action="store_true")
    parser.add_argument("--build", default="build")
    args = parser.parse_args()
    output = ARTIFACTS / "app-uid-probe" / args.output
    output.mkdir(parents=True, exist_ok=False)
    (output / "runner.py").write_bytes(Path(__file__).read_bytes())
    if Path(args.build).name != args.build or not args.build.startswith("build"):
        parser.error("Expected a build directory name")
    if args.reuse_installed and args.replace_known_installed:
        parser.error("Choose reuse or replacement")
    build = ARTIFACTS / "app-uid-probe" / args.build
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
        if existing and not (args.reuse_installed or args.replace_known_installed):
            raise RuntimeError("Probe already installed; inspect it before replacing")
        if args.reuse_installed or args.replace_known_installed:
            paths = adb("shell", "pm", "path", PACKAGE).stdout.strip().splitlines()
            if len(paths) != 1 or not paths[0].startswith("package:"):
                raise ValueError("Expected the previously installed standalone probe")
            device_apk = paths[0].removeprefix("package:")
            installed_hash = adb("shell", "sha256sum", device_apk).stdout.split()[0]
            known = {
                sha256(path)
                for path in (ARTIFACTS / "app-uid-probe").glob("build*/probe.apk")
            }
            if args.replace_known_installed and installed_hash not in known:
                raise ValueError("Refusing to replace an unrecognized installed APK")
            if args.reuse_installed and installed_hash != manifest["apk_sha256"]:
                raise ValueError("Installed probe APK differs from the reviewed build")
            if args.replace_known_installed:
                install = adb("install", "-r", str(build / "probe.apk"))
                (output / "install.log").write_text(install.stdout, encoding="utf-8")
                manifest["installation"] = "replaced_known_probe"
                manifest["previous_apk_sha256"] = installed_hash
            else:
                manifest["installation"] = "reused_exact_apk_hash"
        else:
            install = adb("install", str(build / "probe.apk"))
            (output / "install.log").write_text(install.stdout, encoding="utf-8")
            manifest["installation"] = "installed"
        installed = True
        print("Verified isolated probe APK", flush=True)
        adb("shell", "am", "force-stop", PACKAGE)
        adb("shell", "run-as", PACKAGE, "mkdir", "-p", "files")
        remote_model = "/data/local/tmp/finance-nl-bench/Qwen3.5-4B-Q4_K_M.gguf"
        source_hash = adb("shell", "sha256sum", remote_model).stdout.split()[0]
        if source_hash != MODEL_HASH:
            raise ValueError("Staged device model checksum mismatch")
        before = time.perf_counter()
        adb("shell", "run-as", PACKAGE, "cp", remote_model, "files/model-copy.gguf")
        manifest["model_copy_ms"] = (time.perf_counter() - before) * 1000
        device_hash = adb(
            "shell", "run-as", PACKAGE, "sha256sum", "files/model-copy.gguf"
        ).stdout.split()[0]
        if device_hash != MODEL_HASH:
            raise ValueError("Application-private model checksum mismatch")
        adb(
            "shell",
            "run-as",
            PACKAGE,
            "mv",
            "files/model-copy.gguf",
            "files/model.gguf",
        )
        manifest["model_sha256"] = device_hash
        print("Application-private model checksum verified", flush=True)
        adb(
            "shell",
            "run-as",
            PACKAGE,
            "rm",
            "-f",
            "files/result.json",
            "files/result.tmp",
            "files/server.log",
        )
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
