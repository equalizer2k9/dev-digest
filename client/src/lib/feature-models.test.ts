import { describe, it, expect } from "vitest";
import { FEATURE_MODELS } from "./feature-models";

describe("FEATURE_MODELS", () => {
  it("AC-9: review_intent row defaults to deepseek/deepseek-v4-flash via openrouter", () => {
    const row = FEATURE_MODELS.find((f) => f.id === "review_intent");
    expect(row).toBeDefined();
    expect(row!.defaultModel).toBe("deepseek/deepseek-v4-flash");
    expect(row!.defaultProvider).toBe("openrouter");
  });
});
