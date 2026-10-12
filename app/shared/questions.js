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
 * Contenu entièrement remplacé le 12 oct. pour le second événement (comme
 * `QUESTIONS` plus haut — l'ancien F1-F6 est abandonné).
 *
 * ⚠️ F1/F2/F3 sont les trois questions de la Partie 2 de la mission d'entrée
 * (p2_a/p2_b/p2_c, thermomètres + espoir de coopération), reposées ICI mot
 * pour mot, échelle identique — c'est une VRAIE mesure avant/après sur les
 * trois, pas juste sur F3 comme l'ancien F2↔Q3. Si vous éditez l'une des
 * trois ici, éditez son double dans `QUESTIONS` pareil, ou la comparaison ne
 * veut plus rien dire. F4-F7 sont neufs, pas de mesure avant/après dessus.
 *
 * Rien n'est en base : `feedback.answers` est un json indexé par ces clés.
 * Trois types de question ici : `'scale'` (curseur, comme la mission —
 * F1/F2 sur 0-100, F5 sur 0-10, chacune avec ses propres bornes), `'choice'`
 * (boutons, en ligne dès que l'échelle fait 5 — F3/F4), `'text'` (libre,
 * F6/F7).
 */
window.FEEDBACK = [
  {
    // Miroir mot pour mot de p2_a (QUESTIONS, Partie 2).
    key: 'f1',
    type: 'scale',
    text: 'Sur une échelle de 0 à 100, quel sentiment éprouvez-vous envers les personnes qui font partie d’un camp politique auquel vous vous opposez ?',
    scaleMin: 0,
    scaleMax: 100,
    scaleLabels: { min: '0 — très froid, défavorable', mid: '50 — ni chaleureux ni froid', max: '100 — très chaleureux, favorable' }
  },
  {
    // Miroir mot pour mot de p2_b.
    key: 'f2',
    type: 'scale',
    text: 'Le thermomètre inversé — selon vous, quel sentiment les personnes de ce camp éprouvent-elles envers les personnes comme vous ?',
    scaleMin: 0,
    scaleMax: 100,
    scaleLabels: { min: '0 — très froid, défavorable', mid: '50 — ni chaleureux ni froid', max: '100 — très chaleureux, favorable' }
  },
  {
    // Miroir mot pour mot de p2_c, même échelle d'accord à 5 degrés.
    key: 'f3',
    type: 'choice',
    text: 'L’espoir de coopération — je pense qu’il est possible de travailler avec les gens du camp adverse pour trouver les meilleures solutions à nos plus grands problèmes.',
    options: agreeOptions('f3')
  },
  {
    key: 'f4',
    type: 'choice',
    text: 'Ce soir, j’ai soutenu au moins une proposition que j’aurais rejetée en arrivant.',
    options: [
      { key: 'f4_c1', label: 'Oui' },
      { key: 'f4_c2', label: 'Non' }
    ]
  },
  {
    // Score de recommandation (NPS) — échelle 0-10, pas 0-100.
    key: 'f5',
    type: 'scale',
    text: 'Sur une échelle de 0 à 10, recommanderiez-vous cette soirée à un proche ?',
    scaleMin: 0,
    scaleMax: 10,
    scaleLabels: { min: '0 — pas probable du tout', mid: '5', max: '10 — extrêmement probable' }
  },
  {
    key: 'f6',
    type: 'text',
    text: 'Qu’avez-vous le plus apprécié ?',
    placeholder: 'Une ligne suffit.',
    max: 400
  },
  {
    key: 'f7',
    type: 'text',
    text: 'Qu’est-ce qui pourrait mieux faire fonctionner ?',
    placeholder: 'Même une petite chose.',
    max: 400
  }
];

/* ---------------------------------------------------------------------------
 * Annexe C : « Pol' quiz » — entre Îlots et Propositions.
 *
 * Contenu entièrement remplacé le 12 oct. (format jeu, avec sources) et
 * mécanique revue le même jour : la régie mène le tempo, plus l'îlot. Une
 * réponse par îlot (le « scribe » de la tablée répond pour tous), mais
 * QUELLE question est à l'écran est décidé par `session.polquiz_question` +
 * `polquiz_phase` ('question' | 'reveal'), pas par la progression de
 * l'îlot — voir app/index.html et spec §2.6 (révisée).
 *
 * `correct` = la clé d'option exacte. `explanation`/`source` ne s'affichent
 * qu'en phase `reveal`. `category` est le petit sous-titre de la question
 * (« Question N · … »).
 *
 * La dernière entrée, `spare: true`, est une question de secours — jamais
 * jouée dans l'enchaînement normal des 6 premières, sélectionnable à la
 * main par la régie si besoin (exæquo, question qui tombe à plat).
 *
 * Sources : Cevipof (Baromètre de la confiance politique, vague 17, janvier
 * 2026), sauf Q2 (IPP, note n°87, févr. 2023 / Observatoire des inégalités)
 * et Q3 (étude Martial Foucault pour l'AMF, juin 2025, données ministère de
 * l'Intérieur) et Q4 (ministère de l'Intérieur, résultats officiels, 30 juin
 * 2024).
 */
window.POLQUIZ = [
  {
    key: 'pq1',
    category: 'Question 1 · La relation entre élus et citoyens',
    text: 'Quel responsable politique inspire le plus confiance aux Français ?',
    options: [
      { key: 'pq1_c1', label: 'Le président de la République' },
      { key: 'pq1_c2', label: 'Le député' },
      { key: 'pq1_c3', label: 'Le maire' },
      { key: 'pq1_c4', label: 'Le conseiller régional' }
    ],
    correct: 'pq1_c3',
    explanation: '60 % des Français font confiance au maire de leur commune, contre 34 % à leur député et 18 % au président de la République. Plus l’élu est proche, plus on lui fait confiance.',
    source: 'Cevipof, Baromètre de la confiance politique, vague 17, janvier 2026.'
  },
  {
    key: 'pq2',
    category: 'Question 2 · Le profil des responsables politiques',
    text: 'Sur les 577 députés élus en 2022, combien sont ouvriers ?',
    options: [
      { key: 'pq2_c1', label: '8' },
      { key: 'pq2_c2', label: '35' },
      { key: 'pq2_c3', label: '72' },
      { key: 'pq2_c4', label: '110' }
    ],
    correct: 'pq2_c1',
    explanation: '8 députés sur 577 sont ouvriers, soit 1,4 %, alors que les ouvriers représentent 19 % de la population active. Les cadres supérieurs et professions intellectuelles supérieures représentent environ 70 % des députés.',
    source: 'Institut des politiques publiques, note n°87, février 2023, reprise par l’Observatoire des inégalités.'
  },
  {
    key: 'pq3',
    category: 'Question 3 · L’attractivité des fonctions politiques',
    text: 'Combien de maires ont démissionné entre juillet 2020 et mars 2025 ?',
    options: [
      { key: 'pq3_c1', label: 'Environ 200' },
      { key: 'pq3_c2', label: 'Environ 700' },
      { key: 'pq3_c3', label: 'Plus de 2 000' },
      { key: 'pq3_c4', label: 'Plus de 6 000' }
    ],
    correct: 'pq3_c3',
    explanation: '2 189 maires ont démissionné, soit 417 par an en moyenne, contre 129 par an pendant le mandat 2009-2014.',
    source: 'Étude de Martial Foucault (Cevipof) pour l’Association des maires de France, juin 2025, à partir des données du ministère de l’Intérieur.'
  },
  {
    key: 'pq4',
    category: 'Question 4 · La relation entre élus et citoyens',
    text: 'Quel a été le taux de participation au premier tour des élections législatives de 2024 ?',
    options: [
      { key: 'pq4_c1', label: '47 %' },
      { key: 'pq4_c2', label: '57 %' },
      { key: 'pq4_c3', label: '67 %' },
      { key: 'pq4_c4', label: '77 %' }
    ],
    correct: 'pq4_c3',
    explanation: '66,7 % des inscrits ont voté au premier tour, contre 47,5 % en 2022. C’est la participation la plus forte à des législatives depuis 1997.',
    source: 'Ministère de l’Intérieur, résultats officiels du premier tour, 30 juin 2024.'
  },
  {
    key: 'pq5',
    category: 'Question 5 · La transparence de la vie publique',
    text: 'En Allemagne, 49 % des citoyens jugent leurs élus et dirigeants politiques plutôt corrompus. Quelle est cette part en France ?',
    options: [
      { key: 'pq5_c1', label: '36 %' },
      { key: 'pq5_c2', label: '56 %' },
      { key: 'pq5_c3', label: '76 %' },
      { key: 'pq5_c4', label: '96 %' }
    ],
    correct: 'pq5_c3',
    explanation: '76 % des Français jugent leurs élus et dirigeants politiques plutôt corrompus, et 22 % les jugent plutôt honnêtes. C’est 27 points de plus qu’en Allemagne.',
    source: 'Cevipof, Baromètre de la confiance politique, vague 17, janvier 2026.'
  },
  {
    key: 'pq6',
    category: 'Question 6 · Le rôle des partis politiques',
    text: 'Quelle part des Français fait confiance aux partis politiques ?',
    options: [
      { key: 'pq6_c1', label: '15 %' },
      { key: 'pq6_c2', label: '30 %' },
      { key: 'pq6_c3', label: '45 %' },
      { key: 'pq6_c4', label: '60 %' }
    ],
    correct: 'pq6_c1',
    explanation: '15 % des Français font confiance aux partis politiques, autant qu’aux réseaux sociaux. Ils sont 37 % à faire confiance aux syndicats et 82 % à la science.',
    source: 'Cevipof, Baromètre de la confiance politique, vague 17, janvier 2026.'
  },
  {
    key: 'pq_spare',
    spare: true,
    category: 'Question de rechange',
    text: 'Quelle part des Français se dit intéressée par la politique ?',
    options: [
      { key: 'pq_spare_c1', label: '23 %' },
      { key: 'pq_spare_c2', label: '38 %' },
      { key: 'pq_spare_c3', label: '53 %' },
      { key: 'pq_spare_c4', label: '68 %' }
    ],
    correct: 'pq_spare_c3',
    explanation: '53 % des Français se disent intéressés par la politique, alors que 78 % déclarent ne pas lui faire confiance.',
    source: 'Cevipof, Baromètre de la confiance politique, vague 17, janvier 2026.'
  }
];

/* Consigne affichée une fois, avant la première question (participant et
 * projection). Le "une minute" ici est le temps de concertation à la table
 * avant de répondre — distinct du minuteur de 30 s affiché une fois la
 * question lancée (c'est une mise en ambiance, pas une horloge unique). */
window.POLQUIZ_INTRO = 'Place au Pol’ quiz ! Désignez le scribe de votre tablée : ' +
  'c’est lui qui répond, et c’est lui qui notera vos idées tout au long de la ' +
  'soirée. Pour chaque question, vous avez une minute pour vous mettre d’accord.';

// Durée du minuteur visuel par question, en secondes (spec §2.6).
window.POLQUIZ_COUNTDOWN = 30;
