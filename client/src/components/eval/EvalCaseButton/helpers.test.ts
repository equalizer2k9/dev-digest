import { describe, it, expect } from "vitest";
import { ApiError } from "../../../lib/api";
import { conflictName, errorKey, isRefusal } from "./helpers";

describe("errorKey", () => {
  it.each(["eval_case_bad_name", "eval_case_bad_zone", "eval_case_conflict", "validation_error"])(
    "knows %s",
    (code) => expect(errorKey(code)).toBe(code),
  );
  it("falls back to the given generic key", () => {
    expect(errorKey("nope")).toBe("generic");
    expect(errorKey(undefined, "runGeneric")).toBe("runGeneric");
  });
});

describe("isRefusal", () => {
  it("is true only for the three reasons of AC-5", () => {
    expect(isRefusal("eval_case_undecided")).toBe(true);
    expect(isRefusal("eval_case_no_agent")).toBe(true);
    expect(isRefusal("eval_case_no_patch")).toBe(true);
    expect(isRefusal("eval_case_no_hunk")).toBe(false);
    expect(isRefusal(undefined)).toBe(false);
  });
});

describe("conflictName", () => {
  it("reads case_name from a 409", () => {
    expect(conflictName(new ApiError("x", 409, "eval_case_conflict", { case_name: "k" }))).toBe("k");
    expect(conflictName(new Error("x"))).toBeUndefined();
  });
});
