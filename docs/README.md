# Site de présentation

`docs/index.html` est la page publique du projet : ce qu'est le carnet, à quoi
il ressemble, et comment le télécharger.

## Comment c'est construit

**Bootstrap 5.3.3**, servi en local depuis `vendor/` — le projet est
auto-hébergé, la page l'est aussi : aucun CDN, aucune requête vers un tiers en
dehors des polices Google. La navbar repliable, la grille, les cartes, les
badges, les boutons, la list-group et les utilitaires d'espacement viennent de
Bootstrap.

**L'habillage vient du carnet** (`src/views/layout.js`) : le bloc `<style>` de
la page recopie ses jetons de couleur dans `:root`, puis les branche sur les
variables de Bootstrap —

```css
--bs-body-bg: var(--warm-white);
--bs-body-color: var(--ink);
--bs-border-color: var(--sand);
--bs-link-color: var(--ocean);
```

— et sur celles des composants (`--bs-card-*`, `--bs-btn-*`,
`--bs-list-group-*`). Si l'interface du carnet change de couleurs, recopier ses
variables `:root` suffit à remettre la page d'aplomb. Le reste du bloc `<style>`
ne contient que ce que Bootstrap n'a pas : le bandeau de chiffres turquoise, le
bloc du profil altimétrique et le faux terminal.

Le vélo du bandeau est `public/bg.png`, réduit à 720 px (`img/bike.png`) : dans
le carnet il est blanc sur blanc, donc invisible ; ici il sert de texture sur le
turquoise.

## Publier

Dépôt GitHub → *Settings* → *Pages* → *Source : Deploy from a branch*, branche
`main`, dossier `/docs`. La page sera servie sur
`https://tmilefr.github.io/velo-journal/`.

## Mettre à jour Bootstrap

```bash
npm pack bootstrap@<version>
tar xzf bootstrap-<version>.tgz
cp package/dist/css/bootstrap.min.css docs/vendor/
cp package/dist/js/bootstrap.min.js   docs/vendor/
```

## Les images

Les captures de `img/` viennent du carnet de démonstration (`npm run demo`),
photographiées à 1 280 px de large. Pour les refaire après un changement
d'interface : installer la démo, lancer le serveur, capturer les pages Journal,
Distances, Finances, Commentaires, Diplôme, Livre et Affiche, puis les réduire
(1 100 px, JPEG qualité 78).

Le profil altimétrique de la section « démonstration » est un tableau
`[km, altitude]` extrait des traces GPX du carnet de démo, écrit en dur dans la
constante `PROFILE` du script — à régénérer si le voyage de démonstration change.

## Version autonome (fichier unique)

`build-artifact.py` produit une copie de la page en un seul fichier : Bootstrap
et les images inlinés, l'enveloppe `<html>`/`<head>`/`<body>` retirée. Utile
pour publier la page ailleurs que sur GitHub Pages.

```bash
python3 docs/build-artifact.py /tmp/velo-journal-site.html
```
