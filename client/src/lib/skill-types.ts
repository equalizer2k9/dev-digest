/* skill-types.ts — the skill `type` enum as the UI needs it: the canonical
   order the design lists, and the accent colour each type is drawn in.

   Lives in lib/ rather than in any one component folder because /skills,
   /skills/:id and the agent editor's Skills tab all paint the same chip, and a
   page-local `_components` folder is private to its own route. Labels are NOT
   here — those are i18n (`skills.listItem.type.*`). */

import type { SkillType } from "@devdigest/shared";

/** The four contract types, in the order the design lists them. */
export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Type → accent colour. CSS vars only, so both themes keep working. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--text-secondary)",
  security: "var(--crit)",
  custom: "var(--warn)",
};
