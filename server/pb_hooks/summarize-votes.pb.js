/// <reference path="../pb_data/types.d.ts" />
//
// POST /api/summarize-votes   (auth : facilitators)
//
// Demande à Claude un court résumé des propositions sur lesquelles la salle
// est le plus d'accord, et l'écrit dans `session.text_summary` — d'où les
// trois surfaces le lisent déjà en temps réel via App.onSession (spec §3),
// sans plomberie supplémentaire.
//
// Le texte d'instruction envoyé au modèle vit à part, dans
// prompts/vote-summary.txt, pas ici : il doit pouvoir être modifié et
// itéré sans toucher au code. Il est relu à chaque appel — un édit fait
// directement sur le serveur (ssh + nano) s'applique donc sans redémarrer
// PocketBase, contrairement au reste de pb_hooks/.
//
// Clé API : ANTHROPIC_API_KEY, lue depuis l'environnement du service (voir
// pocketbase.service — EnvironmentFile). Jamais committée, jamais loggée.

routerAdd('POST', '/api/summarize-votes', function (e) {
  // Déclarées ICI et pas en tête de fichier : PocketBase exécute chaque
  // hook dans un pool de VM JS séparées, et un `var` de portée module n'est
  // pas fiable à l'intérieur du callback (constaté le 9 sept : ReferenceError
  // « TOP_N is not defined » alors que la ligne est bien plus haut dans le
  // même fichier). Portée-fonction uniquement, ici, pour tout le reste.
  var TOP_N = 5;                    // propositions envoyées au modèle
  var MODEL = 'claude-haiku-4-5';   // résumé court, tâche simple : pas besoin de plus
  var MAX_TOKENS = 500;

  // $os.readFile renvoie un []byte, exposé côté JS comme un tableau
  // d'entiers — pas une string. `readerToString` (voir la doc JSVM) attend
  // un io.Reader, pas ce tableau : passer l'un à l'autre échoue avec
  // « could not convert ... to io.Reader » (constaté le 9 sept). Décodage
  // UTF-8 fait à la main : le fichier de prompt contient des accents
  // français, donc pas question de mapper les octets un par un
  // (String.fromCharCode(...bytes) casserait tout multioctet).
  function utf8BytesToString(bytes) {
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var b0 = bytes[i++];
      if (b0 < 0x80) {
        out += String.fromCharCode(b0);
      } else if ((b0 & 0xE0) === 0xC0) {
        var b1 = bytes[i++];
        out += String.fromCharCode(((b0 & 0x1F) << 6) | (b1 & 0x3F));
      } else if ((b0 & 0xF0) === 0xE0) {
        var b1e = bytes[i++], b2e = bytes[i++];
        out += String.fromCharCode(((b0 & 0x0F) << 12) | ((b1e & 0x3F) << 6) | (b2e & 0x3F));
      } else if ((b0 & 0xF8) === 0xF0) {
        var b1f = bytes[i++], b2f = bytes[i++], b3f = bytes[i++];
        var cp = ((b0 & 0x07) << 18) | ((b1f & 0x3F) << 12) | ((b2f & 0x3F) << 6) | (b3f & 0x3F);
        cp -= 0x10000;
        out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      }
    }
    return out;
  }

  function dedupeById(rows) {
    var seen = {};
    var out = [];
    rows.forEach(function (r) {
      if (seen[r.id]) return;
      seen[r.id] = true;
      out.push(r);
    });
    return out;
  }

  var apiKey = $os.getenv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return e.json(500, { message: 'ANTHROPIC_API_KEY absente de l’environnement du serveur.' });
  }

  // PocketBase masque tout message d'erreur générique par défaut — sans ce
  // filet, un bug ici renvoie « Something went wrong » au client et rien du
  // tout dans journalctl (testé le 9 sept : aucune ligne pour un 400). On
  // rattrape donc tout, on logue côté serveur, et on renvoie le vrai message
  // (le statut d'une ApiError comme BadRequestError est préservé).
  try {
    // Recalculé à la main depuis `statements`/`votes`, PAS depuis la vue
    // `vote_results` : constaté le 9 sept que $app.findRecordsByFilter sur
    // cette vue renvoie bien les bonnes lignes (id, text) mais des colonnes
    // agrégées (agree/neutral/disagree, des SUM(CASE...) dans le SQL de la
    // vue) toujours à 0 — alors que la même vue est correcte via l'API REST
    // normale. Vraisemblablement une limite du binding DAO sur les colonnes
    // calculées d'une vue. Même filtre toujours-vrai que dans
    // assign-island.pb.js pour « pas de filtre ».
    //
    // limit=500 et dédoublonnage par id : trouvé le 10 sept dans
    // assign-matching.pb.js, findRecordsByFilter(..., 0, 0) peut renvoyer le
    // même enregistrement plusieurs fois (confirmé en transaction ; pas
    // revérifié hors transaction comme ici, mais le coût de se protéger
    // quand même est nul). Un vote en double fausserait le tally, un énoncé
    // en double apparaîtrait deux fois dans le résumé.
    var statements = dedupeById($app.findRecordsByFilter('statements', 'active = true', '', 500, 0));
    var votes = dedupeById($app.findRecordsByFilter('votes', 'value != "skip"', '', 500, 0));

    var tally = {};   // statement id -> { agree, neutral, disagree }
    votes.forEach(function (v) {
      var sid = v.getString('statement');
      var val = v.getString('value');
      if (val !== 'agree' && val !== 'neutral' && val !== 'disagree') return;
      if (!tally[sid]) tally[sid] = { agree: 0, neutral: 0, disagree: 0 };
      tally[sid][val]++;
    });

    var scored = statements.map(function (s) {
      var t = tally[s.id] || { agree: 0, neutral: 0, disagree: 0 };
      var n = t.agree + t.disagree;
      return {
        text: s.getString('text'),
        agree: t.agree, neutral: t.neutral, disagree: t.disagree,
        ratio: n ? t.agree / n : 0,
        n: n
      };
    }).filter(function (r) {
      return r.n > 0 && r.agree >= r.disagree;   // consensus D'ACCORD, pas rejet
    }).sort(function (a, b) {
      return b.ratio - a.ratio || b.n - a.n;
    }).slice(0, TOP_N);

    if (!scored.length) {
      throw new BadRequestError('Pas encore de votes à résumer.');
    }

    var promptPath = __hooks + '/prompts/vote-summary.txt';
    var instructions;
    try {
      instructions = utf8BytesToString($os.readFile(promptPath)).trim();
    } catch (readErr) {
      return e.json(500, { message: 'Prompt introuvable : ' + promptPath });
    }

    var lines = scored.map(function (r, i) {
      return (i + 1) + '. « ' + r.text + ' » — ' + r.agree + ' d’accord, ' +
        r.neutral + ' motus, ' + r.disagree + ' pas d’accord';
    });
    var userMessage = instructions + '\n\nPropositions :\n' + lines.join('\n');

    var res;
    try {
      res = $http.send({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        timeout: 30,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: userMessage }]
        })
      });
    } catch (httpErr) {
      return e.json(502, { message: 'Appel à l’API Anthropic échoué : ' + httpErr });
    }

    if (res.statusCode !== 200 || !res.json) {
      var apiMsg = res.json && res.json.error && res.json.error.message;
      return e.json(502, {
        message: 'Anthropic a répondu ' + res.statusCode + (apiMsg ? ' — ' + apiMsg : '') +
          (apiMsg ? '' : ' — corps : ' + res.raw)
      });
    }

    var block = (res.json.content || []).filter(function (b) { return b.type === 'text'; })[0];
    var summary = block && block.text ? block.text.trim() : '';
    if (!summary) {
      return e.json(502, { message: 'Réponse Anthropic sans texte exploitable.' });
    }

    var session = $app.findFirstRecordByFilter('session', 'key = "main"');
    session.set('text_summary', summary);
    $app.save(session);

    return e.json(200, { summary: summary });
  } catch (err) {
    var status = (err && err.status) || 500;
    var message = (err && err.message) || String(err);
    console.error('summarize-votes:', message, err && err.stack);
    return e.json(status, { message: message });
  }
}, $apis.requireAuth('facilitators'));
