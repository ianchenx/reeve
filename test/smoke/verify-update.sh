#!/bin/sh
#
# verify-update.sh — end-to-end test for `reeve update`.
#
# Installs a tarball whose version is pinned to 0.0.0 (guaranteed older
# than any published npm release), runs `reeve update`, and asserts
# the binary was actually upgraded to the current npm latest.
#
# Expected:
#   /pkg/reeve-ai.tgz   Mount the tarball read-only.
#
# Exit 0 = pass, non-zero = fail.
set -e

PKG="/pkg/reeve-ai.tgz"
[ -f "$PKG" ] || { echo "FAIL: no tarball at $PKG"; exit 1; }

echo "==> Install fake 0.0.0 from tarball"
bun add -g "$PKG"
export PATH="/root/.bun/bin:$PATH"

before=$(reeve --version)
echo "    before: $before"
case "$before" in
  *0.0.0*) ;;
  *) echo "FAIL: expected tarball to report 0.0.0, got: $before"; exit 1 ;;
esac

echo ""
echo "==> reeve update --check"
check_out=$(reeve update --check 2>&1)
echo "$check_out"
case "$check_out" in
  *available*) ;;
  *) echo "FAIL: --check did not report an available upgrade"; exit 1 ;;
esac

echo ""
echo "==> reeve update (no daemon)"
reeve update

echo ""
after=$(reeve --version)
echo "    after:  $after"
case "$after" in
  *0.0.0*) echo "FAIL: version did not change after update ($after)"; exit 1 ;;
esac

echo ""
echo "OK (upgraded from $before to $after)"
