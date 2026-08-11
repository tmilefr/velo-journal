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

`cities.json` — 9 648 villes du monde, extraites de
[GeoNames](https://www.geonames.org/) (licence CC BY 4.0) via le paquet
[`all-the-cities`](https://github.com/zeke/all-the-cities) (MIT) : toutes
celles de plus de 50 000 habitants, plus les capitales et les chefs-lieux
de région. Une ligne par ville, `[nom, latitude, longitude, milliers
d'habitants, capitale]`, triées de la plus peuplée à la moins peuplée —
l'affiche parcourt la liste dans l'ordre et s'arrête quand le cadre est
plein, ce qui étiquette d'abord les grandes villes. Les noms sont ceux de
GeoNames, donc dans la langue du pays (« Torino », pas « Turin »).
