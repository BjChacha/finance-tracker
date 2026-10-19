"""Run an explicitly selected local accelerator without editing frozen baselines."""

import re
import shlex
import sys
import threading
import time
import urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "mobile_instruct"))
from runtime import MODEL, ROOT, contract, evaluation, native, sha256, write_json
from safe_constraints import SafeBranchClient

ARTIFACTS = ROOT / "artifacts/natural-language-latency"


class AcceleratedServer(native.AndroidServer):
    def __init__(
        self,
        device,
        model=MODEL,
        batch=128,
        microbatch=64,
        template="qwen35-official-template.jinja",
        package="snapdragon-b11669",
        repack_threads=None,
        power_mode="balanced",
    ):
        super().__init__(model, 18487)
        self.client = SafeBranchClient(self.port)
        self.device = device
        self.log = "latency-server.log"
        if re.fullmatch(r"[A-Za-z0-9_-]+", package) is None:
            raise ValueError("Invalid runtime directory name")
        if repack_threads is not None and repack_threads not in (1, 2, 4, 8):
            raise ValueError("Unsupported repack worker count")
        self.package = package
        self.repack_threads = repack_threads
        if power_mode not in (
            "balanced",
            "high_performance",
            "sustained_high_performance",
            "burst",
        ):
            raise ValueError("Unsupported HTP power mode")
        self.power_mode = power_mode
        self.arguments = [
            "-m",
            model,
            "--host",
            "127.0.0.1",
            "--port",
            str(self.port),
            "-c",
            "4096",
            "-b",
            str(batch),
            "-ub",
            str(microbatch),
            "-t",
            "4",
            "-tb",
            "4",
            "-np",
            "1",
            "-ngl",
            "0" if device == "none" else "99",
            "--device",
            device,
            "--ctx-checkpoints",
            "4",
            "--jinja",
            "--chat-template-file",
            template,
            "--no-webui",
            "--no-warmup",
            "--no-context-shift",
        ]

    def collect_log(self, destination):
        if not self.pid or not self.pid.isdecimal():
            return False
        result = native.adb(
            "pull", f"{native.REMOTE}/{self.log}", str(destination), check=False
        )
        return result.returncode == 0

    def __enter__(self):
        native.adb("forward", "--no-rebind", f"tcp:{self.port}", f"tcp:{self.port}")
        self.forwarded = True
        self.started = time.perf_counter()
        library = f"{native.REMOTE}/{self.package}/lib"
        environment = {
            "LD_LIBRARY_PATH": library,
            "ADSP_LIBRARY_PATH": library,
            "GGML_HEXAGON_POWER_MODE": self.power_mode,
            "GGML_OPENCL_KERNEL_CACHE_DIR": f"{native.REMOTE}/opencl-cache",
        }
        if self.repack_threads is not None:
            environment["GGML_HEXAGON_REPACK_THREADS"] = str(self.repack_threads)
        self.environment = environment
        command = (
            f"cd {shlex.quote(native.REMOTE)}; "
            + " ".join(
                f"{key}={shlex.quote(value)}" for key, value in environment.items()
            )
            + f" {self.package}/bin/llama-server {shlex.join(self.arguments)}"
            + f" > {self.log} 2>&1 & echo $!"
        )
        try:
            self.pid = native.adb("shell", command).stdout.strip()
            if re.fullmatch(r"[0-9]+", self.pid) is None:
                raise RuntimeError("No owned accelerator server PID")
            self.thread = threading.Thread(target=self.sample, daemon=True)
            self.thread.start()
            polls = 0
            while time.perf_counter() - self.started < 120:
                try:
                    if self.client.request("/health", timeout=1).get("status") == "ok":
                        self.load_ms = (time.perf_counter() - self.started) * 1000
                        return self
                except (urllib.error.URLError, TimeoutError, ConnectionError):
                    pass
                polls += 1
                if polls % 20 == 0:
                    status = native.adb(
                        "shell", "cat", f"/proc/{self.pid}/status", check=False
                    )
                    if status.returncode or re.search(r"State:\s+Z", status.stdout):
                        raise RuntimeError(
                            "Accelerator server exited; inspect server.log"
                        )
                time.sleep(0.1)
            raise TimeoutError("Accelerator initialization exceeded 120 seconds")
        except BaseException:
            self.__exit__(None, None, None)
            raise


__all__ = [
    "ARTIFACTS",
    "HERE",
    "MODEL",
    "AcceleratedServer",
    "contract",
    "evaluation",
    "native",
    "sha256",
    "write_json",
]
