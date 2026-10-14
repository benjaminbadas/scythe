# Scythe

Adaptation web **non officielle** du jeu de plateau **Scythe** (Jamey Stegmaier, Stonemaier Games, 2016), jeu de base,
de 2 à 5 joueurs, en passe-et-joue sur un même écran (contre l'ordinateur si on veut) ou en ligne, chacun sur son
téléphone. Usage privé.

## Démarrer

```bash
npm install
npm run dev      # serveur de développement (http://localhost:5173)
npm test         # tests du moteur de règles et parties complètes entre IA
npm run build    # vérification de types + build de production
```

Pour le jeu en ligne en local, lancer aussi l'API PHP : `php -S 127.0.0.1:8787 -t public`
(Vite lui relaie les requêtes `/api`).

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/engine/data.ts` | Matériel : carte (47 territoires, 7 bases, rivières, tunnels, rencontres), 5 factions et leurs méchas, 5 fiches joueur, cartes Combat, Rencontre, Usine et Objectif, bonus de structures, décompte |
| `src/engine/board.ts` | Géométrie hexagonale, déplacements d'un pas (rivières, lacs, tunnels, Mine, Berge, Canton, Passage souterrain, Plongée, Droit chemin…) |
| `src/engine/game.ts` | Règles : tour (section, action du haut, action du bas), combats, rencontres, Usine, recrues, objectifs, étoiles, fin de partie et décompte |
| `src/engine/ai.ts` | IA (voir plus bas) |
| `src/ai/` | Calcul de l'IA dans un Web Worker, et rythme de ses gestes à l'écran |
| `src/ui/` | Interface React : plateau SVG illustré (`Board.tsx`, dessins dans `art.tsx`), plateau joueur (`PlayerBoard.tsx`), panneau du tour, combat secret, rencontres |
| `public/api/room.php` | Serveur des parties en ligne (PHP 8, sans base de données), repris d'Amerigo |

Le moteur est pur et déterministe : l'état de la partie (y compris le générateur aléatoire) est un objet JSON, et
`apply(état, action)` renvoie le nouvel état ou lève une `RuleError` expliquant le refus. `state.turn.player` désigne
le joueur qui doit agir : c'est le défenseur pendant sa mise secrète d'un combat.

## Habillage

Le plateau est dessiné en SVG (aucune image du jeu n'est reprise), dans l'esprit de l'Europa des années 1920 de
Scythe : carte sur papier vieilli, terrains illustrés (blés et meules, forêts de sapins, montagnes enneigées, derricks
dans la toundra, villages fumants, lacs, Usine aux cheminées éteintes), carcasses de méchas de la Grande Guerre,
rivières sinueuses, tunnels, jetons rencontre, emblèmes des factions. Les pièces ont leur silhouette : personnage et
son animal, méchas marcheurs, ouvriers, structures (chevalement, obélisque, moulin, fortin), sacs, rondins, lingots et
barils. Une légende sous la carte rappelle ce que produit chaque terrain.

Le **plateau joueur** reprend la disposition des fiches : fiche faction (capacité, 4 méchas à débloquer, bonus
immédiats de recrue, 6 étoiles) et fiche joueur en 4 colonnes (structure au-dessus de l'action du haut, cubes
d'amélioration, ouvriers au-dessus de Produire qui révèlent son coût, cases de coût du bas recouvertes par les cubes,
pièces gagnées, recrue et son bonus permanent). Tout le tour se joue en cliquant dessus : la colonne, puis l'option
de l'action du haut, puis l'action du bas (Améliorer : un cube en haut puis le coût à réduire ; Déployer : un mécha
puis sa case sur la carte ; Construire : une structure puis sa case ; Enrôler : une recrue puis son bonus immédiat).
Quand il n'y a plus rien à faire, « Fin du tour » s'allume (et la touche Entrée finit le tour).

## Dispositions

Trois dispositions au choix (boutons en haut à droite, mémorisées sur l'appareil) :

- **Côte à côte** (par défaut sur ordinateur) : la carte à gauche sur toute la hauteur, le plateau joueur et le
  panneau d'action à droite ; tout tient dans l'écran.
- **Superposé** : la carte et le panneau d'action en haut, le plateau joueur sur toute la largeur en bas.
- **Classique** (par défaut sur téléphone) : tout à la suite, avec défilement.

Dans les deux premières, les joueurs et le journal passent dans un tiroir (📜), la légende s'affiche à la demande
(🗺), et les pastilles des joueurs en haut de l'écran permettent de voir leur plateau.

## Joueurs IA

En passe-et-joue, chaque place peut être tenue par l'ordinateur (case « 🤖 IA »). L'IA est « gourmande » :

1. pour chaque section permise, elle essaie les variantes de l'action du haut (déplacements cherchés unité par unité
   en faisceau, avec ou sans transport d'ouvriers et de ressources ; échanges ; productions ; renforcement ; carte
   Usine), règle les combats, rencontres et choix d'Usine qui suivent, puis les variantes de l'action du bas ;
2. chaque suite est jouée sur une copie de la partie avec le moteur ;
3. elle garde celle dont la position a la meilleure évaluation : score de fin estimé (pièces, étoiles, territoires,
   ressources, bonus de structures, selon la popularité), progression vers les étoiles, puissance, cartes, ressources
   encore utiles, distance du personnage aux rencontres et à l'Usine, moins une part du meilleur adversaire.

Au combat, elle mise juste assez pour battre l'estimation publique de l'adversaire (puissance et nombre de cartes),
en jouant d'abord ses cartes ; un combat perdu d'avance ne lui coûte qu'1 puissance (pour piocher une carte).
Un tour prend moins d'une demi-seconde de calcul.

## Jouer en ligne

« Créer une partie » donne un code de 5 lettres et un lien (`…/#K7P2Q`) à partager (2 à 5 joueurs). Chacun prépare
son tour sur son téléphone (on peut l'annuler tant qu'il n'est pas fini) ; le tour part au serveur à la fin, ou dès
qu'un combat demande la mise secrète du défenseur. Les autres téléphones interrogent le serveur toutes les 2 secondes.
Les salles sont des fichiers JSON rangés hors du site (`/home/<compte>/scythe-data`), supprimés après 7 jours
d'inactivité.

Le déploiement sur l'hébergement OVH fonctionne comme pour Amerigo (workflow `.github/workflows/deploy.yml`, sur la
branche `main`, variable `DEPLOY_OVH = true` et secrets `OVH_FTP_HOST`, `OVH_FTP_USER`, `OVH_FTP_PASSWORD`), dans
`www/scythe` → `https://badas.tech/scythe/`.

## Choix d'adaptation

Points que la règle laisse au jugement des joueurs, ou que le matériel physique règle tout seul :

- **Capacités automatiques** : Éclaireur, Artillerie (si l'on a au moins 1 puissance) et Désarmement s'appliquent
  d'office avant chaque combat ; les bonus permanents de recrue et les pièces des actions du bas sont toujours pris ;
  Coercition (Crimée) sert seulement quand il manque une ressource.
- **Paiement des ressources** : prises automatiquement sur les territoires contrôlés qui en ont le plus.
- **Transport** : une unité emporte toutes les ressources de sa case ou aucune ; un mécha emporte le nombre
  d'ouvriers voulu. On ne transporte rien sur un lac (ouvriers et ressources ne peuvent pas y rester), et la
  retraite se fait toujours vers la base.
- **Combats multiples** : réglés dans l'ordre des cases du personnage puis des méchas.
- **Passe-et-joue** : avant la mise secrète d'un combat entre deux joueurs humains, l'écran demande de passer
  l'appareil. La main et les objectifs du joueur qui agit sont affichés dans sa fiche. En ligne, l'état complet
  (mains comprises) transite par le serveur : l'interface ne montre que les siens.
- **Cartes Rencontre** : les 28 du jeu de base (effets seulement, pas les textes d'ambiance). **Objectifs** : les 23
  du jeu de base.

## À vérifier

- **Cartes Usine** : le guide officiel des cartes ne les détaille pas. Les 12 cartes de `FACTORY_CARDS` sont
  provisoires (seules les 3 premières sont confirmées par la règle et la version numérique) : à remplacer par le
  contenu exact des cartes.
- **Carte** : relevée d'après un projet libre puis vérifiée (rivières des deux côtés de chaque bord, 11 rencontres,
  6 tunnels, cases de départ des ouvriers et rivière au nord de la base rusviet conformes à la règle).
- **Tuiles bonus de structures** : barèmes dans `BONUS_VALUES` (seul le cas « 4 lacs → 6 $ » figure dans la règle).
