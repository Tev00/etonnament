/* Le participant et la projection : on vérifie que les pages VIVENT.
 *
 * Rien ici n'écrit, à une exception près signalée plus bas. La projection est
 * la surface la plus exposée — elle tourne sur le navigateur du
 * vidéoprojecteur, devant tout le monde, et personne ne la regarde avant
 * 19h00. Une erreur JS y est invisible jusqu'au pire moment.
 */
import { test, expect } from '@playwright/test';
import { login, snapshot, restore } from './session-guard.mjs';

const API = 'https://app.etonnamment.fr';

async function setView(token, id, view) {
  const r = await fetch(`${API}/api/collections/session/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ projection_view: view })
  });
  if (!r.ok) throw new Error('bascule projection_view refusée : HTTP ' + r.status);
}

function watch(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return errors;
}

test('la projection démarre et lit la session', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/projection.html');
  await page.waitForFunction(() => window.App && window.App.session,
    null, { timeout: 15000 });

  // Un titre vide, c'est un écran blanc devant la salle.
  await expect(page.locator('#headline')).not.toHaveText('…');
  await expect(page.locator('#headline')).not.toHaveText('');
  expect(errors, 'erreurs console sur la projection').toEqual([]);
});

/* `vote_results` n'est lisible que si projection_view = "vote" (spec §4) : on
 * bascule donc pour de vrai, et on remet en place ensuite. C'est aussi ce qui
 * vérifie que l'écran se remplit AU MOMENT de la bascule, sans attendre le
 * GET périodique — quinze secondes de blanc devant la salle, sinon. */
test('la projection se remplit dès la bascule sur « vote »', async ({ page }) => {
  const token = await login();
  const snap = await snapshot();

  const errors = watch(page);
  await page.goto('/projection.html');
  await page.waitForFunction(() => window.App && window.App.session,
    null, { timeout: 15000 });

  try {
    await setView(token, snap.id, 'vote');

    // Cinq secondes : bien en deçà des quinze du GET de secours, donc si la
    // ligne apparaît, c'est bien la bascule qui l'a déclenchée.
    await expect(page.locator('#vrows .vrow').first())
      .toBeVisible({ timeout: 5000 });
    await expect(page.locator('#voteview')).toHaveClass(/is-active/);
  } finally {
    await restore(token, snap);
  }

  expect(errors, 'erreurs console au classement').toEqual([]);
});

/* Le participant crée un compte au chargement — c'est le premier geste de
 * app.js. Ce test laisse donc UN enregistrement `participants` en base, que
 * personne ne peut supprimer (la règle de suppression est réservée à l'admin).
 * D'où le drapeau : on ne le lance pas à chaque fois.
 *
 * Il exige aussi entry_open = true, sinon la création est refusée. */
const participantFlow = process.env.SMOKE_PARTICIPANT === '1';

test.describe(participantFlow ? 'participant' : 'participant (sauté)', () => {
  test.skip(!participantFlow,
    'SMOKE_PARTICIPANT=1 pour l’activer — laisse un participant en base');

  test('le téléphone obtient une identité et un écran', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/index.html');
    await page.waitForFunction(() => window.App && window.App.participant,
      null, { timeout: 20000 });

    const stage = await page.evaluate(() => window.App.session.stage);
    await expect(page.locator(`.panel[data-stage="${stage}"]`)).toHaveClass(/is-active/);
    expect(errors, 'erreurs console sur le téléphone').toEqual([]);
  });
});
