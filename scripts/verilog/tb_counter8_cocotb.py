"""cocotb testbench for counter8.

This is the Python counterpart of the Verilog benches: it self-checks the same
behaviours (reset, count, clear-over-enable, enable freeze, 8-bit wrap) and
writes the same per-cycle CSV, so the two flows can be cross-checked against
each other.

cocotb earns its place here for the stimulus side: the sequence below is easy to
extend to randomised enable/clear patterns, which a fixed .sv bench makes
awkward.
"""

import csv
import os

import cocotb
from cocotb.clock import Clock
from cocotb.triggers import FallingEdge, RisingEdge

CSV_PATH = os.environ.get("COCOTB_CSV", "/tmp/counter8_cycles_cocotb.csv")


class CycleLog:
    """Collects one row per settled clock edge."""

    def __init__(self, path):
        self._file = open(path, "w", newline="")
        self._writer = csv.writer(self._file)
        self._writer.writerow(["cycle", "rst_n", "en", "clr", "count", "count_next", "binary"])
        self.cycle = 0

    def sample(self, dut):
        self._writer.writerow([
            self.cycle,
            int(dut.rst_n.value),
            int(dut.en.value),
            int(dut.clr.value),
            int(dut.count.value),
            int(dut.count_next.value),
            format(int(dut.count.value), "08b"),
        ])
        self._file.flush()
        self.cycle += 1

    def close(self):
        self._file.close()


async def settle(dut):
    """Wait for the next rising edge, then let the non-blocking update land."""
    await RisingEdge(dut.clk)
    await cocotb.triggers.Timer(1, unit="ns")
    await cocotb.triggers.ReadOnly()


@cocotb.test()
async def test_counter8(dut):
    log = CycleLog(CSV_PATH)
    cocotb.start_soon(Clock(dut.clk, 10, unit="ns").start())
    dut.rst_n.value = 0
    dut.en.value = 1
    dut.clr.value = 0

    try:
        # ---- held in reset ----
        for _ in range(2):
            await settle(dut)
            log.sample(dut)
            assert int(dut.count.value) == 0, f"reset: count={int(dut.count.value)}"

        # ---- free running count ----
        await FallingEdge(dut.clk)
        dut.rst_n.value = 1
        for expected in range(1, 17):
            await settle(dut)
            log.sample(dut)
            assert int(dut.count.value) == expected, f"count={int(dut.count.value)} want={expected}"

        # ---- combinational next state ----
        assert int(dut.count_next.value) == (int(dut.count.value) + 1) % 256

        # ---- synchronous clear wins over enable ----
        await FallingEdge(dut.clk)
        dut.clr.value = 1
        for _ in range(2):
            await settle(dut)
            log.sample(dut)
            assert int(dut.count.value) == 0, "clr must clear the counter"

        await FallingEdge(dut.clk)
        dut.clr.value = 0

        # ---- enable low freezes the counter ----
        await FallingEdge(dut.clk)
        dut.en.value = 0
        frozen = int(dut.count.value)
        for _ in range(3):
            await settle(dut)
            log.sample(dut)
            assert int(dut.count.value) == frozen, f"en=0 must freeze count, got {int(dut.count.value)}"

        # ---- resume ----
        await FallingEdge(dut.clk)
        dut.en.value = 1
        for expected in range(frozen + 1, frozen + 4):
            await settle(dut)
            log.sample(dut)
            assert int(dut.count.value) == expected, f"resume: count={int(dut.count.value)} want={expected}"

        # ---- clear, then count for real until the 8-bit wrap ----
        await FallingEdge(dut.clk)
        dut.clr.value = 1
        await settle(dut)
        log.sample(dut)
        assert int(dut.count.value) == 0
        await FallingEdge(dut.clk)
        dut.clr.value = 0

        cycles = 0
        while int(dut.count.value) != 255 and cycles < 600:
            await settle(dut)
            log.sample(dut)
            cycles += 1
        assert int(dut.count.value) == 255, f"never reached 255, stuck at {int(dut.count.value)}"

        await settle(dut)
        log.sample(dut)
        assert int(dut.count.value) == 0, "255 must wrap to 0"
        await settle(dut)
        log.sample(dut)
        assert int(dut.count.value) == 1, "must keep counting after the wrap"

        # ---- reset again ----
        await FallingEdge(dut.clk)
        dut.rst_n.value = 0
        await settle(dut)
        log.sample(dut)
        assert int(dut.count.value) == 0

        dut._log.info("cocotb: all counter8 checks passed, %d cycles logged to %s", log.cycle, CSV_PATH)
    finally:
        log.close()