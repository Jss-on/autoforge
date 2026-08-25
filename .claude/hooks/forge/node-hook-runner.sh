#!/usr/bin/env bash
# Wrapper to run Node.js hook scripts with clean environment.
# Silences shell profile noise that would corrupt JSON stdout.
# SystemRoot/APPDATA/TEMP/TMP must survive env -i: Node on Windows needs
# SystemRoot for several subsystems and os.tmpdir() falls back badly without
# TEMP/TMP — a crash here fail-opens EVERY blocker with no signal.
# CLAUDE_PLUGIN_ROOT must survive so hooks can resolve plugin-shipped files.
exec env -i HOME="$HOME" PATH="$PATH" NODE_PATH="$NODE_PATH" \
  TERM="$TERM" SHELL="$SHELL" USER="$USER" LANG="$LANG" \
  SYSTEMROOT="${SYSTEMROOT:-${SystemRoot:-}}" SystemRoot="${SystemRoot:-${SYSTEMROOT:-}}" \
  APPDATA="${APPDATA:-}" LOCALAPPDATA="${LOCALAPPDATA:-}" \
  TEMP="${TEMP:-}" TMP="${TMP:-}" \
  CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}" \
  CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}" \
  AR_DISABLE_SCOUT_BLOCK="${AR_DISABLE_SCOUT_BLOCK:-}" \
  AR_DISABLE_PRIVACY_BLOCK="${AR_DISABLE_PRIVACY_BLOCK:-}" \
  AR_DISABLE_DANGEROUS_CMD_BLOCK="${AR_DISABLE_DANGEROUS_CMD_BLOCK:-}" \
  AR_DISABLE_ITERATION_CONTEXT="${AR_DISABLE_ITERATION_CONTEXT:-}" \
  AR_DISABLE_SUBAGENT_CONTEXT="${AR_DISABLE_SUBAGENT_CONTEXT:-}" \
  AR_DISABLE_DEV_RULES_REMINDER="${AR_DISABLE_DEV_RULES_REMINDER:-}" \
  AR_DISABLE_SIMPLIFY_GATE="${AR_DISABLE_SIMPLIFY_GATE:-}" \
  AR_DISABLE_SESSION_INIT="${AR_DISABLE_SESSION_INIT:-}" \
  AR_DISABLE_STOP_NOTIFY="${AR_DISABLE_STOP_NOTIFY:-}" \
  AR_NOTIFY_WEBHOOK="${AR_NOTIFY_WEBHOOK:-}" \
  node "$@"
