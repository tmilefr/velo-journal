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

# Copier server.js et package.json ici
# (via sftp, scp, ou coller le contenu)

# Installer les dépendances
npm install
```

### 3. Configurer (variables d'environnement)

Créez un fichier `.env` ou définissez les variables au démarrage :

| Variable         | Défaut      | Description                              |
|------------------|-------------|------------------------------------------|
| `ADMIN_PASSWORD` | `velo2024`  | Mot de passe pour poster                 |
| `PORT`           | `3000`      | Port d'écoute                            |
| `SESSION_SECRET` | auto        | Secret de session (changez-le !)        |
| `TRIP_TITLE`     | `Mon voyage à vélo` | Titre affiché                    |
| `TRIP_START`     | _(vide)_    | Ville de départ (affiché dans le header) |
| `TRIP_END`       | _(vide)_    | Ville d'arrivée                          |

### 4. Démarrer

```bash
# Démarrage simple
ADMIN_PASSWORD=monmotdepasse TRIP_TITLE="Paris → Rome" TRIP_START="Paris" TRIP_END="Rome" node server.js

# Ou avec un fichier .env
node -e "require('fs').writeFileSync('.env','')"; # créer .env
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

### 7. Garder actif avec PM2

```bash
npm install -g pm2

# Démarrer
pm2 start server.js --name velo-journal \
  --env ADMIN_PASSWORD=monmotdepasse \
  --env TRIP_TITLE="Paris → Rome"

# Démarrer automatiquement au reboot
pm2 startup
pm2 save
```

---

## Utilisation

### Poster une étape (vous, depuis le vélo)

1. Ouvrez `https://votre-domaine.fr/post` sur votre téléphone
2. Entrez le mot de passe (une seule fois, mémorisé 30 jours)
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
├── server.js          ← tout le code (backend + templates HTML)
├── package.json
├── data/
│   └── posts.json     ← vos étapes (auto-créé)
└── public/
    └── uploads/       ← vos photos (auto-créé)
```

## Sauvegardes

Sauvegardez régulièrement :

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
