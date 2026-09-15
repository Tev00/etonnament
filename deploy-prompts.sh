#!/usr/bin/env bash
#
# Déploie UNIQUEMENT server/pb_hooks/prompts/ — pas le reste de pb_hooks/,
# et surtout PAS de redémarrage de PocketBase.
#
# Séparé de deploy-hooks.sh à dessein : les hooks lisent ces fichiers à
# chaque appel (voir summarize-votes.pb.js — pas de cache, pas de variable
# chargée au démarrage), donc éditer un prompt n'a besoin que d'un rsync.
# Passer par deploy-hooks.sh pour ça redémarre PocketBase pour rien : ça
# coupe les connexions SSE de toute la salle le temps d'un battement de
# cil, pour un fichier que le hook aurait relu tout seul au prochain appel.
#
#   ./deploy-prompts.sh
#
# Prérequis : même accès SSH que deploy-hooks.sh / deploy-app.sh.

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-deploy@app.etonnamment.fr}"
PROMPTS_DIR="${PROMPTS_DIR:-/opt/pocketbase/pb_hooks/prompts}"
SRC="${SRC:-./server/pb_hooks/prompts/}"

if [ ! -d "$SRC" ]; then
  echo "✗ '$SRC' introuvable. Lancez depuis la racine du dépôt." >&2
  exit 1
fi

echo "→ ${SRC}  vers  ${DEPLOY_HOST}:${PROMPTS_DIR}  (sans redémarrage)"
ssh "$DEPLOY_HOST" "mkdir -p '$PROMPTS_DIR'"
rsync -avz --exclude '.DS_Store' "$SRC" "${DEPLOY_HOST}:${PROMPTS_DIR}/"

# Le transfert peut réussir sans que le contenu corresponde (mauvais fichier
# local, conflit d'édition). On vérifie donc le texte réellement en place,
# pas seulement que rsync s'est bien passé.
echo
echo "→ vérification du contenu déployé :"
ssh "$DEPLOY_HOST" "cat '$PROMPTS_DIR'/vote-summary.txt"
echo
echo "✓ Déployé. Le prochain appel à /api/summarize-votes utilisera ce texte."
