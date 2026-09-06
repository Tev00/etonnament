# app.etonnament.fr sur Scaleway

Runbook. On monte un sous-domaine pour l'app événementielle.
**`etonnament.fr` ne bouge pas** : le site vitrine reste sur Netlify, intact.

---

## Le principe

Le DNS résout des noms d'hôte, pas des chemins. En donnant à l'app son propre
nom d'hôte, on évite tout proxy — et donc tout le risque qui va avec.

```
etonnament.fr          ──►  Netlify   (vitrine, inchangé)
app.etonnament.fr      ──►  Scaleway  (app + PocketBase)
```

Trois bénéfices, dans l'ordre d'importance :

1. **Le temps réel fonctionne.** Un proxy Netlify coupe les requêtes au bout de
   26 secondes ; les connexions SSE de PocketBase restent ouvertes toute la
   soirée. Sans proxy, le problème n'existe pas.
2. **Domaines de panne séparés.** La VM peut redémarrer, mal se configurer ou
   tomber à 20h30 : la vitrine ne s'en aperçoit pas. Et inversement.
3. **Pas de CORS.** Les trois surfaces et l'API partagent une seule origine.

Bonus : le QR code pointe sur `app.etonnament.fr`, plus court que
`etonnament.fr/app` et sans chemin à mal saisir.

---

## Structure du dépôt

```
etonnament/
├── site/                    ← vitrine, déployée sur Netlify (inchangé)
│   ├── index.html
│   └── assets/
├── app/                     ← l'app, déployée sur Scaleway
│   ├── index.html           participant
│   ├── projection.html      grand écran
│   ├── regie.html           facilitateur
│   └── shared/
│       ├── app.js
│       └── questions.js     annexe A (libellés)
├── server/
│   ├── Caddyfile
│   └── pocketbase.service
├── deploy-app.sh
└── SCALEWAY-SETUP.md
```

Les deux dossiers peuvent vivre dans le même dépôt : ils partent simplement
vers deux hébergeurs différents. Netlify pointe sur `site/`, `deploy-app.sh`
pousse `app/`.

```bash
chmod +x deploy-app.sh    # le bit exécutable ne survit pas au téléchargement
```

---

## URL visées

```
https://etonnament.fr/                  vitrine          (Netlify)
https://app.etonnament.fr/              participant      (Scaleway)
https://app.etonnament.fr/projection    grand écran
https://app.etonnament.fr/regie         facilitateur
https://app.etonnament.fr/api/*         PocketBase
https://app.etonnament.fr/_/            admin PocketBase
```

Le `try_files` du Caddyfile fait que `/projection` sert `projection.html` :
URL propres, aucun routeur JS. L'écran d'accueil doit contenir un lien retour
vers `etonnament.fr` (exigence §1.1 du brief).

---

## Choix de l'instance

Tarifs relevés sur la page Scaleway en septembre 2026, hors taxes. Scaleway a
augmenté ses prix au 1er juin 2026 et migré les gammes VC1/START1/X64 vers DEV1
le 31 mai 2026 — **vérifiez dans la console**, les montants bougent plusieurs
fois par an.

| Instance | vCPU | RAM | ~ / mois | Verdict |
|---|---|---|---|---|
| STARDUST1-S | 1 | 1 Go | ~€0,43–3,35 | « Disponibilité limitée, sans SLA », souvent en rupture. Mauvais pari pour une soirée à date fixe. |
| **DEV1-S** | **2** | **2 Go** | **~€6,55** | **Le bon choix.** Deux vCPU, SLA, disponible. |
| PLAY2-PICO | 1 | 2 Go | ~€10,42 | Plus cher que DEV1-S pour moitié moins de CPU. Non. |

Plus l'**IPv4 flexible** (~€0,004/h, soit ~€3/mois) et un peu de block storage.
**Budget réaliste : ~€10/mois.**

Zone **fr-par-1** · Image **Ubuntu 24.04 LTS**.

---

## Phase 1 — Le sous-domaine en ligne

Aucune bascule risquée ici : on ajoute un enregistrement DNS, on n'en modifie
aucun. Si quelque chose échoue, `etonnament.fr` continue de tourner.

### 1. Créer l'instance

Console Scaleway → **Instances** → *Create Instance* :

- Zone **fr-par-1**, type **DEV1-S**, image **Ubuntu 24.04 LTS**
- Ajoutez votre **clé SSH** — sans elle vous resterez dehors
- Cochez **IPv4 flexible**

### 2. Durcir la machine

```bash
ssh root@<IP>

adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
usermod -aG sudo deploy

apt update && apt upgrade -y
apt install -y ufw fail2ban rsync

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

> **Ouvrez une seconde session SSH avant de fermer la première.** Si la
> configuration vous a verrouillé dehors, c'est votre seule porte de sortie.

Vérifiez aussi le **security group Scaleway** (pare-feu côté cloud, distinct
d'`ufw`) : 22, 80 et 443 doivent passer.

### 3. Installer Caddy

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

mkdir -p /var/www/app
chown -R deploy:deploy /var/www/app
```

### 4. Déployer une première fois, par IP

Créez un `app/index.html` minimal (« Étonnamment d'accord — bientôt ») juste
pour avoir quelque chose à servir, puis, depuis votre machine :

```bash
DEPLOY_HOST=deploy@<IP> ./deploy-app.sh
curl -I http://<IP>
```

Vous devez voir `200 OK`. **N'ajoutez pas l'enregistrement DNS avant.** Ce test
prouve que le serveur sert bien vos fichiers ; ce qui reste ensuite ne concerne
que le DNS et le TLS.

### 5. Ajouter l'enregistrement DNS

Chez votre registrar, **sans toucher aux enregistrements existants** :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `app` | `<IP de l'instance>` | 300 |

Laissez les enregistrements Netlify de `@` et `www` exactement comme ils sont.

```bash
dig +short app.etonnament.fr        # doit renvoyer votre IP
dig +short etonnament.fr            # doit encore renvoyer Netlify
```

Le TTL à 300 s garde la souplesse si vous changez d'instance plus tard.

### 6. Activer HTTPS

Une fois que `dig` renvoie la bonne IP :

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -f
```

Le certificat arrive en quelques secondes. `https://app.etonnament.fr` répond.

> L'ordre 5 → 6 n'est pas négociable : Let's Encrypt valide en se connectant au
> domaine, donc le DNS doit pointer ici **avant** la demande de certificat.

### 7. Snapshots

Console Scaleway → **Snapshots** → planifiez-en un automatique. Peu critique
tant que la machine ne sert que des fichiers statiques versionnés dans git.
Ça change radicalement en phase 2.

---

## Phase 2 — PocketBase

Quand la phase 1 est stable depuis quelques jours.

```bash
sudo useradd -r -s /bin/false pocketbase
sudo mkdir -p /opt/pocketbase && cd /opt/pocketbase
# Dernière version linux_amd64 : github.com/pocketbase/pocketbase/releases
sudo unzip pocketbase_*_linux_amd64.zip
sudo mkdir -p /opt/pocketbase/backups
sudo chown -R pocketbase:pocketbase /opt/pocketbase

sudo cp pocketbase.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pocketbase
sudo systemctl status pocketbase
```

Puis **décommentez les blocs `handle /api/*` et `handle /_/*`** du Caddyfile et
`sudo systemctl reload caddy`.

PocketBase n'écoute que sur `127.0.0.1:8090` : il n'est jamais joignable
directement. Caddy est la seule porte d'entrée et gère le TLS en un seul point.

Créez le compte admin à la première visite de `https://app.etonnament.fr/_/`.
Mot de passe long et unique — cette URL est publique.

### Sauvegarde de `pb_data`

Non négociable avant l'événement : `pb_data` contiendra les seules copies des
réponses de la soirée.

```bash
# /etc/cron.d/pocketbase-backup — toutes les 15 min
*/15 * * * * pocketbase /usr/bin/sqlite3 /opt/pocketbase/pb_data/data.db ".backup '/opt/pocketbase/backups/data-$(date +\%H\%M).db'"
```

Et **récupérez une copie hors de la machine** en fin de soirée (`scp`). Une
sauvegarde qui vit sur le disque qu'elle protège n'est pas une sauvegarde.

---

## Ordre d'exécution

1. Instance créée, durcie, Caddy installé.
2. Déploiement testé **par IP**, `200 OK` vérifié.
3. Enregistrement DNS `app` ajouté — les autres intacts.
4. Caddyfile en place, HTTPS actif.
5. *(plus tard)* PocketBase, puis sauvegarde `pb_data`.
6. *(plus tard encore, optionnel)* migrer la vitrine depuis Netlify.

L'étape 2 est celle qu'on saute quand on est pressé. C'est celle qui distingue
« le DNS n'a pas encore propagé » de « le serveur ne fonctionne pas », au
moment précis où vous ne voulez pas avoir à deviner.

---

## Et la vitrine ?

Elle reste sur Netlify, et il n'y a aucune urgence à la déplacer. Vous y
gagnez le CDN, les déploiements atomiques et le rollback en un clic — sans
maintenance de votre côté.

Le jour où vous voudrez tout regrouper sur Scaleway, la manœuvre sera la même
que ci-dessus, avec un TTL abaissé la veille et le site Netlify laissé debout
une semaine en filet de sécurité. Mais ce jour-là, la machine tournera déjà
depuis des mois et vous saurez exactement ce que vous faites.
