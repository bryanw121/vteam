#!/usr/bin/env bash
# The Android app run (#361), called by .github/workflows/android-app.yml inside
# the emulator. Installs the APK, warms the app up, runs the flows, and on any
# failure writes what was on screen to the log and the job summary (artifacts
# can't be opened from a phone or a cloud session). Sets `failure` in
# $GITHUB_OUTPUT: `environment` when the app never reached Events in warm-up
# (the workflow re-runs those once), `flows` when a flow failed.
set -uo pipefail

OUT=test-results/android
SUMMARY=${GITHUB_STEP_SUMMARY:-/dev/stdout}
mkdir -p "$OUT"

note() { echo "$1" | tee -a "$SUMMARY"; }

describe() {
  local heading=$1
  echo "::group::Screen: $heading"
  adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | tee -a "$OUT/focus.txt" || true
  adb shell dumpsys activity processes 2>/dev/null | grep -iE 'not ?responding|ANR' | head -5 || true
  # ICMP can be blocked even when HTTPS works, so this is a hint, not a verdict.
  if adb shell ping -c 1 -W 3 uifolvbwtrbcmfrvelnl.supabase.co >/dev/null 2>&1; then
    echo "network: ping to beta answered"; local net="ping to beta answered"
  else
    echo "network: ping to beta got no answer (ICMP may just be blocked)"; local net="ping to beta got no answer (ICMP may just be blocked)"
  fi
  adb exec-out uiautomator dump /dev/tty 2>/dev/null | sed 's/UI hierchary dumped to.*//' > "$OUT/screen.xml" || true
  node e2e/android/describe-screen.js "$heading" < "$OUT/screen.xml" | tee "$OUT/screen.md"
  echo "::endgroup::"
  {
    cat "$OUT/screen.md"
    echo "- Focus: \`$(adb shell dumpsys window | grep -m1 mCurrentFocus | tr -d '\r' | sed 's/^ *//')\`"
    echo "- Network: $net"
    echo
    echo '<details><summary>Last app log lines</summary>'
    echo
    echo '```'
    adb logcat -d -s ReactNativeJS:V AndroidRuntime:E 2>/dev/null | tail -40
    echo '```'
    echo '</details>'
    echo
  } >> "$SUMMARY"
}

fail() {
  echo "failure=$1" >> "${GITHUB_OUTPUT:-/dev/null}"
  adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
  exit 1
}

adb install -r apk/app-release.apk || { note "### Android app: install failed"; fail environment; }

# The Pixel Launcher (NexusLauncher) is the one app that kept answering "isn't
# responding" on the emulator (Nov 24) and nothing here needs a home screen:
# Maestro launches vteam directly. Turn it off and close any dialog it left.
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher >/dev/null 2>&1 || true
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true

# Warm-up: the first launch on a fresh emulator (180 s, system dialogs dismissed).
if ! maestro test e2e/android/flows/_warmup.yaml --test-output-dir "$OUT/warmup"; then
  note "### Android app: environment, the app never reached Events in warm-up"
  describe "Warm-up: app never reached Events"
  fail environment
fi

if ! maestro test e2e/android/flows -e EVENT_ID="$EVENT_ID" --format junit --output "$OUT/report.xml" --test-output-dir "$OUT"; then
  note "### Android app: a flow failed"
  # Name the failed flows from the JUnit report.
  node -e '
    const x = require("fs").readFileSync(process.argv[1], "utf8")
    for (const m of x.matchAll(/<testcase[^>]*name="([^"]*)"[^>]*>\s*<failure[^>]*message="([^"]*)"/g)) console.log(`- **${m[1]}**: ${m[2]}`)
  ' "$OUT/report.xml" >> "$SUMMARY" 2>/dev/null || true
  describe "After the failed flow"
  fail flows
fi
note "### Android app: all flows passed"
