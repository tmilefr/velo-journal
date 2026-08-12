# 🚴 Velo Journal

Journal de voyage vélo auto-hébergé. Postez vos étapes depuis votre téléphone, votre famille suit en temps réel.

## Fonctionnalités

- **Page famille** — fil d'étapes avec photos, carte interactive, commentaires
- **Interface mobile** — poster une étape depuis le téléphone (titre, texte, photos, GPS auto)
- **Carte Leaflet** — tracé automatique de votre itinéraire
- **Statistiques** — menu à deux entrées réservé aux administrateurs : **📏 Distances** (km cumulés, D+ total, nombre d'étapes, trajet total vélo + train, kilométrage par pays et par région) et **💶 Finances** (total dépensé, moyenne mensuelle, répartition par catégorie et par personne)
- **Système** — menu d'entretien du carnet (admin) : **💾 Sauvegarde**, **📐 Recalculs**, **🖼️ Affiche**, **🔔 Abonnés**
- **Flux RSS** — pour les proches qui utilisent un lecteur RSS
- **Notifications e-mail** — vos proches s'abonnent avec leur e-mail (double opt-in) et sont prévenus à chaque nouvelle étape publiée
- **Mot de passe** — page de post protégée, page famille publique
- **Zéro base de données** — tout dans des fichiers JSON

---

## Installation sur VPS (Ubuntu/Debian)

### 1. Installer Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Copier les fichiers

```bash
# Créer le dossier
mkdir -p ~/velo-journal && cd ~/velo-journal

# Copier server.js, le dossier src/ et package.json ici
# (via sftp, scp, git clone, …)

# Installer les dépendances
npm install
```

### 3. Configurer (variables d'environnement)

Créez un fichier `.env` dans le dossier du projet :

| Variable         | Défaut            | Description                              |
|------------------|-------------------|------------------------------------------|
| `ADMIN_PASSWORD` | `velo2024` ⚠️     | Mot de passe pour poster                 |
| `FAMILY_PASSWORD`| `famille2024` ⚠️  | Mot de passe pour la page famille        |
| `MARGOT_PASSWORD`| _(vide)_          | Mot de passe optionnel rôle Margot       |
| `PORT`           | `3000`            | Port d'écoute                            |
| `SESSION_SECRET` | _(aléatoire)_ ⚠️  | Secret de session — **à définir absolument** |
| `TRIP_TITLE`     | `Mon voyage à vélo` | Titre affiché                          |
| `TRIP_START`     | _(vide)_          | Ville de départ (affiché dans le header) |
| `TRIP_END`       | _(vide)_          | Ville d'arrivée                          |
| `NODE_ENV`       | _(vide)_          | Mettre `production` en prod (active cookie secure) |
| `SMTP_HOST`      | _(vide)_          | Serveur SMTP pour les notifications e-mail (vide = fonctionnalité désactivée) |
| `SMTP_PORT`      | `587`             | Port SMTP                                |
| `SMTP_SECURE`    | _(vide)_          | Mettre `1` pour TLS implicite (port 465) |
| `SMTP_USER`      | _(vide)_          | Identifiant SMTP                         |
| `SMTP_PASS`      | _(vide)_          | Mot de passe SMTP                        |
| `MAIL_FROM`      | `SMTP_USER`       | Adresse expéditrice des e-mails          |
| `BASE_URL`       | _(auto)_          | URL publique du site pour les liens dans les e-mails (ex. `https://monvoyage.fr`) — déduite de la requête si vide |

> ⚠️ **Important** — Le serveur affiche un avertissement au démarrage si `ADMIN_PASSWORD`, `FAMILY_PASSWORD` ou `SESSION_SECRET` sont encore à leur valeur par défaut. Changez-les avant de mettre le site en ligne.

Exemple de fichier `.env` :

```env
ADMIN_PASSWORD=monmotdepassesolide
FAMILY_PASSWORD=familledurandin2025
SESSION_SECRET=une_longue_chaine_aleatoire_ici
TRIP_TITLE=Paris → Rome
TRIP_START=Paris
TRIP_END=Rome
NODE_ENV=production
```

### 4. Démarrer

```bash
# Démarrage simple avec .env
node server.js

# Ou en passant les variables directement
ADMIN_PASSWORD=monmotdepasse TRIP_TITLE="Paris → Rome" node server.js
```

### 5. Rendre accessible publiquement avec Nginx

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/velo-journal
```

Contenu :

```nginx
server {
    listen 80;
    server_name VOTRE_DOMAINE.fr;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/velo-journal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. HTTPS avec Let's Encrypt (recommandé)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d VOTRE_DOMAINE.fr
```

> Le cookie de session est automatiquement passé en mode `secure` (HTTPS uniquement) quand `NODE_ENV=production`.

### 7. Garder actif avec PM2

```bash
npm install -g pm2

# Démarrer (les variables sont lues depuis .env automatiquement)
pm2 start server.js --name velo-journal

# Démarrer automatiquement au reboot
pm2 startup
pm2 save
```

---

## Utilisation

### Poster une étape (vous, depuis le vélo)

1. Ouvrez `https://votre-domaine.fr/post` sur votre téléphone
2. Entrez le mot de passe admin (une seule fois, mémorisé 30 jours)
3. Remplissez le titre, le texte de l'étape
4. Appuyez sur **📍 Détecter ma position** pour la carte
5. Ajoutez des photos (jusqu'à 10)
6. Publiez !

### Déplacements en train et kilométrage par pays

Rien à saisir : tout se déduit de la trace GPX et des points GPS.

**🚆 Déplacements en train** — cochez simplement « Ce déplacement s'est fait en train » dans l'onglet **Parcours**. La distance est calculée :

| Situation | Distance retenue |
|-----------|------------------|
| L'étape porte une trace GPX | longueur de la trace (elle n'est alors pas comptée comme du roulage) |
| Pas de trace | distance à vol d'oiseau entre la dernière position connue et celle de l'étape |
| Un nombre est saisi dans « Km en train » | la valeur saisie, qui prime toujours |

Cocher la case ouvre deux champs **Départ** et **Arrivée**, avec suggestions de lieux dès trois lettres tapées : ils forment le libellé du trajet (« Turin → Gênes »). Laissés vides, ils sont déduits du lieu de l'étape précédente et du lieu d'arrivée. Ces kilomètres sont comptés **à part** : ils n'entrent ni dans les km roulés, ni dans les moyennes, ni dans les jours roulés, mais s'ajoutent au **trajet total parcouru** affiché en haut des statistiques. La page des statistiques indique pour chaque trajet d'où vient sa distance (trace, à vol d'oiseau, saisie).

**🌍 Pays et régions** — ils sont détectés après la publication, en tâche de fond :

- **avec une trace GPX** : la trace est découpée frontière par frontière. Seules ses extrémités sont géocodées ; si elles ne sont pas dans la même région, le point de franchissement est trouvé par **dichotomie**. Une étape qui reste dans une région coûte 2 requêtes, chaque frontière traversée en coûte ~6. Le kilométrage (et le D+) est alors réparti entre les régions réellement traversées — une étape à cheval sur deux pays compte dans les deux, au prorata.
- **sans trace** : l'étape est située par ses coordonnées, à défaut par son libellé de lieu (« Ville, Région, Pays »).

La publication n'attend jamais ce calcul : le géocodage inverse (OpenStreetMap / Nominatim) est limité à une requête par seconde, donc toutes les requêtes de l'application passent par une file d'attente partagée, avec un cache des zones déjà résolues.

La page **Statistiques** en tire une section **🌍 Distance par pays et par région** : un bloc par pays (drapeau, distance, D+, km en train, part du voyage) et, à l'intérieur, une ligne par région dépliable sur le détail des étapes.

Pour les étapes déjà publiées, la page **Système → 📐 Recalculs** propose **🌍 Détecter les étapes pas encore localisées** (ou tout recalculer), avec l'avancement affiché en direct. Un pays saisi à la main dans le formulaire d'édition est figé : la détection ne l'écrase jamais.

### Statistiques et Finances

Les chiffres du voyage sont séparés en deux pages, réunies sous l'entrée de menu **📊 Statistiques** et toutes deux réservées aux administrateurs :

- **📏 Distances** (`/stats`) — distances, dénivelé, jours roulés, distance par mois, déplacements en train, kilométrage par pays et par région
- **💶 Finances** (`/stats/finances`) — total dépensé, moyenne par mois, répartition par catégorie (avec les sous-catégories hôtel/camping) et par personne, en vue d'ensemble puis mois par mois, chaque ligne dépliable sur le détail des dépenses

Les dépenses saisies sur les **pages de préparation** comptent dans les Finances (achat de matériel, billets…) mais n'entrent évidemment pas dans les distances.

### Système

L'entretien du carnet est regroupé sous l'entrée de menu **⚙️ Système**, une page par sujet. `/settings` en donne le sommaire ; le sous-menu y mène directement :

- **💾 Sauvegarde** (`/settings/backup`) — archive complète en ZIP (étapes + médias), export léger des données seules en JSON, et restauration depuis un fichier JSON
- **📐 Recalculs** (`/settings/recalc`) — recalcul des distances depuis les traces GPX, et détection des pays et régions traversés (avancement affiché en direct)
- **🖼️ Affiche** (`/affiche`) — la carte du voyage au format **A3**, à imprimer et encadrer : les traces GPX sur un fond au choix — **épuré** (littoraux, frontières, villes, relief ombré) ou les **tuiles OpenStreetMap** de la page Carte — et la photo favorite de **chaque étape** disposée tout autour du cadre, chacune reliée par un fil à son point d'arrivée. Chaque photo se pose au plus près de son propre point d'arrivée : on part tout contre le point et on s'en éloigne en spirale jusqu'à trouver une place libre du tracé, des points d'étape et des autres photos. Les fils restent courts, les vignettes suivent le voyage en quinconce et occupent les contrées que le parcours ne traverse pas ; leur taille est la plus grande où tout le monde trouve encore sa place. Portrait ou paysage, export PNG 150 / 300 dpi, impression A3 directe. Le relief est échantillonné via [Open-Meteo](https://open-meteo.com/) puis mis en cache dans `tmp/relief/` ; sans réseau, l'affiche se dessine simplement sans ombrage
- **🔔 Abonnés** (`/settings/subscribers`) — liste des abonnés e-mail, validation manuelle et retrait

Le sommaire est accessible aux comptes admin et Margot ; les Statistiques restent réservées à l'admin.

### Page famille

- Partagez simplement `https://votre-domaine.fr`
- Pas de compte, pas d'app à installer
- Ils peuvent laisser des commentaires avec leur prénom

### Flux RSS

`https://votre-domaine.fr/rss` — pour ceux qui utilisent Feedly, NetNewsWire, etc.

### Notifications e-mail

Si SMTP est configuré dans `.env`, une icône **🔔** apparaît à côté du menu (sur le journal, la timeline, la carte et la préparation) et ouvre une fenêtre d'abonnement. Visible uniquement une fois connecté — rien n'est exposé sans mot de passe. L'abonnement lui-même ne retient que l'adresse e-mail :

1. Le lecteur saisit son adresse et reçoit un e-mail de confirmation (double opt-in, lien valable 7 jours)
2. Une fois confirmé, il reçoit un e-mail à **chaque nouvelle étape publiée** — une seule fois par étape, jamais lors des modifications
3. Chaque e-mail contient un lien de désinscription en un clic
4. La liste des abonnés se gère depuis la page **Système → 🔔 Abonnés** (admin) : on peut retirer une adresse, ou **valider une inscription à la main** avec le bouton « ✔ valider » si l'e-mail de confirmation n'arrive jamais (spam, adresse dictée de vive voix…)
5. Chaque envoi (confirmation d'inscription, notification) est tracé dans `data/mail.log`

Exemple de configuration SMTP (Gmail avec mot de passe d'application) :

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=vous@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
BASE_URL=https://votre-domaine.fr
```

---

## Structure des fichiers

```
velo-journal/
├── server.js          ← point d'entrée (crée les dossiers, lance le serveur)
├── package.json
├── .env               ← vos secrets (ne pas commiter !)
├── src/
│   ├── app.js         ← assemblage Express (middleware, routes)
│   ├── config.js      ← lecture du .env, constantes, chemins
│   ├── lib/           ← utilitaires génériques (dates, HTML, ZIP, log…)
│   ├── middleware/    ← auth, CSRF, upload (multer)
│   ├── services/      ← logique métier (posts, GPX, dépenses, stats…)
│   ├── routes/        ← routeurs Express par domaine
│   └── views/         ← templates HTML (layout, pages, scripts client)
├── data/
│   ├── posts.json     ← vos étapes (auto-créé)
│   └── subscribers.json ← abonnés e-mail (auto-créé)
├── tmp/
│   └── relief/        ← cache des grilles d'altitude de l'affiche (auto-créé)
└── public/
    ├── geo/           ← fonds de l'affiche (frontières Natural Earth, villes GeoNames)
    └── uploads/       ← vos photos (auto-créé)
```

---

## Sécurité

### Mesures en place

- **Headers HTTP** — [helmet](https://helmetjs.github.io/) active automatiquement `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, etc.
- **Protection XSS** — tous les champs utilisateur (titre, corps, lieu, commentaires) sont échappés avant rendu HTML.
- **Protection CSRF** — un token aléatoire par session est vérifié sur tous les formulaires POST (supprimer, commenter, poster, modifier).
- **Cookie de session sécurisé** — `httpOnly`, `sameSite: lax`, et `secure` en production.
- **Rate limiting** — la route `/login` est limitée à **10 tentatives par 15 minutes** par IP.
- **Sessions invalidées à la déconnexion** — `req.session.destroy()` à chaque logout.

### Recommandations

- Définissez `SESSION_SECRET` dans `.env` — sans ça, toutes les sessions sont perdues à chaque redémarrage.
- Utilisez HTTPS (Let's Encrypt, voir étape 6) — requis pour le cookie `secure` et la géolocalisation mobile.
- Ne commitez jamais votre fichier `.env` — il est déjà dans `.gitignore`.
- Sauvegardez régulièrement `data/posts.json` et `public/uploads/`.

---

## Sauvegardes

```bash
# Depuis votre machine locale
scp -r user@vps:~/velo-journal/data ./backup-data
scp -r user@vps:~/velo-journal/public/uploads ./backup-photos
```

Ou automatiser avec un cron sur le VPS :

```bash
# Sauvegarder chaque soir à 23h
0 23 * * * tar -czf ~/backup-velo-$(date +\%Y\%m\%d).tar.gz ~/velo-journal/data ~/velo-journal/public/uploads
```
