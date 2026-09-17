#!/usr/bin/env bash
# Transform Claude Code canonical source → OpenCode / Codex platform formats.
# Run after any change to .claude/ source files.
#
# Usage:
#   ./scripts/transform.sh              # transform to all platforms
#   ./scripts/transform.sh --opencode   # OpenCode only
#   ./scripts/transform.sh --codex      # Codex only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLAUDE_SKILLS="$REPO_ROOT/.claude/skills/forge"
CLAUDE_COMMANDS="$REPO_ROOT/.claude/commands"

DO_OPENCODE=1
DO_CODEX=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --opencode) DO_OPENCODE=1; DO_CODEX=0 ;;
    --codex)    DO_OPENCODE=0; DO_CODEX=1 ;;
    -h|--help)  printf 'Usage: %s [--opencode|--codex]\n' "$0"; exit 0 ;;
    *)          printf 'Unknown flag: %s\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

die() { printf 'Error: %s\n' "$1" >&2; exit 1; }

[[ -d "$CLAUDE_SKILLS" ]] || die "Source not found: $CLAUDE_SKILLS"
[[ -d "$CLAUDE_COMMANDS" ]] || die "Source not found: $CLAUDE_COMMANDS"

# --- OpenCode Transform ---
# Differences: colon → underscore in command names, AskUserQuestion → question,
# .claude/ → .opencode/, command files flattened with underscore naming

transform_opencode() {
  local dst_skills="$REPO_ROOT/.opencode/skills/forge"
  local dst_commands="$REPO_ROOT/.opencode/commands"

  rm -rf "$dst_skills" "$dst_commands"/forge*.md
  mkdir -p "$dst_skills/references" "$dst_commands"

  adapt_opencode() {
    # Generic name rules — the old per-command enumeration silently skipped every
    # command added after it was written (build/feature/requirements shipped with
    # colon syntax on this platform because of exactly that).
    sed -E \
      -e 's/`AskUserQuestion`/`question`/g' \
      -e 's/AskUserQuestion/question/g' \
      -e 's|/forge:([a-z]+)|/forge_\1|g' \
      -e 's|name: forge:([a-z]+)|name: forge_\1|g' \
      -e 's|\.claude/skills/|.opencode/skills/|g' \
      -e 's|\.claude/commands/|.opencode/commands/|g' \
      "$1"
  }

  # SKILL.md
  adapt_opencode "$CLAUDE_SKILLS/SKILL.md" > "$dst_skills/SKILL.md"

  # References (copy with adaptations)
  for ref in "$CLAUDE_SKILLS"/references/*.md; do
    [[ -f "$ref" ]] || continue
    adapt_opencode "$ref" > "$dst_skills/references/$(basename "$ref")"
  done

  # Core command (forge.md)
  adapt_opencode "$CLAUDE_COMMANDS/forge.md" > "$dst_commands/forge.md"

  # Subcommand files (colon → underscore in filename)
  for cmd in "$CLAUDE_COMMANDS"/forge/*.md; do
    [[ -f "$cmd" ]] || continue
    local base
    base="$(basename "$cmd")"
    adapt_opencode "$cmd" > "$dst_commands/forge_${base}"
  done

  printf 'OpenCode: transformed %s → %s\n' ".claude/" ".opencode/"
}

# --- Codex Transform ---
# Differences: colon → space in invocations, /forge:X → $forge X,
# Codex router binds the shared command contracts to native tools and bundle paths.

transform_codex() {
  local dst_skills="$REPO_ROOT/plugins/forge/skills/forge"
  local dst_agents="$REPO_ROOT/.agents/skills/forge"

  rm -rf "$dst_skills" "$dst_agents"
  mkdir -p "$dst_skills/references" "$dst_agents/references"

  adapt_codex() {
    # Adapt invocation tokens, never filesystem paths or URLs containing /forge.
    node - "$1" <<'JS'
const fs = require('node:fs');
let text = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n')
  .replace(/^version: (.+)$/m, 'metadata:\n  version: $1')
  .replace(/AskUserQuestion/g, 'request_user_input')
  .replace(/(?<![\w/.:$-])\/forge(?::([a-z]+))?(?![\w/.:-])/g,
    (_, command) => '$forge' + (command ? ' ' + command : ''));
const binding = [
  '## Codex command loading',
  '',
  '- Set `AR_ROOT` to the absolute directory containing this loaded `SKILL.md`. Read bundled `scripts/` and `references/` from that directory. This binding takes precedence over the shared contracts\' Claude path examples and project-local copies.',
  '- Treat text after `$forge` as the invocation. If its first word is a subcommand listed below, read `<subcommand>.md` beside this file and execute that contract with the remaining text as `$ARGUMENTS`. Do this before bare-goal dispatch. Load only the selected contract and references it needs; use the same dispatch for chained commands.',
  '- For a bare invocation, use the dispatch table below; read `forge.md` for Classic or Setup wizard mode. A natural-language goal uses the Orchestrator section.',
  '- Command and reference files are shared across agents: interpret canonical slash/colon Forge invocations as `$forge <subcommand>`. `$ARGUMENTS` means user input, not a shell variable to evaluate.',
  '- In shared contracts, `AskUserQuestion` means the available Codex question tool (`request_user_input` in Plan mode, `request_user_input_async` when available), or a concise chat question when no tool is available. Translate other tool examples to actual session tools; never assume a Claude-only tool exists.',
  '- Run project commands in the user\'s repository and write project output there. Quote absolute bundle paths. On Windows use Git Bash for `.sh` scripts; PowerShell\'s `bash` may resolve to an unconfigured WSL installation.',
  '',
].join('\n');
text = text.replace('## Dispatch (bare', binding + '\n## Dispatch (bare');
process.stdout.write(text);
JS
  }

  # Skills
  adapt_codex "$CLAUDE_SKILLS/SKILL.md" > "$dst_skills/SKILL.md"
  cp "$dst_skills/SKILL.md" "$dst_agents/SKILL.md"

  for ref in "$CLAUDE_SKILLS"/references/*.md; do
    [[ -f "$ref" ]] || continue
    local base
    base="$(basename "$ref")"
    cp "$ref" "$dst_skills/references/$base"
    cp "$dst_skills/references/$base" "$dst_agents/references/$base"
  done

  # Command files (Codex merges commands into skills directory)
  cp "$CLAUDE_COMMANDS/forge.md" "$dst_skills/forge.md"
  cp "$dst_skills/forge.md" "$dst_agents/forge.md"

  for cmd in "$CLAUDE_COMMANDS"/forge/*.md; do
    [[ -f "$cmd" ]] || continue
    local cbase
    cbase="$(basename "$cmd")"
    cp "$cmd" "$dst_skills/$cbase"
    cp "$dst_skills/$cbase" "$dst_agents/$cbase"
  done

  # Restore agents config
  mkdir -p "$dst_agents/agents" "$dst_skills/agents"
  cat > "$dst_agents/agents/openai.yaml" <<'YAML'
interface:
  display_name: "AutoForge"
  short_description: "Autonomous goal-directed iteration engine"
  brand_color: "#0F766E"
  default_prompt: "$forge plan Goal: Define a measurable improvement for this repository"

policy:
  allow_implicit_invocation: true
YAML
  cp "$dst_agents/agents/openai.yaml" "$dst_skills/agents/openai.yaml"

  printf 'Codex: transformed %s → plugins/ + .agents/\n' ".claude/"
}

# --- Claude Plugin Hooks Transform ---

transform_hooks() {
  local src_hooks="$REPO_ROOT/.claude/hooks/forge"
  local dst_hooks="$REPO_ROOT/claude-plugin/hooks"

  [[ -d "$src_hooks" ]] || { printf 'Hooks: no source at %s, skipping\n' "$src_hooks"; return; }

  rm -rf "$dst_hooks"
  mkdir -p "$dst_hooks/lib"

  # Copy all hook files
  for f in "$src_hooks"/*.cjs "$src_hooks"/*.sh "$src_hooks"/*.json; do
    [[ -f "$f" ]] || continue
    cp "$f" "$dst_hooks/$(basename "$f")"
  done

  # Copy .ckignore baseline
  [[ -f "$src_hooks/.ckignore" ]] && cp "$src_hooks/.ckignore" "$dst_hooks/.ckignore"

  # Copy lib directory
  for f in "$src_hooks"/lib/*.cjs; do
    [[ -f "$f" ]] || continue
    cp "$f" "$dst_hooks/lib/$(basename "$f")"
  done

  # Ensure runner is executable
  [[ -f "$dst_hooks/node-hook-runner.sh" ]] && chmod +x "$dst_hooks/node-hook-runner.sh"

  printf 'Hooks: transformed %s → claude-plugin/hooks/\n' ".claude/hooks/forge/"
}

# --- Seam scripts sync ---
# The mechanical gates ship INSIDE skills/forge/scripts/ in every tree so
# plugin, local, and dev installs all resolve the same relative path. Canonical
# source stays repo-root scripts/; these are distribution copies.

transform_scripts() {
  local runtime=(score-build.sh score-requirements.sh score-regression.sh score-debug-fix.sh orchestrate.sh doctor.sh validate-handoff.sh run-index.sh score-test.sh score-design.sh design-scan.cjs asset-check.cjs lessons.cjs score-research.sh score-android.sh)
  local tree s
  for tree in ".claude/skills/forge" \
              "claude-plugin/skills/forge" \
              ".opencode/skills/forge" \
              ".agents/skills/forge" \
              "plugins/forge/skills/forge"; do
    mkdir -p "$REPO_ROOT/$tree/scripts"
    for s in "${runtime[@]}"; do
      cp "$REPO_ROOT/scripts/$s" "$REPO_ROOT/$tree/scripts/$s"
    done
  done
  printf 'Scripts: synced %d seam scripts into all 5 skill trees\n' "${#runtime[@]}"
}

# --- Main ---

if [[ $DO_OPENCODE -eq 1 ]]; then transform_opencode; fi
if [[ $DO_CODEX -eq 1 ]]; then transform_codex; fi
transform_hooks
transform_scripts

printf 'Transform complete.\n'
