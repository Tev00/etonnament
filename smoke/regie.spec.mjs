/* Ce que ce fichier cherche : un bouton qui ne fait rien.
 *
 * Le linter attrape la variable qui en masque une autre. Il n'attrape pas un
 * gestionnaire branché sur le mauvais client, ni un `addEventListener` sur un
 * id qui n'existe plus, ni une promesse rejetée en silence. Ces trois-là ne se
 * voient qu'en cliquant — et jusqu'ici, la seule occasion de cliquer sur les
 * quatorze boutons de la régie, c'était la soirée elle-même.
 *
 * Chaque bouton doit donc produire DEUX choses : aucune erreur console, et une
 * requête d'écriture partie vers l'API. Le premier critère seul ne suffit pas :
 * un bouton débranché ne lève rien du tout.
 */
import { test, expect } from '@playwright/test';
import { login, snapshot, restore } from './session-guard.mjs';

let token, snap;

test.beforeAll(async () => {
  token = await login();
  snap = await snapshot();
  console.log('  session relevée :', JSON.stringify(
    Object.fromEntries(Object.entries(snap).filter(([k]) => k !== 'id'))));
});

test.afterAll(async () => {
  if (token && snap) {
    await restore(token, snap);
    console.log('  session restaurée.');
  }
});

/** Ouvre la régie et s'y connecte. Renvoie les erreurs console collectées. */
async function openRegie(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto('/regie.html');
  await page.fill('#lid', process.env.REGIE_EMAIL);
  await page.fill('#lpw', process.env.REGIE_PASSWORD);
  await page.click('#loginBtn');

  // La console n'apparaît qu'une fois le jeton obtenu.
  await expect(page.locator('#console')).toBeVisible({ timeout: 15000 });
  // …et App.start() n'est lancé qu'après : on attend le premier état connu.
  await page.waitForFunction(() => window.App && window.App.session, null,
    { timeout: 15000 });
  return errors;
}

/** Clique et exige qu'un PATCH parte vers `session`. */
async function clickExpectingPatch(page, locator, label) {
  const patch = page.waitForRequest(
    r => r.method() === 'PATCH' && r.url().includes('/collections/session/records'),
    { timeout: 8000 }
  ).catch(() => null);

  await locator.click();
  const req = await patch;
  expect(req, `« ${label} » n'a envoyé aucune écriture`).not.toBeNull();

  // Le corps dit ce que le bouton croit changer : un bouton qui part avec un
  // corps vide est branché, mais sur rien.
  const body = req.postDataJSON();
  expect(Object.keys(body || {}).length,
    `« ${label} » a envoyé un corps vide`).toBeGreaterThan(0);
  return body;
}

test('la régie se connecte et affiche la console', async ({ page }) => {
  const errors = await openRegie(page);
  expect(errors, 'erreurs console à la connexion').toEqual([]);
});

test('les huit boutons de stage écrivent tous', async ({ page }) => {
  const errors = await openRegie(page);
  const buttons = page.locator('#stages button');
  const n = await buttons.count();
  expect(n, 'nombre de stages').toBe(8);

  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const name = await b.textContent();
    const body = await clickExpectingPatch(page, b, 'stage ' + name);
    expect(body.stage, 'stage envoyé').toBe(name.trim());
  }
  expect(errors, 'erreurs console pendant les stages').toEqual([]);
});

/* C'est ce test-ci qui aurait attrapé le bug du 8 septembre : les quatre
 * bascules levaient « patch is not a function » à chaque clic, sans jamais
 * envoyer quoi que ce soit. vote_open est l'une des quatre. */
test('les quatre bascules basculent vraiment', async ({ page }) => {
  const errors = await openRegie(page);
  const flags = ['entry_open', 'propositions_open', 'vote_open', 'feedback_open'];

  for (const key of flags) {
    const before = await page.evaluate(k => window.App.session[k], key);
    const b = page.locator(`[data-flag="${key}"]`);
    const body = await clickExpectingPatch(page, b, 'bascule ' + key);
    expect(body, `${key} absent du corps`).toHaveProperty(key);
    expect(body[key], `${key} doit passer à ${!before}`).toBe(!before);
  }
  expect(errors, 'erreurs console pendant les bascules').toEqual([]);
});

test('les vues de projection et la pagination écrivent', async ({ page }) => {
  const errors = await openRegie(page);

  for (const v of ['idle', 'entry', 'vote', 'programme']) {
    const body = await clickExpectingPatch(
      page, page.locator(`[data-pview="${v}"]`), 'projection ' + v);
    expect(body.projection_view).toBe(v);
  }

  const q = page.locator('[data-pq="q4"]');
  expect((await clickExpectingPatch(page, q, 'question q4')).projection_question).toBe('q4');

  await clickExpectingPatch(page, page.locator('#pageNext'), 'page suivante');
  await clickExpectingPatch(page, page.locator('#pagePrev'), 'page précédente');
  await clickExpectingPatch(page, page.locator('#pageFirst'), 'retour au début');

  // projection_page ne doit jamais passer sous zéro, quel que soit le nombre
  // de clics sur « précédente ».
  for (let i = 0; i < 3; i++) {
    await clickExpectingPatch(page, page.locator('#pagePrev'), 'précédente (butée)');
  }
  const page0 = await page.evaluate(() => window.App.session.projection_page);
  expect(page0, 'projection_page bloquée à 0').toBe(0);

  expect(errors, 'erreurs console sur la projection').toEqual([]);
});

test('les listes de la régie se chargent sans erreur', async ({ page }) => {
  const errors = await openRegie(page);

  await page.click('#refreshProps');
  await page.click('#refreshFb');
  await expect(page.locator('#fbStats')).not.toHaveText('', { timeout: 8000 });
  await expect(page.locator('#fbStats')).not.toHaveText('illisible');

  // Le nombre d'îlots est un champ + un bouton : la paire la plus facile à
  // débrancher sans que rien ne se voie.
  const current = await page.evaluate(() => window.App.session.islands_count);
  await page.fill('#islands', String(current));
  const body = await clickExpectingPatch(
    page, page.locator('#saveIslands'), 'enregistrer les îlots');
  expect(body.islands_count).toBe(current);

  expect(errors, 'erreurs console sur les listes').toEqual([]);
});
