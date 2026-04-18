#!/usr/bin/env bash
#
# Reeve installer — one-line install for the reeve-ai CLI.
#
# Usage:
#   curl -fsSL https://reeve.run/install.sh | bash
#
# Environment variables:
#   SKIP_BUN_INSTALL   Set to "1" to skip auto-installing Bun if missing.
#   BUN_INSTALL        Override Bun install dir (default: $HOME/.bun).
#   REEVE_DEBUG        Set to "1" to print shell trace.
#
if [ -z "${BASH_VERSION:-}" ]; then
  echo "error: this installer requires bash." >&2
  echo "       rerun with: curl -fsSL https://reeve.run/install.sh | bash" >&2
  exit 1
fi

set -euo pipefail

if [[ "${REEVE_DEBUG:-}" == "1" ]]; then
  set -x
fi

# Remember the user's shell PATH before we modify our own, so the final
# "PATH not set up" hint only fires when the user genuinely needs it.
readonly ORIGINAL_PATH="$PATH"

readonly PACKAGE_NAME="reeve-ai"
readonly BIN_NAME="reeve"
readonly BUN_INSTALL_URL="https://bun.sh/install"
readonly REPO_URL="https://github.com/ianchenx/reeve"

# --- output helpers -----------------------------------------------------------
if [[ -t 1 ]]; then
  _red=$'\033[0;31m'
  _green=$'\033[0;32m'
  _yellow=$'\033[0;33m'
  _dim=$'\033[0;2m'
  _bold=$'\033[1m'
  _reset=$'\033[0m'
else
  _red='' _green='' _yellow='' _dim='' _bold='' _reset=''
fi

info()    { printf '%s\n' "${_dim}$*${_reset}"; }
step()    { printf '%s\n' "${_bold}==>${_reset} $*"; }
warn()    { printf '%s\n' "${_yellow}warn:${_reset} $*" >&2; }
success() { printf '%s\n' "${_green}$*${_reset}"; }
die()     { printf '%s\n' "${_red}error:${_reset} $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

# --- platform detection -------------------------------------------------------
os=$(uname -s 2>/dev/null || echo unknown)
case "$os" in
  Linux|Darwin) ;;
  *) die "unsupported OS: $os (Reeve requires Linux or macOS)" ;;
esac

arch=$(uname -m 2>/dev/null || echo unknown)
case "$arch" in
  x86_64|amd64|arm64|aarch64) ;;
  *) die "unsupported architecture: $arch" ;;
esac

# --- bun bootstrap ------------------------------------------------------------
bun_bin_dir() {
  printf '%s/bin' "${BUN_INSTALL:-$HOME/.bun}"
}

add_bun_to_path() {
  local dir
  dir=$(bun_bin_dir)
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) export PATH="$dir:$PATH" ;;
  esac
}

bun_version() {
  local v
  v=$(bun --version 2>&1 | head -1) \
    || die "Bun is installed but failed to run: $v"
  printf '%s' "$v"
}

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    local v
    v=$(bun_version)
    info "Found Bun $v"
    return 0
  fi

  if [[ "${SKIP_BUN_INSTALL:-}" == "1" ]]; then
    die "Bun is required but not found. Install from https://bun.sh then re-run."
  fi

  step "Bun not found — installing from $BUN_INSTALL_URL"
  need_cmd curl
  need_cmd bash
  # Bun's own installer needs unzip; surface the requirement up-front
  # so the error is actionable.
  command -v unzip >/dev/null 2>&1 \
    || die "unzip is required to install Bun. Install it (apt/brew) and re-run."

  curl -fsSL "$BUN_INSTALL_URL" | bash \
    || die "Bun installation failed"

  add_bun_to_path
  command -v bun >/dev/null 2>&1 \
    || die "Bun installed but not found on PATH. Start a new shell and re-run."

  local v
  v=$(bun_version)
  success "Bun $v ready"
}

# --- reeve install ------------------------------------------------------------
install_reeve() {
  local spec="$PACKAGE_NAME"
  if [[ -n "${VERSION:-}" ]]; then
    spec="${PACKAGE_NAME}@${VERSION}"
  fi

  step "Installing $spec globally with bun"
  bun add -g "$spec" \
    || die "bun add -g $spec failed"
}

# --- verification -------------------------------------------------------------
verify() {
  add_bun_to_path
  if ! command -v "$BIN_NAME" >/dev/null 2>&1; then
    warn "$BIN_NAME not found on PATH after install."
    info  "Bun installs globals to $(bun_bin_dir). Add this to your shell rc:"
    printf '  %sexport PATH="%s:$PATH"%s\n' "$_bold" "$(bun_bin_dir)" "$_reset"
    exit 1
  fi

  step "Verifying installation"
  local v
  v=$("$BIN_NAME" --version 2>&1) \
    || die "'$BIN_NAME --version' failed: $v"
  success "$v"
}

# --- main ---------------------------------------------------------------------
main() {
  info "Reeve installer — $os/$arch"
  ensure_bun
  install_reeve
  verify

  echo
  success "Reeve installed."

  local bun_dir reeve_dir path_missing=0 already_configured=0
  bun_dir=$(bun_bin_dir)
  reeve_dir="${REEVE_DIR:-$HOME/.reeve}"

  if [[ ":$ORIGINAL_PATH:" != *":$bun_dir:"* ]]; then
    path_missing=1
  fi
  if [[ -f "$reeve_dir/settings.json" ]]; then
    already_configured=1
  fi

  # PATH first — without it, the next-step commands won't resolve.
  if (( path_missing )); then
    echo
    warn "$bun_dir is not on your PATH in new shells."
    info  "For this shell:"
    printf '  %sexport PATH="%s:$PATH"%s\n' "$_bold" "$bun_dir" "$_reset"
    info  "To persist, append that line to ~/.zshrc, ~/.bashrc, or your shell's rc file."
  fi

  echo
  if (( already_configured )); then
    info  "Existing config detected at ${_bold}$reeve_dir/settings.json${_reset}${_dim} — no re-init needed."
    info  "Run ${_bold}$BIN_NAME --help${_reset}${_dim} to see all commands, or ${_bold}$BIN_NAME start${_reset}${_dim} to launch the daemon."
  else
    info  "Next: run ${_bold}$BIN_NAME init${_reset}${_dim} to configure Linear + pick an agent."
    info  "      ${_bold}$BIN_NAME doctor${_reset}${_dim} checks your setup."
    info  "      ${_bold}$BIN_NAME --help${_reset}${_dim} lists every command."
    info  "      Docs: $REPO_URL"
  fi
}

main "$@"
