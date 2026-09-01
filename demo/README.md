# 🎒 Carnet de démonstration — *Nancy → Venise*

Un voyage complet, fabriqué de toutes pièces, pour découvrir le carnet sans
avoir à saisir quoi que ce soit — et pour montrer l'application à quelqu'un en
deux minutes.

```bash
npm install
npm run demo        # installe le carnet de démo
npm start           # http://localhost:3000
```

Mots de passe par défaut : **`famille2024`** (page famille) et **`velo2024`**
(admin, qui donne accès aux statistiques, aux finances et au menu Système).

| Commande | Effet |
|---|---|
| `npm run demo` | installe le carnet (refuse d'écraser un carnet existant) |
| `npm run demo -- --force` | écrase le carnet, après l'avoir sauvegardé dans `data/posts.avant-demo-*.json` |
| `npm run demo -- --svg` | photos en SVG au lieu de JPEG (utile sans `sharp`) |
| `npm run demo -- --no-photos` | données seules, sans images |
| `npm run demo -- --clean` | retire le carnet de démo et tous ses fichiers |

> ⚠️ `--force` remplace `data/posts.json`, `data/subscribers.json` et
> `data/settings.json`. Le carnet précédent est copié à côté avant d'être
> écrasé ; les photos de démo (préfixe `demo-`) sont les seules supprimées de
> `public/uploads/`, vos propres médias ne sont jamais touchés.

---

## Ce que contient le voyage

**Nancy → Venise, du 13 juin au 8 juillet 2026** : 1 546 km à vélo, 355 km de
train, 21 jours roulés sur 25, cinq pays.

| | |
|---|---|
| 29 publications | 3 articles de préparation, 26 étapes |
| 85 photos | paysage et portrait, dessinées à la volée |
| 20 traces GPX | avec altitude, calées sur les distances annoncées |
| 62 commentaires | 8 personnes, avec des fils de réponses |
| 79 dépenses | 6 910,90 €, toutes catégories et tous payeurs |
| 6 abonnés e-mail | 5 confirmés, 1 en attente de validation |

### Ce que chaque page a à montrer

- **📖 Journal** — photos, récits, cartes, commentaires et réponses, couchages,
  et le tri par visibilité (une étape réservée à l'admin, une autre à Margot).
- **📅 Timeline** et **🗺️ Carte** — l'itinéraire complet, 20 traces GPX bout à bout.
- **📏 Distances** — moyennes, records (112 km le 29 juin, 1 250 m D+ au col du
  Vršič), distance par mois, **un transfert en train** compté à part, et la
  répartition **par pays et par région** : neuf régions dans cinq pays, dont
  cinq étapes à cheval sur une frontière, réparties au prorata.
- **💶 Finances** — restaurant, hébergement (hôtel *et* camping), nourriture,
  divers ; par personne (Julie, Nico, commun) ; mois par mois ; les achats de
  préparation comptent dans le budget mais pas dans les kilomètres.
- **💬 Commentaires** — 62 messages, 8 prénoms, le filtre par personne et
  l'inversion de l'ordre.
- **🖼️ Affiche**, **📖 Livre photo** — les photos sont volontairement des
  verticales *et* des horizontales, et une partie des étapes a une sélection
  📖 explicite, pour montrer la mise en page.
- **🏅 Diplôme** — Margot rejoint le voyage **à Nuremberg** le 21 juin : la page
  s'ouvre déjà sur son diplôme (987 km, 14 jours de vélo, 6 023 m D+), sans
  rien saisir.
- **🔔 Abonnés** — dont une inscription en attente, à valider à la main.

---

## Comment c'est fabriqué

- **`trip.js`** — le voyage lui-même : des intentions, pas des chiffres. Les
  points de passage réels, le profil d'altitude, la distance et le dénivelé
  *annoncés* de chaque étape, les textes, les dépenses, les commentaires.
- **`seed.js`** — le fabricant. Il déduit une trace GPX plausible des points de
  passage (elle serpente jusqu'à faire exactement la distance annoncée, et son
  relief est ajusté au dénivelé annoncé), dessine les photos, puis écrit
  `data/posts.json`, `data/subscribers.json` et `data/settings.json`.

Deux propriétés utiles :

1. **Aucun appel réseau.** Ni tuiles, ni géocodage, ni API d'altitude : les
   pays et régions sont écrits directement dans les données, avec la même
   structure que celle produite par la détection automatique. La démo
   fonctionne dans un train.
2. **Reproductible.** Même graine, même carnet : les identifiants, les traces
   et les photos sont identiques d'une exécution à l'autre.

Les chiffres affichés survivent d'ailleurs à un **📐 Recalcul** depuis la page
Système : les distances et dénivelés stockés sont exactement ceux que
l'application recalculerait à partir des traces GPX.

### Faire son propre jeu de données

`trip.js` se lit comme un carnet de route ; son en-tête décrit chaque champ.
Ajouter une étape, c'est ajouter un objet dans le tableau `posts` :

```js
{
  day: 26,                                   // jour depuis le départ
  title: 'Retour par la lagune',
  location: 'Chioggia, Vénétie, Italie',
  at: [45.2190, 12.2790],                    // point d'arrivée
  route: [[45.4408, 12.3155], [45.2190, 12.2790]],
  ele: [2, 3],
  km: 54, dplus: 90,                         // ce que la trace devra mesurer
  geo: [['Italie', 'Vénétie', 'it', 54]],
  body: `<p>…</p>`,
  photos: [['La digue de Pellestrina', 'paysage']],
}
```

Puis `npm run demo -- --force`.

---

## Et pour une vraie démo en ligne ?

Le carnet de démo est fait pour être publié tel quel : rien de personnel, aucune
adresse réelle (tout est en `@example.com`), aucune coordonnée de domicile.
Pensez tout de même à changer les deux mots de passe par défaut avant de
l'exposer sur Internet.
