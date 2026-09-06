# Étonnamment d'accord — App technique

Spec de conception. À lire avant d'écrire du code.
Version 1 — schéma PocketBase, règles d'API, machine à états des phases.

---

## 0. Architecture

```
Navigateur (3 surfaces)                    Serveur
┌──────────────────────────┐
│ /app/index.html          │  participant (téléphone)
│ /app/projection.html     │  grand écran            ──►  PocketBase
│ /app/regie.html          │  facilitateur                (VPS, SQLite)
└──────────────────────────┘                              + pb_hooks/
        Netlify (statique)                                temps réel SSE
```

Trois fichiers HTML séparés, un module JS partagé (`app.js`), pas de routeur SPA.
Motif : moins de pièces mobiles le soir même, et la projection tourne sur un
navigateur inconnu (celui du vidéoprojecteur).

**Temps réel.** Les trois surfaces s'abonnent à la collection `session`.
La projection s'abonne en plus à `entry_results` et `vote_results`.
Aucun polling, aucun bouton « rafraîchir ».

---

## 1. Collections

### 1.1 `participants` — collection de type **auth**

Identité anonyme et persistante. À la première visite, le client génère
`username` + `password` aléatoires, crée le compte, s'authentifie, et stocke
le token dans `localStorage`. Aucun email, aucun mot de passe saisi par l'humain.

| Champ | Type | Notes |
|---|---|---|
| `username` | auth | généré : `p_` + 16 car. aléatoires |
| `password` | auth | généré : 32 car. aléatoires, stocké côté client |
| `island` | number | 1..N, `null` tant que non assigné. **Écrit par le hook uniquement** |
| `entry_done` | bool | mission d'entrée terminée |
| `created` | auto | sert d'ordre d'arrivée |

> **Pourquoi un compte auth plutôt qu'un simple UUID en localStorage ?**
> Sans auth, les règles d'API ne peuvent pas référencer `@request.auth`, donc
> n'importe qui peut écrire n'importe quoi. Avec un compte anonyme, on garde
> l'anonymat total *et* on obtient des règles par enregistrement. Même friction
> pour le participant : zéro.

### 1.2 `entry_answers` — mission d'entrée

Une ligne par (participant, question). Enregistrement au fil de l'eau : si
quelqu'un abandonne à Q5, les 4 premières lignes existent déjà.

| Champ | Type | Notes |
|---|---|---|
| `participant` | relation → participants | |
| `question` | text | clé : `q1` … `q7` |
| `choice` | text | clé de l'option, ex. `q4_c2` |

**Index unique** sur `(participant, question)` — permet un *upsert* si le
participant revient en arrière et change sa réponse.

> Le libellé français des questions et des options **ne vit pas en base**.
> Il vit dans `questions.js` côté front (annexe A du déroulé). La base ne
> stocke que des clés. Ça permet de corriger une faute de frappe sans toucher
> aux données.

### 1.3 `statements` — énoncés soumis au vote

~26 lignes : 6 graines pré-chargées + 20 issues des îlots après validation régie.

| Champ | Type | Notes |
|---|---|---|
| `text` | text (max 300) | |
| `active` | bool | `false` par défaut ; passe à `true` à la validation régie |

**Pas de champ `source`.** Les graines doivent être indistinguables : le plus
simple est que l'information n'existe pas dans cette collection. La provenance
reste dans `propositions`.

### 1.4 `propositions` — gabarit de saisie des îlots

Séparée de `statements`. C'est **la frontière d'anonymat** : `propositions`
porte le numéro d'îlot, `statements` ne le porte pas. L'étape de validation
régie fait la copie et coupe le lien.

| Champ | Type | Notes |
|---|---|---|
| `island` | number | visible régie uniquement |
| `problem` | text | problème visé |
| `description` | text (max 300) | 2 phrases, limite imposée côté UI *et* base |
| `effect` | text | effet attendu |
| `status` | select | `draft` \| `validated` \| `rejected` |
| `statement` | relation → statements | rempli à l'injection |

### 1.5 `votes`

| Champ | Type | Notes |
|---|---|---|
| `participant` | relation → participants | |
| `statement` | relation → statements | |
| `value` | select | `agree` \| `neutral` \| `disagree` \| `skip` |

**Index unique** sur `(participant, statement)`.
`neutral` = « motus ». `skip` = « passer » — on l'enregistre pour ne pas
re-présenter la carte, mais il est exclu des agrégats.

### 1.6 `feedback` — clôture

| Champ | Type | Notes |
|---|---|---|
| `participant` | relation → participants | |
| `answers` | json | 5 réponses, fermées + texte libre court |

Un seul enregistrement par participant (json plutôt que lignes : pas d'agrégat
temps réel nécessaire, et le texte libre se prête mal aux lignes).

### 1.7 `session` — enregistrement unique, la machine à états

Une seule ligne, `key = "main"`. Tout le monde la lit, seule la régie l'écrit.

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `key` | text unique | `main` | |
| `stage` | select | `accueil` | écran par défaut du participant (voir §3) |
| `entry_open` | bool | `true` | mission d'entrée ouverte |
| `islands_count` | number | `10` | nombre d'îlots actifs |
| `propositions_open` | bool | `false` | saisie des propositions |
| `vote_open` | bool | `false` | vote Polis |
| `feedback_open` | bool | `false` | questionnaire de clôture |
| `projection_view` | select | `idle` | `idle` \| `entry` \| `vote` \| `programme` |
| `projection_question` | text | `q1` | quelle question projeter |
| `projection_page` | number | `0` | pagination des résultats de vote |

### 1.8 `facilitators` — collection de type **auth**

Comptes créés à la main dans l'admin PocketBase. Deux comptes, pas un :
si le téléphone du facilitateur meurt, quelqu'un d'autre reprend la régie.

---

## 2. Collections « view » (agrégats)

Des collections en lecture seule définies par du SQL. Elles évitent d'exposer
les réponses brutes au public tout en permettant la projection en temps réel.

### 2.1 `entry_results`

```sql
SELECT
  (question || '__' || choice) AS id,
  question,
  choice,
  COUNT(*) AS n
FROM entry_answers
GROUP BY question, choice
```

### 2.2 `participant_count`

```sql
SELECT
  'total' AS id,
  COUNT(*) AS n
FROM participants
WHERE entry_done = true
```

Nécessaire pour afficher « 34 personnes sur 58 » — les effectifs absolus
demandés au §1.5 du brief.

### 2.3 `vote_results`

```sql
SELECT
  s.id AS id,
  s.text AS text,
  SUM(CASE WHEN v.value = 'agree'    THEN 1 ELSE 0 END) AS agree,
  SUM(CASE WHEN v.value = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
  SUM(CASE WHEN v.value = 'disagree' THEN 1 ELSE 0 END) AS disagree
FROM statements s
LEFT JOIN votes v ON v.statement = s.id AND v.value != 'skip'
WHERE s.active = true
GROUP BY s.id
```

**Le tri se fait côté client**, pas en SQL — pour pouvoir l'ajuster le soir même
sans migration :

```js
const n = agree + disagree;                 // neutral exclu du dénominateur
const lean = n ? Math.abs(agree - disagree) / n : 0;
// lean proche de 1 → consensuel     lean proche de 0 → clivant
// Seuil : ignorer les énoncés avec n < 8, sinon le bruit remonte en tête.
```

Trier par `lean` décroissant donne l'ordre « du plus consensuel au plus clivant »
du brief. Le clustering d'opinions (P1) n'est pas dans ce périmètre.

---

## 3. Machine à états

Deux mécanismes distincts, volontairement découplés :

- **`stage`** décide de l'écran par défaut du participant.
- **Les booléens** (`entry_open`, `vote_open`…) décident de ce qui est *permis*.

Pourquoi les séparer : le brief exige que le facilitateur n'attende jamais une
action des participants. Avec des booléens indépendants, la régie peut rouvrir
la mission d'entrée à 20h10 pour un retardataire sans faire reculer toute la
salle. Une machine à états strictement séquentielle rendrait ça impossible.

| `stage` | Écran participant | Ouvert normalement |
|---|---|---|
| `accueil` | déroulé, partenaires, calendrier | `entry_open` |
| `mission` | 7 questions, une par écran | `entry_open` |
| `consigne` | « trouve quelqu'un qui… » + n° d'îlot | — |
| `ilots` | numéro d'îlot en très grand | — |
| `propositions` | formulaire (membres de l'îlot) | `propositions_open` |
| `vote` | pile de cartes | `vote_open` |
| `resultats` | « regardez l'écran » | — |
| `cloture` | 5 questions de feedback | `feedback_open` |

Déroulé nominal, chaque transition déclenchée **manuellement** par la régie :

```
19h00  accueil       entry_open=true, islands_count=10
       mission       (les gens répondent en arrivant)
       consigne      → n° d'îlot affiché dès la fin de la mission
19h25  ─────────────  régie : entry_open=false
       ilots         projection_view=entry, la régie fait défiler q1…q7
20h00  propositions  propositions_open=true
       ─────────────  régie valide → statements.active=true
20h45  vote          vote_open=true, propositions_open=false
21h00  resultats     vote_open=false, projection_view=vote
21h15  cloture       feedback_open=true
```

Le bouton « numéro d'îlot » reste accessible depuis **tous** les stages
(exigence §1.4 : affichage persistant).

---

## 4. Règles d'API

Syntaxe PocketBase. `null` = admin uniquement. `""` = public.

Abréviation utilisée ci-dessous :
`FACILITATOR` ≡ `@request.auth.collectionName = "facilitators"`

| Collection | list / view | create | update | delete |
|---|---|---|---|---|
| `participants` | `id = @request.auth.id \|\| FACILITATOR` | `@collection.session.entry_open = true` | `FACILITATOR` | `null` |
| `entry_answers` | `participant = @request.auth.id \|\| FACILITATOR` | `participant = @request.auth.id && @collection.session.entry_open = true` | idem create | `null` |
| `statements` | `active = true && @collection.session.vote_open = true` … `\|\| FACILITATOR` | `FACILITATOR` | `FACILITATOR` | `FACILITATOR` |
| `propositions` | `island = @request.auth.island \|\| FACILITATOR` | `island = @request.auth.island && @collection.session.propositions_open = true` | idem create, ou `FACILITATOR` | `FACILITATOR` |
| `votes` | `participant = @request.auth.id \|\| FACILITATOR` | `participant = @request.auth.id && @collection.session.vote_open = true` | idem create | `null` |
| `feedback` | `FACILITATOR` | `participant = @request.auth.id && @collection.session.feedback_open = true` | `participant = @request.auth.id` | `null` |
| `session` | `""` | `null` | `FACILITATOR` | `null` |
| `entry_results` (view) | `""` | — | — | — |
| `participant_count` (view) | `""` | — | — | — |
| `vote_results` (view) | `@collection.session.projection_view = "vote" \|\| FACILITATOR` | — | — | — |

Trois points qui portent tout le poids :

1. **`island` n'est jamais écrit par le participant** — update réservé à
   `FACILITATOR`, et le hook d'assignation écrit via le DAO (qui contourne les
   règles). Sinon n'importe qui choisit son îlot.
2. **Les phases sont appliquées côté serveur**, pas seulement dans l'UI, via
   `@collection.session.<flag> = true`. Cacher un bouton n'est pas fermer un vote.
3. **`propositions` ne fuit jamais vers le public.** La règle de lecture exige
   d'être dans l'îlot ou d'être la régie.

> ⚠️ Vérifier la syntaxe `@collection.<name>.<field>` contre la doc PocketBase
> de la version installée avant de s'appuyer dessus ; c'est le point que je
> testerais en premier, avec un compte de test, avant d'écrire le reste.

---

## 5. Assignation des îlots (hook serveur)

**Ne pas faire côté client.** Deux personnes qui scannent en même temps liraient
la même composition et se verraient attribuer le même îlot.

Route personnalisée dans `pb_hooks/`, appelée à la fin de la mission d'entrée
(ou dès que Q4 et Q6 sont répondues, si on veut donner le numéro plus tôt) :

```
POST /api/assign-island        auth : participant
```

Algorithme glouton, exécuté **dans une transaction**, en relisant les
compositions à l'intérieur de la transaction :

```
q4 = réponse du participant à Q4      (rapport au mot « débat »)
q6 = réponse du participant à Q6      (connaît quelqu'un de très éloigné)

pour chaque îlot i dans 1..islands_count :
    same4 = nb de membres de i ayant la même réponse Q4
    same6 = nb de membres de i ayant la même réponse Q6
    excess = taille(i) − min(taille de tous les îlots)

    score(i) = 2*same4 + 2*same6 + 10*excess

affecter à l'îlot de score minimal ; égalité → le moins rempli ; puis au hasard
```

Le terme `excess` fortement pondéré maintient l'équilibrage ; les termes `same*`
maximisent la diversité intra-îlot demandée au §1.4. Les poids sont à ajuster
lors de la répétition, pas en théorie.

**Réassignation manuelle** (régie) : simple update du champ `island`.
Un écran listant les 10 îlots et leur remplissage suffit.

**`islands_count` est réglable.** À 30 personnes présentes, 10 îlots donnent des
groupes de 3 : la régie doit pouvoir descendre à 5 avant l'ouverture.

---

## 6. Décisions de conception à valider

Quatre points où j'ai tranché — dites-moi si vous voulez l'inverse.

1. **Pas de rôle « rapporteur ».** N'importe quel membre de l'îlot peut éditer
   les 2 propositions de son îlot (`island = @request.auth.island`). Ça évite
   un flux de revendication du rôle, et ça tolère la panne : si le téléphone du
   rapporteur meurt, son voisin continue. Le brief dit « accessible au
   rapporteur » — dans les faits, « accessible à l'îlot » est plus robuste.

2. **La consigne de connexion est calculée côté client**, sans stockage : on
   tire Q2 ou Q6, on affiche la question et la réponse donnée. Conforme au
   brief (« pas besoin de matching réel »).

3. **`skip` est enregistré** plutôt qu'ignoré, pour ne pas re-servir la même
   carte. Il est exclu des agrégats.

4. **Les libellés (annexes A et B) vivent dans le front**, pas en base — sauf
   les 6 énoncés graines, qui sont des lignes `statements` insérées au *seed*
   puisqu'ils doivent être indistinguables des propositions des îlots.

---

## 7. Dégradation

- **File d'attente locale.** Toute écriture qui échoue est mise en file dans
  `localStorage` et rejouée. Le wifi de la salle est le risque n°1 de la soirée,
  bien avant le code.
- **La projection garde son dernier état** en cas de perte de connexion : ne
  jamais afficher une page blanche ou une erreur sur grand écran. Afficher les
  derniers chiffres connus.
- **Export papier.** Un bouton régie qui imprime : la liste des îlots avec leurs
  membres, et les énoncés validés. À déclencher à 20h00, avant le vote — c'est
  le point où une panne coûterait le plus cher.
- **`localStorage` est fragile** : navigation privée, effacement, changement
  d'appareil = nouvelle identité. Acceptable sur 2h30. À savoir, pas à corriger.

---

## 8. Sécurité

- La régie **doit** être derrière un vrai compte (`facilitators`), pas une URL
  obscure. Quelqu'un dans la salle trouvera `/app/regie` — c'est exactement le
  public qui a envie d'essayer.
- Le mot de passe des comptes `participants` est généré et stocké côté client :
  ce n'est pas un secret, c'est un jeton de continuité. Ne jamais y attacher
  quoi que ce soit de sensible.
- `createRule` ouvert sur `participants` = quelqu'un peut créer des comptes en
  masse. Le garde-fou est `entry_open`, qui referme la porte à 19h25. Suffisant
  pour une soirée ; insuffisant pour un déploiement permanent.

---

## 9. Ordre de construction suggéré

1. PocketBase déployé + `session` + les 3 pages qui lisent le stage. **Rien
   d'autre.** Vérifier que le temps réel arrive sur les 3 surfaces.
2. Compte anonyme + mission d'entrée + sauvegarde au fil de l'eau.
3. `entry_results` + écran de projection du miroir.
4. Hook d'assignation + écran d'îlot + réassignation régie.
5. Propositions + validation régie → injection dans `statements`.
6. Vote + `vote_results` + projection triée.
7. Feedback.
8. Console de régie complète (elle s'étoffe à chaque étape ; ne pas la
   construire d'un bloc au début).
9. **Répétition générale avec 5–10 téléphones réels.** Non négociable.

Les étapes 1 et 9 sont celles qu'on est tenté de sauter. Ce sont les deux qui
sauvent la soirée.
