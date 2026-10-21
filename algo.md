# Ghost Yards : l'algorithme

**La question :** au moment du lancer, 3 à 5 receveurs sont disponibles et le QB n'en choisit qu'un. Combien de yards offraient ceux qu'il a ignorés ?

**L'idée :** un modèle estime, à l'instant du lancer, combien de yards chaque receveur rapporterait en moyenne s'il était ciblé (les **xYards**). On compare ensuite la cible choisie aux autres.

![Ghost Yards](web/public/screenshot.png)

## Relancer
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
git clone --depth 1 https://github.com/ThompsonJamesBliss/nfl-big-data-bowl-regional-event-data data_raw
.venv/bin/python -m src.run_all          # environ 15 s, écrit web/public/data.json
cd web && npm install && npm run dev     # interface
```

## Données
Big Data Bowl 2023, édition régionale : 8 557 actions de passe, semaines 1 à 8 de 2021, 122 matchs.
Le tracking enregistre 10 positions par seconde pour les 22 joueurs et le ballon, et s'arrête environ 0,5 s après le lancer. Il ne contient donc ni la réception ni les yards après réception.

## Pipeline
| Étape | Fichier | Sortie |
|---|---|---|
| 1. Extraction | `src/extract.py` | `out/throw_frame.parquet`, `out/snap_frame.parquet` |
| 2. Cible et features | `src/features.py` | `out/receivers.parquet` (une ligne par receveur et par action) |
| 3. Modèle xYards | `src/model.py` | `out/xyards.parquet`, `out/calibration.png` |
| 4. Ghost yards et verdicts | `src/ghost_yards.py` | `out/plays.parquet`, `out/players.parquet`, `out/qbs.parquet` |
| 5. Export | `src/export.py` | `web/public/data.json`, lu par l'interface (aucun calcul dans le navigateur) |

### 1. Extraction
- DuckDB lit les 122 fichiers de tracking en une seule requête.
- **Normalisation :** si l'attaque joue vers la gauche, x devient 120 - x, y devient 53,3 - y, et les angles tournent de 180°. L'attaque va donc toujours vers +x.
- On garde la frame du **snap** (`ball_snap`) et celle du **lancer** (première frame `pass_forward` ou `autoevent_passforward`).
- La ligne de scrimmage `los_x` est la position x du ballon au snap.
- Un tracé de contrôle (`src/check_plot.py`) vérifie que l'attaque va vers la droite et que les receveurs sont devant la ligne.

### 2. Cible et features
- **La cible** n'existe pas dans les données. On la tire du texte de l'action (*« pass short right **to C.Godwin** »*) avec une regex, puis on l'apparie aux receveurs de l'équipe en attaque (`pff_role` = « Pass Route ») via le préfixe du prénom et le nom. Les cas « Dj.Moore », « St. Brown », « Jr. » sont gérés.
- **Taux d'appariement : 95,5 %.** Restent 7 227 actions (passes complètes, incomplètes et interceptions), soit 33 459 lignes receveur et 4,6 receveurs par action.
- **Features**, calculées pour chaque receveur à l'instant du lancer :

| Feature | Définition | Sens football |
|---|---|---|
| `depth` | x - `los_x` | profondeur du tracé |
| `sep1`, `sep2` | distance au 1er et au 2e défenseur en couverture | à quel point il est ouvert |
| `dist_qb` | distance au QB | longueur et difficulté de la passe |
| `lateral` | écart latéral à la position du ballon au snap | passe vers la ligne de touche |
| `speed`, `v_downfield` | vitesse, et `s · sin(dir)` | élan, yards après la réception |
| `time_to_throw` | (frame du lancer - frame du snap) / 10 | temps laissé au QB |
| `room` | 110 - x | place jusqu'à l'en-but |
| couverture | Man / Zone / Other (one-hot) | type de défense |

### 3. Modèle xYards
- **`HistGradientBoostingRegressor`** (scikit-learn), avec une perte quadratique, car on veut une **moyenne** attendue.
- Il est entraîné **uniquement sur les cibles réelles**, puisque c'est le seul cas où le résultat est connu.
  - Passe complète : les yards gagnés (`prePenaltyPlayResult`, avant pénalité, pour mesurer le jeu lui-même).
  - Passe incomplète : **0**, ce qui est indispensable pour que le modèle intègre le risque.
  - Interception : **-10**, une hypothèse.
- **Contrainte de monotonie** sur `sep1` et `sep2` : à situation égale, un receveur plus ouvert vaut toujours au moins autant.
- **Out-of-fold :** GroupKFold à 5 plis par match. Chaque pli est entraîné sur les cibles des 4 autres et prédit **tous** les receveurs des matchs laissés de côté. Aucune prédiction ne vient d'un modèle qui a vu le match.
- **Recalibration isotone** (croisée, avec les mêmes plis) : elle aligne la moyenne prédite sur la moyenne réelle et corrige la surestimation des valeurs hautes.
- **Plafond :** xYards ≤ 110 - `los_x`, la place restante jusqu'à l'en-but.

### 4. Ghost yards
Sur chaque action :
1. **Le fantôme** (`ghost_id`) est le receveur non ciblé **plus ouvert que la cible** (`sep1` supérieur) qui a le plus de xYards. S'il n'en existe aucun, il n'y a pas de fantôme.
2. `gap = xYards(fantôme) - xYards(cible)`
3. `ghost_yards = max(0, gap)`, attribué **à ce seul receveur**.

Un seul receveur peut recevoir le ballon. Une action produit donc **au plus une** valeur de ghost yards, et on n'additionne jamais les receveurs d'une même action. Tous les totaux (joueur, QB) sont des sommes de valeurs par action.

**Par joueur :**
- `ghost_yards_per_game` = somme de ses ghost yards / matchs joués ;
- il faut au moins 100 tracés : 135 joueurs sont classés (90 WR, 29 TE, 16 RB) ;
- le classement se fait par poste, et la note sur 10 est le décile dans le poste ;
- son ghost play est l'action où il a offert le plus (hors actions annulées par une pénalité).

*Exemple : Amari Cooper court 205 tracés en 7 matchs. Il est le fantôme sur 41 actions, dont 27 avec un écart positif, soit 176 yards attendus au total et 25,1 par match.*

### 5. Verdict du QB (complément)
Deux questions **séparées** :
- **Décision**, qui compare deux attendus : *« Avait-il mieux et plus ouvert ailleurs ? »* C'est un bon choix si `gap` ≤ 0, discutable si l'écart est inférieur à 5 yards, et un mauvais choix au-delà.
- **Exécution**, qui compare le réel à l'attendu : *« L'action a-t-elle rapporté plus que prévu ? »* On compare les yards réels aux xYards de la cible.

On ne compare **jamais** les yards réels de la cible aux xYards d'une alternative.

Résultat sur la ligue : 58,8 % de bons choix, 26,5 % de discutables, 14,7 % de mauvais choix. Les QB (33, avec au moins 100 passes) sont présentés par écart à la moyenne de la ligue. La matrice 2×2 croise décision et exécution, en excluant les discutables.

## Validation
| | MAE (yards) |
|---|---|
| Modèle (out-of-fold, 7 227 cibles) | **6,81** |
| Baseline (prédire la moyenne) | 7,39 |

- Le gain est modeste, ce qui est attendu : une passe est complète ou non, et le résultat tient beaucoup au hasard.
- **Calibration :** les moyennes par décile de prédiction sont proches de la diagonale (14,5 prédits pour 13,9 réels sur le décile le plus haut).
- **Bon sens :** à profondeur de 10 à 20 yards, un receveur collé à son défenseur vaut 4,9 xYards, contre 13,3 s'il est seul.
- **Interception à -5 ou -15 :** les xYards restent corrélés à 0,98.

## Choix et corrections faits en cours de route
- **Biais de sélection.** Le modèle n'apprend que sur les passes lancées, et un QB ne lance profond que si le receveur est vraiment libre. Le modèle surévaluait donc les receveurs profonds. Sans correction, son meilleur choix coïncidait avec celui du QB dans 24 % des cas, contre 22 % au hasard, et le fantôme était bien plus profond que la cible (9,4 contre 5,7 yards). La règle « fantôme plus ouvert que la cible » ramène la profondeur du fantôme à 5,4 yards, contre 5,7 pour la cible.
- **Surestimation des valeurs hautes.** Le décile le plus haut annonçait 17,4 yards pour 14,1 réels. La recalibration isotone corrige ce défaut, et le maximum passe de 47,9 à 25,8 xYards.
- **Seuil de décision.** À 3 yards, la moitié des passes devenaient des « mauvais choix », ce qui n'est pas crédible. Le seuil retenu est de 5 yards.

## Limites
- Ouvert au lancer ne veut pas dire ouvert à l'arrivée du ballon.
- La pression sur le QB, le timing des routes et la progression de lecture ne sont pas modélisés.
- Le biais de sélection est atténué, pas éliminé. Les valeurs doivent se lire comme des **yards attendus laissés sur la table**, pas comme des yards perdus.
- Seulement 8 semaines de 2021, et uniquement des actions de passe. La valeur d'une interception est arbitraire.
- Le verdict sur une action isolée est indicatif. Il n'est fiable qu'en agrégé. Les RB classés sont peu nombreux (16).

## Travaux liés
- EHCP, Expected Hypothetical Completion Probability (Deshpande & Evans, 2019).
- ESPN Open Score.
- Prime Targets (Prime Video) : *Prime Targets montre en direct qui est ouvert ; Ghost Yards fait le bilan de ce que ça a coûté.*
