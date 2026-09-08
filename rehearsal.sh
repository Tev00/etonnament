#!/usr/bin/env bash
#
# Répétition générale quand on est seul : N participants émulés qui suivent
# VOTRE régie. Vous menez la soirée depuis votre téléphone, ils remplissent la
# salle.
#
#   ./rehearsal.sh              # 10 bots, sur le code du dépôt
#   N=25 ./rehearsal.sh         # 25 bots
#   APP_URL=https://app.etonnamment.fr/app/index.html ./rehearsal.sh
#                               # sur l'app réellement déployée
#   VERBOSE=1 ./rehearsal.sh    # dit aussi qui abandonne en route
#
# Ils attendent que vous ouvriez chaque phase depuis la régie :
#
#   1. Ouvrez « Mission d'entrée »  → ils créent leur compte et répondent,
#                                     puis reçoivent un îlot
#   2. Ouvrez « Saisie des propositions » → un porte-plume par îlot écrit deux
#                                     propositions ; à vous de les valider
#   3. Ouvrez « Vote »              → ils votent sur tous les énoncés actifs
#   4. Ouvrez « Questionnaire de clôture » → ils répondent
#
# Ctrl-C pour arrêter. Les navigateurs se ferment avec le script.
#
# ⚠️  DE VRAIES DONNÉES SONT ÉCRITES en production : participants, réponses,
#     propositions, votes, questionnaires. Les participants ne peuvent PAS
#     être supprimés par l'API (règle réservée à l'admin). Prévoyez de
#     repartir d'une base propre avant la vraie soirée — le plus simple est
#     de vider les collections depuis l'admin PocketBase.

set -euo pipefail
cd "$(dirname "$0")"

N="${N:-10}"

if [ ! -d .smoke/node_modules ]; then
  echo "→ installation de Playwright dans .smoke/ (une seule fois)…"
  mkdir -p .smoke
  npm install --silent --prefix .smoke @playwright/test
  .smoke/node_modules/.bin/playwright install chromium
fi
[ -e node_modules ] || ln -s .smoke/node_modules node_modules

# Serveur local, sauf si on vise l'app déployée.
SERVER_PID=""
if [ -z "${APP_URL:-}" ]; then
  if ! curl -sf -o /dev/null http://127.0.0.1:8765/index.html 2>/dev/null; then
    python3 -m http.server 8765 --bind 127.0.0.1 --directory app >/dev/null 2>&1 &
    SERVER_PID=$!
    trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
    sleep 1
  fi
  echo "→ code servi depuis ./app (l'API reste celle de production)"
else
  echo "→ app visée : $APP_URL"
fi

cat <<MSG

⚠️  Écrit de vraies données dans la base de production.
    Les participants créés ne sont pas supprimables par l'API.

$N participants émulés. Ils attendent votre régie.
MSG

exec node smoke/rehearsal.mjs
