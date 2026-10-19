#!/usr/bin/env bash
# Cross-checks the two simulation flows for counter8.
#
#   * iverilog + the Verilog cycle bench  -> /tmp/counter8_cycles.csv
#   * cocotb  + the Python cycle bench   -> /tmp/counter8_cycles_cocotb.csv
#
# Both benches drive the same input sequence, so the two logs must agree cycle
# for cycle on every signal. A difference means one of the flows is lying.
set +e

VERILOG_DIR="$(cd "$(dirname "$0")" && pwd)"
COCOTB_PY="${COCOTB_PY:-$HOME/venvs/cocotb/bin/python}"

RTL="${COUNTER8_RTL:-$(ls /mnt/c/Users/*/Desktop/circuit/new/designs/counter8/src/counter8.v 2>/dev/null | head -1)}"
if [ -z "$RTL" ] || [ ! -f "$RTL" ]; then
  echo "counter8.v not found; set COUNTER8_RTL"
  exit 1
fi

echo "=== 1. iverilog + Verilog bench ==="
iverilog -g2012 -o /tmp/c8_cycles.vvp "$VERILOG_DIR/tb_counter8_cycles.sv" "$RTL" || exit 1
vvp /tmp/c8_cycles.vvp +csv=/tmp/counter8_cycles.csv 2>&1 | grep -E "RESULT|error" || true

echo ""
echo "=== 2. cocotb + Python bench ==="
cd "$VERILOG_DIR" || exit 1
COCOTB_CSV=/tmp/counter8_cycles_cocotb.csv "$COCOTB_PY" run_cocotb.py 2>&1 | grep -E "PASS=|FAIL=|passed|failed" || true

echo ""
echo "=== 3. compare ==="
python3 - <<'PY'
import csv

def rows(path):
    with open(path) as handle:
        return list(csv.DictReader(handle))

iv = rows("/tmp/counter8_cycles.csv")
co = rows("/tmp/counter8_cycles_cocotb.csv")
print(f"iverilog cycles: {len(iv)}   cocotb cycles: {len(co)}")

mismatches = []
for a, b in zip(iv, co):
    for field in ("rst_n", "en", "clr", "count", "count_next", "binary"):
        if a[field] != b[field]:
            mismatches.append((a["cycle"], field, a[field], b[field]))
            break

if mismatches:
    print(f"MISMATCH in {len(mismatches)} cycle(s):")
    for cycle, field, left, right in mismatches[:5]:
        print(f"  cycle {cycle}: {field} iverilog={left} cocotb={right}")
    raise SystemExit(1)

print(f"identical on all {min(len(iv), len(co))} shared cycles x 6 signals")
PY