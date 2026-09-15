/// <reference path="../pb_data/types.d.ts" />
//
// POST /api/assign-matching   (auth : facilitators)
//
// Appaire les participants pour l'activité de rencontre du stage
// « consigne » : mélange, forme des paires, et écrit une couleur + un code à
// 6 caractères partagés sur les DEUX enregistrements `participants` de
// chaque paire. Pas de collection à part — deux champs de plus sur
// `participants` suffisent, et il n'y a pas d'étape de confirmation : les
// participants se trouvent dans la salle, un point c'est tout, la régie
// règle les orphelins de vive voix si besoin.
//
// ⚠️ INCRÉMENTAL, exprès (corrigé le 10 sept — plusieurs participants
// restaient sans paire lors du vrai événement). Ne touche QUE les
// participants sans `pair_color` : tout le monde ne finit pas la mission
// d'entrée à la même seconde, donc la régie appuie forcément sur ce bouton
// plus d'une fois pendant la phase. La version précédente relisait TOUS les
// `entry_done = true` à chaque appel et rebattait tout le monde, y compris
// ceux déjà appariés — un second clic changeait la couleur de gens déjà
// appariés sans que leur téléphone le sache forcément (SSE coupé, écran
// verrouillé, wifi de salle…), qui se retrouvaient à tenir une couleur que
// plus personne d'autre ne portait. Indiscernable de « jamais apparié ».
// Rejouer ce hook est maintenant sûr à volonté : il ne fait qu'ajouter les
// nouveaux arrivants aux paires, jamais rebattre les anciennes.
//
// Nombre impair : le dernier tiré ne reçoit ni couleur ni code plutôt qu'une
// couleur que personne d'autre ne porte — ça le laisserait chercher un match
// qui n'existe pas. Il reste candidat pour l'appel suivant (toujours sans
// `pair_color`), donc un impair ponctuel se résorbe tout seul dès qu'une
// personne de plus finit la mission. L'app participant lui montre un écran
// d'attente en attendant, et le roster régie le montre à part.

routerAdd('POST', '/api/assign-matching', function (e) {
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I/L

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    var toHex = function (v) {
      var s2 = Math.round((v + m) * 255).toString(16);
      return s2.length === 1 ? '0' + s2 : s2;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  // Teinte répartie uniformément sur le cercle chromatique (360/n : le
  // maximum possible pour l'écart minimal entre deux teintes). Luminosité
  // toujours dans 34-56% pour que le texte blanc reste lisible dessus quelle
  // que soit la teinte — pas de calcul de contraste par couleur, la plage
  // est choisie pour marcher dans tous les cas.
  //
  // Saturation (période 4) et luminosité (période 5) varient largement en
  // plus de la teinte, PAS juste pour faire joli : à 35 couleurs, la teinte
  // seule ne suffit pas — l'écart minimal (360/35 ≈ 10°) confond deux
  // teintes voisines sous l'éclairage d'une salle, et le renvoi de teinte
  // *boucle* (couleur 35 est à ~10° de la couleur 1, pas à 360°). Testé le 9
  // sept avec des cycles courts (période 2/3) : la paire de bouclage
  // ressortait quasi identique — même luminosité, saturations à 8 points
  // d'écart. Périodes 4 et 5 n'ont pas de diviseur commun avec 35 qui
  // recréerait le même problème, et l'écart de luminosité au point de
  // bouclage passe de quasi nul à 20 points. Le code à 6 caractères reste le
  // recours définitif, pas ce calcul (spec).
  function generatePalette(n) {
    var colors = [];
    for (var k = 0; k < n; k++) {
      var hue = Math.round((360 / n) * k);
      var sat = 55 + (k % 4) * 12;     // 55 / 67 / 79 / 91
      var light = 34 + (k % 5) * 5.5;  // 34 / 39.5 / 45 / 50.5 / 56
      colors.push(hslToHex(hue, sat, light));
    }
    return colors;
  }

  function generateCodes(n) {
    var seen = {};
    var out = [];
    while (out.length < n) {
      var code = '';
      for (var i = 0; i < 6; i++) {
        code += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
      }
      if (seen[code]) continue;
      seen[code] = true;
      out.push(code);
    }
    return out;
  }

  try {
    var result = null;

    // Lu ET écrit DANS la même transaction, pas avant : deux appels qui se
    // chevauchent (régie qui reclique pendant qu'un premier appel tourne
    // encore) ne doivent pas lire la même liste de candidats avant que l'un
    // des deux n'écrive, sinon ils appairent différemment les mêmes
    // personnes et on retombe dans le bug qu'on corrige. Trouvé le 10 sept
    // en vérifiant le correctif ci-dessus sur données réelles : lire les
    // candidats AVANT la transaction (comme la première version de ce
    // correctif le faisait encore) a laissé des gens orphelins même avec la
    // logique incrémentale. Même remède qu'assign-island.pb.js pour la même
    // raison — voir son commentaire sur la relecture à l'intérieur.
    $app.runInTransaction(function (txApp) {
      // Seuls les gens SANS couleur sont candidats — ceux déjà appariés
      // (run précédent, ou déjà traités plus haut dans cette même
      // transaction s'il y en avait deux) ne sont ni relus, ni resauvegardés.
      //
      // limit=500 et PAS 0 : trouvé le 10 sept, avec limit=0 (« pas de
      // limite », le même idiome utilisé partout ailleurs dans ce dépôt —
      // assign-island.pb.js compris) txApp.findRecordsByFilter() À
      // L'INTÉRIEUR d'une transaction renvoyait parfois le même
      // enregistrement plusieurs fois. Chaque doublon repassait par
      // set()+save(), donc la dernière occurrence d'une personne écrasait
      // sa propre paire déjà posée par une occurrence précédente,
      // laissant son vrai partenaire orphelin. 500 est très au-dessus de
      // tout effectif réel et évite quel que soit le chemin interne bogué
      // pour limit=0. Dédoublonnage par id ci-dessous en plus, en filet —
      // le vrai correctif est la limite explicite, mais autant ne pas
      // dépendre uniquement de l'avoir bien comprise.
      var raw = txApp.findRecordsByFilter(
        'participants', 'entry_done = true && pair_color = ""', '', 500, 0
      );
      var seen = {};
      var newcomers = [];
      raw.forEach(function (r) {
        if (seen[r.id]) return;
        seen[r.id] = true;
        newcomers.push(r);
      });

      // Fisher-Yates : l'appariement doit être imprévisible, pas juste
      // l'ordre d'arrivée en base (qui grouperait les gens venus ensemble).
      for (var i = newcomers.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = newcomers[i]; newcomers[i] = newcomers[j]; newcomers[j] = tmp;
      }

      var n = newcomers.length;
      var pairCount = Math.floor(n / 2);   // pas Math.ceil : le surnombre reste sans couleur, exprès

      var palette = generatePalette(Math.max(pairCount, 1));
      var codes = generateCodes(Math.max(pairCount, 1));

      for (var p = 0; p < pairCount; p++) {
        var a = newcomers[p * 2];
        var b = newcomers[p * 2 + 1];
        var color = palette[p];
        var code = codes[p];

        a.set('pair_color', color);
        a.set('pair_code', code);
        txApp.save(a);

        b.set('pair_color', color);
        b.set('pair_code', code);
        txApp.save(b);
      }

      result = { new_pairs: pairCount, newly_matched: pairCount * 2, still_unmatched: n - pairCount * 2 };
    });

    // matching_view reste "searching" pour ceux déjà en train de chercher,
    // jamais rétrogradé même si cet appel n'a apparié personne de neuf.
    var session = $app.findFirstRecordByFilter('session', 'key = "main"');
    session.set('matching_view', 'searching');
    $app.save(session);

    return e.json(200, result);
  } catch (err) {
    var status = (err && err.status) || 500;
    var message = (err && err.message) || String(err);
    console.error('assign-matching:', message, err && err.stack);
    return e.json(status, { message: message });
  }
}, $apis.requireAuth('facilitators'));
