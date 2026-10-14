/* Route: /skills (Skills Lab → Skills). Thin route entry — the grid, its
   cards, preview drawer, create/import modals, styles, constants, helpers and
   i18n are colocated under _components/SkillsGridView. */
"use client";

import { SkillsGridView } from "./_components/SkillsGridView";

export default function SkillsPage() {
  return <SkillsGridView />;
}
