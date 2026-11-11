#!/usr/bin/env bash
# Install Chromium's system packages for Playwright without letting an apt outage fail CI.
#
# GitHub's Ubuntu runners fetch packages through an Azure mirror list. On Nov 11 2026 the runners
# stopped resolving both azure.archive.ubuntu.com and archive.ubuntu.com ("Temporary failure
# resolving ..."), and every e2e and a11y job died here before running a test. The runner image
# already ships Google Chrome, so Chromium's shared libraries are normally present anyway; what
# apt adds on top is mostly fonts.
#
# So: install through whichever Ubuntu mirror resolves (the runner's first, then
# archive.ubuntu.com), each attempt capped so the job's timeout never fires here. If no mirror
# works, check that Playwright's Chromium has every shared library it links against; if it does,
# warn and carry on (the tests themselves will say if the browser can't run). Fail only when a
# library is actually missing.
set -uo pipefail

attempt() {
  echo "::group::playwright install-deps chromium ($1)"
  timeout 240 npx playwright install-deps chromium
  local status=$?
  echo "::endgroup::"
  return $status
}

use_canonical_mirrors() {
  echo "Switching apt from the runner's mirror list to archive.ubuntu.com"
  local f
  for f in /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list; do
    [ -f "$f" ] || continue
    sudo sed -i \
      -e 's#mirror+file:/etc/apt/apt-mirrors.txt#http://archive.ubuntu.com/ubuntu/#g' \
      -e 's#http://azure.archive.ubuntu.com/ubuntu/\?#http://archive.ubuntu.com/ubuntu/#g' \
      "$f"
  done
}

resolves() { getent hosts "$1" >/dev/null; }

if resolves azure.archive.ubuntu.com; then
  attempt "runner mirrors" && exit 0
else
  echo "azure.archive.ubuntu.com doesn't resolve"
fi
if resolves archive.ubuntu.com; then
  use_canonical_mirrors
  attempt "archive.ubuntu.com" && exit 0
else
  echo "archive.ubuntu.com doesn't resolve either"
fi

# No mirror worked. Is Chromium runnable with what the runner image already has?
browsers=$(ls -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"/chromium*/chrome-*/{chrome,chrome-headless-shell,headless_shell} 2>/dev/null)
if [ -z "$browsers" ]; then
  echo "::error::Couldn't install Chromium's system packages (no apt mirror reachable) and found no Playwright Chromium to check"
  exit 1
fi
missing=$(for b in $browsers; do ldd "$b" | grep 'not found'; done | sort -u)
if [ -n "$missing" ]; then
  echo "::error::Couldn't install Chromium's system packages (no apt mirror reachable), and Chromium is missing:"
  echo "$missing"
  exit 1
fi
echo "::warning::Ubuntu's apt mirrors are unreachable; skipped Chromium's system packages. The runner image already has every library Chromium links against (some fonts may be missing)."
exit 0
