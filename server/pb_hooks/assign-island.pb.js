/// <reference path="../pb_data/types.d.ts" />
//
// POST /api/assign-island   (auth : participant)
//
// Affecte un îlot au participant authentifié et renvoie { island: N }.
//
// Pourquoi côté serveur : deux personnes qui terminent la mission à la même
// seconde liraient, côté client, la même composition d'îlots et se verraient
// attribuer le même numéro. Ici tout se passe dans une transaction, et les
// compositions sont relues À L'INTÉRIEUR de celle-ci (spec §5).
//
// Écrit `island` via le DAO, qui contourne les règles d'API : la règle
// d'update de `participants` doit rester fermée au participant, sans quoi
// chacun choisit son îlot.
//
// ⚠️ Vérifié le 8 septembre : elle ne l'était PAS. Un participant pouvait
// s'attribuer l'îlot de son choix d'un appel, ce qui vide l'algorithme
// ci-dessous de son sens. La règle attendue est :
//
//     update : @request.auth.collectionName = "facilitators"
//
// Ce hook écrit donc aussi `entry_done`, qui était jusque-là écrit par le
// client — c'était la seule raison de laisser la règle ouverte.

routerAdd('POST', '/api/assign-island', function (e) {
  var participant = e.auth;
  if (!participant) {
    return e.json(401, { message: 'authentification requise' });
  }

  // Les deux clés ci-dessous nourrissent la dimension « diversité » du score
  // (voir plus bas) : deux personnes ayant répondu pareil à L'UNE OU L'AUTRE
  // de ces deux questions sont pénalisées pour atterrir dans le même îlot.
  // Pointent vers `shared/questions.js` — si ce fichier change de contenu
  // (ce qui s'est déjà produit une fois, le 12 oct., en passant de q4/q6 à
  // ces deux-là), modifier UNIQUEMENT ces deux constantes, rien d'autre
  // ci-dessous. N'importe quelle question à choix (pas à curseur) convient :
  // l'algorithme ne compare les réponses qu'en égalité stricte de clé.
  // ⚠️ Déclarées ICI, à l'intérieur du handler, et pas en tête de fichier :
  // un `var` de portée module n'est pas fiablement visible depuis l'intérieur
  // d'un callback `routerAdd` (architecture à VMs pré-chargées de PocketBase
  // — voir le hook assign-matching pour le même piège, déjà rencontré).
  var DIVERSITY_Q_A = 'p1_1';
  var DIVERSITY_Q_B = 'p1_4';

  var result = null;

  $app.runInTransaction(function (txApp) {
    // Relire le participant dans la transaction : entre sa requête et ici,
    // la régie a pu le déplacer à la main.
    var me = txApp.findRecordById('participants', participant.id);

    // Idempotent : réappuyer sur le bouton ne rebat pas les cartes.
    var already = me.getInt('island');
    if (already > 0) {
      // …mais on confirme la fin de mission : un participant peut avoir été
      // placé à la main par la régie avant d'avoir fini de répondre.
      if (!me.getBool('entry_done')) {
        me.set('entry_done', true);
        txApp.save(me);
      }
      result = { island: already, assigned: false };
      return;
    }

    var session = txApp.findFirstRecordByFilter('session', 'key = "main"');
    var islandsCount = session.getInt('islands_count');
    if (islandsCount < 1) {
      throw new BadRequestError('islands_count vaut ' + islandsCount + ' : aucun îlot ouvert.');
    }

    // --- réponses aux deux questions qui portent la diversité recherchée ----
    // limit=500 et pas 0 : trouvé le 10 sept dans assign-matching.pb.js,
    // txApp.findRecordsByFilter(..., 0, 0) À L'INTÉRIEUR d'une transaction
    // peut renvoyer le même enregistrement plusieurs fois. Sans effet ici
    // (même clé réécrite sur elle-même), mais `members` juste en dessous
    // fait des size[isl]++ — un doublon y fausserait le compte pour de vrai.
    // Même limite explicite aux deux, par cohérence.
    var answers = txApp.findRecordsByFilter(
      'entry_answers',
      'question = "' + DIVERSITY_Q_A + '" || question = "' + DIVERSITY_Q_B + '"',
      '', 500, 0
    );

    var byParticipant = {};       // id -> { [DIVERSITY_Q_A]: choix, [DIVERSITY_Q_B]: choix }
    for (var i = 0; i < answers.length; i++) {
      var a = answers[i];
      var pid = a.getString('participant');
      if (!byParticipant[pid]) byParticipant[pid] = {};
      byParticipant[pid][a.getString('question')] = a.getString('choice');
    }
    var mine = byParticipant[me.id] || {};

    // --- composition actuelle des îlots ------------------------------------
    var rawMembers = txApp.findRecordsByFilter('participants', 'island > 0', '', 500, 0);
    var seenMembers = {};
    var members = [];
    rawMembers.forEach(function (r) {
      if (seenMembers[r.id]) return;
      seenMembers[r.id] = true;
      members.push(r);
    });

    var size = {}, sameA = {}, sameB = {};
    for (var n = 1; n <= islandsCount; n++) { size[n] = 0; sameA[n] = 0; sameB[n] = 0; }

    for (var m = 0; m < members.length; m++) {
      var mem = members[m];
      var isl = mem.getInt('island');
      if (isl < 1 || isl > islandsCount) continue;   // îlot fermé depuis
      size[isl]++;
      var ans = byParticipant[mem.id] || {};
      if (mine[DIVERSITY_Q_A] && ans[DIVERSITY_Q_A] === mine[DIVERSITY_Q_A]) sameA[isl]++;
      if (mine[DIVERSITY_Q_B] && ans[DIVERSITY_Q_B] === mine[DIVERSITY_Q_B]) sameB[isl]++;
    }

    var minSize = Infinity;
    for (var s = 1; s <= islandsCount; s++) minSize = Math.min(minSize, size[s]);

    // --- score : équilibrage d'abord, diversité ensuite ---------------------
    // excess est pondéré 10 contre 2 : un îlot en retard se remplit avant
    // qu'on optimise la diversité. Poids à régler à la répétition, pas en
    // théorie (spec §5).
    var best = [], bestScore = Infinity;
    for (var k = 1; k <= islandsCount; k++) {
      var score = 2 * sameA[k] + 2 * sameB[k] + 10 * (size[k] - minSize);
      if (score < bestScore) { bestScore = score; best = [k]; }
      else if (score === bestScore) { best.push(k); }
    }

    // Égalité : le moins rempli, puis au hasard.
    var leastFilled = best.filter(function (x) {
      return size[x] === Math.min.apply(null, best.map(function (y) { return size[y]; }));
    });
    var chosen = leastFilled[Math.floor(Math.random() * leastFilled.length)];

    me.set('island', chosen);
    // `entry_done` alimente la vue participant_count, donc le « 34 sur 58 »
    // projeté. Écrit ici, côté serveur, il ne dépend plus d'une règle d'API
    // ouverte au participant.
    me.set('entry_done', true);
    txApp.save(me);

    result = { island: chosen, assigned: true };
  });

  return e.json(200, result);
}, $apis.requireAuth('participants'));
