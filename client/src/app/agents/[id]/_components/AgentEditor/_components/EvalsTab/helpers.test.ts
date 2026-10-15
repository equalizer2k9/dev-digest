import { describe, it, expect } from "vitest";
import type { EvalRunRecord } from "@devdigest/shared";
import { latestCompleted, statusLineRun, caseLocation } from "./helpers";

const run = (id: string, status: EvalRunRecord["status"]) => ({ id, status }) as EvalRunRecord;

describe("latestCompleted", () => {
  it("skips a newer running or failed run", () => {
    const runs = [run("r3", "running"), run("r2", "failed"), run("r1", "completed"), run("r0", "completed")];
    expect(latestCompleted(runs)?.id).toBe("r1");
  });
  it("is null with no completed run", () => {
    expect(latestCompleted([run("r1", "failed")])).toBeNull();
    expect(latestCompleted([])).toBeNull();
  });
});

describe("statusLineRun", () => {
  it("returns the newest run when it is running or failed", () => {
    expect(statusLineRun([run("r2", "running"), run("r1", "completed")])?.id).toBe("r2");
    expect(statusLineRun([run("r2", "failed"), run("r1", "completed")])?.id).toBe("r2");
  });
  it("returns null when the newest run is completed, even if an older one failed", () => {
    expect(statusLineRun([run("r2", "completed"), run("r1", "failed")])).toBeNull();
    expect(statusLineRun([])).toBeNull();
  });
});

describe("caseLocation", () => {
  it("formats file:start-end", () => {
    expect(caseLocation({ file: "src/a.ts", start_line: 3, end_line: 9 })).toBe("src/a.ts:3-9");
  });
  it("collapses a single line", () => {
    expect(caseLocation({ file: "src/a.ts", start_line: 3, end_line: 3 })).toBe("src/a.ts:3");
  });
});
