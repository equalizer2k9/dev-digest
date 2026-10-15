/**
 * Child-process environment for the SDK. Two supported backends:
 *
 *   subscription (default) — strip any API key so the SDK uses the Claude Code subscription.
 *   openrouter             — point the SDK at OpenRouter's Anthropic-compatible endpoint
 *                            (or a local translating proxy like LiteLLM) via ANTHROPIC_BASE_URL.
 *
 * Through the LiteLLM proxy (OPENROUTER_BASE_URL not on openrouter.ai) every client — the SDK and the
 * direct judge call — authenticates with the proxy's LITELLM_MASTER_KEY; OPENROUTER_API_KEY is needed
 * only by the proxy container and is kept out of the eval sessions.
 *
 * The whole harness (subagents, skills, tool use, CLAUDE.md) still runs inside the Agent SDK;
 * only the model inference is redirected. Select with EVAL_BACKEND=openrouter.
 */

const BACKEND = process.env.EVAL_BACKEND ?? "subscription";

/**
 * The bearer an OpenRouter-backend call carries: the proxy's master key when OPENROUTER_BASE_URL
 * points at the LiteLLM proxy, otherwise the OpenRouter key itself (direct to openrouter.ai).
 */
export function openRouterAuth(): { token: string; viaProxy: boolean } {
  const base = process.env.OPENROUTER_BASE_URL;
  const viaProxy = Boolean(base) && !/^https:\/\/openrouter\.ai(\/|$)/.test(base!);
  const token = viaProxy ? process.env.LITELLM_MASTER_KEY : process.env.OPENROUTER_API_KEY;
  if (!token) {
    throw new Error(
      viaProxy
        ? `OPENROUTER_BASE_URL=${base} is the LiteLLM proxy but LITELLM_MASTER_KEY is not set`
        : "EVAL_BACKEND=openrouter but OPENROUTER_API_KEY is not set",
    );
  }
  return { token, viaProxy };
}

/**
 * Copy the current env, configured for the selected inference backend.
 *
 * subscription: an API key in the environment takes priority over the Claude Code subscription,
 *   so we delete it — without this every eval run would silently bill API tokens.
 *
 * openrouter: set ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN and blank ANTHROPIC_API_KEY so the
 *   SDK speaks the Anthropic wire protocol to OpenRouter instead of api.anthropic.com. The base
 *   URL must have NO trailing slash. Override OPENROUTER_BASE_URL to point at a local LiteLLM
 *   proxy (e.g. http://localhost:4000) when routing to models that need Anthropic<->OpenAI
 *   translation; the bearer is then the proxy's master key (see openRouterAuth).
 */
export function subscriptionEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;

  if (BACKEND === "openrouter") {
    const { token, viaProxy } = openRouterAuth();
    env.ANTHROPIC_BASE_URL = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "");
    env.ANTHROPIC_AUTH_TOKEN = token;
    env.ANTHROPIC_API_KEY = ""; // blank, not deleted — stops the SDK falling back to Anthropic auth
    if (viaProxy) delete env.OPENROUTER_API_KEY; // the provider key stays with the proxy
    return env;
  }

  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}
