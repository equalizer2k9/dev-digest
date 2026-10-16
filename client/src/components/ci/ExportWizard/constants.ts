import type { CiPostAs, CiTrigger } from "@devdigest/shared";

export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;

export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

export const TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];

/** A-4: the defaults the preview is requested with. */
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export const DEFAULT_POST_AS: CiPostAs = "github_review";

/** Message key under `exportWizard.postAs` for each publication mode. */
export const POST_AS_KEYS: Record<CiPostAs, string> = {
  github_review: "githubReview",
  pr_comment: "prComment",
  none: "none",
};

/** Files under this prefix are the bundled runner: collapsed by default in the preview. */
export const RUNNER_PREFIX = ".devdigest/runner/";

/** API error code of a missing runner build (409). */
export const ERR_RUNNER_MISSING = "ci_runner_missing";
