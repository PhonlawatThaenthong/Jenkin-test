#!/bin/sh
# Lab 10 Pipeline Health Gate: block a production deploy when this pipeline's own
# build success rate (from the Lab 09 Prometheus) is below the threshold.
#
# Prometheus keeps per-job counters, not a per-build history, so "the last 20 builds" is
# approximated by the builds finished inside HEALTH_WINDOW (default 24h, which covers
# roughly 20 builds at workshop traffic). Aborted builds are excluded.
set -eu
PROM_URL="${PROM_URL:-http://prometheus:9090}"
JOB="${HEALTH_JOB:?set HEALTH_JOB to the Jenkins job full name}"
WINDOW="${HEALTH_WINDOW:-24h}"
THRESHOLD="${HEALTH_THRESHOLD:-0.90}"
MIN_BUILDS="${HEALTH_MIN_BUILDS:-5}"

q() {
  curl -sf --get "$PROM_URL/api/v1/query" --data-urlencode "query=$1" \
    | jq -r '.data.result[0].value[1] // "0"'
}
sel="jenkins_job=\"$JOB\""
success=$(q "max(increase({__name__=~\"default_jenkins_builds_success_build_count(_total)?\",$sel}[$WINDOW]))")
total=$(q "max(increase({__name__=~\"default_jenkins_builds_total_build_count(_total)?\",$sel}[$WINDOW]))")
aborted=$(q "max(increase({__name__=~\"default_jenkins_builds_aborted_build_count(_total)?\",$sel}[$WINDOW]))")

echo "Health gate for job '$JOB' over $WINDOW: success=$success total=$total aborted=$aborted"
awk -v s="$success" -v t="$total" -v a="$aborted" -v th="$THRESHOLD" -v min="$MIN_BUILDS" 'BEGIN {
  finished = t - a
  if (finished < min) {
    printf "Only %.1f finished builds in the window (< %d): not enough data, gate passes with a warning.\n", finished, min
    exit 0
  }
  rate = s / finished
  printf "Build success rate = %.1f%% (threshold %.0f%%)\n", rate * 100, th * 100
  if (rate < th) { print "HEALTH GATE FAILED: pipeline is unhealthy, production deploy blocked."; exit 1 }
  print "Health gate passed."
}'
