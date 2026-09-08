/* Répétition générale à une seule personne.
 *
 * Lance N participants émulés dans des navigateurs sans interface. Ils ne
 * décident de rien : ils REGARDENT la session et suivent, exactement comme la
 * salle. Vous gardez la régie sur votre téléphone et menez la soirée ; les
 * bots répondent, reçoivent un îlot, écrivent des propositions, votent et
 * remplissent la clôture au fur et à mesure que vous ouvrez chaque phase.
 *
 * Chaque bot est un vrai navigateur avec son propre localStorage : identité
 * distincte, jeton distinct, file d'attente distincte. Le code client exécuté
 * est celui du dépôt, et les règles d'API, le hook d'affectation et les vues
 * agrégées sont ceux de la production.
 *
 * Les bots pilotent l'app par `App.*` plutôt qu'en cliquant : c'est votre
 * téléphone qui teste l'interface, eux remplissent la salle. Ce qu'ils
 * exercent — règles, hook, index uniques, agrégats, temps réel — est
 * précisément ce qu'un seul téléphone ne peut pas exercer.
 *
 * ⚠️ ILS ÉCRIVENT DE VRAIES DONNÉES. Participants, réponses, propositions,
 * votes et questionnaires resteront en base. Les participants ne sont pas
 * supprimables par l'API (règle réservée à l'admin) : prévoyez de repartir
 * d'une base propre avant la vraie soirée. Voir --help.
 */
import { chromium } from '../.smoke/node_modules/playwright/index.mjs';

const N        = Number(process.env.N || 10);
const APP_URL  = process.env.APP_URL || 'http://127.0.0.1:8765/index.html';
const API      = 'https://app.etonnamment.fr';
const VERBOSE  = process.env.VERBOSE === '1';

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Les gens ne répondent pas en même temps. Sans ce désordre, on ne teste
// jamais la concurrence — qui est tout l'intérêt de la manœuvre.
const jitter = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

const log = (...m) => console.log(new Date().toLocaleTimeString('fr-FR'), ...m);

/* Distribution des votes. On ne tire pas au hasard uniformément : un vote
 * uniforme donne des `lean` tous voisins de zéro et une projection sans
 * relief, où l'on ne verrait pas si le classement fonctionne. Chaque énoncé
 * reçoit donc un « tempérament » tiré une fois, et les bots votent selon lui. */
function temperaments(ids) {
  const kinds = ['consensuel', 'consensuel', 'clivant', 'clivant', 'tiède'];
  const map = {};
  ids.forEach((id, i) => { map[id] = kinds[i % kinds.length]; });
  return map;
}
function voteFor(kind) {
  const r = Math.random();
  if (kind === 'consensuel') return r < 0.78 ? 'agree' : r < 0.9 ? 'neutral' : 'disagree';
  if (kind === 'clivant')    return r < 0.45 ? 'agree' : r < 0.55 ? 'neutral' : 'disagree';
  return r < 0.3 ? 'agree' : r < 0.7 ? 'neutral' : 'disagree';   // tiède
}

async function session() {
  const r = await fetch(`${API}/api/collections/session/records`);
  return (await r.json()).items[0];
}

class Bot {
  constructor(i, page) {
    this.i = i; this.page = page;
    this.done = { entry: false, island: null, props: false, vote: false, fb: false };
    this.errors = [];

    /* Un participant sur dix laisse la mission en plan — cas que la spec dit
     * gérer (les réponses déjà données restent en base). On tire la décision
     * UNE fois par personne, pas à chaque question : à 8 % par question sur
     * sept questions, c'est 44 % de la salle qui abandonne, ce qui ne
     * ressemble à rien. */
    this.abandonsAt = Math.random() < 0.1
      ? 1 + Math.floor(Math.random() * 6)    // s'arrête entre Q2 et Q7
      : null;
  }

  async ready() {
    await this.page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    // index.html crée le compte de lui-même au chargement.
    await this.page.waitForFunction(() => window.App && window.App.participant,
      null, { timeout: 30000 });
    this.id = await this.page.evaluate(() => window.App.participant.id);
  }

  ev(fn, arg) { return this.page.evaluate(fn, arg); }

  async answerEntry() {
    const qs = await this.ev(() => window.QUESTIONS.map(q =>
      ({ key: q.key, options: q.options.map(o => o.key) })));

    for (let k = 0; k < qs.length; k++) {
      if (this.abandonsAt === k) {
        if (VERBOSE) log(`  bot ${this.i} abandonne à ${qs[k].key}`);
        // Marqué fini pour la boucle : cette personne est partie, on ne la
        // relance pas indéfiniment. Ses réponses déjà données restent.
        this.done.entry = true;
        this.abandoned = true;
        return false;
      }
      await this.ev(a => window.App.saveAnswer(a.q, a.c),
        { q: qs[k].key, c: pick(qs[k].options) });
      await sleep(jitter(150, 900));
    }

    // Ce que fait finish() dans l'app : marquer la mission finie, puis
    // demander l'îlot au serveur.
    const flagged = await this.ev(() => window.App.pb
      .collection('participants')
      .update(window.App.participant.id, { entry_done: true })
      .then(() => true)
      .catch(e => 'REFUSÉ ' + (e && e.status)));
    if (flagged !== true) this.errors.push('entry_done: ' + flagged);

    const island = await this.ev(() => window.App.assignIsland()
      .then(r => r.island).catch(e => 'ERREUR ' + (e && e.status)));
    if (typeof island === 'number') this.done.island = island;
    else this.errors.push('assignIsland: ' + island);

    this.done.entry = true;
    return true;
  }

  async writeProposition(slot) {
    const res = await this.ev(async a => {
      try {
        const rec = await window.App.pb.collection('propositions').create({
          island: a.island,
          problem: 'Répétition — problème ' + a.slot,
          description: 'Proposition de répétition n°' + a.slot +
            ' pour l’îlot ' + a.island + '. Deux phrases, comme demandé.',
          effect: 'Effet attendu ' + a.slot,
          status: 'draft'
        });
        return rec.id;
      } catch (e) { return 'ERREUR ' + (e && e.status); }
    }, { island: this.done.island, slot });
    if (String(res).startsWith('ERREUR')) this.errors.push('proposition: ' + res);
    return res;
  }

  async vote(temp) {
    const statements = await this.ev(() => window.App.loadStatements()
      .then(rows => rows.map(r => r.id)).catch(() => []));
    if (!statements.length) { this.errors.push('vote: aucun énoncé lisible'); return; }

    for (const id of statements) {
      // Quelques cartes passées : `skip` doit être enregistré sans compter.
      const v = Math.random() < 0.07 ? 'skip' : voteFor(temp[id] || 'tiède');
      await this.ev(a => window.App.saveVote(a.id, a.v), { id, v });
      await sleep(jitter(120, 700));
    }
    this.done.vote = true;
  }

  /* Sonde de sécurité, spec §5 : un participant ne doit PAS pouvoir choisir
   * son îlot. On tente l'écriture avec son propre jeton et on remet la valeur
   * d'origine si elle passe — la répétition ne doit pas laisser quelqu'un
   * déplacé. Coût nul : le bot a déjà un compte. */
  async probeIslandWrite() {
    const before = this.done.island;
    if (!(before > 0)) return null;
    const r = await this.ev(async a => {
      const target = a.before === 1 ? 2 : 1;
      try {
        await window.App.pb.collection('participants')
          .update(window.App.participant.id, { island: target });
        // Accepté : on répare tout de suite.
        await window.App.pb.collection('participants')
          .update(window.App.participant.id, { island: a.before })
          .catch(() => {});
        return 'ACCEPTÉ';
      } catch (e) { return 'refusé(' + (e && e.status) + ')'; }
    }, { before });
    if (r === 'ACCEPTÉ') {
      this.errors.push(
        'SÉCURITÉ — le participant peut choisir son îlot (spec §5 l’interdit). ' +
        'Régler l’update de `participants` sur facilitators seuls.');
    }
    return r;
  }

  async feedback() {
    const answers = await this.ev(() => {
      const out = {};
      window.FEEDBACK.forEach(q => {
        out[q.key] = q.type === 'choice'
          ? q.options[Math.floor(Math.random() * q.options.length)].key
          : 'Réponse de répétition.';
      });
      return out;
    });
    await this.ev(a => window.App.saveFeedback(a), answers);
    this.done.fb = true;
  }
}

/* ---------------------------------------------------------------------- */

const browser = await chromium.launch();
const bots = [];

/* Ctrl-C doit rendre un compte-rendu, pas juste une pile d'appels : c'est le
 * seul moment où l'on regarde ce que la répétition a produit. */
let reporting = false;
async function report() {
  if (reporting) return; reporting = true;
  const done = k => bots.filter(b => b.done[k]).length;
  const placed = bots.filter(b => b.done.island > 0);
  const byIsland = {};
  placed.forEach(b => { byIsland[b.done.island] = (byIsland[b.done.island] || 0) + 1; });

  console.log('\n────────── répétition ──────────');
  console.log('identités créées :', bots.filter(b => b.id).length, '/', N);
  console.log('mission finie    :', done('entry') - bots.filter(b => b.abandoned).length,
              `(${bots.filter(b => b.abandoned).length} abandon(s) simulé(s))`);
  console.log('îlots            :', JSON.stringify(byIsland));
  console.log('propositions     :', done('props'), 'îlot(s) ont écrit');
  console.log('vote             :', done('vote'), '/', N);
  console.log('clôture          :', done('fb'), '/', N);

  const errs = bots.flatMap(b => b.errors.map(e => `bot ${b.i}: ${e}`));
  if (errs.length) {
    console.log('\n⚠ anomalies (' + errs.length + ') :');
    // Dédoublonné : dix bots qui butent sur la même règle, c'est UN problème.
    const seen = new Map();
    errs.forEach(e => {
      const k = e.replace(/^bot \d+: /, '');
      seen.set(k, (seen.get(k) || 0) + 1);
    });
    [...seen].forEach(([k, n]) => console.log(`  ×${n}  ${k}`));
  } else {
    console.log('\n✓ aucune anomalie');
  }
  console.log('────────────────────────────────');
  await browser.close();
  process.exit(0);
}
process.on('SIGINT', report);
process.on('SIGTERM', report);

log(`ouverture de ${N} téléphones émulés…`);
for (let i = 1; i <= N; i++) {
  // Un contexte par bot : localStorage séparé, donc identité séparée.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => bots[i - 1] && bots[i - 1].errors.push('page: ' + e.message));
  bots.push(new Bot(i, page));
}

let s = await session();
if (!s.entry_open) {
  log('⏳ entry_open est FERMÉ — ouvrez la mission d’entrée dans la régie.');
  while (!(await session()).entry_open) await sleep(3000);
}

log('création des identités…');
for (const b of bots) {
  try { await b.ready(); } catch (e) { b.errors.push('identité: ' + e.message); }
  await sleep(jitter(200, 800));   // ils n'arrivent pas tous à la même seconde
}
log(`${bots.filter(b => b.id).length}/${N} identités créées.`);

let temp = null;
let lastPhase = '';

// Boucle de suivi : on relit la session et on réagit, comme les téléphones.
for (;;) {
  s = await session();

  const phase = [s.entry_open && 'entrée', s.propositions_open && 'propositions',
                 s.vote_open && 'vote', s.feedback_open && 'clôture']
                 .filter(Boolean).join('+') || 'rien d’ouvert';
  if (phase !== lastPhase) { log('▸ phase :', phase, `— stage ${s.stage}`); lastPhase = phase; }

  if (s.entry_open) {
    const todo = bots.filter(b => b.id && !b.done.entry);
    if (todo.length) {
      log(`  mission d’entrée : ${todo.length} à répondre`);
      await Promise.all(todo.map(async b => {
        await sleep(jitter(0, 4000));
        try { await b.answerEntry(); } catch (e) { b.errors.push('entrée: ' + e.message); }
      }));
      const placed = bots.filter(b => b.done.island != null);
      const byIsland = {};
      placed.forEach(b => { byIsland[b.done.island] = (byIsland[b.done.island] || 0) + 1; });
      log('  îlots :', JSON.stringify(byIsland));

      // Une seule sonde suffit : la règle est la même pour tout le monde.
      const probe = placed[0];
      if (probe && !probe.probed) {
        probe.probed = true;
        const r = await probe.probeIslandWrite();
        if (r) log('  sonde « le participant peut-il choisir son îlot ? » →', r);
      }
    }
  }

  if (s.propositions_open) {
    // Un porte-plume par îlot, comme dans la salle : ce n'est pas dix
    // personnes qui écrivent, c'est une table.
    const byIsland = new Map();
    bots.filter(b => b.done.island > 0 && !b.done.props)
        .forEach(b => { if (!byIsland.has(b.done.island)) byIsland.set(b.done.island, b); });
    if (byIsland.size) {
      log(`  propositions : ${byIsland.size} îlot(s) écrivent`);
      for (const b of byIsland.values()) {
        await b.writeProposition(1);
        await sleep(jitter(300, 1200));
        await b.writeProposition(2);
        b.done.props = true;
      }
    }
  }

  if (s.vote_open) {
    const todo = bots.filter(b => b.id && !b.done.vote);
    if (todo.length) {
      if (!temp) {
        const ids = await todo[0].ev(() => window.App.loadStatements()
          .then(r => r.map(x => x.id)).catch(() => []));
        temp = temperaments(ids);
        log(`  vote : ${ids.length} énoncés, tempéraments tirés`);
      }
      await Promise.all(todo.map(async b => {
        await sleep(jitter(0, 3000));
        try { await b.vote(temp); } catch (e) { b.errors.push('vote: ' + e.message); }
      }));
      log(`  vote : ${bots.filter(b => b.done.vote).length}/${N} ont fini`);
    }
  }

  if (s.feedback_open) {
    const todo = bots.filter(b => b.id && !b.done.fb);
    if (todo.length) {
      await Promise.all(todo.map(async b => {
        await sleep(jitter(0, 5000));
        try { await b.feedback(); } catch (e) { b.errors.push('clôture: ' + e.message); }
      }));
      log(`  clôture : ${bots.filter(b => b.done.fb).length}/${N} ont répondu`);
    }
  }

  await sleep(2500);
}
