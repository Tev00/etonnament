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
// d'update de `participants` reste fermée au participant, sans quoi chacun
// choisirait son îlot.

routerAdd('POST', '/api/assign-island', function (e) {
  var participant = e.auth;
  if (!participant) {
    return e.json(401, { message: 'authentification requise' });
  }

  var result = null;

  $app.runInTransaction(function (txApp) {
    // Relire le participant dans la transaction : entre sa requête et ici,
    // la régie a pu le déplacer à la main.
    var me = txApp.findRecordById('participants', participant.id);

    // Idempotent : réappuyer sur le bouton ne rebat pas les cartes.
    var already = me.getInt('island');
    if (already > 0) {
      result = { island: already, assigned: false };
      return;
    }

    var session = txApp.findFirstRecordByFilter('session', 'key = "main"');
    var islandsCount = session.getInt('islands_count');
    if (islandsCount < 1) {
      throw new BadRequestError('islands_count vaut ' + islandsCount + ' : aucun îlot ouvert.');
    }

    // --- réponses Q4 et Q6, qui portent la diversité recherchée -------------
    var answers = txApp.findRecordsByFilter(
      'entry_answers', 'question = "q4" || question = "q6"', '', 0, 0
    );

    var byParticipant = {};       // id -> { q4, q6 }
    for (var i = 0; i < answers.length; i++) {
      var a = answers[i];
      var pid = a.getString('participant');
      if (!byParticipant[pid]) byParticipant[pid] = {};
      byParticipant[pid][a.getString('question')] = a.getString('choice');
    }
    var mine = byParticipant[me.id] || {};

    // --- composition actuelle des îlots ------------------------------------
    var members = txApp.findRecordsByFilter('participants', 'island > 0', '', 0, 0);

    var size = {}, same4 = {}, same6 = {};
    for (var n = 1; n <= islandsCount; n++) { size[n] = 0; same4[n] = 0; same6[n] = 0; }

    for (var m = 0; m < members.length; m++) {
      var mem = members[m];
      var isl = mem.getInt('island');
      if (isl < 1 || isl > islandsCount) continue;   // îlot fermé depuis
      size[isl]++;
      var ans = byParticipant[mem.id] || {};
      if (mine.q4 && ans.q4 === mine.q4) same4[isl]++;
      if (mine.q6 && ans.q6 === mine.q6) same6[isl]++;
    }

    var minSize = Infinity;
    for (var s = 1; s <= islandsCount; s++) minSize = Math.min(minSize, size[s]);

    // --- score : équilibrage d'abord, diversité ensuite ---------------------
    // excess est pondéré 10 contre 2 : un îlot en retard se remplit avant
    // qu'on optimise la diversité. Poids à régler à la répétition, pas en
    // théorie (spec §5).
    var best = [], bestScore = Infinity;
    for (var k = 1; k <= islandsCount; k++) {
      var score = 2 * same4[k] + 2 * same6[k] + 10 * (size[k] - minSize);
      if (score < bestScore) { bestScore = score; best = [k]; }
      else if (score === bestScore) { best.push(k); }
    }

    // Égalité : le moins rempli, puis au hasard.
    var leastFilled = best.filter(function (x) {
      return size[x] === Math.min.apply(null, best.map(function (y) { return size[y]; }));
    });
    var chosen = leastFilled[Math.floor(Math.random() * leastFilled.length)];

    me.set('island', chosen);
    txApp.save(me);

    result = { island: chosen, assigned: true };
  });

  return e.json(200, result);
}, $apis.requireAuth('participants'));
