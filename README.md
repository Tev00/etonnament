# Étonnamment d'accord

Deux choses dans un seul dépôt, déployées à deux endroits différents.

| Dossier | Contenu | Va sur | URL |
|---|---|---|---|
| `site/` | site vitrine | Netlify | `etonnamment.fr` |
| `app/` | app de la soirée | Scaleway | `app.etonnamment.fr/app/` |

Elles ne se parlent pas et ne tombent pas ensemble — c'est voulu. Voir
`docs/SCALEWAY-SETUP.md` pour le raisonnement.

---

## Arborescence

```
.
├── site/                  → Netlify  (etonnamment.fr)
│   ├── index.html
│   └── assets/
├── app/                   → Scaleway (app.etonnamment.fr/app/)
│   ├── index.html         page d'attente (à remplacer par l'app)
│   └── assets/
├── server/                configs de la machine Scaleway
│   ├── Caddyfile
│   └── pocketbase.service
├── docs/
│   ├── SCALEWAY-SETUP.md  runbook d'installation
│   └── app-spec.md        schéma PocketBase, règles d'API, phases
├── check.sh               vérification statique (ESLint) avant déploiement
├── eslint.config.mjs
├── deploy-app.sh
└── netlify.toml           publish = "site"
```

---

## Déployer

**Le site** — `git push`. Netlify construit depuis `site/` (voir
`netlify.toml`). Rollback en un clic dans l'interface Netlify.

**L'app** :

```bash
chmod +x deploy-app.sh        # une seule fois
./deploy-app.sh               # vérifie le code, puis rsync vers app.etonnamment.fr/app/

# avant que le DNS existe, ciblez l'IP :
DEPLOY_HOST=deploy@<IP> ./deploy-app.sh
```

Le script lance d'abord `./check.sh` (ESLint, tiré par npx — rien n'est
installé à demeure), puis fait une simulation rsync et demande confirmation
avant d'écrire quoi que ce soit. Rollback : `git revert` puis relancer.

Le contrôle refuse le déploiement sur une erreur. Le soir même, si le réseau
ne permet pas à npx de tourner ou qu'un correctif doit partir immédiatement :

```bash
SKIP_CHECK=1 ./deploy-app.sh
```

---

## État

Suit l'ordre de construction de `docs/app-spec.md` §9.

**En place**

- [x] Site vitrine en ligne sur Netlify
- [x] Formulaire de contact relié au webhook Make
- [x] Spécification technique de l'app (`docs/app-spec.md`)
- [x] Instance Scaleway, `app.etonnamment.fr` en ligne, PocketBase installé
- [x] Schéma créé, y compris les vues `entry_results`, `participant_count`
      et `vote_results`
- [x] 1. Les trois surfaces lisent `session` en temps réel
- [x] 2. Compte anonyme, mission d'entrée, file d'attente d'écriture
- [x] 3. Miroir de la mission d'entrée sur la projection
- [x] 4. Hook d'assignation des îlots, écran d'îlot, réaffectation régie
- [x] 5. Propositions et validation régie
- [x] 6. Vote, classement projeté, pagination régie
- [x] Régie derrière un compte `facilitators` (spec §8)
- [x] 7. Questionnaire de clôture, compteur régie
- [x] Vérification statique avant déploiement (`check.sh`)
- [x] 8. Export papier des îlots et des énoncés
- [x] Test de fumée navigateur des trois surfaces (`smoke.sh`)

**Reste à faire**

- [ ] Ajouter `programme` aux valeurs de `projection_view` dans l'admin
      PocketBase — la valeur est prévue au §1.7 mais absente du schéma, donc
      le bouton correspondant de la régie renvoie 400 (le test de fumée
      échoue là-dessus, exprès)
- [ ] Écran « programme » sur la projection, une fois la valeur acceptée
- [ ] Audit des règles d'API restantes contre le tableau du §4 —
      `propositions` et `session` sont faits, les autres non
- [ ] Deuxième compte facilitateur (spec §1.8 : deux, pas un)
- [ ] Confirmer le durcissement de l'instance (SSH, pare-feu, mises à jour) —
      la machine tourne et sert en HTTPS, mais rien ici n'atteste du reste ;
      voir `docs/SCALEWAY-SETUP.md`
- [ ] Test de bout en bout des étapes 5 et 6 — jamais exercées avec de vrais
      participants et les drapeaux ouverts
- [ ] **Répétition générale avec de vrais téléphones** — spec §9, non
      négociable

---

## Vérifier avant de déployer

```bash
./check.sh                                   # ESLint, ~1 s, lancé par deploy-app.sh
REGIE_EMAIL=… REGIE_PASSWORD=… ./smoke.sh    # navigateur réel, ~10 s
```

`smoke.sh` clique sur tous les boutons de la régie et exige de chacun qu'il
parte réellement écrire — ce qu'un linter ne peut pas voir. Il **écrit dans la
base de production** : il relève `session` au début et la restaure à la fin.
Ne pas le lancer pendant l'événement.

---

## À savoir

- Le domaine s'écrit **`etonnamment.fr`**, avec deux « m », comme la marque
  « Étonnamment ». La graphie à un seul « m » (`etonnament.fr`) n'est pas
  enregistrée et ne résout pas — si un lien ne répond pas, compter les « m ».
- `pb_data/` est dans `.gitignore` : il contiendra les réponses des
  participants. Ne jamais le committer.
- Les libellés des questions (annexe A) vivent dans `app/shared/questions.js`,
  pas en base de données — on peut corriger une faute sans toucher aux données.
