# Étonnamment d'accord

Deux choses dans un seul dépôt, déployées à deux endroits différents.

| Dossier | Contenu | Va sur | URL |
|---|---|---|---|
| `site/` | site vitrine | Netlify | `etonnament.fr` |
| `app/` | app de la soirée | Scaleway | `app.etonnament.fr` |

Elles ne se parlent pas et ne tombent pas ensemble — c'est voulu. Voir
`docs/SCALEWAY-SETUP.md` pour le raisonnement.

---

## Arborescence

```
.
├── site/                  → Netlify  (etonnament.fr)
│   ├── index.html
│   └── assets/
├── app/                   → Scaleway (app.etonnament.fr)
│   ├── index.html         page d'attente (à remplacer par l'app)
│   └── assets/
├── server/                configs de la machine Scaleway
│   ├── Caddyfile
│   └── pocketbase.service
├── docs/
│   ├── SCALEWAY-SETUP.md  runbook d'installation
│   └── app-spec.md        schéma PocketBase, règles d'API, phases
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
./deploy-app.sh               # rsync vers app.etonnament.fr

# avant que le DNS existe, ciblez l'IP :
DEPLOY_HOST=deploy@<IP> ./deploy-app.sh
```

Le script fait une simulation et demande confirmation avant d'écrire quoi que
ce soit. Rollback : `git revert` puis relancer.

---

## État

- [x] Site vitrine en ligne sur Netlify
- [x] Formulaire de contact relié au webhook Make
- [x] Spécification technique de l'app (`docs/app-spec.md`)
- [ ] Instance Scaleway créée et durcie
- [ ] `app.etonnament.fr` en ligne (page d'attente)
- [ ] PocketBase installé, schéma créé
- [ ] App : mission d'entrée, îlots, propositions, vote, feedback
- [ ] Régie + projection
- [ ] **Répétition générale avec de vrais téléphones**

---

## À savoir

- Le domaine s'écrit **`etonnamment.fr`** (un seul « m » central), alors que la
  marque s'écrit « Étonnamment ». Ce n'est pas une faute de frappe.
- `pb_data/` est dans `.gitignore` : il contiendra les réponses des
  participants. Ne jamais le committer.
- Les libellés des questions (annexe A) vivent dans `app/shared/questions.js`,
  pas en base de données — on peut corriger une faute sans toucher aux données.
