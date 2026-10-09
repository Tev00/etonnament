/* Étonnamment d'accord — annexe A : mission d'entrée (« Questionnaire | Intro »).
 *
 * Les libellés vivent ici et NON en base : la base ne stocke que des clés
 * (`q4_c2`), ce qui permet de corriger une faute de frappe le soir même sans
 * toucher aux réponses déjà enregistrées (spec §1.2).
 *
 * Ne jamais réutiliser ni renuméroter une clé après le début de l'événement :
 * les réponses déjà en base pointeraient sur un autre libellé.
 *
 * Présentation en échelle de Likert à 5 degrés (ajouté le 9 oct.) : les 7
 * questions ont désormais toutes exactement 5 options, affichées en ligne
 * plutôt qu'empilées (app/index.html, classe `.options.likert`). Q4 et Q7
 * restent des choix catégoriels (pas d'ordre naturel) — la mise en forme
 * Likert ne s'applique qu'à l'affichage, pas au sens des réponses. Q4 et Q6
 * alimentent l'algorithme d'affectation des îlots (spec §5) : l'algorithme ne
 * compare les clés qu'en égalité stricte, donc passer de 2/4 à 5 options ne
 * change rien à sa logique (server/pb_hooks/assign-island.pb.js).
 *
 * ⚠️ Cette refonte renumérote q1_c1..c4 etc. Les réponses déjà enregistrées
 * en base (répétitions de septembre) pointeront vers d'anciens libellés —
 * sans incidence pour une vraie soirée pas encore tenue, mais à nettoyer
 * avant la prochaine répétition ou le vrai événement.
 */
window.QUESTIONS = [
  {
    key: 'q1',
    text: 'Dans les douze derniers mois, vous est-il arrivé d’éviter un sujet politique avec un proche pour ne pas créer de tension ?',
    options: [
      { key: 'q1_c1', label: 'Jamais' },
      { key: 'q1_c2', label: 'Rarement' },
      { key: 'q1_c3', label: 'Parfois' },
      { key: 'q1_c4', label: 'Souvent' },
      { key: 'q1_c5', label: 'Très souvent' }
    ]
  },
  {
    key: 'q2',
    text: 'Vous est-il déjà arrivé de changer d’avis sur un sujet politique important à la suite d’une conversation ?',
    options: [
      { key: 'q2_c1', label: 'Jamais' },
      { key: 'q2_c2', label: 'Rarement' },
      { key: 'q2_c3', label: 'Parfois' },
      { key: 'q2_c4', label: 'Souvent' },
      { key: 'q2_c5', label: 'Très souvent' }
    ]
  },
  {
    // F2 (annexe B) reprend cette échelle à l'identique — voir la note là-bas.
    key: 'q3',
    text: 'Avez-vous déjà renoncé à dire ce que vous pensiez dans un groupe par crainte de la réaction ?',
    options: [
      { key: 'q3_c1', label: 'Jamais' },
      { key: 'q3_c2', label: 'Rarement' },
      { key: 'q3_c3', label: 'Parfois' },
      { key: 'q3_c4', label: 'Souvent' },
      { key: 'q3_c5', label: 'Très souvent' }
    ]
  },
  {
    // Q4 et Q6 alimentent l'algorithme d'affectation des îlots (spec §5).
    // Catégoriel, pas ordinal — voir la note en tête de fichier.
    key: 'q4',
    text: 'Quand vous entendez le mot « débat », qu’est-ce qui vous vient en premier ?',
    options: [
      { key: 'q4_c1', label: 'Un affrontement' },
      { key: 'q4_c2', label: 'Un échange utile' },
      { key: 'q4_c3', label: 'Un spectacle' },
      { key: 'q4_c4', label: 'Une perte de temps' },
      { key: 'q4_c5', label: 'Autre' }
    ]
  },
  {
    key: 'q5',
    text: 'Avez-vous le sentiment que votre voix compte dans les décisions politiques ?',
    options: [
      { key: 'q5_c1', label: 'Tout à fait' },
      { key: 'q5_c2', label: 'Plutôt oui' },
      { key: 'q5_c3', label: 'Je ne sais pas' },
      { key: 'q5_c4', label: 'Plutôt non' },
      { key: 'q5_c5', label: 'Pas du tout' }
    ]
  },
  {
    // Q4 et Q6 alimentent l'algorithme d'affectation des îlots (spec §5).
    key: 'q6',
    text: 'Connaissez-vous personnellement quelqu’un dont les convictions politiques sont très éloignées des vôtres, et avec qui vous discutez régulièrement ?',
    options: [
      { key: 'q6_c1', label: 'Personne' },
      { key: 'q6_c2', label: 'Oui, rarement' },
      { key: 'q6_c3', label: 'Oui, parfois' },
      { key: 'q6_c4', label: 'Oui, souvent' },
      { key: 'q6_c5', label: 'Oui, très souvent' }
    ]
  },
  {
    key: 'q7',
    text: 'Qu’est-ce qui vous a fait venir ce soir ?',
    options: [
      { key: 'q7_c1', label: 'La méthode' },
      { key: 'q7_c2', label: 'Le sujet' },
      { key: 'q7_c3', label: 'J’accompagne quelqu’un' },
      { key: 'q7_c4', label: 'Je veux contribuer au projet' },
      { key: 'q7_c5', label: 'La curiosité' }
    ]
  }
];

/* Consigne de rencontre (spec §6.2) : on tire Q2 ou Q6 et on affiche la
 * réponse donnée. Calculé côté client, rien n'est stocké. */
window.CONSIGNE_QUESTIONS = ['q2', 'q6'];

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
