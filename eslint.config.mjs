/* Étonnamment d'accord — vérification statique des trois surfaces.
 *
 * Lancée par ./check.sh, elle-même appelée par ./deploy-app.sh. Le dépôt n'a
 * pas de package.json et n'en veut pas : ESLint est tiré par npx au moment du
 * contrôle et rien n'est installé à demeure.
 *
 * Le jeu de règles est volontairement court. Une règle qui crie pour du style
 * finit par être ignorée, et c'est alors la vraie erreur qu'on ne voit plus.
 * Chaque règle activée ici correspond à un bug qui casserait l'app en salle.
 */
const browser = {
  window: 'readonly', document: 'readonly', console: 'readonly',
  localStorage: 'readonly', navigator: 'readonly', location: 'readonly',
  crypto: 'readonly', fetch: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly',
  Promise: 'readonly', Set: 'readonly', Map: 'readonly',
  JSON: 'readonly', Math: 'readonly', Object: 'readonly', Array: 'readonly',
  String: 'readonly', Number: 'readonly', Boolean: 'readonly', Date: 'readonly',
  Error: 'readonly', RegExp: 'readonly', isNaN: 'readonly',
  parseInt: 'readonly', parseFloat: 'readonly',
  Uint32Array: 'readonly', encodeURIComponent: 'readonly',
  prompt: 'readonly', alert: 'readonly', confirm: 'readonly',

  // Fournis par les autres <script> de la page.
  PocketBase: 'readonly',
  App: 'readonly',
  QUESTIONS: 'readonly',
  CONSIGNE_QUESTIONS: 'readonly'
};

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',      // pas de modules : trois <script> classiques
      globals: browser
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      /* Le bug du 8 septembre : `var patch = {}` dans un gestionnaire de clic
       * masquait la fonction patch(), et chaque clic levait « patch is not a
       * function ». Les quatre bascules de la régie n'ont jamais fonctionné,
       * dont vote_open. C'est cette règle-là qui justifie tout le fichier. */
      'no-shadow': 'error',

      // Un identifiant mal orthographié — getElementById rendu dans une
      // variable jamais déclarée — casse la page au premier clic, pas au
      // chargement : invisible à l'œil, évident ici.
      'no-undef': 'error',

      'no-redeclare': 'error',
      'no-func-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': 'error',
      'no-self-assign': 'error',
      'no-sparse-arrays': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',

      // Averti sans bloquer : une variable inutilisée est souvent le reste
      // d'un remaniement, parfois le signe qu'on a oublié de brancher
      // quelque chose. À regarder, pas à interdire.
      // `catch (e) {}` sans utiliser e est volontaire ici : la liaison reste
      // écrite en toutes lettres pour rester compatible avec les navigateurs
      // qui ignorent le catch sans paramètre. Ce n'est pas un oubli.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  }
];
