# Mon Paysage Magique

Imagier interactif pour enfants : on tape des mots, le paysage prend vie.
Pas de score, pas de chrono, pas d'échec.

## Lancer

Ouvrir `index.html` dans un navigateur. Aucune installation, aucune dépendance.

## Structure

| Fichier         | Rôle                                                           |
|-----------------|----------------------------------------------------------------|
| `js/words.js`   | Base de mots (62 mots, 8 familles) et normalisation de saisie  |
| `js/draw.js`    | Dessin procédural de chaque élément + propriétés (zone, vitesse…) |
| `js/scene.js`   | État de la scène, animation, météo, rendu Canvas               |
| `js/audio.js`   | Signal sonore, voix (synthèse vocale fr-FR), musique           |
| `js/app.js`     | Saisie, imagier, barre d'actions                               |

## Ajouter un mot

- **Un objet** : une entrée dans `WORDS` (`kind: 'noun'`), une fonction de dessin
  dans `DRAW` et une entrée dans `TYPES` (même clé, sans accent ni tiret).
- **Une couleur** : une entrée `kind: 'color'` avec sa valeur hexadécimale.

## Choix de comportement à connaître

- `chat` / `château` : un mot qui est le début d'un autre attend ~1 s avant d'être
  validé (Entrée ou Espace valide tout de suite).
- `rien` et « Tout effacer » remettent tout à zéro (éléments, météo, nuit, eau).
  « Tout effacer » demande un second appui pour éviter les accidents.
- `vent`, `hélium` et `musique` fonctionnent en interrupteur (on / off).
- `soleil` chasse les intempéries et ramène le jour ; `soleil`, `lune` et
  `arc-en-ciel` sont uniques dans la scène.
- Les montagnes ne s'envolent pas avec `hélium` (elles couvraient tout l'écran).
