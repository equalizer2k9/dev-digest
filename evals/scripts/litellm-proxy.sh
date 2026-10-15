#!/usr/bin/env bash
# Start/stop the LiteLLM translating proxy that lets the eval TOOL tiers (agentTask / workflowTask)
# run on cheap non-Anthropic OpenRouter models. See evals/proxy/litellm.config.yaml for the why.
#
# Usage:
#   scripts/litellm-proxy.sh up      # start, wait until it answers, print the export line
#   scripts/litellm-proxy.sh down    # stop and remove the container
#   scripts/litellm-proxy.sh wait    # block until the running proxy is healthy (CI helper)
#
# The OpenRouter key is taken from $OPENROUTER_API_KEY, or read from ~/.devdigest/secrets.json.
# The proxy's master key is $LITELLM_MASTER_KEY; when unset, `up` generates a random one and keeps it
# in proxy/.master-key (0600, git-ignored) for the eval process to export.

set -euo pipefail

PROXY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../proxy" && pwd)"
COMPOSE=(docker compose -f "$PROXY_DIR/docker-compose.yml")
PORT="${LITELLM_PORT:-4000}"
URL="http://localhost:${PORT}"
MASTER_KEY_FILE="$PROXY_DIR/.master-key"

load_key() {
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    local secrets="$HOME/.devdigest/secrets.json"
    if [[ -f "$secrets" ]]; then
      OPENROUTER_API_KEY="$(node -e 'process.stdout.write((require(process.argv[1]).OPENROUTER_API_KEY)||"")' "$secrets" 2>/dev/null || true)"
    fi
  fi
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    echo "error: OPENROUTER_API_KEY not set and not found in ~/.devdigest/secrets.json" >&2
    exit 1
  fi
  export OPENROUTER_API_KEY
}

load_master_key() {
  if [[ -z "${LITELLM_MASTER_KEY:-}" ]]; then
    LITELLM_MASTER_KEY="sk-$(openssl rand -hex 32)"
    (umask 077 && printf '%s' "$LITELLM_MASTER_KEY" > "$MASTER_KEY_FILE")
  fi
  export LITELLM_MASTER_KEY
}

wait_healthy() {
  echo "waiting for LiteLLM proxy at ${URL} ..." >&2
  for _ in $(seq 1 60); do
    if curl -fsS "${URL}/health/liveliness" >/dev/null 2>&1; then
      echo "proxy is up: ${URL}" >&2
      return 0
    fi
    sleep 2
  done
  echo "error: proxy did not become healthy at ${URL}" >&2
  "${COMPOSE[@]}" logs --tail 40 >&2 || true
  exit 1
}

case "${1:-up}" in
  up)
    load_key
    load_master_key
    "${COMPOSE[@]}" up -d
    wait_healthy
    cat >&2 <<EOF

Proxy ready. To route every eval tier through it (the OpenRouter key stays in the container):

  export EVAL_BACKEND=openrouter
  export OPENROUTER_BASE_URL=${URL}
  export LITELLM_MASTER_KEY="\$(cat ${MASTER_KEY_FILE})"   # unless you set it yourself
  export EVAL_MODEL=google/gemini-2.5-flash        # cheap model that survives the tool tiers
  export EVAL_JUDGE_MODEL=google/gemini-2.5-flash
  pnpm eval:workflow

Stop it with: scripts/litellm-proxy.sh down
EOF
    ;;
  down)
    # compose interpolates the env block even on `down`, so the vars must be present (values unused).
    OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-unused}" LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-unused}" \
      "${COMPOSE[@]}" down
    rm -f "$MASTER_KEY_FILE"
    ;;
  wait)
    wait_healthy
    ;;
  *)
    echo "usage: $0 {up|down|wait}" >&2
    exit 2
    ;;
esac
