export const CONFIDENCE_COLOR = {
  low: "var(--warning, var(--text-secondary))",
  medium: "var(--text-secondary)",
  high: "var(--success, var(--text-secondary))",
} as const;

export const ERROR_KEY_BY_CODE: Record<string, "paymentRequired" | "modelNotFound" | "config"> = {
  llm_payment_required: "paymentRequired",
  llm_model_not_found: "modelNotFound",
  config_error: "config",
};

/**
 * Source reason (as emitted by the server, plus the camelCase keys themselves)
 * -> `sources.reason.*` i18n key. Anything not listed renders as `other` — never the raw server string.
 */
export const REASON_KEY_BY_REASON: Record<string, string> = {
  empty: "empty",
  not_synced: "notSynced",
  notSynced: "notSynced",
  no_changes: "noChanges",
  noChanges: "noChanges",
  not_found: "notFound",
  notFound: "notFound",
  too_large: "tooLarge",
  tooLarge: "tooLarge",
  truncated: "truncated",
  notMarkdown: "notMarkdown",
  not_markdown: "notMarkdown",
  absolute_path: "absolutePath",
  path_traversal: "pathTraversal",
  invalid_path: "invalidPath",
  fetch_failed: "fetchFailed",
  is_pull_request: "pullRequest",
  pullRequest: "pullRequest",
};
