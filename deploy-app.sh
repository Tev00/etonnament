#!/usr/bin/env bash
#
# Déploie l'app (app/) vers l'instance Scaleway servant app.etonnamment.fr.
# Le site vitrine (site/) reste sur Netlify et n'est pas concerné.
#
# Cible /var/www/etonnamment/app/ et non la racine : la racine sert une copie
# de la vitrine, et ce script utilise --delete.
#
#   chmod +x deploy-app.sh      # une seule fois
#   ./deploy-app.sh
#
# Avant que le DNS ne soit en place, ciblez l'IP directement :
#   DEPLOY_HOST=deploy@51.15.x.x ./deploy-app.sh
#
# Prérequis : une clé SSH déjà autorisée pour DEPLOY_HOST.

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-deploy@app.etonnamment.fr}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/etonnamment/app/}"
SRC="${SRC:-./app/}"

if [ ! -d "$SRC" ]; then
  echo "✗ Répertoire source '$SRC' introuvable. Lancez depuis la racine du dépôt." >&2
  exit 1
fi

if [ ! -f "${SRC}index.html" ]; then
  echo "✗ Pas d'index.html dans '$SRC'. Refus de déployer un site vide." >&2
  exit 1
fi

# Vérification statique avant tout envoi. Une erreur de syntaxe ou une
# variable qui en masque une autre ne se voit pas à la relecture et ne casse
# la page qu'au premier clic — c'est-à-dire, ici, en salle.
#
# Échappatoire assumée : le soir même, si le contrôle ne peut pas tourner et
# qu'un correctif doit partir tout de suite, SKIP_CHECK=1 le court-circuite.
# Un outil qui empêche de déployer un correctif est pire que le bug.
if [ "${SKIP_CHECK:-0}" = "1" ]; then
  echo "⚠ Vérification sautée (SKIP_CHECK=1)."
  echo
else
  ./check.sh
  echo
fi

echo "→ ${SRC}  vers  ${DEPLOY_HOST}:${DEPLOY_PATH}"
echo

# Simulation d'abord : on voit toujours ce qui va changer avant que ça change.
rsync -avz --delete --dry-run \
  --exclude '.DS_Store' \
  --exclude '.git' \
  "$SRC" "${DEPLOY_HOST}:${DEPLOY_PATH}"

echo
read -r -p "Appliquer ces changements ? [o/N] " reply
case "$reply" in
  [oOyY]*) ;;
  *) echo "Annulé."; exit 0 ;;
esac

rsync -avz --delete \
  --exclude '.DS_Store' \
  --exclude '.git' \
  "$SRC" "${DEPLOY_HOST}:${DEPLOY_PATH}"

echo
echo "✓ Déployé — https://app.etonnamment.fr/app/"
