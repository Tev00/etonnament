#!/usr/bin/env bash
#
# Déploie les hooks PocketBase (server/pb_hooks/) vers l'instance Scaleway.
#
# Séparé de deploy-app.sh à dessein : `app/` est du statique servi par Caddy,
# `pb_hooks/` est du code exécuté par PocketBase, et l'installer REDÉMARRE le
# service — donc coupe les connexions SSE de toute la salle le temps d'un
# battement de cil. À ne pas lancer pendant l'événement sans le vouloir.
#
#   ./deploy-hooks.sh
#
# Prérequis : clé SSH autorisée pour DEPLOY_HOST, et sudo sans mot de passe
# pour redémarrer le service.

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-deploy@app.etonnamment.fr}"
HOOKS_DIR="${HOOKS_DIR:-/opt/pocketbase/pb_hooks}"
SRC="${SRC:-./server/pb_hooks/}"

if [ ! -d "$SRC" ]; then
  echo "✗ '$SRC' introuvable. Lancez depuis la racine du dépôt." >&2
  exit 1
fi

echo "→ ${SRC}  vers  ${DEPLOY_HOST}:${HOOKS_DIR}"
echo
echo "⚠️  PocketBase va être redémarré : les connexions temps réel repartiront."
read -r -p "Continuer ? [o/N] " reply
case "$reply" in
  [oOyY]*) ;;
  *) echo "Annulé."; exit 0 ;;
esac

ssh "$DEPLOY_HOST" "mkdir -p '$HOOKS_DIR'"
rsync -avz --exclude '.DS_Store' "$SRC" "${DEPLOY_HOST}:${HOOKS_DIR}/"

ssh "$DEPLOY_HOST" '
  sudo systemctl restart pocketbase
  sleep 3
  systemctl is-active --quiet pocketbase && echo "✓ pocketbase actif" || {
    echo "✗ pocketbase ne redémarre pas :" >&2
    sudo journalctl -u pocketbase -n 30 --no-pager >&2
    exit 1
  }
'

# Un hook qui ne compile pas laisse PocketBase démarrer quand même : le service
# est « actif » et la route absente. On vérifie donc la route elle-même.
echo
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST https://app.etonnamment.fr/api/assign-island || true)
if [ "$code" = "404" ]; then
  echo "✗ /api/assign-island renvoie 404 : le hook n'a pas été chargé." >&2
  exit 1
fi
echo "✓ /api/assign-island répond ($code — 401 attendu sans authentification)"
