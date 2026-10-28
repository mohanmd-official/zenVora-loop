#!/bin/bash
# Proves each feature can be left out: builds core alone, core + each feature, and everything, then checks
# every build's script for names that are used but never defined (eslint no-undef). Needs Node (npx).
#   bash tools/check-features.sh
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cat > "$T/eslint.config.mjs" <<'CFG'
import globals from "globals";
export default [{ files: ["**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: { ...globals.browser, XLSX: "readonly", JSZip: "readonly" } },
  rules: { "no-undef": "error", "no-redeclare": "error" } }];
CFG
(cd "$T" && npm init -y >/dev/null && npm i -s eslint@9 globals@15 >/dev/null 2>&1)
FEATS=$(python3 build.py --list | awk '$3=="on"{print $2}')
fail=0
for only in "" $FEATS "$(echo $FEATS | tr ' ' ',')"; do
  python3 build.py --only "$only" >/dev/null
  python3 - "$T/app.js" <<'PY'
import re, sys; h = open('build/index.html', encoding='utf-8').read()
open(sys.argv[1], 'w').write(re.search(r'<script>\n([\s\S]*?)</script>\s*</body>', h).group(1))
PY
  if (cd "$T" && npx eslint app.js >/dev/null 2>&1); then echo "✔ core${only:+ + $only}"; else echo "✘ core${only:+ + $only}:"; (cd "$T" && npx eslint app.js | grep error | sed 's/^ */    /' | sort -u | head -20); fail=1; fi
done
rm -rf build
exit $fail
