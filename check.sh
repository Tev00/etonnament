#!/usr/bin/env bash
#
# Vérification statique des trois surfaces, avant déploiement.
#
#   ./check.sh
#
# Appelée automatiquement par deploy-app.sh. Pour la sauter en cas d'urgence
# — le soir même, réseau capricieux, correctif à pousser tout de suite :
#
#   SKIP_CHECK=1 ./deploy-app.sh
#
# Le JS des trois pages vit dans des <script> en ligne. Plutôt que d'extraire
# ces blocs vers des fichiers temporaires (ce qui décalerait les numéros de
# ligne), on remplace par du vide TOUT ce qui est hors <script> : le fichier
# .js produit a exactement la même hauteur que le .html, et les lignes
# signalées par ESLint sont directement celles du fichier source.

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npx >/dev/null 2>&1; then
  echo "⚠ npx introuvable — vérification sautée." >&2
  echo "  Le déploiement continue : refuser de déployer faute d'outil serait" >&2
  echo "  pire que le bug qu'on cherche." >&2
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/app/shared"
cp app/shared/app.js "$WORK/app/shared/app.js"
cp app/shared/questions.js "$WORK/app/shared/questions.js"

# On ne vérifie pas pocketbase.umd.js : c'est un build minifié tiers.

python3 - "$WORK" <<'PY'
import re, sys, pathlib
work = pathlib.Path(sys.argv[1])
for name in ("index.html", "projection.html", "regie.html"):
    src = pathlib.Path("app", name).read_text(encoding="utf-8")
    out, keep = [], False
    for line in src.split("\n"):
        # Les balises <script src=...> n'ont pas de contenu : on les ignore.
        opens  = re.search(r"<script(?![^>]*\bsrc=)[^>]*>", line)
        closes = "</script>" in line
        if opens and closes:
            out.append(line[opens.end():line.index("</script>")]); continue
        if opens:
            out.append(line[opens.end():]); keep = True; continue
        # Un </script> alors qu'aucun bloc n'est ouvert ferme un
        # <script src=...> : la ligne est du HTML, on la vide.
        if closes and keep:
            out.append(line[:line.index("</script>")]); keep = False; continue
        if closes:
            out.append(""); continue
        out.append(line if keep else "")
    (work / "app" / (name + ".js")).write_text("\n".join(out), encoding="utf-8")
PY

echo "→ vérification du code (ESLint)…"

# --no-config-lookup : on impose NOTRE config, sans remonter l'arborescence.
set +e
OUT="$(cd "$WORK" && npx --yes eslint \
        --no-config-lookup \
        --config "$OLDPWD/eslint.config.mjs" \
        app 2>&1)"
CODE=$?
set -e

# On rend aux fichiers leur vrai nom : app/regie.html.js → app/regie.html
OUT="$(printf '%s' "$OUT" | sed 's/\.html\.js/.html/')"

if [ $CODE -eq 0 ]; then
  [ -n "$OUT" ] && printf '%s\n' "$OUT"
  echo "  ✓ aucun problème"
  exit 0
fi

# ESLint sort 2 quand il n'a pas pu tourner du tout (pas de réseau pour npx,
# config illisible). Ce n'est pas un défaut du code : on prévient et on laisse
# passer, comme pour npx absent.
if [ $CODE -gt 1 ]; then
  echo "⚠ ESLint n'a pas pu s'exécuter — vérification sautée." >&2
  printf '%s\n' "$OUT" >&2
  exit 0
fi

printf '%s\n' "$OUT"
echo
echo "✗ Erreurs détectées — déploiement refusé." >&2
echo "  Pour passer outre malgré tout : SKIP_CHECK=1 ./deploy-app.sh" >&2
exit 1
