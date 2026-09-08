/* Étonnamment d'accord — annexe A : mission d'entrée.
 *
 * Les libellés vivent ici et NON en base : la base ne stocke que des clés
 * (`q4_c2`), ce qui permet de corriger une faute de frappe le soir même sans
 * toucher aux réponses déjà enregistrées (spec §1.2).
 *
 * Ne jamais réutiliser ni renuméroter une clé après le début de l'événement :
 * les réponses déjà en base pointeraient sur un autre libellé.
 */
window.QUESTIONS = [
  {
    key: 'q1',
    text: 'Dans les douze derniers mois, vous est-il arrivé d’éviter un sujet politique avec un proche pour ne pas créer de tension ?',
    options: [
      { key: 'q1_c1', label: 'Souvent' },
      { key: 'q1_c2', label: 'Une fois ou deux' },
      { key: 'q1_c3', label: 'Jamais' }
    ]
  },
  {
    key: 'q2',
    text: 'Vous est-il déjà arrivé de changer d’avis sur un sujet politique important à la suite d’une conversation ?',
    options: [
      { key: 'q2_c1', label: 'Oui' },
      { key: 'q2_c2', label: 'Non' },
      { key: 'q2_c3', label: 'Je ne sais pas' }
    ]
  },
  {
    key: 'q3',
    text: 'Avez-vous déjà renoncé à dire ce que vous pensiez dans un groupe par crainte de la réaction ?',
    options: [
      { key: 'q3_c1', label: 'Oui' },
      { key: 'q3_c2', label: 'Non' }
    ]
  },
  {
    // Q4 et Q6 alimentent l'algorithme d'affectation des îlots (spec §5).
    key: 'q4',
    text: 'Quand vous entendez le mot « débat », qu’est-ce qui vous vient en premier ?',
    options: [
      { key: 'q4_c1', label: 'Un affrontement' },
      { key: 'q4_c2', label: 'Un échange utile' },
      { key: 'q4_c3', label: 'Un spectacle' },
      { key: 'q4_c4', label: 'Autre' }
    ]
  },
  {
    key: 'q5',
    text: 'Avez-vous le sentiment que votre voix compte dans les décisions politiques ?',
    options: [
      { key: 'q5_c1', label: 'Oui' },
      { key: 'q5_c2', label: 'Plutôt non' },
      { key: 'q5_c3', label: 'Pas du tout' }
    ]
  },
  {
    key: 'q6',
    text: 'Connaissez-vous personnellement quelqu’un dont les convictions politiques sont très éloignées des vôtres, et avec qui vous discutez régulièrement ?',
    options: [
      { key: 'q6_c1', label: 'Oui' },
      { key: 'q6_c2', label: 'Non' }
    ]
  },
  {
    key: 'q7',
    text: 'Qu’est-ce qui vous a fait venir ce soir ?',
    options: [
      { key: 'q7_c1', label: 'La méthode' },
      { key: 'q7_c2', label: 'Le sujet' },
      { key: 'q7_c3', label: 'J’accompagne quelqu’un' },
      { key: 'q7_c4', label: 'Je veux contribuer au projet' }
    ]
  }
];

/* Consigne de rencontre (spec §6.2) : on tire Q2 ou Q6 et on affiche la
 * réponse donnée. Calculé côté client, rien n'est stocké. */
window.CONSIGNE_QUESTIONS = ['q2', 'q6'];

/* ---------------------------------------------------------------------------
 * Annexe B : questionnaire de clôture.
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
 * Les clés sont désormais figées — au 8 septembre la collection `feedback` est
 * vide, c'était donc le dernier moment pour les renuméroter.
 */
window.FEEDBACK = [
  {
    // Donnée neuve : la mission d'entrée ne demande rien sur la surprise.
    key: 'f1',
    type: 'choice',
    text: 'Ce soir, avez-vous entendu un point de vue qui vous a surpris ?',
    options: [
      { key: 'f1_c1', label: 'Oui, plusieurs' },
      { key: 'f1_c2', label: 'Oui, un' },
      { key: 'f1_c3', label: 'Non' }
    ]
  },
  {
    /* Miroir de Q3 — « Avez-vous déjà renoncé à dire ce que vous pensiez dans
     * un groupe par crainte de la réaction ? ». Posée à l'arrivée et au
     * départ, c'est la seule paire du questionnaire qui autorise un
     * avant/après sur la même personne. */
    key: 'f2',
    type: 'choice',
    text: 'Ce soir, avez-vous pu dire ce que vous pensiez, sans vous retenir ?',
    options: [
      { key: 'f2_c1', label: 'Oui' },
      { key: 'f2_c2', label: 'En partie' },
      { key: 'f2_c3', label: 'Non' }
    ]
  },
  {
    key: 'f3',
    type: 'text',
    text: 'Qu’est-ce qui a le mieux marché, selon vous ?',
    placeholder: 'Une ligne suffit.',
    max: 400
  },
  {
    key: 'f4',
    type: 'text',
    text: 'Qu’est-ce qui a coincé ?',
    placeholder: 'Même une petite chose.',
    max: 400
  },
  {
    /* Deux questions en une dans le déroulé — « revenir » ET « amener
     * quelqu'un ». En choix fermé plutôt qu'en texte libre : c'est le
     * chiffre qu'on citera pour décider s'il y a une prochaine soirée. Les
     * options gardent les deux idées distinctes. */
    key: 'f5',
    type: 'choice',
    text: 'Seriez-vous prêt·e à revenir, ou à amener quelqu’un ?',
    options: [
      { key: 'f5_c1', label: 'Oui, et j’amènerais quelqu’un' },
      { key: 'f5_c2', label: 'Oui, je reviendrais' },
      { key: 'f5_c3', label: 'Peut-être' },
      { key: 'f5_c4', label: 'Non' }
    ]
  },
  {
    key: 'f6',
    type: 'text',
    text: 'Qu’est-ce que vous diriez à quelqu’un pour l’inviter au prochain débat ?',
    placeholder: 'Vos mots à vous — ce sont les meilleurs pour inviter.',
    max: 500
  }
];
