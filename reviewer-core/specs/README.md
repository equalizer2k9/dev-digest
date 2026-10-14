# reviewer-core/specs

One spec per feature, written BEFORE implementation. Create with `/spec reviewer-core <feature-name>`.
File name: `<feature-name>.md` (kebab-case). A feature spanning packages gets its spec in the
package that owns the core logic; other packages link to it from their own table.

Status: `draft` → `approved` → `implemented`.

| Spec | Status | Summary |
|---|---|---|
| [grounding.md](grounding.md) | implemented | Citation-gate contract: what a finding must cite to be kept, every drop case, and the downstream rules (score recomputed from survivors, `verdict` deliberately not re-derived). |
| [skills-lab](skills-lab.md) | draft | Engine half of Skills Lab: `PromptParts.skills` becomes `SkillPart[]` (id/name/version/body/trusted), one rendered sub-block per skill in array order, untrusted bodies `wrapUntrusted`-ed, and per-skill + whole-block token attribution through an injected `countTokens` with a dependency-free `ceil(len/4)` fallback. |
