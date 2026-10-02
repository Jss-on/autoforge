#!/usr/bin/env bash
# AutoForge installer — supports Claude Code, OpenCode, OpenAI Codex, and Cursor, local or global.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TOOL=""
LOCATION=""
CONFIG_DIR=""
FORCE=0

cancelled() { printf "\nInstallation cancelled\n"; exit 0; }
trap cancelled INT

usage() {
  cat <<'EOF'
Usage: ./scripts/install.sh [options]

Options:
  --claude            Install for Claude Code
  --opencode          Install for OpenCode
  --codex             Install for OpenAI Codex
  --cursor            Install for Cursor
  -g, --global        Install globally
  -l, --local         Install in the current project
  -c, --config-dir    Override the global config directory
  --force             Replace existing files without prompting
  -h, --help          Show this help message

Examples:
  ./scripts/install.sh                          # interactive
  ./scripts/install.sh --claude --global
  ./scripts/install.sh --opencode --local
  ./scripts/install.sh --codex --global
  ./scripts/install.sh --cursor --local
EOF
}

expand_path() {
  local raw="$1"
  case "$raw" in
    '~') raw="$HOME" ;;
    '~/'*) raw="$HOME/${raw#\~/}" ;;
  esac
  # Round-trip through a native absolute path so /tmp and /c aliases compare equally.
  case "$OSTYPE" in msys*|cygwin*) raw="$(cygpath -u "$(cygpath -am "$raw")")" ;; esac
  case "$raw" in /*) ;; *) raw="$PWD/$raw" ;; esac
  printf '%s\n' "$raw"
}

is_interactive() { [[ -t 0 && -t 1 ]]; }

die() { printf 'Error: %s\n' "$1" >&2; exit 1; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --claude)
        if [[ -n "$TOOL" && "$TOOL" != "claude" ]]; then die "choose only one tool"; fi
        TOOL="claude" ;;
      --opencode)
        if [[ -n "$TOOL" && "$TOOL" != "opencode" ]]; then die "choose only one tool"; fi
        TOOL="opencode" ;;
      --codex)
        if [[ -n "$TOOL" && "$TOOL" != "codex" ]]; then die "choose only one tool"; fi
        TOOL="codex" ;;
      --cursor)
        if [[ -n "$TOOL" && "$TOOL" != "cursor" ]]; then die "choose only one tool"; fi
        TOOL="cursor" ;;
      -g|--global)
        if [[ -n "$LOCATION" && "$LOCATION" != "global" ]]; then die "choose --global or --local"; fi
        LOCATION="global" ;;
      -l|--local)
        if [[ -n "$LOCATION" && "$LOCATION" != "local" ]]; then die "choose --global or --local"; fi
        LOCATION="local" ;;
      -c|--config-dir)
        shift
        if [[ $# -eq 0 || -z "$1" ]]; then die "--config-dir requires a path"; fi
        CONFIG_DIR="$(expand_path "$1")" ;;
      --config-dir=*)
        if [[ -z "${1#*=}" ]]; then die "--config-dir requires a path"; fi
        CONFIG_DIR="$(expand_path "${1#*=}")" ;;
      --force) FORCE=1 ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown argument: $1" ;;
    esac
    shift
  done
}

get_global_dir() {
  local tool="$1"
  if [[ -n "$CONFIG_DIR" ]]; then printf '%s\n' "$CONFIG_DIR"; return; fi
  case "$tool" in
    claude)
      if [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
        expand_path "$CLAUDE_CONFIG_DIR"
      else
        printf '%s\n' "$HOME/.claude"
      fi ;;
    opencode)
      if [[ -n "${OPENCODE_CONFIG_DIR:-}" ]]; then expand_path "$OPENCODE_CONFIG_DIR"
      elif [[ -n "${OPENCODE_CONFIG:-}" ]]; then dirname "$(expand_path "$OPENCODE_CONFIG")"
      elif [[ -n "${XDG_CONFIG_HOME:-}" ]]; then printf '%s\n' "$(expand_path "$XDG_CONFIG_HOME")/opencode"
      else printf '%s\n' "$HOME/.config/opencode"; fi ;;
    codex)
      if [[ -n "${CODEX_HOME:-}" ]]; then expand_path "$CODEX_HOME"
      else printf '%s\n' "$HOME/.codex"; fi ;;
    cursor) printf '%s\n' "$HOME/.cursor" ;;
  esac
}

get_target_dir() {
  local tool="$1" location="$2"
  if [[ "$location" == "local" ]]; then
    case "$tool" in
      claude) printf '%s\n' "$PWD/.claude" ;;
      opencode) printf '%s\n' "$PWD/.opencode" ;;
      codex) printf '%s\n' "$PWD/.codex" ;;
      cursor) printf '%s\n' "$PWD/.cursor" ;;
    esac
    return
  fi
  get_global_dir "$tool"
}

prompt_tool() {
  local answer
  printf 'Select the tool to install:\n  1) Claude Code\n  2) OpenCode\n  3) OpenAI Codex\n  4) Cursor\nChoice [1]: '
  read -r answer || cancelled
  case "${answer:-1}" in
    1) TOOL="claude" ;;
    2) TOOL="opencode" ;;
    3) TOOL="codex" ;;
    4) TOOL="cursor" ;;
    *) die "invalid selection: $answer" ;;
  esac
}

prompt_location() {
  local global_dir answer local_dir
  global_dir="$(get_global_dir "$TOOL")"
  local_dir="$(get_target_dir "$TOOL" local)"
  printf 'Install location:\n  1) Global (%s)\n  2) Local  (%s)\nChoice [1]: ' "$global_dir" "$local_dir"
  read -r answer || cancelled
  case "${answer:-1}" in
    1) LOCATION="global" ;;
    2) LOCATION="local" ;;
    *) die "invalid selection: $answer" ;;
  esac
}

ensure_context() {
  if [[ -z "$TOOL" ]]; then
    if is_interactive; then prompt_tool; else TOOL="claude"; fi
  fi
  if [[ -z "$LOCATION" ]]; then
    if is_interactive; then prompt_location; else LOCATION="global"; fi
  fi
}

sync_dir() {
  local source destination
  [[ -d "$1" ]] || die "source directory not found: $1"
  if [[ "$1" -ef "$2" ]]; then return; fi
  source="$(expand_path "$(cd "$1" && pwd -P)")"
  mkdir -p "$(dirname "$2")"
  destination="$(checked_destination "$2")"
  case "$source/" in "$destination/"*) die "source is inside destination: $destination" ;; esac
  case "$destination/" in "$source/"*) die "destination is inside source: $destination" ;; esac
  rm -rf "$destination"
  cp -R "$source" "$destination"
}
sync_file() {
  [[ -f "$1" ]] || die "source file not found: $1"
  if [[ "$1" -ef "$2" ]]; then return; fi
  mkdir -p "$(dirname "$2")"
  cp "$1" "$(checked_destination "$2")"
}

checked_destination() {
  local parent
  parent="$(expand_path "$(cd "$(dirname "$1")" && pwd -P)")"
  # target_root is the canonical config directory from main, never a path-depth guess.
  case "$parent/" in "$target_root/"*) ;; *) die "destination escapes config directory: $1" ;; esac
  [[ ! -L "$1" ]] || die "refusing symbolic-link destination: $1"
  printf '%s/%s\n' "$parent" "$(basename "$1")"
}

confirm_overwrite() {
  local target_root="$1"
  if [[ $FORCE -eq 1 ]]; then return 0; fi
  if [[ ! -d "$target_root/skills/forge" ]]; then return 0; fi
  if ! is_interactive; then return 0; fi
  local answer
  printf 'Existing forge files found in %s. Replace? [Y/n]: ' "$target_root"
  read -r answer || cancelled
  case "${answer:-Y}" in
    [yY]|[yY][eE][sS]|'') ;;
    *) printf 'Skipped.\n'; exit 0 ;;
  esac
}

install_claude() {
  local t="$1"
  mkdir -p "$t/skills" "$t/commands"
  # skills/forge carries SKILL.md + references/ + scripts/ — the seam
  # scripts ARE the mechanical gates; an install without them silently degrades
  # every gate to model self-report.
  sync_dir "$REPO_ROOT/.claude/skills/forge" "$t/skills/forge"
  if [[ -d "$REPO_ROOT/.claude/commands/forge" ]]; then
    sync_dir "$REPO_ROOT/.claude/commands/forge" "$t/commands/forge"
  fi
  if [[ -f "$REPO_ROOT/.claude/commands/forge.md" ]]; then
    sync_file "$REPO_ROOT/.claude/commands/forge.md" "$t/commands/forge.md"
  fi
  # The 9 safety/context hooks were previously never installed at all — an
  # advertised feature that only worked via the plugin marketplace path.
  if [[ -d "$REPO_ROOT/.claude/hooks/forge" ]]; then
    sync_dir "$REPO_ROOT/.claude/hooks/forge" "$t/hooks/forge"
    printf 'Hooks synced to %s/hooks/forge.\n' "$t"
    printf 'NOTE: hook REGISTRATION is automatic only for the marketplace plugin install\n'
    printf '      (/plugin install forge@autoforge). For this file install, wire\n'
    printf '      hooks/forge/hooks.json entries into your settings.json manually.\n'
  fi
}

install_opencode() {
  local t="$1" src
  mkdir -p "$t/skills" "$t/commands" "$t/agents"
  sync_dir "$REPO_ROOT/.opencode/skills/forge" "$t/skills/forge"
  for src in "$REPO_ROOT"/.opencode/commands/forge*.md; do
    if [[ -f "$src" ]]; then
      sync_file "$src" "$t/commands/$(basename "$src")"
    fi
  done
  sync_file "$REPO_ROOT/.opencode/agents/docs-manager.md" "$t/agents/docs-manager.md"
}

install_codex() {
  local t="$1"
  mkdir -p "$t/skills"
  sync_dir "$REPO_ROOT/.agents/skills/forge" "$t/skills/forge"
}

install_cursor() {
  local t="$1"
  mkdir -p "$t/skills"
  sync_dir "$REPO_ROOT/.cursor/skills/forge" "$t/skills/forge"
}

main() {
  parse_args "$@"
  ensure_context
  local target_root
  if [[ -n "$CONFIG_DIR" && "$LOCATION" == local ]]; then die "--config-dir can only be used with --global"; fi
  target_root="$(expand_path "$(get_target_dir "$TOOL" "$LOCATION")")"
  mkdir -p "$target_root"
  target_root="$(expand_path "$(cd "$target_root" && pwd -P)")"
  case "$OSTYPE:$target_root" in
    *:/|msys*:/[a-zA-Z]|cygwin*:/cygdrive/[a-zA-Z]) die "refusing filesystem root as config directory" ;;
  esac
  confirm_overwrite "$target_root"

  local label
  case "$TOOL" in claude) label="Claude Code" ;; opencode) label="OpenCode" ;; codex) label="OpenAI Codex" ;; cursor) label="Cursor" ;; esac
  printf 'Installing AutoForge for %s (%s)\nTarget: %s\n' "$label" "$LOCATION" "$target_root"

  case "$TOOL" in
    claude) install_claude "$target_root" ;;
    opencode) install_opencode "$target_root" ;;
    codex) install_codex "$target_root" ;;
    cursor) install_cursor "$target_root" ;;
  esac

  case "$TOOL" in
    codex) printf 'Done. Use $forge in Codex to start.\n' ;;
    cursor) printf 'Done. Use /forge or /forge <subcommand> in Cursor Agent to start.\n' ;;
    *) printf 'Done. Run /forge to start.\n' ;;
  esac
}

main "$@"
