// ── Jeu de données de démonstration : Nancy → Venise, été 2026 ──
//
// Ce fichier décrit un voyage complet, pensé pour montrer *toutes* les
// fonctionnalités du carnet : étapes et articles de préparation, jours de
// repos, étape sur plusieurs jours, transfert en train, cinq pays et leurs
// régions, dépenses de toutes catégories, couchages, commentaires et
// réponses, visibilités restreintes, photo de couverture et sélection pour le
// livre, compagnon de route qui rejoint en chemin (le diplôme).
//
// Il ne contient que des *intentions* : les kilomètres, le dénivelé, les
// traces GPX et les photos sont fabriqués par demo/seed.js à partir des
// points de passage ci-dessous. Rien n'est téléchargé, rien n'appelle de
// service externe : la démo fonctionne hors ligne.
//
// Format d'une étape :
//   day       décalage en jours depuis le départ
//   days      durée en jours (étape à cheval sur plusieurs journées)
//   hour      heure de publication (Europe/Paris), 19h par défaut
//   title     titre affiché
//   body      récit (HTML restreint : <p> <strong> <em> <h3> <ul> <li> <a>)
//   location  « Ville, Région, Pays » — sert aussi au repli de géolocalisation
//   route     points de passage [lat, lon] : la trace GPX est tracée dessus
//   ele       altitude (m) à chacun de ces points
//   km,dplus  cibles : la trace est fabriquée pour les atteindre
//   geo       répartition par région : [pays, région, code ISO, part des km]
//   photos    [légende, 'paysage' | 'portrait'] — la 1re est la couverture
//   book      indices des photos retenues pour le livre (défaut : toutes)
//   sleep     { label, comment, at: [lat, lon] }
//   expenses  [catégorie, sous-catégorie, payeur, montant, libellé]
//   comments  [prénom, message, jour, [réponses…]]
//   train     { from, to, km } — transfert ferroviaire
//   visibility 'all' (défaut) | 'margot' | 'admin'
//   privateNote note visible du seul administrateur

const TRIP = {
  title: 'Nancy → Venise',
  start: 'Nancy',
  end:   'Venise',
  departure: '2026-06-13',   // jour 0

  // Le compagnon de route qui monte en selle en cours de voyage : la page
  // 🏅 Diplôme retrouve son étape par ce nom de lieu.
  companion: { name: 'Margot', joinsAt: 'Nuremberg' },

  posts: [
    // ─────────────────────────── PRÉPARATION ───────────────────────────
    {
      type: 'preparation',
      date: '2026-03-08', hour: 21,
      title: 'Les vélos, les sacoches et la tente',
      location: 'Nancy, Grand Est, France',
      at: [48.6921, 6.1844],
      body: `<p>Six mois qu'on en parle le soir à table, et voilà : les deux vélos sont dans le garage. Des randonneuses en acier, cadre costaud, porte-bagages avant et arrière, moyeu dynamo pour l'éclairage et le téléphone.</p>
<p>On a fait le tour du matériel ce week-end, tout étalé sur le tapis du salon :</p>
<ul><li>quatre sacoches étanches, deux devant, deux derrière</li><li>une tente trois places qui pèse à peine 2,4 kg</li><li>un réchaud, deux gamelles, et le luxe absolu : une vraie cafetière italienne</li></ul>
<p><strong>Bilan : 38 kg à deux, sans l'eau ni la nourriture.</strong> On va essayer de descendre, mais personne n'a encore osé proposer de laisser la cafetière.</p>`,
      photos: [['Les deux vélos chargés dans le garage', 'paysage'], ['Le matériel étalé sur le tapis du salon', 'portrait']],
      expenses: [
        ['divers', null, 'nico',   1450, 'Vélo de voyage — Nico'],
        ['divers', null, 'julie',  1380, 'Vélo de voyage — Julie'],
        ['divers', null, 'commun',  420, 'Sacoches étanches (x4)'],
        ['divers', null, 'commun',  310, 'Tente 3 places'],
        ['divers', null, 'commun',  145, 'Réchaud, gamelles, popote'],
      ],
      comments: [
        ['Mamie', 'Mon Dieu, 38 kilos ! Vous êtes bien sûrs de vous ? Prenez au moins des chaussettes de rechange.', 2,
          [['Julie', 'Promis Mamie, quatre paires chacun. Et la cafetière reste. 😄', 3]]],
        ['Tonton Marc', 'Le moyeu dynamo, c\'est le meilleur investissement du lot. Vous me remercierez en Autriche.', 4],
      ],
    },
    {
      type: 'preparation',
      date: '2026-04-12', hour: 18,
      title: 'L\'itinéraire : de la Meurthe à la lagune',
      location: 'Nancy, Grand Est, France',
      at: [48.6921, 6.1844],
      body: `<p>Le tracé est arrêté. On part de la maison, on suit le canal de la Marne au Rhin jusqu'à Strasbourg, on traverse le Bade-Wurtemberg et la Bavière jusqu'au Danube, et on descend le fleuve jusqu'à Vienne.</p>
<p>Là, un train nous emmène de l'autre côté des Alpes, à Villach. Ensuite ce sont les Alpes juliennes, le col du Vršič, la vallée de la Soča, et enfin la plaine du Frioul jusqu'à Venise.</p>
<h3>En chiffres prévus</h3>
<ul><li>environ 1 600 km à vélo</li><li>4 semaines, 21 jours de selle</li><li>5 pays : France, Allemagne, Autriche, Slovénie, Italie</li></ul>
<p><em>Et une inconnue de taille : Margot nous rejoint à Nuremberg, en train, avec son vélo. Elle fera la seconde moitié avec nous.</em></p>`,
      photos: [['La carte punaisée au mur, tracée au feutre rouge', 'paysage']],
      comments: [
        ['Papi', 'Le Danube à vélo, j\'en rêve depuis quarante ans. Vous ferez une photo à Passau pour moi ?', 5],
        ['Léa', 'Le col du Vršič, j\'y suis allée en voiture, ça monte VRAIMENT. Bon courage 😅', 9],
        ['Classe de CM2', 'Bonjour ! Notre maîtresse nous a montré votre carte. On va suivre votre voyage toute l\'année. Bon vent !', 14,
          [['Nico', 'Merci les CM2 ! On vous enverra des photos de chaque pays. Regardez bien la carte : combien de frontières on va traverser ?', 15]]],
      ],
    },
    {
      type: 'preparation',
      date: '2026-05-20', hour: 12,
      title: 'Les billets du retour sont pris',
      location: 'Nancy, Grand Est, France',
      at: [48.6921, 6.1844],
      body: `<p>C'est fait : quatre places Venise → Nancy avec les vélos, le 11 juillet. Réserver le retour rend la chose soudain très réelle.</p>
<p>Le compte à rebours est lancé : <strong>24 jours</strong>.</p>`,
      photos: [['Les billets imprimés sur la table de la cuisine', 'portrait']],
      expenses: [['divers', null, 'commun', 268, 'Billets de train du retour (4 pers. + vélos)']],
    },

    // ─────────────────────────── LE VOYAGE ───────────────────────────
    {
      day: 0, hour: 10,
      title: 'Jour 0 — On y va',
      location: 'Nancy, Grand Est, France',
      at: [48.6921, 6.1844],
      km: 0, dplus: 0,
      geo: [['France', 'Grand Est', 'fr', 1]],
      body: `<p>Photo devant la maison, les voisins sur le pas de la porte, un peu de vent. On ne roule pas aujourd'hui : on charge, on vérifie, on dort une dernière fois dans un vrai lit.</p>
<p>Demain matin, plein est.</p>`,
      photos: [['Devant la maison, prêts à partir', 'paysage'], ['Les sacoches sanglées une dernière fois', 'portrait']],
      sleep: { label: 'À la maison, dernière nuit', comment: 'Personne n\'a vraiment dormi.', at: [48.6921, 6.1844] },
      comments: [
        ['Mamie', 'Bon voyage mes chéris. Écrivez tous les jours !', 0],
        ['Tonton Marc', 'Vent dans le dos !', 0],
        ['Papi', 'On est tous derrière vous. Fais attention aux camions à la sortie de Nancy.', 0],
      ],
    },
    {
      day: 1,
      title: 'Le canal, tout droit, toute la journée',
      location: 'Saverne, Grand Est, France',
      at: [48.7407, 7.3624],
      route: [[48.6921, 6.1844], [48.7357, 7.0553], [48.7407, 7.3624]],
      ele: [212, 265, 190],
      km: 92, dplus: 340,
      geo: [['France', 'Grand Est', 'fr', 92]],
      body: `<p>Première journée et déjà une leçon : un canal, ça ne monte pas. On a suivi la Marne au Rhin sur près de quatre-vingts kilomètres de chemin de halage, entre les peupliers et les péniches.</p>
<p>Le plan incliné de Saint-Louis-Arzviller nous a coupé le souffle — une écluse qui soulève les bateaux de quarante mètres. On est restés vingt minutes à regarder.</p>
<p>Arrivée à Saverne en fin d'après-midi, jambes lourdes, moral haut.</p>`,
      photos: [['Le chemin de halage sous les peupliers', 'paysage'], ['Une péniche croisée vers Réchicourt', 'paysage'], ['Julie et sa première crevaison (dix minutes chrono)', 'portrait']],
      book: [0, 2],
      sleep: { label: 'Camping municipal de Saverne', comment: 'Emplacement au bord de l\'eau, douches chaudes, 18 € la nuit. Les grenouilles ont chanté jusqu\'à minuit.', at: [48.7365, 7.3510] },
      expenses: [
        ['hebergement', 'camping', 'commun', 18, 'Camping municipal'],
        ['nourriture',  null,     'julie',  14.6, 'Courses du soir (pâtes, tomates, fromage)'],
        ['restaurant',  null,     'nico',   9.5,  'Deux cafés et une tarte à Sarrebourg'],
      ],
      comments: [
        ['Mamie', '78 km le premier jour ! Vous allez trop vite, ménagez-vous.', 1],
        ['Léa', 'Le plan incliné c\'est fou hein ? Ma photo préférée d\'Alsace.', 1,
          [['Nico', 'On n\'avait jamais vu ça. Margot va adorer les vidéos.', 2]]],
      ],
    },
    {
      day: 2,
      title: 'Descente sur Strasbourg',
      location: 'Strasbourg, Grand Est, France',
      at: [48.5734, 7.7521],
      route: [[48.7407, 7.3624], [48.6300, 7.5200], [48.5734, 7.7521]],
      ele: [190, 175, 142],
      km: 52, dplus: 180,
      geo: [['France', 'Grand Est', 'fr', 52]],
      body: `<p>Petite étape, exprès. On descend le canal jusqu'aux quais, on se faufile entre les cyclistes strasbourgeois — ici tout le monde roule, c'est déconcertant — et on pose les vélos devant la cathédrale à midi.</p>
<p>Après-midi de flâneurs : la Petite France, un bretzel démesuré, une sieste sur un banc de l'Orangerie.</p>`,
      photos: [['La cathédrale au bout de la rue Mercière', 'portrait'], ['Les vélos garés devant la Petite France', 'paysage'], ['Le bretzel de la victoire', 'portrait']],
      sleep: { label: 'Chez Anne et Karim, amis de fac', comment: 'Vrai lit, vraie douche, vraie machine à laver. Le luxe absolu.', at: [48.5800, 7.7400] },
      expenses: [
        ['restaurant', null, 'commun', 46.8, 'Tarte flambée et vin blanc, tous les quatre'],
        ['divers',     null, 'nico',    7.9, 'Chambre à air de rechange'],
      ],
      comments: [
        ['Papi', 'La Petite France ! Ta grand-mère et moi y étions en 1974.', 2],
      ],
    },
    {
      day: 3, hour: 20,
      title: 'Journée sans vélo',
      location: 'Strasbourg, Grand Est, France',
      at: [48.5734, 7.7521],
      km: 0, dplus: 0,
      geo: [['France', 'Grand Est', 'fr', 1]],
      body: `<p>Jour de repos assumé. On a lavé trois semaines de linge en une machine, réglé un dérailleur récalcitrant, mangé beaucoup trop.</p>
<p>Demain on passe le Rhin : première frontière.</p>`,
      photos: [['Le linge qui sèche au balcon', 'paysage']],
      sleep: { label: 'Chez Anne et Karim (2e nuit)', comment: '', at: [48.5800, 7.7400] },
      expenses: [
        ['nourriture', null, 'julie', 32.4, 'Courses pour trois jours'],
        ['divers',     null, 'commun', 12, 'Laverie'],
      ],
    },
    {
      day: 4,
      title: 'Passage du Rhin, bonjour l\'Allemagne',
      location: 'Karlsruhe, Bade-Wurtemberg, Allemagne',
      at: [49.0069, 8.4037],
      route: [[48.5734, 7.7521], [48.8100, 8.0700], [48.8583, 8.2044], [49.0069, 8.4037]],
      ele: [142, 128, 122, 115],
      km: 88, dplus: 260,
      geo: [['France', 'Grand Est', 'fr', 34], ['Allemagne', 'Bade-Wurtemberg', 'de', 54]],
      body: `<p>On a traversé le Rhin sur la passerelle d'Iffezheim, à pied, en poussant les vélos. Pas de barrière, pas de contrôle, juste un panneau bleu à douze étoiles et un changement de revêtement.</p>
<p>De l'autre côté, l'Allemagne à vélo tient sa réputation : pistes larges, signalisation impeccable, et des cyclistes de soixante-dix ans qui nous doublent en côte.</p>
<p><strong>Première étape à cheval sur deux pays</strong> — la trace s'en souvient, les statistiques aussi.</p>`,
      photos: [['La passerelle sur le Rhin, un pied dans chaque pays', 'paysage'], ['Le panneau d\'entrée en Allemagne', 'portrait'], ['Piste cyclable en forêt vers Rastatt', 'paysage'], ['Premier Apfelschorle de la série', 'portrait']],
      book: [0, 2],
      sleep: { label: 'Camping Turmbergblick, Karlsruhe', comment: 'Un peu loin du centre mais impeccable. 22 €.', at: [49.0100, 8.4600] },
      expenses: [
        ['hebergement', 'camping', 'commun', 22, 'Camping Turmbergblick'],
        ['restaurant',  null,     'nico',   28.5, 'Currywurst et frites, les deux'],
        ['nourriture',  null,     'julie',  11.2, 'Petit-déjeuner du lendemain'],
      ],
      comments: [
        ['Classe de CM2', 'On a trouvé sur la carte ! Le Rhin sépare la France et l\'Allemagne. Est-ce que les gens parlent français là-bas ?', 5,
          [['Julie', 'Un peu près de la frontière ! Et nous on parle allemand comme des vaches espagnoles. On montre du doigt et on sourit beaucoup. 😊', 5]]],
        ['Mamie', 'Une frontière sans douanier, quelle époque.', 5],
      ],
    },
    {
      day: 5,
      title: 'La journée des collines du Kraichgau',
      location: 'Heilbronn, Bade-Wurtemberg, Allemagne',
      at: [49.1427, 9.2109],
      route: [[49.0069, 8.4037], [49.0369, 8.7069], [49.1364, 8.9128], [49.1427, 9.2109]],
      ele: [115, 210, 245, 158],
      km: 92, dplus: 810,
      geo: [['Allemagne', 'Bade-Wurtemberg', 'de', 92]],
      body: `<p>Fini le plat. Le Kraichgau, c'est une succession de bosses courtes et raides entre des champs de colza, et à chaque sommet le même paysage recommencé, en plus beau.</p>
<p>810 mètres de dénivelé : le premier vrai jour de jambes. On a fini sur les quais du Neckar, jus de pomme frais à la main, dans une lumière d'or.</p>`,
      photos: [['Bosse après bosse dans le colza', 'paysage'], ['Le village d\'Eppingen depuis la crête', 'paysage'], ['Les quais du Neckar au coucher du soleil', 'paysage']],
      sleep: { label: 'Gasthof zum Ochsen', comment: 'Chambre familiale, petit-déjeuner monstrueux inclus. 78 €.', at: [49.1400, 9.2200] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 78, 'Gasthof zum Ochsen'],
        ['restaurant',  null,   'julie',  34.2, 'Dîner sur les quais'],
        ['nourriture',  null,   'nico',    8.4, 'Jus de pomme et bretzels'],
      ],
      comments: [
        ['Tonton Marc', '810 m de D+ chargés, chapeau. C\'est là qu\'on est content d\'avoir mis un triple plateau.', 6],
      ],
    },
    {
      day: 6,
      title: 'Forêts, ruisseaux et une ville toute en colombages',
      location: 'Schwäbisch Hall, Bade-Wurtemberg, Allemagne',
      at: [49.1127, 9.7380],
      route: [[49.1427, 9.2109], [49.1993, 9.5058], [49.1127, 9.7380]],
      ele: [158, 230, 304],
      km: 71, dplus: 620,
      geo: [['Allemagne', 'Bade-Wurtemberg', 'de', 71]],
      body: `<p>Étape courte, forestière, silencieuse. On a roulé deux heures sans croiser une voiture, juste des chevreuils et un chemin qui longe le Kocher.</p>
<p>Schwäbisch Hall se mérite : ça monte sec à l'entrée, puis la ville s'ouvre d'un coup, escalier monumental, colombages, marché aux fleurs. On a mangé une glace sur les marches de l'église en regardant les gens passer.</p>`,
      photos: [['Le chemin le long du Kocher', 'paysage'], ['L\'escalier de Saint-Michel', 'portrait'], ['Glace sur les marches', 'portrait']],
      sleep: { label: 'Camping am Steinbacher See', comment: 'Au bord du lac, baignade à 19 h. 19,50 €.', at: [49.1000, 9.7100] },
      expenses: [
        ['hebergement', 'camping', 'commun', 19.5, 'Camping am Steinbacher See'],
        ['nourriture',  null,     'julie',  16.8, 'Courses au supermarché'],
        ['restaurant',  null,     'nico',    7.2, 'Deux glaces sur la place'],
      ],
    },
    {
      day: 7,
      title: 'Vers la Bavière, par la route romantique',
      location: 'Rothenburg ob der Tauber, Bavière, Allemagne',
      at: [49.3777, 10.1790],
      route: [[49.1127, 9.7380], [49.1352, 10.0716], [49.3777, 10.1790]],
      ele: [304, 413, 425],
      km: 76, dplus: 680,
      geo: [['Allemagne', 'Bade-Wurtemberg', 'de', 31], ['Allemagne', 'Bavière', 'de', 45]],
      body: `<p>On change de Land en milieu de journée, quelque part entre deux champs — un panneau, un lion bleu et blanc, et c'est la Bavière.</p>
<p>Rothenburg est une carte postale qui existe vraiment : remparts complets, ruelles pavées, tourelles. Trop de cars de touristes à 15 h, personne à 21 h. On a fait le tour des remparts au crépuscule, seuls.</p>`,
      photos: [['Le Plönlein, la maison de travers', 'portrait'], ['Le chemin de ronde au crépuscule', 'paysage'], ['Les vélos contre les remparts', 'paysage'], ['La porte du Burgtor à contre-jour', 'portrait']],
      book: [1, 3],
      sleep: { label: 'Auberge de jeunesse de Rothenburg', comment: 'Dans un ancien moulin, dortoir familial. 64 € pour quatre.', at: [49.3750, 10.1800] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 64, 'Auberge de jeunesse'],
        ['restaurant',  null,   'julie',  52.4, 'Dîner dans la vieille ville'],
        ['divers',      null,   'commun',  9,   'Carte postale + timbres pour Mamie'],
      ],
      comments: [
        ['Mamie', 'J\'ai reçu la carte postale ! Elle est sur le frigo.', 12],
        ['Léa', 'Rothenburg vide le soir, c\'est le vrai secret. Bien joué.', 8],
      ],
    },
    {
      day: 8,
      title: 'Nuremberg — les retrouvailles',
      location: 'Nuremberg, Bavière, Allemagne',
      at: [49.4521, 11.0767],
      route: [[49.3777, 10.1790], [49.3009, 10.5713], [49.4521, 11.0767]],
      ele: [425, 409, 309],
      km: 88, dplus: 540,
      geo: [['Allemagne', 'Bavière', 'de', 88]],
      body: `<p>On a roulé vite, aujourd'hui. Pas parce que c'était facile — parce que Margot arrivait à 18 h 42 en gare de Nuremberg, avec son vélo dans le fourgon.</p>
<p>Elle est descendue du train, elle avait l'air minuscule à côté de sa monture, elle a dit « alors, on part quand ? » avant même de dire bonjour.</p>
<p><strong>À partir de demain, on est trois.</strong></p>`,
      photos: [['Margot et son vélo sur le quai de la gare', 'portrait'], ['Le château de Nuremberg au-dessus des toits', 'paysage'], ['Le premier repas à trois', 'paysage']],
      sleep: { label: 'Hôtel Elch, vieille ville', comment: 'Maison à colombages du XIVe siècle, planchers qui craquent. 96 €.', at: [49.4550, 11.0730] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 96, 'Hôtel Elch'],
        ['restaurant',  null,   'nico',   61.5, 'Saucisses de Nuremberg, les trois'],
        ['nourriture',  null,   'julie',  13.9, 'Petit-déjeuner et fruits'],
      ],
      comments: [
        ['Mamie', 'Ma Margot est arrivée ! Photo de vous trois s\'il vous plaît !!', 8,
          [['Nico', 'Regarde la dernière photo Mamie 😊', 9], ['Mamie', 'Elle a grandi. Vous me la ramenez entière hein.', 9]]],
        ['Papi', 'Bienvenue à bord Margot !', 8],
        ['Classe de CM2', 'Bonjour Margot ! Est-ce que tu as déjà fait du vélo aussi longtemps ?', 9,
          [['Margot', 'Jamais ! Mon record c\'était 30 km. Demain on en fait 100. J\'ai un peu peur. 😬', 10]]],
      ],
    },
    {
      day: 9, days: 2, hour: 20,
      title: 'Deux jours à Nuremberg pour préparer la suite',
      location: 'Nuremberg, Bavière, Allemagne',
      at: [49.4521, 11.0767],
      km: 0, dplus: 0,
      geo: [['Allemagne', 'Bavière', 'de', 1]],
      body: `<p>Deux jours sans rouler : révision complète des trois vélos chez un mécano de la Südstadt, montage du porte-bagages de Margot, courses, et une visite du musée du jouet qui nous a tous rendus nostalgiques.</p>
<p>Margot a appris à réparer une crevaison. Trois fois. Elle a chronométré : 6 minutes 40 à la fin.</p>
<p><em>Étape à cheval sur deux journées — le carnet sait compter ça.</em></p>`,
      photos: [['L\'atelier du mécano de la Südstadt', 'paysage'], ['Margot, démonte-pneu à la main', 'portrait'], ['Le musée du jouet', 'paysage']],
      sleep: { label: 'Hôtel Elch (2 nuits)', comment: '', at: [49.4550, 11.0730] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 192, 'Hôtel Elch, deux nuits'],
        ['divers',      null,   'nico',    84.5, 'Révision des trois vélos + porte-bagages'],
        ['nourriture',  null,   'julie',   41.3, 'Courses pour la vallée du Danube'],
        ['restaurant',  null,   'commun',  38,   'Déjeuner au marché'],
      ],
    },
    {
      day: 11,
      title: 'Première étape de Margot : cap sur le Danube',
      location: 'Ratisbonne, Bavière, Allemagne',
      at: [49.0134, 12.1016],
      route: [[49.4521, 11.0767], [49.2803, 11.4617], [49.0134, 12.1016]],
      ele: [309, 425, 337],
      km: 104, dplus: 720,
      geo: [['Allemagne', 'Bavière', 'de', 104]],
      body: `<p>104 kilomètres pour un premier jour, c'est beaucoup. Margot n'a pas dit un mot de la première heure, puis elle a commencé à chanter, et elle n'a plus arrêté.</p>
<p>Arrivée sur le pont de pierre de Ratisbonne au soleil couchant, le Danube en dessous, large et vert. Elle a levé les bras. Nous aussi.</p>
<blockquote>« C'est le plus long truc que j'ai fait de ma vie. »</blockquote>`,
      photos: [['Margot en tête sur la piste', 'paysage'], ['Le pont de pierre de Ratisbonne', 'paysage'], ['Les trois vélos et le Danube', 'paysage'], ['Bras levés à l\'arrivée', 'portrait']],
      book: [1, 3],
      sleep: { label: 'Camping Azur, île du Danube', comment: 'Les pieds dans le fleuve. 24 €.', at: [49.0200, 12.1200] },
      expenses: [
        ['hebergement', 'camping', 'commun', 24, 'Camping Azur'],
        ['restaurant',  null,     'nico',   45.6, 'Wurstkuchl, la plus vieille gargote d\'Allemagne'],
        ['nourriture',  null,     'julie',  12.1, 'Fruits et pain'],
      ],
      comments: [
        ['Mamie', '104 km ! Margot, ma championne !', 11],
        ['Tonton Marc', 'Le Wurstkuchl ! 500 ans de saucisses. Vous avez bien fait.', 12],
        ['Classe de CM2', 'Bravo Margot ! On a calculé : 104 km c\'est comme aller de l\'école à la mer !', 12,
          [['Margot', 'Et j\'ai chanté pendant 80 km. Papa et Maman en ont marre de ma chanson. 🎵', 13]]],
      ],
    },
    {
      day: 12,
      title: 'Le fleuve fait le travail',
      location: 'Straubing, Bavière, Allemagne',
      at: [48.8817, 12.5760],
      route: [[49.0134, 12.1016], [48.9300, 12.3200], [48.8817, 12.5760]],
      ele: [337, 328, 320],
      km: 56, dplus: 140,
      geo: [['Allemagne', 'Bavière', 'de', 56]],
      body: `<p>Jambes de coton après hier : on a fait court et plat. La piste du Danube est un tapis roulant, on ne pédale presque pas.</p>
<p>Baignade dans un bras mort du fleuve à midi, sieste dans l'herbe, arrivée à Straubing avant le goûter. Certaines journées sont des cadeaux.</p>`,
      photos: [['Baignade dans le bras mort', 'paysage'], ['Sieste dans l\'herbe, vélos couchés', 'paysage']],
      sleep: { label: 'Camping Straubing', comment: 'Simple et propre, 21 €.', at: [48.8900, 12.5700] },
      expenses: [
        ['hebergement', 'camping', 'commun', 21, 'Camping Straubing'],
        ['nourriture',  null,     'julie',  22.7, 'Courses et glaces'],
      ],
    },
    {
      day: 13,
      title: 'Passau, la ville des trois rivières',
      location: 'Passau, Bavière, Allemagne',
      at: [48.5667, 13.4319],
      route: [[48.8817, 12.5760], [48.8355, 12.9600], [48.6270, 13.1830], [48.5667, 13.4319]],
      ele: [320, 312, 305, 291],
      km: 98, dplus: 380,
      geo: [['Allemagne', 'Bavière', 'de', 98]],
      body: `<p>Longue journée le long du fleuve, avec ce vent d'est qui nous a mis les nerfs à vif pendant trois heures.</p>
<p>Et puis Passau, la récompense : la pointe où le Danube, l'Inn et l'Ilz se rejoignent, chacun d'une couleur différente. On voit vraiment la ligne dans l'eau. Papi, la photo est pour toi.</p>`,
      photos: [['Le confluent des trois rivières', 'paysage'], ['La vieille ville depuis la forteresse', 'paysage'], ['Vent de face, tête dans le guidon', 'portrait']],
      sleep: { label: 'Pension Rößner', comment: 'Vue sur l\'Inn depuis la fenêtre. 82 €.', at: [48.5700, 13.4600] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 82, 'Pension Rößner'],
        ['restaurant',  null,   'julie',  58.9, 'Dîner au bord de l\'eau'],
        ['nourriture',  null,   'nico',   15.4, 'Pique-nique du midi'],
      ],
      comments: [
        ['Papi', 'La photo du confluent. J\'ai attendu quarante ans pour la voir. Merci mon grand.', 14,
          [['Nico', 'On pensait à toi tout du long. On y retournera ensemble.', 14]]],
      ],
    },
    {
      day: 14,
      title: 'Deuxième frontière : l\'Autriche',
      location: 'Linz, Haute-Autriche, Autriche',
      at: [48.3064, 14.2861],
      route: [[48.5667, 13.4319], [48.4560, 13.4330], [48.3500, 13.9000], [48.3064, 14.2861]],
      ele: [291, 313, 290, 266],
      km: 96, dplus: 430,
      geo: [['Allemagne', 'Bavière', 'de', 22], ['Autriche', 'Haute-Autriche', 'at', 74]],
      body: `<p>La frontière autrichienne est un pont sur l'Inn à Schärding, et un panneau rouge et blanc. Margot a posé un pied de chaque côté pour la photo, comme au Rhin. C'est devenu un rituel.</p>
<p>La vallée se resserre, les collines se boisent, les fermes deviennent des chalets. On dort à Linz, ville de béton et d'art numérique, plus belle qu'on ne l'imaginait.</p>`,
      photos: [['Un pied en Allemagne, un pied en Autriche', 'portrait'], ['La vallée du Danube en aval de Schärding', 'paysage'], ['L\'Ars Electronica Center allumé la nuit', 'paysage']],
      sleep: { label: 'Camping Pichlingersee', comment: 'À côté du lac, un peu bruyant (autoroute). 20 €.', at: [48.2500, 14.3800] },
      expenses: [
        ['hebergement', 'camping', 'commun', 20, 'Camping Pichlingersee'],
        ['restaurant',  null,     'nico',   49.8, 'Schnitzel géants'],
        ['nourriture',  null,     'julie',   9.6, 'Petit-déjeuner'],
        ['divers',      null,     'commun', 11.5, 'Deux patins de frein'],
      ],
      comments: [
        ['Classe de CM2', 'Ça fait 3 pays ! France, Allemagne, Autriche. Il en reste combien ?', 15,
          [['Julie', 'Encore deux : la Slovénie et l\'Italie. Cherchez-les sur la carte 🗺️', 15]]],
      ],
    },
    {
      day: 15,
      title: 'La boucle de la Wachau',
      location: 'Melk, Basse-Autriche, Autriche',
      at: [48.2276, 15.3345],
      route: [[48.3064, 14.2861], [48.2264, 14.8506], [48.2276, 15.3345]],
      ele: [266, 232, 213],
      km: 92, dplus: 460,
      geo: [['Autriche', 'Haute-Autriche', 'at', 48], ['Autriche', 'Basse-Autriche', 'at', 44]],
      body: `<p>Les gorges du Strudengau, puis l'entrée dans la Wachau : vignes en terrasses, abricotiers, châteaux en ruine sur chaque promontoire.</p>
<p>L'abbaye de Melk apparaît au détour du fleuve, énorme, jaune, posée sur son rocher comme un paquebot. On est restés bêtes devant.</p>`,
      photos: [['Les terrasses de vigne de la Wachau', 'paysage'], ['L\'abbaye de Melk depuis le fleuve', 'paysage'], ['Abricots achetés à une ferme', 'portrait']],
      sleep: { label: 'Camping Melk', comment: 'Au pied de l\'abbaye, éclairée toute la nuit. 23 €.', at: [48.2300, 15.3300] },
      expenses: [
        ['hebergement', 'camping', 'commun', 23, 'Camping Melk'],
        ['nourriture',  null,     'julie',  18.4, 'Abricots, pain, fromage'],
        ['restaurant',  null,     'commun', 41.2, 'Heuriger du village'],
      ],
    },
    {
      day: 16,
      title: 'Vienne au bout du guidon',
      location: 'Vienne, Vienne, Autriche',
      at: [48.2082, 16.3738],
      route: [[48.2276, 15.3345], [48.3300, 15.7000], [48.3300, 16.0600], [48.2082, 16.3738]],
      ele: [213, 194, 180, 171],
      km: 112, dplus: 390,
      geo: [['Autriche', 'Basse-Autriche', 'at', 78], ['Autriche', 'Vienne', 'at', 34]],
      body: `<p><strong>La plus longue journée du voyage : 112 km.</strong> Vent dans le dos toute la matinée, on volait.</p>
<p>Entrée dans Vienne par l'île du Danube, au milieu des baigneurs et des barbecues. On a traversé la ville jusqu'au Prater, et on a mangé une Sachertorte qu'on n'avait absolument pas méritée. Enfin si, un peu.</p>`,
      photos: [['Vent dans le dos sur la piste du Danube', 'paysage'], ['L\'île du Danube et ses baigneurs', 'paysage'], ['La grande roue du Prater', 'portrait'], ['La Sachertorte, gros plan', 'portrait']],
      book: [0, 2, 3],
      sleep: { label: 'Appartement loué, Leopoldstadt', comment: 'Deux nuits, machine à laver, cuisine. 145 € les deux nuits.', at: [48.2200, 16.3900] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 145, 'Appartement Leopoldstadt (2 nuits)'],
        ['restaurant',  null,   'julie',  27.5, 'Sachertorte et cafés'],
        ['nourriture',  null,   'nico',   28.9, 'Courses'],
      ],
      comments: [
        ['Léa', '112 bornes ! Vous êtes devenus des machines.', 17],
        ['Mamie', 'La Sachertorte, j\'en rêve. Rapportez-en une part.', 17,
          [['Margot', 'Mamie, elle n\'aurait pas survécu aux Alpes. 🍰', 17]]],
      ],
    },
    {
      day: 17, hour: 21,
      title: 'Vienne, jour de musées et de lessive',
      location: 'Vienne, Vienne, Autriche',
      at: [48.2082, 16.3738],
      km: 0, dplus: 0,
      geo: [['Autriche', 'Vienne', 'at', 1]],
      body: `<p>Repos. Le Belvédère le matin, le marché du Naschmarkt à midi, une sieste de deux heures l'après-midi, et un tram jusqu'à la gare pour repérer le quai des vélos.</p>
<p>Demain on saute les Alpes en train : Vienne → Villach, 355 km de rail, quatre heures et demie. Un peu de triche assumée.</p>`,
      photos: [['Le Belvédère et ses jardins', 'paysage'], ['Le Naschmarkt', 'paysage']],
      sleep: { label: 'Appartement, Leopoldstadt (2e nuit)', comment: '', at: [48.2200, 16.3900] },
      expenses: [
        ['restaurant', null, 'commun', 54.3, 'Déjeuner au Naschmarkt'],
        ['divers',     null, 'julie',  33,   'Entrées du Belvédère (3)'],
        ['nourriture', null, 'nico',   19.7, 'Provisions pour le train'],
      ],
    },
    {
      day: 18, hour: 18,
      title: 'Par-dessus les Alpes, en train',
      location: 'Villach, Carinthie, Autriche',
      at: [46.6103, 13.8558],
      km: 12, dplus: 90,
      train: { from: 'Vienne Hauptbahnhof', to: 'Villach Hauptbahnhof', km: 355 },
      geo: [['Autriche', 'Carinthie', 'at', 12]],
      body: `<p>Quatre heures trente de train, les trois vélos accrochés côte à côte dans le fourgon, le Semmering, les tunnels, et de l'autre côté un autre monde : des montagnes pointues, une lumière plus dure, des noms qui sonnent slaves.</p>
<p>12 petits kilomètres du gare à l'auberge pour se dégourdir les jambes, et une baignade dans le lac d'Ossiach.</p>
<p><em>Ces 355 km de rail ne comptent pas comme du vélo — le carnet les range à part, dans le trajet total parcouru.</em></p>`,
      photos: [['Les trois vélos dans le fourgon', 'portrait'], ['Le Semmering par la fenêtre', 'paysage'], ['Baignade dans le lac d\'Ossiach', 'paysage']],
      sleep: { label: 'Auberge du lac, Ossiach', comment: 'Dortoir de six, on était seuls. 54 €.', at: [46.6700, 13.9800] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 54, 'Auberge du lac'],
        ['divers',      null,   'commun', 96, 'Billets de train + 3 vélos'],
        ['restaurant',  null,   'nico',   36.8, 'Dîner au bord du lac'],
      ],
      comments: [
        ['Tonton Marc', 'Prendre le train, c\'est pas tricher, c\'est de la stratégie.', 19],
        ['Classe de CM2', 'Est-ce que les vélos ont un billet aussi ?', 19,
          [['Nico', 'Oui ! Un billet chacun, et un emplacement réservé dans un wagon spécial. 🚆🚲', 19]]],
      ],
    },

    {
      day: 19,
      title: 'Quatrième pays : la Slovénie',
      location: 'Kranjska Gora, Haute-Carniole, Slovénie',
      at: [46.4838, 13.7856],
      route: [[46.6103, 13.8558], [46.5470, 13.7100], [46.4970, 13.7100], [46.4838, 13.7856]],
      ele: [501, 580, 864, 810],
      km: 48, dplus: 620,
      geo: [['Autriche', 'Carinthie', 'at', 27], ['Slovénie', 'Haute-Carniole', 'si', 21]],
      body: `<p>Le triple point : à Rateče, on peut voir l'Autriche, l'Italie et la Slovénie d'un seul regard. Margot a voulu poser un pied dans chaque pays — c'est physiquement impossible, mais elle a essayé longtemps.</p>
<p>Ça monte doucement toute la journée, sur une ancienne voie ferrée transformée en piste. Kranjska Gora est au pied des Alpes juliennes, murailles grises qui bouchent tout l'horizon sud. Demain, on passe par-dessus.</p>`,
      photos: [['Le panneau slovène et les Alpes juliennes derrière', 'paysage'], ['La piste sur l\'ancienne voie ferrée', 'paysage'], ['Margot cherchant le triple point', 'portrait']],
      sleep: { label: 'Camp Špik, Gozd Martuljek', comment: 'Vue sur la face nord du Špik depuis la tente. 26 €.', at: [46.4900, 13.8300] },
      expenses: [
        ['hebergement', 'camping', 'commun', 26, 'Camp Špik'],
        ['nourriture',  null,     'julie',  24.8, 'Grosses courses avant le col'],
        ['restaurant',  null,     'nico',   31.4, 'Štruklji et soupe de champignons'],
      ],
      comments: [
        ['Classe de CM2', '4 pays !! Il n\'en manque plus qu\'un !', 20],
        ['Papi', 'Les Alpes juliennes. Faites attention demain, ce col n\'est pas une plaisanterie.', 20],
      ],
    },
    {
      day: 20,
      title: 'Le col du Vršič — 50 lacets et beaucoup de silence',
      location: 'Bovec, Gorizia, Slovénie',
      at: [46.3383, 13.5522],
      route: [[46.4838, 13.7856], [46.4333, 13.7472], [46.3800, 13.7300], [46.3383, 13.5522]],
      ele: [810, 1611, 620, 434],
      km: 46, dplus: 1250,
      geo: [['Slovénie', 'Haute-Carniole', 'si', 18], ['Slovénie', 'Gorizia', 'si', 28]],
      body: `<h3>1 611 mètres, 24 lacets pavés à la montée, 26 à la descente</h3>
<p>On est partis à 6 h 30 pour éviter la chaleur. Les lacets sont numérotés à l'envers, du 50 au 1 : on les compte, ça aide. Les pavés du haut font vibrer les sacoches et les dents.</p>
<p>Margot a poussé son vélo sur trois lacets, puis elle est remontée dessus et n'a plus mis pied à terre. Au sommet, elle pleurait un peu et elle riait beaucoup. La chapelle russe, en bas dans les mélèzes, nous a tous rendus silencieux.</p>
<p>La descente sur la vallée de la Soča : une eau turquoise à ne pas y croire, comme un filtre mal réglé. C'est la vraie couleur.</p>
<p><strong>Plus grosse montée du voyage.</strong></p>`,
      photos: [['Les lacets pavés du Vršič', 'paysage'], ['Margot au sommet, 1611 m', 'portrait'], ['La chapelle russe dans les mélèzes', 'portrait'], ['La Soča turquoise', 'paysage'], ['Le panneau du col', 'portrait']],
      book: [1, 3, 2],
      sleep: { label: 'Camp Polovnik, Bovec', comment: 'Petit camping familial, la patronne nous a offert des abricots. 24 €.', at: [46.3400, 13.5600] },
      expenses: [
        ['hebergement', 'camping', 'commun', 24, 'Camp Polovnik'],
        ['restaurant',  null,     'commun', 62.5, 'Le dîner le plus mérité du voyage'],
        ['nourriture',  null,     'julie',  16.2, 'Ravitaillement du col'],
      ],
      comments: [
        ['Mamie', 'MA MARGOT A FAIT UN COL DE 1600 MÈTRES. Je le dis à tout le monde à la boulangerie.', 21,
          [['Margot', 'Mamie j\'ai poussé sur 3 virages, faut le dire aussi 😅', 21],
           ['Mamie', 'On ne dira rien du tout à la boulangerie.', 21]]],
        ['Tonton Marc', 'Le Vršič chargé. Sérieusement, bravo. C\'est du costaud.', 21],
        ['Léa', 'Je vous l\'avais dit 😂 Bravo les cyclistes.', 21],
        ['Classe de CM2', '1611 mètres, c\'est plus haut que le Puy de Dôme ! On a vérifié.', 22],
      ],
    },
    {
      day: 20, hour: 23,
      visibility: 'admin',
      title: 'Note d\'intendance (privée)',
      location: 'Bovec, Gorizia, Slovénie',
      at: [46.3383, 13.5522],
      km: 0, dplus: 0,
      geo: [['Slovénie', 'Gorizia', 'si', 1]],
      body: `<p>Point matériel et budget à mi-parcours, entre nous :</p>
<ul><li>la roue arrière de Julie a pris un léger voile dans la descente du col — à faire vérifier à Trieste</li><li>trois rayons de rechange restants sur cinq</li><li>budget : on est à peu près dans les clous, l'hébergement dérape un peu</li></ul>
<p>Rien d'inquiétant, mais autant l'écrire quelque part.</p>`,
      photos: [['La roue arrière posée sur le pied d\'atelier', 'portrait']],
      privateNote: 'Prévoir 80–100 € pour le passage chez le mécano de Trieste. Ne pas en parler à Margot, elle culpabiliserait pour la descente.',
    },
    {
      day: 21,
      visibility: 'margot',
      title: 'La page de Margot',
      location: 'Tolmin, Gorizia, Slovénie',
      at: [46.1836, 13.7325],
      km: 38, dplus: 310,
      route: [[46.3383, 13.5522], [46.2450, 13.5786], [46.1836, 13.7325]],
      ele: [434, 234, 200],
      geo: [['Slovénie', 'Gorizia', 'si', 38]],
      body: `<p>Aujourd'hui c'est moi qui écris.</p>
<p>On a suivi la rivière toute la journée. Elle change de couleur tout le temps : vert, bleu, presque blanc dans les rapides. À Kobarid on a mangé une glace au yaourt et miel, la meilleure de ma vie (Papa dit que c'est parce qu'on avait roulé, je ne suis pas d'accord).</p>
<p>Ce que je préfère depuis le début du voyage :</p>
<ul><li>dormir sous la tente quand il pleut sur la toile</li><li>doubler Papa dans les montées (2 fois)</li><li>le moment où on ne sait pas encore où on va dormir</li></ul>
<p>Ce que j'aime le moins : les tunnels, et le vent de face.</p>`,
      photos: [['La Soča vue du pont de Kobarid', 'paysage'], ['La glace yaourt-miel', 'portrait'], ['Mon vélo et mon ombre', 'paysage']],
      sleep: { label: 'Camp Gabrje, Tolmin', comment: 'On a planté la tente à côté d\'un arbre à cerises.', at: [46.1800, 13.7200] },
      expenses: [
        ['hebergement', 'camping', 'commun', 25, 'Camp Gabrje'],
        ['restaurant',  null,     'julie',  12.5, 'Trois glaces à Kobarid'],
        ['nourriture',  null,     'nico',   18.9, 'Courses du soir'],
      ],
      comments: [
        ['Mamie', 'Margot, tu écris très bien. Continue.', 22],
        ['Papi', 'Doubler ton père deux fois, c\'est la vraie victoire du voyage. 😄', 22],
      ],
    },
    {
      day: 22,
      title: 'La vallée s\'ouvre, la chaleur arrive',
      location: 'Nova Gorica, Gorizia, Slovénie',
      at: [45.9550, 13.6483],
      route: [[46.1836, 13.7325], [46.1450, 13.7400], [46.0900, 13.6400], [45.9550, 13.6483]],
      ele: [200, 170, 105, 92],
      km: 48, dplus: 420,
      geo: [['Slovénie', 'Gorizia', 'si', 48]],
      body: `<p>La montagne s'écarte, la vigne remplace la forêt, et la température monte de dix degrés en une matinée. On roule à l'ombre quand il y en a.</p>
<p>Nova Gorica et Gorizia sont une seule ville coupée en deux par une frontière qui ne sert plus à rien : la place de la gare est traversée par une ligne de pavés blancs, un pied en Slovénie, l'autre en Italie. On a pique-niqué assis dessus.</p>`,
      photos: [['La ligne de pavés sur la place de la gare', 'paysage'], ['Pique-nique à cheval sur la frontière', 'portrait'], ['Les vignes du Collio', 'paysage']],
      sleep: { label: 'Chambre chez l\'habitant, Šempeter', comment: 'Jardin, figuier, et un chat qui a dormi sur les sacoches. 68 €.', at: [45.9300, 13.6400] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 68, 'Chambre chez l\'habitant'],
        ['restaurant',  null,   'nico',   44.7, 'Dîner au bord de la frontière'],
        ['nourriture',  null,   'julie',  13.4, 'Fruits et eau (beaucoup d\'eau)'],
      ],
    },
    {
      day: 23,
      title: 'Cinquième pays : l\'Italie et la mer',
      location: 'Trieste, Frioul-Vénétie Julienne, Italie',
      at: [45.6495, 13.7768],
      route: [[45.9550, 13.6483], [45.9410, 13.6220], [45.8050, 13.5330], [45.6495, 13.7768]],
      ele: [92, 84, 12, 20],
      km: 62, dplus: 480,
      geo: [['Slovénie', 'Gorizia', 'si', 6], ['Italie', 'Frioul-Vénétie Julienne', 'it', 56]],
      body: `<p>Deux cents mètres après le petit-déjeuner, on était en Italie. Cinquième et dernier pays.</p>
<p>Et puis, au sortir d'un virage sur la route en corniche, l'Adriatique — d'un coup, en entier, jusqu'à l'horizon. On s'est arrêtés tous les trois sans se concerter. Personne n'a rien dit pendant une minute.</p>
<p>Trieste sent le café et le vent. On a bu un capo in B sur la place de l'Unité d'Italie, la plus grande place d'Europe ouverte sur la mer, et Julie a fait retoucher sa roue chez un vieux mécano de la via Carducci.</p>`,
      photos: [['La première vue sur l\'Adriatique', 'paysage'], ['La place de l\'Unité d\'Italie', 'paysage'], ['Le mécano de la via Carducci', 'portrait'], ['Capo in B au comptoir', 'portrait']],
      book: [0, 1],
      sleep: { label: 'Hôtel Alabarda, centre', comment: 'Vieil immeuble, plafonds de quatre mètres. 92 €.', at: [45.6500, 13.7700] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 92, 'Hôtel Alabarda'],
        ['divers',      null,   'julie',  85, 'Réparation de la roue arrière'],
        ['restaurant',  null,   'commun', 57.6, 'Poisson grillé au port'],
        ['nourriture',  null,   'nico',    9.8, 'Café et pâtisseries'],
      ],
      comments: [
        ['Classe de CM2', '5 PAYS ! Vous avez gagné ! Est-ce que la mer était chaude ?', 24,
          [['Margot', 'On n\'a pas eu le temps de se baigner à Trieste mais demain oui !! 🌊', 24]]],
        ['Mamie', 'La mer ! Vous y êtes. Je suis si fière.', 24],
        ['Tonton Marc', 'Un capo in B, tu as retenu la leçon 😄', 24],
      ],
    },
    {
      day: 24,
      title: 'La plaine, les lagunes, et 101 km de plat',
      location: 'Portogruaro, Vénétie, Italie',
      at: [45.7767, 12.8386],
      route: [[45.6495, 13.7768], [45.8050, 13.5330], [45.6773, 13.3936], [45.7767, 12.8386]],
      ele: [20, 10, 2, 5],
      km: 101, dplus: 210,
      geo: [['Italie', 'Frioul-Vénétie Julienne', 'it', 62], ['Italie', 'Vénétie', 'it', 39]],
      body: `<p>Plat, plat, plat. On traverse les lagunes de Grado et de Marano sur des digues au milieu des roseaux, avec des hérons partout et une odeur de vase chaude.</p>
<p>Trois baignades dans la journée, dont une avec les vélos posés dans le sable. Le sel sèche sur la peau et on repart.</p>`,
      photos: [['La digue au milieu des roseaux', 'paysage'], ['Les vélos couchés dans le sable', 'paysage'], ['Baignade de midi', 'portrait'], ['Un héron qui nous regarde passer', 'portrait']],
      sleep: { label: 'Camping Villaggio San Francesco', comment: 'Immense, un peu usine, mais la piscine a fait l\'unanimité. 32 €.', at: [45.6300, 12.9800] },
      expenses: [
        ['hebergement', 'camping', 'commun', 32, 'Camping Villaggio San Francesco'],
        ['restaurant',  null,     'nico',   48.9, 'Pizzas, les trois'],
        ['nourriture',  null,     'julie',  15.6, 'Glaces et boissons'],
      ],
    },
    {
      day: 25, hour: 17,
      title: 'Venise — le bout du guidon',
      location: 'Venise, Vénétie, Italie',
      at: [45.4408, 12.3155],
      route: [[45.7767, 12.8386], [45.5990, 12.8880], [45.5250, 12.6430], [45.4408, 12.3155]],
      ele: [5, 2, 2, 2],
      km: 74, dplus: 120,
      geo: [['Italie', 'Vénétie', 'it', 74]],
      body: `<h3>{{TOTAL_KM}} kilomètres, {{TOTAL_DAYS}} jours, {{COUNTRIES}} pays</h3>
<p>On a roulé jusqu'à Punta Sabbioni le long du littoral, et on a pris le vaporetto — vélos compris — pour traverser la lagune. Venise est arrivée par la mer, comme il faut : les campaniles d'abord, puis les toits, puis tout le reste.</p>
<p>On a débarqué sur les Zattere, poussé les vélos dans les ruelles jusqu'à la place Saint-Marc, et on est restés là, décoiffés, en cuissard, au milieu des touristes en robe d'été.</p>
<p>Margot a dit : <em>« On repart quand ? »</em></p>
<p><strong>Merci à tous ceux qui ont suivi le carnet jour après jour.</strong> Vos commentaires nous ont portés dans les cols. On vous embrasse depuis la lagune.</p>`,
      photos: [['Venise vue du vaporetto', 'paysage'], ['Les trois vélos place Saint-Marc', 'paysage'], ['La photo d\'arrivée, tous les trois', 'portrait'], ['Le compteur : {{TOTAL_KM}} km', 'portrait'], ['Dernier coucher de soleil sur la lagune', 'paysage']],
      book: [2, 0, 4],
      sleep: { label: 'Hôtel sur la Giudecca', comment: 'Dernière nuit, fenêtre sur le canal. 128 €.', at: [45.4270, 12.3300] },
      expenses: [
        ['hebergement', 'hotel', 'commun', 128, 'Hôtel sur la Giudecca'],
        ['restaurant',  null,   'commun', 96.4, 'Le dîner d\'arrivée'],
        ['divers',      null,   'julie',  21,   'Vaporetto (3 pers. + 3 vélos)'],
        ['nourriture',  null,   'nico',   14.2, 'Cicchetti et spritz'],
      ],
      comments: [
        ['Mamie', 'VOUS Y ÊTES !!! J\'ai pleuré devant l\'ordinateur. Rentrez bien mes chéris.', 25,
          [['Julie', 'On rentre samedi Mamie. On rapporte des photos et beaucoup de linge sale. ❤️', 25]]],
        ['Papi', '{{TOTAL_KM}} km. Je relis le carnet depuis le début ce soir. Bravo à vous trois.', 25],
        ['Tonton Marc', 'Bravo la famille. La prochaine fois, je viens.', 25,
          [['Nico', 'On t\'attend. Rendez-vous à Nuremberg 😉', 26]]],
        ['Léa', 'Quel voyage. Merci de nous avoir emmenés avec vous.', 26],
        ['Classe de CM2', 'BRAVO !!! On a suivi toute l\'année sur la carte de la classe. Merci pour les photos de chaque pays. Bonnes vacances !', 26,
          [['Margot', 'Merci les CM2 ! Je viendrai vous raconter le col à la rentrée. 🚲', 27]]],
      ],
    },

  ],
};

module.exports = TRIP;
