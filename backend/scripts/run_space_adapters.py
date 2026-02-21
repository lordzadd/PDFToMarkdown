from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def main() -> int:
    registry = Path(__file__).resolve().parents[1] / "model_registry.json"
    data = json.loads(registry.read_text(encoding="utf-8"))

    procs: list[subprocess.Popen] = []
    try:
        for model in data.get("models", []):
            if not model.get("enabled", True):
                continue
            if model.get("provider") != "hf_space":
                continue

            cmd = model.get("startup_cmd")
            cwd = model.get("startup_cwd")
            if not cmd:
                continue

            workdir = Path(cwd).expanduser().resolve() if cwd else Path.cwd()
            print(f"[space-adapter] starting {model['id']} in {workdir}: {cmd}")
            proc = subprocess.Popen(cmd, cwd=str(workdir), shell=True)
            procs.append(proc)

        if not procs:
            print("[space-adapter] no enabled hf_space startup_cmd entries found")
            return 0

        while True:
            time.sleep(1)
            for proc in procs:
                if proc.poll() is not None:
                    print(f"[space-adapter] process exited with code {proc.returncode}")
                    return proc.returncode or 0
    except KeyboardInterrupt:
        return 0
    finally:
        for proc in procs:
            if proc.poll() is None:
                proc.send_signal(signal.SIGTERM)


if __name__ == "__main__":
    raise SystemExit(main())
