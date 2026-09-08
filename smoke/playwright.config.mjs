/* Test de fumée des trois surfaces.
 *
 * Les pages sont servies EN LOCAL depuis app/, mais app.js vise l'API de
 * production dès que le hostname est localhost (voir le commentaire en tête
 * de app.js). On teste donc le code du dépôt contre la vraie base — ce qui
 * est exactement la situation du développement quotidien, et la seule façon
 * d'exercer les règles d'API pour de bon.
 *
 * Conséquence à ne jamais perdre de vue : ce test ÉCRIT en production. La
 * session est relevée avant et restaurée après (voir session-guard.mjs).
 * Ne pas le lancer pendant l'événement.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Playwright lance webServer depuis le dossier de CETTE config, pas depuis la
// racine du dépôt : le chemin doit donc être absolu, sinon on sert `smoke/app`.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app');

export default {
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: false,        // on écrit dans une session unique : jamais en parallèle
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
    actionTimeout: 8000
  },
  webServer: {
    command: `python3 -m http.server 8765 --bind 127.0.0.1 --directory ${APP}`,
    url: 'http://127.0.0.1:8765/index.html',
    reuseExistingServer: true,
    timeout: 15000
  }
};
