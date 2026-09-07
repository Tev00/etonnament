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
      fetchSession().catch(function () {
        // Réseau coupé : on le signale, mais on garde `session` intact.
        setStatus('offline');
      });
    }, POLL_MS);
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

  global.App = {
    pb: pb,
    isDev: isDev,
    apiBase: API_BASE,

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

    /** Écrit sur la session. Réservé à la régie. */
    patchSession: function (data) {
      if (!session) return Promise.reject(new Error('session inconnue'));
      return pb.collection('session').update(session.id, data)
        .then(function (record) { adopt(record); return record; });
    },

    start: start
  };
})(window);
