#!/bin/bash
# Quality gate: fails CI if any module is grade D or worse.
# Also warns about C-grade modules (no tests).
#
# Run: bash scripts/check-quality.sh

set -euo pipefail
cd "$(dirname "$0")/.."

errors=0
warnings=0

get_lines() { wc -l < "$1" | tr -d ' '; }

get_test_count() {
  local src="$1"
  local test="${src%.ts}.test.ts"
  if [ -f "$test" ]; then
    grep -c '  it(' "$test" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

echo "Checking module quality..."
echo ""

for f in src/lib/*.ts; do
  echo "$f" | grep -q '\.test\.ts$' && continue

  lines=$(get_lines "$f")
  tests=$(get_test_count "$f")
  test_file="${f%.ts}.test.ts"
  basename=$(echo "$f" | sed 's|src/||')

  # Skip types-only files
  if echo "$f" | grep -q "types.ts"; then
    continue
  fi

  # Grade D: no tests AND > 200 lines (mixed concerns likely)
  if [ "$tests" -eq 0 ] && [ "$lines" -gt 200 ]; then
    echo "FAIL: $basename — grade D (${lines} lines, no tests)"
    errors=$((errors + 1))
    continue
  fi

  # Grade C: no tests — also fail
  if [ "$tests" -eq 0 ]; then
    echo "FAIL: $basename — grade C (${lines} lines, no tests)"
    errors=$((errors + 1))
    continue
  fi

  echo "  OK: $basename — ${tests} tests"
done

echo ""
if [ $errors -gt 0 ]; then
  echo "FAILED: $errors module(s) at grade D or worse. Add tests before merging."
  exit 1
fi

echo "PASSED: all modules have tests."
exit 0
