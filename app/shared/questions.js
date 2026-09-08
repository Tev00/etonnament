/* Étonnamment d'accord — annexe A : mission d'entrée.
 *
 * Les libellés vivent ici et NON en base : la base ne stocke que des clés
 * (`q4_c2`), ce qui permet de corriger une faute de frappe le soir même sans
 * toucher aux réponses déjà enregistrées (spec §1.2).
 *
 * Ne jamais réutiliser ni renuméroter une clé après le début de l'événement :
 * les réponses déjà en base pointeraient sur un autre libellé.
 */
window.QUESTIONS = [
  {
    key: 'q1',
    text: 'Dans les douze derniers mois, vous est-il arrivé d’éviter un sujet politique avec un proche pour ne pas créer de tension ?',
    options: [
      { key: 'q1_c1', label: 'Souvent' },
      { key: 'q1_c2', label: 'Une fois ou deux' },
      { key: 'q1_c3', label: 'Jamais' }
    ]
  },
  {
    key: 'q2',
    text: 'Vous est-il déjà arrivé de changer d’avis sur un sujet politique important à la suite d’une conversation ?',
    options: [
      { key: 'q2_c1', label: 'Oui' },
      { key: 'q2_c2', label: 'Non' },
      { key: 'q2_c3', label: 'Je ne sais pas' }
    ]
  },
  {
    key: 'q3',
    text: 'Avez-vous déjà renoncé à dire ce que vous pensiez dans un groupe par crainte de la réaction ?',
    options: [
      { key: 'q3_c1', label: 'Oui' },
      { key: 'q3_c2', label: 'Non' }
    ]
  },
  {
    // Q4 et Q6 alimentent l'algorithme d'affectation des îlots (spec §5).
    key: 'q4',
    text: 'Quand vous entendez le mot « débat », qu’est-ce qui vous vient en premier ?',
    options: [
      { key: 'q4_c1', label: 'Un affrontement' },
      { key: 'q4_c2', label: 'Un échange utile' },
      { key: 'q4_c3', label: 'Un spectacle' },
      { key: 'q4_c4', label: 'Autre' }
    ]
  },
  {
    key: 'q5',
    text: 'Avez-vous le sentiment que votre voix compte dans les décisions politiques ?',
    options: [
      { key: 'q5_c1', label: 'Oui' },
      { key: 'q5_c2', label: 'Plutôt non' },
      { key: 'q5_c3', label: 'Pas du tout' }
    ]
  },
  {
    key: 'q6',
    text: 'Connaissez-vous personnellement quelqu’un dont les convictions politiques sont très éloignées des vôtres, et avec qui vous discutez régulièrement ?',
    options: [
      { key: 'q6_c1', label: 'Oui' },
      { key: 'q6_c2', label: 'Non' }
    ]
  },
  {
    key: 'q7',
    text: 'Qu’est-ce qui vous a fait venir ce soir ?',
    options: [
      { key: 'q7_c1', label: 'La méthode' },
      { key: 'q7_c2', label: 'Le sujet' },
      { key: 'q7_c3', label: 'J’accompagne quelqu’un' },
      { key: 'q7_c4', label: 'Je veux contribuer au projet' }
    ]
  }
];

/* Consigne de rencontre (spec §6.2) : on tire Q2 ou Q6 et on affiche la
 * réponse donnée. Calculé côté client, rien n'est stocké. */
window.CONSIGNE_QUESTIONS = ['q2', 'q6'];

/* ---------------------------------------------------------------------------
 * Annexe B : questionnaire de clôture.
 *
 * ⚠️ LIBELLÉS À VALIDER. L'annexe B du déroulé n'existe pas encore dans le
 * dépôt : ces cinq questions sont une proposition, pas le texte arrêté.
 * Les remplacer ici suffit — rien n'est en base, et `feedback.answers` est un
 * json indexé par ces clés. En revanche, ne pas RENUMÉROTER les clés après le
 * début de la soirée : des réponses déjà envoyées pointeraient ailleurs.
 *
 * F1 et F3 font écho à Q1 et Q3 de la mission d'entrée. C'est délibéré : les
 * poser deux fois, à l'arrivée et au départ, est le seul moyen de mesurer un
 * déplacement au cours de la soirée plutôt qu'un état à la fin.
 *
 * `type: 'text'` = réponse libre courte. Une seule, en dernier (spec §1.6) :
 * à 21h15 les gens partent, un questionnaire qui se lit d'un écran se remplit,
 * un questionnaire qui défile s'abandonne.
 */
window.FEEDBACK = [
  {
    key: 'f1',
    type: 'choice',
    text: 'Ce soir, avez-vous entendu un point de vue qui vous a surpris ?',
    options: [
      { key: 'f1_c1', label: 'Oui, plusieurs' },
      { key: 'f1_c2', label: 'Oui, un' },
      { key: 'f1_c3', label: 'Non' }
    ]
  },
  {
    key: 'f2',
    type: 'choice',
    text: 'Avez-vous parlé avec quelqu’un que vous n’auriez pas abordé ailleurs ?',
    options: [
      { key: 'f2_c1', label: 'Oui' },
      { key: 'f2_c2', label: 'Non' }
    ]
  },
  {
    key: 'f3',
    type: 'choice',
    text: 'Avez-vous pu dire ce que vous pensiez, sans vous retenir ?',
    options: [
      { key: 'f3_c1', label: 'Oui' },
      { key: 'f3_c2', label: 'En partie' },
      { key: 'f3_c3', label: 'Non' }
    ]
  },
  {
    key: 'f4',
    type: 'choice',
    text: 'Reviendriez-vous à une soirée de ce genre ?',
    options: [
      { key: 'f4_c1', label: 'Oui' },
      { key: 'f4_c2', label: 'Peut-être' },
      { key: 'f4_c3', label: 'Non' }
    ]
  },
  {
    key: 'f5',
    type: 'text',
    text: 'Une phrase à nous laisser ?',
    placeholder: 'Ce qui vous a marqué, ce qui a manqué…',
    max: 400
  }
];
