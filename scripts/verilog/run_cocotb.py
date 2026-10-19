"""Build counter8 with icarus and run the cocotb testbench.

    ~/venvs/cocotb/bin/python scripts/verilog/run_cocotb.py

cocotb 2.x ships the build/run tooling as the separate `cocotb_tools` package.
The RTL defaults to the counter8 source in the circuit/new project; pass a path
to point it somewhere else.
"""

import glob
import os
import sys
from pathlib import Path

from cocotb_tools.runner import get_runner

HERE = Path(__file__).resolve().parent
RELATIVE_RTL = "Desktop/circuit/new/designs/counter8/src/counter8.v"


def find_rtl():
    """Locate counter8.v: argument, then env var, then the usual WSL mount."""
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    if os.environ.get("COUNTER8_RTL"):
        return Path(os.environ["COUNTER8_RTL"])
    for pattern in (
        f"/mnt/c/Users/*/{RELATIVE_RTL}",
        f"/mnt/c/{RELATIVE_RTL}",
        f"/home/*/{RELATIVE_RTL}",
    ):
        matches = sorted(glob.glob(pattern))
        if matches:
            return Path(matches[0])
    return None


def main():
    rtl = find_rtl()
    if rtl is None or not Path(rtl).exists():
        raise SystemExit(f"RTL not found: pass a path, set COUNTER8_RTL, or check {RELATIVE_RTL}")

    runner = get_runner("icarus")
    runner.build(
        sources=[str(rtl)],
        hdl_toplevel="counter8",
        build_args=["-g2012"],
        # counter8.v carries no `timescale, and without one icarus defaults to
        # 1 second precision, which cocotb refuses to schedule against.
        timescale=("1ns", "1ps"),
        always=True,
    )
    runner.test(
        hdl_toplevel="counter8",
        test_module="tb_counter8_cocotb",
        test_dir=str(HERE),
        extra_env={"COCOTB_CSV": os.environ.get("COCOTB_CSV", "/tmp/counter8_cycles_cocotb.csv")},
    )


if __name__ == "__main__":
    main()