#!/usr/bin/env bash
# Install Chromium's system packages for Playwright, surviving an apt mirror outage.
#
# GitHub's Ubuntu runners fetch packages through an Azure mirror list. When that mirror's name
# stops resolving ("Temporary failure resolving 'azure.archive.ubuntu.com'"), every e2e and a11y
# job dies here before running a test. So: try twice as configured, then point apt straight at
# archive.ubuntu.com / security.ubuntu.com and try twice more. Exits non-zero only if all fail.
set -uo pipefail

attempt() {
  echo "::group::playwright install-deps chromium ($1)"
  timeout 600 npx playwright install-deps chromium
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

for n in 1 2; do
  attempt "runner mirrors, try $n" && exit 0
  sleep 10
done
use_canonical_mirrors
for n in 1 2; do
  attempt "archive.ubuntu.com, try $n" && exit 0
  sleep 20
done
echo "::error::Could not install Chromium system packages from any apt mirror"
exit 1
