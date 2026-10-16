import type { CiInstallInput, CiPostAs, CiTrigger } from "@devdigest/shared";
import { STEP_CONFIGURE, STEP_PREVIEW, STEP_TARGET } from "./constants";

export interface WizardState {
  repoId: string | null;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  /** Number of files in the current preview; 0 before one arrived. */
  fileCount: number;
  previewFailed: boolean;
  /** The workflow text, only when the user changed it (D-10). */
  editedWorkflow: string | null;
}

/** Whether the wizard may move on from `step`. The Install step has no Continue. */
export function canContinue(step: number, state: WizardState): boolean {
  if (step === STEP_TARGET) return !!state.repoId;
  if (step === STEP_PREVIEW) return state.fileCount > 0 && !state.previewFailed;
  if (step === STEP_CONFIGURE) return state.triggers.length >= 1;
  return false;
}

/** Preview request body: the current choices, no workflow. */
export function previewBody(state: WizardState): Omit<CiInstallInput, "workflow"> {
  return { repo_id: state.repoId ?? "", triggers: state.triggers, post_as: state.postAs };
}

/** Install request body: `workflow` goes along only when it was edited (D-10). */
export function installBody(state: WizardState): CiInstallInput {
  const body = previewBody(state);
  return state.editedWorkflow == null ? body : { ...body, workflow: state.editedWorkflow };
}
