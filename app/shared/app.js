/* Étonnamment d'accord — module partagé par les trois surfaces.
 *
 * Rôle unique à ce stade : connaître l'état de `session` et prévenir la page
 * quand il change. Rien d'autre. Voir docs/app-spec.md §9 étape 1.
 *
 * Charger APRÈS pocketbase.umd.js :
 *   <script src="shared/pocketbase.umd.js"></script>
 *   <script src="shared/app.js"></script>
 */
(function (global) {
  'use strict';

  // En production, l'API est servie par la même origine que la page : pas de
  // CORS, et l'app suit le domaine sur lequel elle est déployée.
  //
  // En dev (localhost), il n'y a pas de PocketBase local : on vise l'instance
  // Scaleway, qui renvoie `Access-Control-Allow-Origin: *`.
  //
  // ⚠️ Conséquence : depuis localhost, on écrit dans la BASE DE PRODUCTION.
  // Bouger un `stage` en dev change ce que la projection affiche dans la salle.
  // `App.isDev` sert à afficher un bandeau pour qu'on ne l'oublie jamais.
  var isDev = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(global.location.hostname);
  var API_BASE = isDev ? 'https://app.etonnamment.fr' : global.location.origin;

  var pb = new PocketBase(API_BASE);

  /* La régie et le participant peuvent tourner dans le MÊME navigateur (le
   * facilitateur teste sur son téléphone, puis ouvre la régie). Avec le
   * magasin par défaut, les deux jetons s'écrasent : la régie déconnecte le
   * participant, et inversement. On donne donc à la régie sa propre clé de
   * localStorage.
   *
   * Le build UMD n'exporte pas LocalAuthStore ; on récupère la classe depuis
   * une instance. Moins joli qu'un import, mais sans dépendance ajoutée. */
  function separateStore(key) {
    var probe = new PocketBase(API_BASE);
    var LocalAuthStore = Object.getPrototypeOf(probe.authStore).constructor;
    return new LocalAuthStore(key);
  }

  // Sans ça, deux requêtes concurrentes sur la même collection s'annulent
  // mutuellement — comportement par défaut du SDK, piège classique.
  pb.autoCancellation(false);

  var SESSION_KEY = 'main';

  // Dernier état connu. On ne le remet JAMAIS à null en cas de panne réseau :
  // la projection doit continuer d'afficher les derniers chiffres connus
  // plutôt qu'une page blanche (spec §7).
  var session = null;

  var listeners = new Set();
  var statusListeners = new Set();

  // 'connecting' | 'live' | 'offline'
  var status = 'connecting';

  function setStatus(next) {
    if (status === next) return;
    status = next;
    statusListeners.forEach(function (fn) {
      try { fn(status); } catch (e) { console.error(e); }
    });
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(session); } catch (e) { console.error(e); }
    });
  }

  function adopt(record) {
    if (!record || record.key !== SESSION_KEY) return;
    session = record;
    setStatus('live');
    emit();
  }

  function fetchSession() {
    return pb.collection('session')
      .getFirstListItem('key="' + SESSION_KEY + '"', { requestKey: null })
      .then(function (record) {
        adopt(record);
        return record;
      });
  }

  /* Le SSE est la voie normale. Mais une connexion SSE peut mourir sans que le
   * navigateur s'en aperçoive (wifi de salle, portail captif, veille du
   * téléphone) : l'abonnement paraît vivant et plus rien n'arrive. Un GET lent
   * en parallèle coûte une requête toutes les 15 s et transforme cette panne
   * silencieuse — la pire le soir même — en simple retard de 15 s. */
  var POLL_MS = 15000;

  function startPolling() {
    setInterval(function () {
      fetchSession().then(function () {
        // Le réseau répond : c'est le moment de vider la file.
        flushQueue();
        // …et de rattraper une vue dont l'abonnement se serait tu.
        viewReloaders.forEach(function (reload) { reload(); });
      }).catch(function () {
        // Réseau coupé : on le signale, mais on garde `session` intact.
        setStatus('offline');
      });
    }, POLL_MS);

    // Le navigateur sait souvent avant nous que le wifi est revenu.
    global.addEventListener('online', function () { flushQueue(); });
  }

  /* Depuis localhost on écrit en production. Un bandeau non dissimulable, sur
   * les trois surfaces, vaut mieux qu'une note dans un README qu'on relira
   * après avoir déplacé le stage pendant l'événement. */
  function devBanner() {
    if (!isDev) return;
    var el = document.createElement('div');
    el.textContent = 'DEV → écrit dans la base de PRODUCTION (' + API_BASE + ')';
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:100;' +
      'background:#B23A2B;color:#fff;font:600 13px/1.4 system-ui,sans-serif;' +
      'text-align:center;padding:6px 12px;letter-spacing:.03em';
    document.body.appendChild(el);
  }

  function start() {
    devBanner();

    fetchSession().catch(function (err) {
      console.error('session initiale illisible', err);
      setStatus('offline');
    });

    // Le SDK gère seul la reconnexion SSE et le renvoi des abonnements.
    pb.collection('session').subscribe('*', function (e) {
      if (e.action === 'update' || e.action === 'create') adopt(e.record);
    }).catch(function (err) {
      /* Le SSE a échoué, mais le GET de secours continue de tourner : on est
       * dégradé (15 s de latence), pas hors ligne. Afficher « connexion
       * perdue » ici ferait paniquer la salle alors que tout fonctionne.
       * Seul un GET en échec fait passer le statut à 'offline'. */
      console.warn('temps réel indisponible — repli sur le GET périodique', err);
    });

    startPolling();
  }

  /* ---------------------------------------------------------------------
   * Identité anonyme
   *
   * Aucun email, aucun mot de passe saisi. On génère les deux, on crée le
   * compte, et on garde les identifiants en localStorage pour se
   * réauthentifier si le token expire ou si l'onglet est rouvert.
   *
   * Ce mot de passe n'est pas un secret : c'est un jeton de continuité
   * (spec §8). Ne jamais y attacher quoi que ce soit de sensible.
   * ------------------------------------------------------------------- */
  var ID_KEY = 'etonnamment.identity';

  function randomString(len) {
    var alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var bytes = new Uint32Array(len);
    global.crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function readIdentity() {
    try { return JSON.parse(global.localStorage.getItem(ID_KEY)); }
    catch (e) { return null; }
  }

  function writeIdentity(id) {
    try { global.localStorage.setItem(ID_KEY, JSON.stringify(id)); }
    catch (e) { console.warn('localStorage indisponible', e); }
  }

  /* La collection `participants` est configurée avec identityFields: ["email"]
   * (usernamePassword: false) : on ne PEUT pas se connecter par username, quoi
   * qu'en dise la spec §1.1. On génère donc une adresse de synthèse sur le TLD
   * `.invalid`, réservé par la RFC 2606 et donc jamais routable — personne ne
   * peut recevoir de courrier à cette adresse, et `emailVisibility` reste
   * false. L'anonymat est intact ; seule la forme du jeton change.
   *
   * Pour revenir à la spec à la lettre : cocher `username` dans les
   * identityFields de la collection, côté admin PocketBase. */
  var EMAIL_DOMAIN = '@participant.etonnamment.invalid';

  function createIdentity() {
    var handle = 'p_' + randomString(16);
    var id = {
      username: handle,
      email: handle + EMAIL_DOMAIN,
      password: randomString(32)
    };
    return pb.collection('participants').create({
      username: id.username,
      email: id.email,
      emailVisibility: false,
      password: id.password,
      passwordConfirm: id.password
    }).then(function () {
      writeIdentity(id);
      return id;
    });
  }

  /** Authentifie le participant, en créant le compte à la première visite.
   *  Résout avec l'enregistrement participant. */
  function ensureParticipant() {
    var id = readIdentity();

    function auth(identity) {
      return pb.collection('participants')
        .authWithPassword(identity.email || identity.username, identity.password)
        .then(function (res) { return res.record; });
    }

    // Une identité enregistrée avant l'ajout de l'email ne peut plus se
    // connecter : on la traite comme absente et on en refait une.
    if (id && !id.email) id = null;

    if (id && id.username && id.password) {
      return auth(id).catch(function (err) {
        // Compte disparu (base réinitialisée entre deux répétitions) : on en
        // refait un plutôt que de laisser le participant sur une erreur.
        console.warn('réauthentification impossible, nouvelle identité', err);
        return createIdentity().then(auth);
      });
    }
    return createIdentity().then(auth);
  }

  /* ---------------------------------------------------------------------
   * File d'attente d'écriture (spec §7)
   *
   * Le wifi de la salle est le risque n°1. Toute réponse qui n'part pas est
   * gardée en localStorage et rejouée. Les réponses sont idempotentes par
   * (participant, question) : la file se dédoublonne sur `question`, donc
   * elle ne grossit pas si quelqu'un change trois fois d'avis hors ligne.
   * ------------------------------------------------------------------- */
  var QUEUE_KEY = 'etonnamment.queue';

  function readQueue() {
    try { return JSON.parse(global.localStorage.getItem(QUEUE_KEY)) || []; }
    catch (e) { return []; }
  }

  function writeQueue(q) {
    try { global.localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
    catch (e) { console.warn('localStorage indisponible', e); }
  }

  /* La file contient deux sortes d'écritures : les réponses de la mission
   * d'entrée et les votes. Une entrée écrite avant l'ajout du vote n'a pas de
   * `kind` — on la lit comme une réponse plutôt que de la jeter, sinon la
   * répétition générale perdrait les réponses mises en file juste avant un
   * déploiement. */
  function normalize(item) {
    if (item && item.kind) return item;
    return { kind: 'answer', question: item.question, choice: item.choice };
  }

  // Deux entrées de même clé sont le même avis changé d'idée : la seconde
  // remplace la première, et la file ne grossit pas hors ligne.
  function queueKey(item) {
    return item.kind === 'vote' ? 'vote:' + item.statement : 'answer:' + item.question;
  }

  function sameEntry(a, b) {
    a = normalize(a); b = normalize(b);
    if (queueKey(a) !== queueKey(b)) return false;
    return a.kind === 'vote' ? a.value === b.value : a.choice === b.choice;
  }

  function enqueue(item) {
    var q = readQueue().filter(function (x) {
      return queueKey(normalize(x)) !== queueKey(item);
    });
    q.push(item);
    writeQueue(q);
  }

  // Réponses déjà en base pour ce participant : question -> id d'enregistrement.
  var answerIds = Object.create(null);

  function pushAnswer(question, choice) {
    var pid = pb.authStore.model && pb.authStore.model.id;
    if (!pid) return Promise.reject(new Error('participant non authentifié'));

    var existing = answerIds[question];
    if (existing) {
      return pb.collection('entry_answers').update(existing, { choice: choice });
    }
    return pb.collection('entry_answers')
      .create({ participant: pid, question: question, choice: choice })
      .then(function (rec) { answerIds[question] = rec.id; return rec; });
  }

  // Votes déjà en base pour ce participant : statement -> id d'enregistrement.
  // Rempli par loadVotes(). Sans lui, un second envoi sur le même énoncé
  // heurterait l'index unique (participant, statement) au lieu de corriger.
  var voteIds = Object.create(null);

  function pushVote(statement, value) {
    var pid = pb.authStore.model && pb.authStore.model.id;
    if (!pid) return Promise.reject(new Error('participant non authentifié'));

    var existing = voteIds[statement];
    if (existing) {
      return pb.collection('votes').update(existing, { value: value });
    }
    return pb.collection('votes')
      .create({ participant: pid, statement: statement, value: value })
      .then(function (rec) { voteIds[statement] = rec.id; return rec; });
  }

  function sendQueued(item) {
    item = normalize(item);
    return item.kind === 'vote'
      ? pushVote(item.statement, item.value)
      : pushAnswer(item.question, item.choice);
  }

  /** Rejoue la file. Silencieux : appelé souvent, échoue souvent, sans bruit. */
  function flushQueue() {
    var q = readQueue();
    if (!q.length) return Promise.resolve();

    return q.reduce(function (chain, item) {
      return chain.then(function () {
        return sendQueued(item).then(function () {
          // On ne retire que cette entrée-là : si l'avis a changé pendant
          // l'envoi, la nouvelle version reste en file et partira ensuite.
          writeQueue(readQueue().filter(function (x) { return !sameEntry(x, item); }));
        });
      });
    }, Promise.resolve()).catch(function () { /* on retentera */ });
  }

  /* ---------------------------------------------------------------------
   * Vues agrégées
   *
   * Une collection « view » n'émet AUCUN événement temps réel : PocketBase
   * émet à l'écriture d'un enregistrement, et personne n'écrit dans une vue
   * (vérifié sur l'instance, voir spec §0). On s'abonne donc à la collection
   * SOURCE et on relit la vue à chaque événement.
   *
   * Le débounce compte : à l'ouverture du vote, soixante personnes cliquent
   * en même temps. Sans lui, un événement = une requête, et la projection
   * repartirait en soixante relectures de la même vue.
   * ------------------------------------------------------------------- */
  var DEBOUNCE_MS = 400;
  var viewReloaders = [];

  function watchView(view, source, cb) {
    var timer = null;

    function reload() {
      return pb.collection(view).getFullList({ requestKey: null })
        .then(cb)
        .catch(function (e) {
          // On garde l'affichage précédent plutôt que de vider l'écran.
          console.warn('relecture de ' + view + ' impossible', e);
        });
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; reload(); }, DEBOUNCE_MS);
    }

    reload();
    pb.collection(source).subscribe('*', schedule).catch(function (e) {
      console.warn('abonnement à ' + source + ' refusé — repli sur le GET', e);
    });

    // Filet : même si l'abonnement meurt, le GET périodique rafraîchit la vue.
    viewReloaders.push(reload);
    return reload;
  }

  global.App = {
    pb: pb,
    isDev: isDev,
    apiBase: API_BASE,

    watchView: watchView,

    /* ---- Régie -----------------------------------------------------------
     * La console de régie DOIT être derrière un vrai compte, pas une URL
     * obscure : quelqu'un dans la salle finira par trouver /app/regie, et
     * c'est exactement le public qui a envie d'essayer (spec §8). */
    regie: (function () {
      var rpb = null;   // client dédié, jeton séparé du participant

      function client() {
        if (!rpb) {
          rpb = new PocketBase(API_BASE, separateStore('etonnamment.regie'));
          rpb.autoCancellation(false);
        }
        return rpb;
      }

      return {
        get pb() { return client(); },

        get isAuthed() { return client().authStore.isValid; },

        get user() { return client().authStore.model; },

        login: function (identity, password) {
          return client().collection('facilitators')
            .authWithPassword(identity, password);
        },

        logout: function () { client().authStore.clear(); },

        /** Rappelé à chaque connexion/déconnexion. */
        onChange: function (fn) {
          var c = client();
          fn(c.authStore.isValid);
          return c.authStore.onChange(function () { fn(c.authStore.isValid); });
        }
      };
    })(),

    ensureParticipant: ensureParticipant,

    get participant() { return pb.authStore.model; },

    /** Demande l'affectation d'un îlot. Idempotent côté serveur : rappeler
     *  renvoie le même numéro sans rebattre les cartes. Résout { island }. */
    assignIsland: function () {
      return pb.send('/api/assign-island', { method: 'POST' });
    },

    /** Relit le participant courant (l'îlot peut avoir été changé par la
     *  régie) et met à jour l'authStore. */
    refreshParticipant: function () {
      var me = pb.authStore.model;
      if (!me) return Promise.resolve(null);
      return pb.collection('participants').getOne(me.id, { requestKey: null })
        .then(function (rec) {
          pb.authStore.save(pb.authStore.token, rec);
          return rec;
        });
    },

    /** Charge les réponses déjà données, pour reprendre où on s'était arrêté. */
    loadAnswers: function () {
      var pid = pb.authStore.model && pb.authStore.model.id;
      if (!pid) return Promise.resolve({});
      return pb.collection('entry_answers').getFullList({
        filter: 'participant="' + pid + '"',
        requestKey: null
      }).then(function (rows) {
        var byQuestion = {};
        rows.forEach(function (r) {
          answerIds[r.question] = r.id;
          byQuestion[r.question] = r.choice;
        });
        return byQuestion;
      });
    },

    /** Enregistre une réponse. Résout immédiatement même hors ligne : la
     *  réponse part dans la file et le participant continue sans friction. */
    saveAnswer: function (question, choice) {
      return pushAnswer(question, choice).catch(function (err) {
        console.warn('réponse mise en file', err);
        enqueue({ kind: 'answer', question: question, choice: choice });
      });
    },

    /* ---- Vote (spec §1.5) -------------------------------------------------
     * `statements` n'est lisible par le participant que si `vote_open` est
     * vrai : hors phase de vote, ceci renvoie une liste vide, ce qui est le
     * comportement voulu. */
    loadStatements: function () {
      return pb.collection('statements').getFullList({
        filter: 'active = true',
        requestKey: null
      });
    },

    /** Votes déjà émis : statement -> 'agree' | 'neutral' | 'disagree' | 'skip'.
     *  Sert à reprendre la pile où on l'avait laissée après un rechargement. */
    loadVotes: function () {
      var pid = pb.authStore.model && pb.authStore.model.id;
      if (!pid) return Promise.resolve({});
      return pb.collection('votes').getFullList({
        filter: 'participant="' + pid + '"',
        requestKey: null
      }).then(function (rows) {
        var byStatement = {};
        rows.forEach(function (r) {
          voteIds[r.statement] = r.id;
          byStatement[r.statement] = r.value;
        });
        return byStatement;
      });
    },

    /** Enregistre un vote. Comme saveAnswer : ne rejette jamais, la carte
     *  suivante s'affiche même si le wifi est tombé. */
    saveVote: function (statement, value) {
      return pushVote(statement, value).catch(function (err) {
        console.warn('vote mis en file', err);
        enqueue({ kind: 'vote', statement: statement, value: value });
      });
    },

    get pendingWrites() { return readQueue().length; },

    flushQueue: flushQueue,

    /** Dernier état connu de la session, ou null avant le premier chargement. */
    get session() { return session; },

    /** 'connecting' | 'live' | 'offline' */
    get status() { return status; },

    /** S'abonner aux changements de session. Rappelé immédiatement si l'état
     *  est déjà connu, pour que l'appelant n'ait pas à gérer le cas initial. */
    onSession: function (fn) {
      listeners.add(fn);
      if (session) fn(session);
      return function () { listeners.delete(fn); };
    },

    onStatus: function (fn) {
      statusListeners.add(fn);
      fn(status);
      return function () { statusListeners.delete(fn); };
    },

    start: start
  };
})(window);
