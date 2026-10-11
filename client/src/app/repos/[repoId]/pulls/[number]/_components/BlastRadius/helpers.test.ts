import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { blastStats, callerLabel } from "./helpers";

const base: BlastRadiusResponse = {
  changed_symbols: [],
  downstream: [],
  summary: "",
  degraded: false,
  reason: null,
};

describe("blastStats", () => {
  it("returns zeros for an empty response", () => {
    expect(blastStats(base)).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
  });

  it("counts symbols, sums callers and de-duplicates endpoints and crons across entries", () => {
    const blast: BlastRadiusResponse = {
      ...base,
      changed_symbols: [
        { name: "a", file: "a.ts", kind: "function" },
        { name: "b", file: "b.ts", kind: "function" },
        { name: "c", file: "c.ts", kind: "function" },
      ],
      downstream: [
        {
          symbol: "a",
          callers: [
            { name: "x", file: "x.ts", line: 1 },
            { name: "y", file: "y.ts", line: 2 },
          ],
          endpoints_affected: ["GET /a", "GET /b"],
          crons_affected: ["nightly"],
        },
        {
          symbol: "b",
          callers: [{ name: "z", file: "z.ts", line: 3 }],
          endpoints_affected: ["GET /b", "POST /c"],
          crons_affected: ["nightly", "hourly"],
        },
      ],
    };
    expect(blastStats(blast)).toEqual({ symbols: 3, callers: 3, endpoints: 3, crons: 2 });
  });
});

describe("callerLabel", () => {
  it("joins file and line", () => {
    expect(callerLabel("src/a.ts", 12)).toBe("src/a.ts:12");
  });
});
