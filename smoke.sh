#!/usr/bin/env bash
#
# Test de fumée : ouvre les trois surfaces dans un vrai navigateur et clique
# sur tout ce qui se clique dans la régie.
#
#   REGIE_EMAIL=… REGIE_PASSWORD=… ./smoke.sh
#
# Ce que ça attrape et que ./check.sh ne peut pas voir : un bouton branché sur
# rien, sur le mauvais client, ou sur un id qui n'existe plus. Rien de tout
# cela n'est une erreur de syntaxe.
#
# ⚠️  CE TEST ÉCRIT DANS LA BASE DE PRODUCTION.
#     Il relève `session` au début et la restaure à la fin. Ne pas le lancer
#     pendant l'événement : entre les deux, la salle verrait défiler les
#     stages.
#
# Pour exercer aussi le téléphone (laisse un enregistrement `participants` que
# personne ne peut supprimer, et demande entry_open = true) :
#
#   SMOKE_PARTICIPANT=1 REGIE_EMAIL=… REGIE_PASSWORD=… ./smoke.sh
#
# Playwright et son navigateur s'installent dans .smoke/, qui est ignoré par
# git : la racine du dépôt reste sans package.json, comme pour ESLint.

set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${REGIE_EMAIL:-}" ] || [ -z "${REGIE_PASSWORD:-}" ]; then
  cat >&2 <<'MSG'
✗ Identifiants manquants.

  REGIE_EMAIL=vous@etonnamment.fr REGIE_PASSWORD='…' ./smoke.sh

Ce sont ceux d'un compte `facilitators`. Ne les mettez pas dans un fichier
suivi par git.
MSG
  exit 2
fi

if [ ! -d .smoke/node_modules ]; then
  echo "→ installation de Playwright dans .smoke/ (une seule fois)…"
  mkdir -p .smoke
  npm install --silent --prefix .smoke @playwright/test
  .smoke/node_modules/.bin/playwright install chromium
  echo
fi

# Les specs vivent dans smoke/ et importent '@playwright/test'. Node cherche
# node_modules en remontant l'arborescence : sans ce lien à la racine, il ne
# trouve rien, car le paquet est dans .smoke/. Le lien est ignoré par git.
if [ ! -e node_modules ]; then
  ln -s .smoke/node_modules node_modules
fi

echo "⚠  Écrit dans la base de production. La session sera restaurée à la fin."
echo

exec .smoke/node_modules/.bin/playwright test \
  --config smoke/playwright.config.mjs
