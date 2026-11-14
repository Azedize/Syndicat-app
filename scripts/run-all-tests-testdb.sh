#!/usr/bin/env bash
# Runs every test suite against the ISOLATED test base (syndycat_test) and its
# API on :5056. The working base is never the target: `testdb exec` refuses
# any database other than syndycat_test on a local host.
#   bash run-all-tests-testdb.sh [suite-file …]
# Logs: scripts/.seedgen/logs/tests/<suite>.log ; summary printed at the end.
cd "$(dirname "$0")"
LOGS=.seedgen/logs/tests
mkdir -p "$LOGS"
if [ $# -gt 0 ]; then SUITES="$*"; else
  SUITES=$(node -e 'const j=require("./package.json");const s=new Set();for(const [k,v] of Object.entries(j.scripts)) if(k.endsWith(":test")){const m=[...v.matchAll(/src\/([\w-]+-test\.ts)/g)].pop(); if(m) s.add(m[1]);} console.log([...s].join(" "))')
fi
: > "$LOGS/summary.txt"
for f in $SUITES; do
  name=${f%.ts}
  start=$(date +%s)
  # rate-limit-profile checks the header the WORKING-base API announces (one GET,
  # no write): it must see :5055, not the test API.
  api=http://localhost:5056/api
  [ "$name" = "rate-limit-profile-test" ] && api=http://localhost:5055/api
  # A suite that never exits (open handle) is stopped after 10 minutes.
  timeout 600 pnpm run -s testdb -- exec env API_BASE_URL=$api node --import=tsx "src/$f" > "$LOGS/$name.log" 2>&1
  code=$?
  secs=$(( $(date +%s) - start ))
  last=$(grep -E "passed|réussi|[0-9]+/[0-9]+|obtenus" "$LOGS/$name.log" | tail -1 | tr -s ' ' | cut -c1-120)
  # « ❌ FAIL » lines (election-audit) count too; a non-zero exit without any counted line is reported as exit=1.
  fails=$(grep -cE "^\s*(❌ )?(FAIL|ÉCHEC)" "$LOGS/$name.log")
  printf "%-36s exit=%s fails=%s %4ss  %s\n" "$name" "$code" "$fails" "$secs" "$last" | tee -a "$LOGS/summary.txt"
done
