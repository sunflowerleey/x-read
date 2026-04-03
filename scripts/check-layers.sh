#!/bin/bash
# Architecture layer guard: detects dependency violations.
# Layer hierarchy: Types → Data → Transform → API → UI
# Each layer may only import from layers below it.
#
# Run: bash scripts/check-layers.sh

set -euo pipefail
cd "$(dirname "$0")/.."

errors=0

# Layer definitions (files in each layer)
# Layer 1: Types
TYPES="src/lib/types.ts"
# Layer 2: Data
DATA="src/lib/twitter.ts src/lib/webpage.ts"
# Layer 3: Transform
TRANSFORM="src/lib/gemini.ts src/lib/markdown.ts src/lib/splitMarkdown.ts src/lib/alignBlocks.ts src/lib/escapeHtml.ts src/lib/cleanJinaMarkdown.ts"
# Layer 4: API routes
API="src/app/api"
# Layer 5: UI
UI="src/app/page.tsx src/app/layout.tsx src/components src/hooks"

check_no_import() {
  local file="$1"
  local forbidden_pattern="$2"
  local rule="$3"

  [ -f "$file" ] || return 0

  if grep -qE "$forbidden_pattern" "$file" 2>/dev/null; then
    echo "VIOLATION: $file — $rule"
    grep -nE "$forbidden_pattern" "$file" | head -3
    errors=$((errors + 1))
  fi
}

echo "Checking architecture layer dependencies..."
echo ""

# Layer 1 (Types): must not import from any other project layer
check_no_import "$TYPES" "from ['\"]@/lib/(twitter|webpage|gemini|markdown|splitMarkdown|alignBlocks|escapeHtml|cleanJinaMarkdown)" \
  "Types layer must not import from Data/Transform layers"

# Layer 2 (Data): must not import from Transform (except types and cleanJinaMarkdown which is used by twitter.ts)
for f in $DATA; do
  [ -f "$f" ] || continue
  check_no_import "$f" "from ['\"]@/lib/(gemini|markdown|splitMarkdown|alignBlocks|escapeHtml)" \
    "Data layer must not import from Transform layer (except cleanJinaMarkdown)"
done

# Layer 3 (Transform): must not import from API or UI
for f in $TRANSFORM; do
  check_no_import "$f" "from ['\"]@/app/" \
    "Transform layer must not import from API/UI layers"
  check_no_import "$f" "from ['\"]@/(components|hooks)/" \
    "Transform layer must not import from UI layer"
done

# Layer 5 (UI components/hooks): must not import directly from Data layer
for f in src/components/*.tsx src/components/*.ts src/hooks/*.ts; do
  [ -f "$f" ] || continue
  check_no_import "$f" "from ['\"]@/lib/(twitter|webpage)" \
    "UI layer must not import directly from Data layer (use API routes)"
  check_no_import "$f" "from ['\"]@/lib/gemini" \
    "UI layer must not import directly from Gemini (use API routes)"
done

echo ""
if [ $errors -gt 0 ]; then
  echo "FAILED: $errors layer violation(s) found."
  exit 1
else
  echo "OK: All layer dependencies are clean."
  exit 0
fi
