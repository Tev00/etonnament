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

⚠️ **Les collections « view » n'émettent pas d'événements temps réel.** Vérifié
sur l'instance (8 sept.) : en s'abonnant simultanément à `entry_answers` et à
`entry_results`, la création d'une réponse déclenche bien `event:entry_answers`
et **rien** sur `entry_results`. C'est logique — PocketBase émet sur l'écriture
d'un enregistrement, et personne n'écrit jamais dans une vue.

La projection s'abonne donc aux collections **sources** (`entry_answers`,
`votes`) et **relit la vue** à chaque événement. Le GET périodique de
`app.js` sert de filet : si un événement se perd, l'écran se corrige tout seul
en 15 s au lieu de rester figé.

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
| `pair_color` | text | couleur hex de l'appariement du stage `consigne` (§2.5). Vide si non apparié |
| `pair_code` | text | code à 6 caractères partagé avec le même partenaire, secours daltonisme |
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
| `question` | text | clé de question — voir `shared/questions.js` pour le jeu actuel |
| `choice` | text | clé de l'option (ex. `p1_1_c2`) pour une question à choix, ou le nombre choisi en texte (ex. `73`) pour une question à curseur |

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
| `problem` | text | problème visé — jamais versionné, régie ne le modifie pas |
| `description` | text (max 300 côté UI ; pas de limite en base) | 2 phrases, écrites par l'îlot — version *initiale*, jamais réécrite par la régie |
| `effect` | text | effet attendu, version *initiale* — idem |
| `description_final` | text | ajouté le 12 oct. — réécriture régie de `description`, vide tant que `modified` est faux |
| `effect_final` | text | ajouté le 12 oct. — idem pour `effect` |
| `modified` | bool | ajouté le 12 oct., défaut `false` — bascule à `true` dès que la régie enregistre une édition (§2.7) |
| `status` | select | `draft` \| `validated` \| `rejected` |
| `statement` | relation → statements | rempli à l'injection |

> `description`/`effect` ne sont **jamais** écrasés par une édition régie —
> c'est tout le sens de la séparation initiale/finale. L'îlot continue de ne
> voir et modifier que `description`/`effect` (son propre formulaire,
> `app/index.html`, est inchangé par cet ajout). Le texte réellement copié
> dans `statements` — donc ce sur quoi la salle vote — est la version
> *effective* : `description_final` si `modified = true`, sinon
> `description` (voir `effectiveText()` dans `regie.html`).

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
| `answers` | json | 7 réponses (contenu du 12 oct., `shared/questions.js` `FEEDBACK`) : 2 curseurs 0-100, 1 curseur 0-10 (NPS), 2 à choix, 2 texte libre |

Un seul enregistrement par participant (json plutôt que lignes : pas d'agrégat
temps réel nécessaire, et le texte libre se prête mal aux lignes).

> F1/F2/F3 reposent mot pour mot les trois questions de la Partie 2 de la
> mission d'entrée (`p2_a`/`p2_b`/`p2_c`) — une vraie mesure avant/après sur
> les trois, pas seulement sur une comme l'ancien contenu (événement 1). Les
> garder synchronisées si l'une des deux copies est éditée (`questions.js`
> porte la même note des deux côtés).

### 1.7 `session` — enregistrement unique, la machine à états

Une seule ligne, `key = "main"`. Tout le monde la lit, seule la régie l'écrit.

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `key` | text unique | `main` | |
| `stage` | select | `accueil` | écran par défaut du participant (voir §3) |
| `entry_open` | bool | `true` | mission d'entrée ouverte |
| `matching_open` | bool | `false` | appariement par couleur ouvert (stage `consigne`, §2.5) |
| `matching_view` | select | `idle` | `idle` \| `color_assignment` \| `searching` — les deux non-idle affichent la même chose côté participant (§2.5) |
| `islands_count` | number | `10` | nombre d'îlots actifs |
| `polquiz_open` | bool | `false` | saisie du Pol' quiz ouverte (stage `polquiz`, §2.6) |
| `propositions_open` | bool | `false` | saisie des propositions |
| `vote_open` | bool | `false` | vote Polis |
| `feedback_open` | bool | `false` | questionnaire de clôture |
| `projection_view` | select | `idle` | `idle` \| `entry` \| `vote` \| `programme` |
| `projection_question` | text | `q1` | quelle question projeter |
| `projection_page` | number | `0` | pagination des résultats de vote |
| `text_summary` | text | `""` | résumé IA des propositions les plus consensuelles (§2.4), écrit par `/api/summarize-votes` |

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
// Tous les énoncés sont classés ensemble, quel que soit n.
```

Trier par `lean` décroissant donne l'ordre « du plus consensuel au plus clivant »
du brief. Le clustering d'opinions (P1) n'est pas dans ce périmètre.

### 2.4 Résumé IA du vote — `POST /api/summarize-votes`

Hook facultatif (`server/pb_hooks/summarize-votes.pb.js`, auth `facilitators`),
déclenché à la demande par un bouton régie, pas automatiquement :

1. Recalcule les tallies à la main depuis `statements` (`active = true`) et
   `votes` (`value != "skip"`) — PAS depuis la vue `vote_results` : le
   binding DAO du hook (`$app.findRecordsByFilter`) renvoie les bonnes lignes
   mais des colonnes agrégées (`SUM(CASE...)` dans le SQL de la vue) toujours
   à 0, alors que la même vue est correcte via l'API REST normale (constaté
   le 9 sept). Garde les `TOP_N` (5) propositions où `agree >= disagree`
   triées par `agree / (agree + disagree)` décroissant — l'accord, pas le
   consensus symétrique de `lean` en 2.3.
2. Appelle l'API Messages d'Anthropic (`claude-haiku-4-5`, pas de streaming,
   un seul message) avec ces propositions et le texte d'instruction lu dans
   `server/pb_hooks/prompts/vote-summary.txt` — fichier à part, relu à chaque
   appel, pour pouvoir l'ajuster sans toucher au code ni redémarrer PocketBase.
3. Écrit le texte renvoyé dans `session.text_summary`.

Les trois surfaces le lisent déjà en temps réel via `App.onSession` (spec §3) :
rien de nouveau à câbler côté client au-delà de l'affichage. La projection
l'affiche sous les résultats du vote, en second temps, dès qu'il existe.

Clé `ANTHROPIC_API_KEY` fournie par `EnvironmentFile=-/opt/pocketbase/.env`
dans `pocketbase.service` (le `-` la rend optionnelle : le service démarre
même sans, le hook répond juste 500). Jamais committée.

### 2.5 Appariement par couleur — `POST /api/assign-matching`

Jeu de rencontre du stage `consigne` : ~70 participants retrouvent leur
binôme en cherchant la même couleur de fond dans la salle, avec un code à 6
caractères en secours (accessibilité daltonisme — jamais la couleur seule).
Volontairement minimal : pas de collection `pairs`, pas d'étape de
confirmation. Juste deux champs de plus sur `participants` (§1.1) et un écran
plein cadre côté client.

1. La régie ouvre `matching_open` (bascule générique, comme `vote_open`) puis
   clique « Attribuer les paires », qui appelle ce hook
   (`server/pb_hooks/assign-matching.pb.js`, auth `facilitators`) — **autant
   de fois que nécessaire pendant la phase**, pas une seule (voir plus bas).
2. Le hook lit les `participants` avec `entry_done = true` ET **sans
   `pair_color`** — pas tout le monde, exprès (voir plus bas) —, les mélange
   (Fisher-Yates — pas l'ordre d'arrivée, qui grouperait les gens venus
   ensemble), les découpe en paires, génère une couleur (teintes réparties
   sur 360°, luminosité 34-56% pour rester lisible en texte blanc quelle que
   soit la teinte) et un code à 6 caractères par paire, et écrit les deux sur
   les deux `participants` de chaque paire.
3. **Nombre impair** : le dernier tiré ne reçoit ni couleur ni code — pas une
   couleur que personne d'autre ne porte, ce qui le laisserait chercher un
   match inexistant. Reste candidat pour l'appel suivant, donc se résorbe
   tout seul dès qu'une personne de plus finit la mission. Voir §5.1 côté
   participant et le roster régie pour la résolution manuelle si besoin.
4. Le hook met `session.matching_view = 'searching'`. `color_assignment`
   existe dans le schéma mais n'est pas déclenché séparément : les deux
   valeurs non-`idle` affichent la même chose côté participant (décision du
   9 sept — un seul geste régie, pas de temps de « préparez-vous »).

**Deux bugs réels trouvés le 10 sept lors du premier vrai essai** (« plusieurs
participants sans paire », rapporté par Paul — reproduit à ~50% de la salle) :

- **Le hook rebattait TOUT LE MONDE à chaque appel**, pas seulement les
  nouveaux arrivants. Personne ne finit la mission d'entrée à la même
  seconde, donc la régie appuie forcément plusieurs fois sur ce bouton — et
  chaque rappel réattribuait une nouvelle couleur à des gens déjà appariés.
  Le téléphone de quelqu'un qui n'avait pas immédiatement rechargé
  affichait alors sa couleur devenue périmée : personne d'autre dans la
  salle ne la portait plus, indiscernable de « jamais apparié ». Corrigé en
  rendant le hook incrémental (§2 ci-dessus) : il ne touche jamais un
  `participants` qui a déjà une `pair_color`.
- **`txApp.findRecordsByFilter(..., 0, 0)` À L'INTÉRIEUR d'une transaction
  peut renvoyer le même enregistrement plusieurs fois** — confirmé avec un
  export de diagnostic montrant un même id présent 2-3 fois dans le
  résultat. Chaque doublon repassait par `set()`+`save()`, donc la dernière
  occurrence d'une personne écrasait sa propre paire déjà posée par une
  occurrence précédente, laissant son vrai partenaire orphelin — un second
  bug indépendant du premier, qui survivait même après le correctif
  incrémental. Corrigé en passant une limite explicite (500, très au-dessus
  de tout effectif réel) plutôt que 0, plus un dédoublonnage par id en
  filet. **Le même idiome (`limit=0`) existe aussi dans
  `assign-island.pb.js`** (`members`, une vraie collection comptée par
  `size[isl]++` — un doublon y aurait faussé l'équilibrage des îlots pour de
  vrai, silencieusement) **et `summarize-votes.pb.js`** (`statements`/
  `votes`, hors transaction — risque non confirmé mais protégé par
  précaution) : les trois ont reçu la même limite explicite le même jour.

Côté participant (`app/index.html`), un overlay plein écran (`#matchingOverlay`,
en dehors de `.wrap`, par-dessus logo et bandeau de connexion) s'affiche
quand `stage === 'consigne' && matching_open === true && matching_view !==
'idle'`. La couleur et le code viennent de `me.pair_color`/`me.pair_code`,
lus via `App.refreshParticipant()` — déjà rappelé à chaque session, rien de
nouveau à interroger (même plomberie que le numéro d'îlot). Sans
`pair_color` (nombre impair), l'écran affiche « Pas encore de paire — allez
voir la régie » plutôt qu'un fond vide qui a l'air cassé.

Côté régie (10 sept), le roster n'est plus lecture seule : chaque personne a
son propre menu (déplacer vers un autre groupe — y compris un groupe déjà
formé, ce qui crée un trio sans rien de spécial à coder côté serveur — ou
« sans paire », ou « nouveau groupe »). Écrit en client-side direct
(`R().collection('participants').update(...)`, comme le déplacement
manuel d'îlot déjà en place), pas via un hook : la règle d'update de
`participants` est déjà ouverte aux facilitators pour tous les champs.
« Nouveau groupe » génère une couleur/code à part côté régie (teinte
aléatoire, pas la répartition 360°/n du hook) — ajustement manuel rare et
unitaire, pas besoin de reproduire l'algorithme exact.

Chaque écran participant affiche aussi, en permanence et en tout petit en
bas d'écran (`#participantId`), les 4 derniers caractères de son
`username` — la même règle que `shortName()` dans regie.html, pour que
régie et participant lisent la même chaîne sans conversion mentale. Sert à
localiser quelqu'un dans le roster (paire cassée, îlot égaré), pas à
attirer l'œil du participant lui-même.

### 2.6 Pol' quiz — entre `ilots` et `propositions` (ajouté le 9 oct.)

Mini-quiz à choix unique (questions.js, `window.POLQUIZ`, 4 questions
d'exemple — contenu volontairement intemporel, à ajuster sans toucher au
code), affiché sur le stage `polquiz`, gardé par le booléen `polquiz_open`
comme les autres phases (§3, §4).

Différence structurante avec la mission d'entrée : **une réponse par îlot**,
pas une par personne — même logique de synchronisation partagée que
`propositions` (§1.4), pas celle de la mission. Une nouvelle collection,
`polquiz_answers`, porte un enregistrement par îlot (`island`, number) avec
un champ `answers` (json, `{ pq1: 'pq1_c2', … }`) — une seule ligne par îlot,
pas une ligne par question comme `propositions` (deux champs suffisent, pas
besoin de « slots »). Quiconque à la table répond écrit dans ce même
enregistrement ; tous les téléphones abonnés (subscribe sur la collection,
filtrage local par `island`) avancent ensemble à la question suivante — le
participant qui tape ne voit **pas** un état différent de ses voisins de
table une fois la réponse partie, exactement comme pour les propositions.

Règles d'API (mêmes que `propositions`, §4) :

```
list/view : island = @request.auth.island || FACILITATOR
create    : island = @request.auth.island && @collection.session.polquiz_open = true
update    : idem create, ou FACILITATOR
delete    : FACILITATOR
```

✅ **Fait le 12 oct.** : `session.polquiz_open` (bool, défaut `false`) et la
collection `polquiz_answers` (`island` number requis, `answers` json,
`created`/`updated` autodate, les quatre règles ci-dessus) existent sur
l'instance live — créés via l'API superuser (`_superusers/auth-with-password`
puis `PATCH`/`POST /api/collections`), pas par ce dépôt (toujours pas de
migration automatisée ; créer une collection depuis un hook applicatif
reviendrait à lui donner un accès qu'on retire explicitement au participant
partout ailleurs, §4 point 1). Vérifié : liste anonyme sur `polquiz_answers`
renvoie `0 items`, pas une fuite.

### 2.7 Édition régie des propositions (ajouté le 12 oct.)

La régie peut réécrire la description et l'effet d'une proposition sans
toucher à ce que l'îlot a écrit — pour corriger une formulation ambiguë,
couper une proposition trop longue, ou neutraliser une tournure avant le
vote, sans perdre la trace du texte d'origine.

1. Bouton « Modifier » sur chaque proposition (`regie.html`, fieldset
   Propositions) — ouvre un panneau avec deux champs texte, pré-remplis par
   la version effective actuelle (`description_final`/`effect_final` si déjà
   modifiée, sinon `description`/`effect`).
2. « Enregistrer la modification » écrit dans `description_final`/
   `effect_final` et passe `modified` à `true` — `description`/`effect`
   (l'îlot) ne sont jamais touchés par ce chemin.
3. **Si la proposition est déjà validée** (`statement` pointe vers un
   énoncé existant), l'enregistrement met aussi à jour `statements.text` en
   place, dans la même opération. Nécessaire : une fois `status =
   'validated'`, le bouton « Valider → énoncé » n'est plus affiché, donc
   rien d'autre ne resynchroniserait le texte voté avec l'édition.
4. « Revenir à la version initiale » repasse `modified` à `false` (et
   resynchronise `statements.text` sur `description` si déjà validée) sans
   effacer `description_final`/`effect_final` — l'édition reste en base,
   simplement ignorée, au cas où la régie voudrait la rétablir.
5. `validate()` (le bouton « Valider → énoncé ») envoie désormais la version
   *effective* (`effectiveText(p)`, §1.4) dans `statements.text`, plus la
   même resynchronisation défensive que le point 3 si un `statement` existe
   déjà (reclique après une édition entre-temps).

Le roster régie affiche un tag « modifié » (accent) à côté du statut, et un
encart « Version finale (régie), envoyée au vote » sous le texte d'origine
quand `modified` est vrai — toujours visible à côté de la version initiale,
jamais à sa place : la régie doit pouvoir comparer les deux d'un coup d'œil,
pas deviner ce qui a changé.

---

## 3. Machine à états

Deux mécanismes distincts, volontairement découplés :

- **`stage`** décide de l'écran par défaut du participant.
- **Les booléens** (`entry_open`, `vote_open`…) décident de ce qui est *permis*.

Pourquoi les séparer : le brief exige que le facilitateur n'attende jamais une
action des participants. Avec des booléens indépendants, la régie peut rouvrir
la mission d'entrée à 20h10 pour un retardataire sans faire reculer toute la
salle. Une machine à états strictement séquentielle rendrait ça impossible.

La régie affiche des libellés différents de la clé `stage` sur ses boutons
(`STAGE_LABELS` dans `regie.html`, ajouté le 9 oct.) — la clé stockée en base
ne change pas, seul l'intitulé lu par le facilitateur change :
`mission` → « Questionnaire | Intro », `consigne` → « Paires », `cloture` →
« Questionnaire | Fin ».

| `stage` | Écran participant | Ouvert normalement |
|---|---|---|
| `accueil` | déroulé, partenaires, calendrier | `entry_open` |
| `mission` (« Questionnaire \| Intro ») | questions à 5 degrés (Likert) et/ou à curseur 0-100, une par écran — contenu dans `shared/questions.js` | `entry_open` |
| `consigne` (« Paires ») | « trouve quelqu'un qui… » + appariement par couleur + n° d'îlot | — |
| `ilots` | numéro d'îlot en très grand | — |
| `polquiz` (« Pol' quiz ») | mini-quiz à choix unique, une réponse par îlot (§2.6) | `polquiz_open` |
| `propositions` | formulaire (membres de l'îlot) | `propositions_open` |
| `vote` | pile de cartes | `vote_open` |
| `resultats` | « regardez l'écran » | — |
| `cloture` (« Questionnaire \| Fin ») | 7 questions de feedback : 2 curseurs 0-100, 1 curseur 0-10 (NPS), 2 à 5 degrés (Likert), 2 texte libre | `feedback_open` |

Déroulé nominal, chaque transition déclenchée **manuellement** par la régie :

```
19h00  accueil       entry_open=true, islands_count=10
       mission       (les gens répondent en arrivant)
       consigne      → n° d'îlot affiché dès la fin de la mission
19h25  ─────────────  régie : entry_open=false
       ilots         projection_view=entry, la régie fait défiler les questions
       polquiz       polquiz_open=true (mini-quiz, une réponse par îlot)
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
| `polquiz_answers` | `island = @request.auth.island \|\| FACILITATOR` | `island = @request.auth.island && @collection.session.polquiz_open = true` | idem create, ou `FACILITATOR` | `FACILITATOR` |
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

> ✅ **Vérifié sur l'instance** (7 sept.). `@collection.session.entry_open = true`
> en règle de création sur `entry_answers` fonctionne : `entry_open = true` →
> création acceptée, `entry_open = false` → création refusée. Le motif est donc
> valide pour `propositions_open`, `vote_open` et `feedback_open`.
>
> ⚠️ **Piège à connaître.** Une création refusée par une règle renvoie
> **400 avec un corps d'erreur vide**, et non 403 — indiscernable au premier
> coup d'œil d'une erreur de validation ou de base de données. Avant de
> soupçonner le schéma, vérifier l'état du drapeau correspondant dans
> `session`. (Une *lecture* refusée, elle, renvoie bien 403.)

---

## 5. Assignation des îlots (hook serveur)

**Ne pas faire côté client.** Deux personnes qui scannent en même temps liraient
la même composition et se verraient attribuer le même îlot.

Route personnalisée dans `pb_hooks/`, appelée à la fin de la mission d'entrée :

```
POST /api/assign-island        auth : participant
```

Algorithme glouton, exécuté **dans une transaction**, en relisant les
compositions à l'intérieur de la transaction :

```
A = réponse du participant à DIVERSITY_Q_A
B = réponse du participant à DIVERSITY_Q_B

pour chaque îlot i dans 1..islands_count :
    sameA = nb de membres de i ayant la même réponse A
    sameB = nb de membres de i ayant la même réponse B
    excess = taille(i) − min(taille de tous les îlots)

    score(i) = 2*sameA + 2*sameB + 10*excess

affecter à l'îlot de score minimal ; égalité → le moins rempli ; puis au hasard
```

Le terme `excess` fortement pondéré maintient l'équilibrage ; les termes
`same*` maximisent la diversité intra-îlot demandée au §1.4. Les poids sont à
ajuster lors de la répétition, pas en théorie.

`DIVERSITY_Q_A`/`DIVERSITY_Q_B` sont deux constantes déclarées **à l'intérieur**
du handler `routerAdd` (pas en tête de fichier — un `var` de portée module
n'est pas fiablement visible depuis l'intérieur d'un callback de route sur
PocketBase, à cause de son architecture à VMs pré-chargées ; déjà rencontré
dans `assign-matching.pb.js`). Elles pointent vers deux questions à choix (pas
à curseur) de `shared/questions.js` — l'algorithme ne compare les réponses
qu'en égalité stricte de clé, donc n'importe quelle question à choix convient,
et changer le contenu de la mission d'entrée ne demande de toucher que ces
deux constantes.

> **Historique** : à l'origine `q4`/`q6` (événement 1, rapport au mot
> « débat » / connaît quelqu'un de très éloigné). Le contenu de la mission
> d'entrée a été entièrement remplacé le 12 oct. pour le second événement,
> ces clés ont disparu de `questions.js` — le hook a été regénéralisé à cette
> occasion (constantes nommées plutôt que clés en dur) et repointé vers
> `p1_1`/`p1_4` (deux des cinq propositions de la Partie 1). Pendant la
> fenêtre entre le changement de contenu et cette correction, l'algorithme n'a
> pas planté : `sameA`/`sameB` valaient simplement 0 pour tout le monde, donc
> un équilibrage par taille uniquement, sans dimension de diversité — à
> surveiller si ce fichier change encore sans que ces deux constantes
> suivent.

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
