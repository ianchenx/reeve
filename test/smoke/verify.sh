#!/bin/sh
#
# verify.sh — verify a reeve package works in a clean environment.
#
# Modes:
#   basic (default)  Install from tarball, check CLI starts.
#   full             Also verify config loading and project listing.
#
# Exit code 0 = pass, non-zero = fail.
set -e

MODE="${1:-basic}"
PKG="/pkg/reeve-ai.tgz"

die() { echo "FAIL: $1" >&2; exit 1; }

[ -f "$PKG" ] || die "no tarball at $PKG — mount with -v ./pkg.tgz:/pkg/reeve-ai.tgz:ro"

# ── Install ──
echo "==> Installing from tarball"
bun add -g "$PKG" || die "bun add -g failed"

# ── CLI basics ──
echo ""
echo "==> reeve --version"
reeve --version

echo ""
echo "==> reeve doctor"
reeve doctor || true

echo ""
echo "==> Daemon start/stop"
# basic mode has no settings.json mounted; `reeve run` fails preflight by design,
# so use `reeve start` (tolerant of empty config) for basic. full mode has real
# settings, so exercise the strict `reeve run` path too.
if [ "$MODE" = "full" ]; then
  reeve run &
  PID=$!
  sleep 3
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:14500/api/status 2>/dev/null || echo "000")
  PROJECTS_CODE=$(curl -s -o /tmp/reeve-projects.json -w '%{http_code}' http://localhost:14500/api/projects 2>/dev/null || echo "000")
  kill $PID 2>/dev/null || true
  wait $PID 2>/dev/null || true
else
  reeve start >/dev/null
  sleep 3
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:14500/api/status 2>/dev/null || echo "000")
  reeve stop >/dev/null 2>&1 || true
fi

if [ "$CODE" = "200" ]; then
  echo "PASS: HTTP 200"
else
  die "daemon health check failed (HTTP $CODE)"
fi

if [ "$MODE" = "full" ]; then
  if [ "$PROJECTS_CODE" != "200" ]; then
    die "project listing failed (HTTP $PROJECTS_CODE)"
  fi
  jq -e 'type == "array"' /tmp/reeve-projects.json >/dev/null || die "project listing did not return a JSON array"
  echo "PASS: project listing"
fi

# ── Full mode: config-dependent checks ──
if [ "$MODE" = "full" ]; then
  echo ""
  echo "==> Config loading"
  [ -f /root/.reeve/settings.json ] || die "settings.json not mounted"
  echo "PASS: settings.json mounted"
fi

echo ""
echo "OK ($MODE)"
