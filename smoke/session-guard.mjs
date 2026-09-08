/* Relève et restaure l'enregistrement `session`.
 *
 * Le test clique sur tous les boutons de la régie, et la moitié d'entre eux
 * écrivent dans `session` : sans ça, un test de fumée lancé à 18h50 laisserait
 * la salle sur `stage = cloture` et le vote fermé.
 */
const API = 'https://app.etonnamment.fr';

// Les champs pilotés par la régie. On ne restaure QUE ceux-là : réécrire
// l'enregistrement entier renverrait aussi `created`/`updated` et ferait
// échouer la requête.
export const FIELDS = [
  'stage', 'entry_open', 'islands_count', 'propositions_open',
  'vote_open', 'feedback_open', 'projection_view', 'projection_question',
  'projection_page'
];

export async function login() {
  const identity = process.env.REGIE_EMAIL;
  const password = process.env.REGIE_PASSWORD;
  if (!identity || !password) {
    throw new Error(
      'REGIE_EMAIL et REGIE_PASSWORD doivent être définis — voir ./smoke.sh');
  }
  const r = await fetch(`${API}/api/collections/facilitators/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password })
  });
  if (!r.ok) throw new Error('connexion facilitateur refusée : HTTP ' + r.status);
  return (await r.json()).token;
}

export async function snapshot() {
  const r = await fetch(`${API}/api/collections/session/records`);
  const rec = (await r.json()).items[0];
  const kept = { id: rec.id };
  for (const f of FIELDS) kept[f] = rec[f];
  return kept;
}

export async function restore(token, snap) {
  const body = {};
  for (const f of FIELDS) body[f] = snap[f];
  const r = await fetch(`${API}/api/collections/session/records/${snap.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    // On crie fort : laisser la session dans un état arbitraire est le seul
    // vrai danger de ce fichier.
    throw new Error('!! SESSION NON RESTAURÉE !! HTTP ' + r.status +
      ' — remettre à la main : ' + JSON.stringify(body));
  }
}
