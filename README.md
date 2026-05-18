# 🚴 Velo Journal

Journal de voyage vélo auto-hébergé. Postez vos étapes depuis votre téléphone, votre famille suit en temps réel.

## Fonctionnalités

- **Page famille** — fil d'étapes avec photos, carte interactive, commentaires
- **Interface mobile** — poster une étape depuis le téléphone (titre, texte, photos, GPS auto)
- **Carte Leaflet** — tracé automatique de votre itinéraire
- **Statistiques** — km cumulés, D+ total, nombre d'étapes
- **Flux RSS** — pour les proches qui utilisent un lecteur RSS
- **Mot de passe** — page de post protégée, page famille publique
- **Zéro base de données** — tout dans un fichier JSON

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

# Copier app.js et package.json ici
# (via sftp, scp, ou coller le contenu)

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
node app.js

# Ou en passant les variables directement
ADMIN_PASSWORD=monmotdepasse TRIP_TITLE="Paris → Rome" node app.js
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
pm2 start app.js --name velo-journal

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

### Page famille

- Partagez simplement `https://votre-domaine.fr`
- Pas de compte, pas d'app à installer
- Ils peuvent laisser des commentaires avec leur prénom

### Flux RSS

`https://votre-domaine.fr/rss` — pour ceux qui utilisent Feedly, NetNewsWire, etc.

---

## Structure des fichiers

```
velo-journal/
├── app.js             ← tout le code (backend + templates HTML)
├── package.json
├── .env               ← vos secrets (ne pas commiter !)
├── data/
│   └── posts.json     ← vos étapes (auto-créé)
└── public/
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
