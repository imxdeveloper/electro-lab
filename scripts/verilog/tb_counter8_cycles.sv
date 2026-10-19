// Cycle-dumping testbench for counter8.
//
// The stock tb_counter8.sv checks behaviour and prints PASS/FAIL. This one
// dumps every clock cycle as CSV so Chip View can drive its 3D activation from
// real simulated values instead of an invented pattern.
//
//   iverilog -g2012 -o /tmp/counter8_cycles.vvp tb_counter8_cycles.sv ../src/counter8.v
//   vvp /tmp/counter8_cycles.vvp > cycles.csv
//
// Every input combination is exercised: reset held, free running, synchronous
// clear, enable low (frozen), and the 8-bit wrap.

`timescale 1ns/1ps

// Writes the cycle log to a file rather than stdout, so simulator chatter
// ($finish diagnostics) cannot corrupt the CSV and break the cross-check
// against the cocotb run.
module tb_counter8_cycles;

    reg        clk = 1'b0;
    reg        rst_n = 1'b0;
    reg        en = 1'b1;
    reg        clr = 1'b0;
    wire [7:0] count;
    wire [7:0] count_next;

    integer cycle = 0;
    integer csv;
    reg [1023:0] csv_path;

    counter8 dut (
        .clk       (clk),
        .rst_n     (rst_n),
        .en        (en),
        .clr       (clr),
        .count     (count),
        .count_next(count_next)
    );

    always #5 clk = ~clk;

    // One header row, then one row per settled clock edge.
    initial begin
        if (!$value$plusargs("csv=%s", csv_path)) csv_path = "/tmp/counter8_cycles.csv";
        csv = $fopen(csv_path);
        if (csv == 0) begin
            $display("could not open the cycle CSV");
            $finish;
        end
        $fdisplay(csv, "cycle,rst_n,en,clr,count,count_next,binary");
    end

    task sample;
        begin
            $fdisplay(csv, "%0d,%0d,%0d,%0d,%0d,%0d,%08b",
                cycle, rst_n, en, clr, count, count_next, count);
            cycle = cycle + 1;
        end
    endtask

    initial begin
        // ---- held in reset: two edges, output stays 0 ----
        repeat (2) begin
            @(posedge clk); #1 sample;
        end

        // ---- free running count ----
        @(negedge clk); rst_n = 1'b1;
        repeat (16) begin
            @(posedge clk); #1 sample;
        end

        // ---- synchronous clear: wins over enable ----
        @(negedge clk); clr = 1'b1;
        repeat (2) begin
            @(posedge clk); #1 sample;
        end
        @(negedge clk); clr = 1'b0;

        // ---- enable low freezes the counter ----
        @(negedge clk); en = 1'b0;
        repeat (3) begin
            @(posedge clk); #1 sample;
        end

        // ---- resume ----
        @(negedge clk); en = 1'b1;
        repeat (3) begin
            @(posedge clk); #1 sample;
        end

        // ---- clear again, then straight to the 8-bit wrap ----
        @(negedge clk); clr = 1'b1;
        @(posedge clk); #1 sample;
        @(negedge clk); clr = 1'b0;
        while (count !== 8'd255) begin
            @(posedge clk); #1 sample;
        end
        // The wrap itself and the cycle after it.
        @(posedge clk); #1 sample;
        @(posedge clk); #1 sample;

        $finish;
    end

    initial begin
        #200000;
        $finish;
    end

    // Close the CSV on the way out so nothing is lost if the run ends early.
    final $fclose(csv);

endmodule