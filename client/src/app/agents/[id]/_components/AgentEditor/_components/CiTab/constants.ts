import type { CiFailOn } from "@devdigest/shared";

/** Options of the "Fail CI on" select; labels live under `ci.ciTab.failOnOptions`. */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];
