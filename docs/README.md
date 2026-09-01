# Site de présentation

`docs/index.html` est la page publique du projet : ce qu'est le carnet, à quoi
il ressemble, et comment le télécharger. Une seule page, sans dépendance —
polices Google en lien, tout le reste (styles, script, profil du voyage) est
dans le fichier.

**Publier** : dépôt GitHub → *Settings* → *Pages* → *Source : Deploy from a
branch*, branche `main`, dossier `/docs`. La page sera servie sur
`https://tmilefr.github.io/velo-journal/`.

Les captures de `img/` viennent du carnet de démonstration (`npm run demo`),
photographiées à 1 280 px de large. Pour les refaire après un changement
d'interface : installer la démo, lancer le serveur, capturer les pages
Journal, Distances, Finances, Commentaires, Diplôme, Livre et Affiche, puis
les réduire (1 100 px, JPEG qualité 78).

Le profil altimétrique dessiné dans la section « démonstration » est un tableau
`[km, altitude]` extrait des traces GPX du carnet de démo, écrit en dur dans la
constante `PROFILE` du script — à régénérer si le voyage de démonstration
change.
