#!/usr/bin/env bash
# Install Chromium's system packages for Playwright, surviving an apt mirror outage.
#
# GitHub's Ubuntu runners fetch packages through an Azure mirror list. When that mirror's name
# stops resolving ("Temporary failure resolving 'azure.archive.ubuntu.com'"), every e2e and a11y
# job dies here before running a test, after apt has spent minutes retrying. So: if the mirror's
# name doesn't resolve, go straight to archive.ubuntu.com; otherwise try as configured once and
# fall back on failure. Each attempt is capped so the job's own timeout is never the one to fire.
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

if getent hosts azure.archive.ubuntu.com >/dev/null; then
  attempt "runner mirrors" && exit 0
else
  echo "azure.archive.ubuntu.com doesn't resolve"
fi
use_canonical_mirrors
for n in 1 2; do
  attempt "archive.ubuntu.com, try $n" && exit 0
  sleep 15
done
echo "::error::Could not install Chromium system packages from any apt mirror"
exit 1
