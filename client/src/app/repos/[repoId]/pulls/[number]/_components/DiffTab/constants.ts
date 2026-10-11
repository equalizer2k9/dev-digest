import type { SmartDiffRole } from "@devdigest/shared";

/** Per-role copy keys (in `prReview.json` → `smartDiff`) and whether the group
   starts open. Typed over the contract so a role added or dropped there fails
   typecheck here. */
export const ROLE_META: Record<
  SmartDiffRole,
  { labelKey: string; hintKey: string; startsOpen: boolean }
> = {
  core: { labelKey: "smartDiff.coreLabel", hintKey: "smartDiff.coreHint", startsOpen: true },
  tests: { labelKey: "smartDiff.testsLabel", hintKey: "smartDiff.testsHint", startsOpen: true },
  wiring: { labelKey: "smartDiff.wiringLabel", hintKey: "smartDiff.wiringHint", startsOpen: true },
  docs: { labelKey: "smartDiff.docsLabel", hintKey: "smartDiff.docsHint", startsOpen: false },
  boilerplate: {
    labelKey: "smartDiff.boilerplateLabel",
    hintKey: "smartDiff.boilerplateHint",
    startsOpen: false,
  },
};
