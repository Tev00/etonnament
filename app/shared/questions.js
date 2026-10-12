/* Étonnamment d'accord — annexe A : mission d'entrée (« Questionnaire | Intro »).
 *
 * Les libellés vivent ici et NON en base : la base ne stocke que des clés
 * (`p1_1_c2`), ce qui permet de corriger une faute de frappe le soir même
 * sans toucher aux réponses déjà enregistrées (spec §1.2).
 *
 * Ne jamais réutiliser ni renuméroter une clé après le début de l'événement :
 * les réponses déjà en base pointeraient sur un autre libellé.
 *
 * Contenu entièrement remplacé le 12 oct. pour le second événement (contenu
 * de l'événement 1 — q1..q7 — abandonné, base vidée avant ce changement).
 * Deux parties, deux types de question :
 * - `type: 'choice'` — échelle de Likert à 5 degrés, affichée en ligne
 *   (`.options.likert`, comme pour `FEEDBACK`).
 * - `type: 'scale'` — curseur continu 0-100 (thermomètre). Pas d'`options` ;
 *   `scaleLabels` ne sert qu'à l'affichage (positions 0/50/100 sous le
 *   curseur), la valeur enregistrée est le nombre choisi, en texte.
 *
 * ⚠️ Plus aucune question ne nourrit l'algorithme d'affectation des îlots
 * (spec §5, `server/pb_hooks/assign-island.pb.js`, qui cherchait `q4`/`q6`
 * par clé en dur) : ces clés n'existent plus. L'algorithme ne plante pas —
 * `same4`/`same6` restent à 0 pour tout le monde — mais il n'équilibre plus
 * que par taille d'îlot, sans dimension de diversité. Pareil pour la
 * consigne de rencontre ci-dessous, réparée en pointant vers deux questions
 * réelles de ce nouveau jeu ; à confirmer/ajuster avec Paul.
 */

// Échelle d'accord partagée par plusieurs questions ci-dessous — définie une
// seule fois pour que le texte reste identique partout où elle est réutilisée
// (évite qu'une des copies dérive après une correction de faute de frappe).
var AGREE_SCALE = [
  { label: 'Pas du tout d’accord' },
  { label: 'Plutôt pas d’accord' },
  { label: 'Ni l’un ni l’autre' },
  { label: 'Plutôt d’accord' },
  { label: 'Tout à fait d’accord' }
];

function agreeOptions(prefix) {
  return AGREE_SCALE.map(function (o, i) {
    return { key: prefix + '_c' + (i + 1), label: o.label };
  });
}

window.QUESTIONS = [
  // --- Partie 1 : 5 propositions qui circulent dans le débat public -------
  {
    key: 'p1_1',
    section: 'Partie 1',
    sectionIntro: 'Voici des propositions qui circulent dans le débat public :',
    type: 'choice',
    text: 'Instaurer le référendum d’initiative citoyenne.',
    options: agreeOptions('p1_1')
  },
  {
    key: 'p1_2',
    section: 'Partie 1',
    sectionIntro: 'Voici des propositions qui circulent dans le débat public :',
    type: 'choice',
    text: 'Introduire une part de proportionnelle aux élections législatives.',
    options: agreeOptions('p1_2')
  },
  {
    key: 'p1_3',
    section: 'Partie 1',
    sectionIntro: 'Voici des propositions qui circulent dans le débat public :',
    type: 'choice',
    text: 'Limiter à deux le nombre de mandats successifs identiques.',
    options: agreeOptions('p1_3')
  },
  {
    key: 'p1_4',
    section: 'Partie 1',
    sectionIntro: 'Voici des propositions qui circulent dans le débat public :',
    type: 'choice',
    text: 'Réduire le nombre de parlementaires.',
    options: agreeOptions('p1_4')
  },
  {
    key: 'p1_5',
    section: 'Partie 1',
    sectionIntro: 'Voici des propositions qui circulent dans le débat public :',
    type: 'choice',
    text: 'Rendre le vote obligatoire.',
    options: agreeOptions('p1_5')
  },

  // --- Partie 2 : thermomètres + espoir de coopération ---------------------
  {
    key: 'p2_a',
    section: 'Partie 2',
    type: 'scale',
    text: 'Sur une échelle de 0 à 100, quel sentiment éprouvez-vous envers les personnes qui font partie d’un camp politique auquel vous vous opposez ?',
    scaleLabels: { min: '0 — très froid, défavorable', mid: '50 — ni chaleureux ni froid', max: '100 — très chaleureux, favorable' }
  },
  {
    // Le thermomètre inversé — même échelle, l'autre sens.
    key: 'p2_b',
    section: 'Partie 2',
    sectionIntro: 'Le thermomètre inversé.',
    type: 'scale',
    text: 'Selon vous, quel sentiment les personnes de ce camp éprouvent-elles envers les personnes comme vous ?',
    scaleLabels: { min: '0 — très froid, défavorable', mid: '50 — ni chaleureux ni froid', max: '100 — très chaleureux, favorable' }
  },
  {
    key: 'p2_c',
    section: 'Partie 2',
    sectionIntro: 'L’espoir de coopération.',
    type: 'choice',
    text: 'Je pense qu’il est possible de travailler avec les gens du camp adverse pour trouver les meilleures solutions à nos plus grands problèmes.',
    options: agreeOptions('p2_c')
  }
];

/* Consigne de rencontre (spec §6.2) : on tire une des deux clés ci-dessous et
 * on affiche la réponse donnée. Calculé côté client, rien n'est stocké.
 * ⚠️ Repointé le 12 oct. vers deux questions à choix de ce nouveau jeu (les
 * deux thermomètres, p2_a/p2_b, sont numériques — mauvais candidats pour un
 * « trouvez quelqu'un qui a répondu comme vous », qui a besoin d'une vraie
 * égalité de clé). Choix par défaut, à confirmer avec Paul. */
window.CONSIGNE_QUESTIONS = ['p1_1', 'p2_c'];

/* ---------------------------------------------------------------------------
 * Annexe B : questionnaire de clôture (« Questionnaire | Fin »).
 *
 * Six questions : les quatre du déroulé (Paul, 8 sept.), précédées de deux
 * questions fermées qui rejoignent la mission d'entrée.
 *
 * Pourquoi ces deux-là d'abord. Elles se répondent d'un doigt : commencer par
 * un tap plutôt que par un champ de texte, c'est la différence entre un
 * questionnaire commencé et un questionnaire regardé. Les trois champs libres
 * viennent ensuite, quand la personne est déjà dedans.
 *
 * ⚠️ Une seule des deux est une VRAIE mesure avant/après. F2 reprend Q3 presque
 * mot pour mot : on peut comparer les deux réponses d'une même personne et dire
 * si la soirée a changé quelque chose. F1 porte sur la surprise, que la mission
 * d'entrée ne mesure pas — c'est une donnée neuve, pas un second point sur une
 * courbe. Ne pas présenter les deux comme un avant/après dans le bilan.
 *
 * Rien n'est en base : `feedback.answers` est un json indexé par ces clés.
 *
 * Échelle de Likert à 5 degrés (ajouté le 9 oct., comme sur la mission
 * d'entrée) : F1, F2 et F5 passent de 3/3/4 à 5 options chacune, affichées en
 * ligne (`.options.likert`). F2 reprend l'échelle de Q3 mot pour mot
 * (Jamais…Très souvent) : c'est ce qui rend la comparaison avant/après valide.
 * F3/F4/F6 restent en texte libre, inchangées.
 */
window.FEEDBACK = [
  {
    // Donnée neuve : la mission d'entrée ne demande rien sur la surprise.
    key: 'f1',
    type: 'choice',
    text: 'Ce soir, avez-vous entendu un point de vue qui vous a surpris ?',
    options: [
      { key: 'f1_c1', label: 'Pas du tout' },
      { key: 'f1_c2', label: 'Un peu' },
      { key: 'f1_c3', label: 'Moyennement' },
      { key: 'f1_c4', label: 'Beaucoup' },
      { key: 'f1_c5', label: 'Énormément' }
    ]
  },
  {
    /* Miroir de Q3 — même échelle, mot pour mot, pour que la comparaison
     * avant/après sur une même personne reste valide. */
    key: 'f2',
    type: 'choice',
    text: 'Ce soir, avez-vous pu dire ce que vous pensiez, sans vous retenir ?',
    options: [
      { key: 'f2_c1', label: 'Jamais' },
      { key: 'f2_c2', label: 'Rarement' },
      { key: 'f2_c3', label: 'Parfois' },
      { key: 'f2_c4', label: 'Souvent' },
      { key: 'f2_c5', label: 'Très souvent' }
    ]
  },
  {
    key: 'f3',
    type: 'text',
    text: 'Qu’est-ce qui a le mieux marché, selon vous ?',
    placeholder: 'Une ligne suffit.',
    max: 400
  },
  {
    key: 'f4',
    type: 'text',
    text: 'Qu’est-ce qui a coincé ?',
    placeholder: 'Même une petite chose.',
    max: 400
  },
  {
    /* Deux questions en une dans le déroulé — « revenir » ET « amener
     * quelqu'un ». En choix fermé plutôt qu'en texte libre : c'est le
     * chiffre qu'on citera pour décider s'il y a une prochaine soirée. Les
     * options gardent les deux idées distinctes. */
    key: 'f5',
    type: 'choice',
    text: 'Seriez-vous prêt·e à revenir, ou à amener quelqu’un ?',
    options: [
      { key: 'f5_c1', label: 'Oui, avec quelqu’un' },
      { key: 'f5_c2', label: 'Oui, seul·e' },
      { key: 'f5_c3', label: 'Probablement' },
      { key: 'f5_c4', label: 'Peut-être' },
      { key: 'f5_c5', label: 'Non' }
    ]
  },
  {
    key: 'f6',
    type: 'text',
    text: 'Qu’est-ce que vous diriez à quelqu’un pour l’inviter au prochain débat ?',
    placeholder: 'Vos mots à vous — ce sont les meilleurs pour inviter.',
    max: 500
  }
];

/* ---------------------------------------------------------------------------
 * Annexe C : « Pol' quiz » — entre Îlots et Propositions.
 *
 * Contrairement aux mission/clôture (une réponse par personne), le quiz se
 * répond UNE FOIS PAR ÎLOT : n'importe qui à la table répond, tout le monde
 * à la même table voit la même question avancer en direct (même mécanique de
 * synchronisation que `propositions`, par `island` — voir app/index.html et
 * spec §2.5/§6.1). Rien n'empêche une bonne réponse factuelle à l'occasion,
 * mais l'objectif est de faire parler la table, pas de la piéger : contenu
 * volontairement intemporel (pas d'actualité qui périme), à ajuster ici sans
 * toucher au code.
 */
window.POLQUIZ = [
  {
    key: 'pq1',
    text: 'Quel pays est considéré comme le berceau de la démocratie ?',
    options: [
      { key: 'pq1_c1', label: 'La Grèce antique' },
      { key: 'pq1_c2', label: 'La Rome antique' },
      { key: 'pq1_c3', label: 'Le Royaume-Uni' },
      { key: 'pq1_c4', label: 'La France' }
    ]
  },
  {
    key: 'pq2',
    text: 'En France, à partir de quel âge peut-on voter ?',
    options: [
      { key: 'pq2_c1', label: '16 ans' },
      { key: 'pq2_c2', label: '18 ans' },
      { key: 'pq2_c3', label: '21 ans' },
      { key: 'pq2_c4', label: '25 ans' }
    ]
  },
  {
    key: 'pq3',
    text: 'D’où vient le mot « démocratie » ?',
    options: [
      { key: 'pq3_c1', label: 'Du grec, « le pouvoir du peuple »' },
      { key: 'pq3_c2', label: 'Du latin, « le pouvoir de la loi »' },
      { key: 'pq3_c3', label: 'De l’arabe, « l’assemblée »' },
      { key: 'pq3_c4', label: 'Un mot moderne, né au XIXe siècle' }
    ]
  },
  {
    // Pas de bonne réponse ici — c'est pour faire parler l'îlot, pas un test.
    key: 'pq4',
    text: 'Pour votre îlot, qu’est-ce qui compte le plus dans un bon débat ?',
    options: [
      { key: 'pq4_c1', label: 'Écouter' },
      { key: 'pq4_c2', label: 'Convaincre' },
      { key: 'pq4_c3', label: 'Être honnête' },
      { key: 'pq4_c4', label: 'Être drôle' }
    ]
  }
];
