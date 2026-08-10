# Fonds de carte

`countries-50m.json` — frontières et littoraux du monde entier au 1:50 000 000,
au format TopoJSON. Fichier repris tel quel du paquet
[`world-atlas`](https://github.com/topojson/world-atlas) (v2, licence ISC),
lui-même dérivé des données [Natural Earth](https://www.naturalearthdata.com/)
(domaine public).

Il est servi tel quel par `/public/geo/countries-50m.json` et décodé côté
client par l'affiche (`src/views/affiche.js`) : les arcs partagés par deux pays
sont tracés comme frontières, ceux qui n'appartiennent qu'à un seul comme
littoraux.
