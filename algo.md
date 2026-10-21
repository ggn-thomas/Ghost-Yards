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
- **Fins de mi-temps exclues :** les actions des 2 dernières minutes du 2e et du 4e quart-temps (et de la prolongation) sont retirées, soit 15 % des passes. Le QB y joue le chrono (sortir en touche, temps morts), pas les yards, et le modèle ne connaît ni le chrono ni le score.
- **Taux d'appariement : 96,1 %.** Restent 6 166 actions (passes complètes, incomplètes et interceptions), soit 28 385 lignes receveur et 4,6 receveurs par action.
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
1. **Le fantôme** (`ghost_id`) est le receveur non ciblé **plus ouvert que la cible** (`sep1` supérieur) qui a le plus de xYards, à condition qu'il offre plus que la cible. Sinon, il n'y a pas de fantôme.
2. `gap = xYards(fantôme) - xYards(cible)`
3. `ghost_yards = max(0, gap)`, attribué **à ce seul receveur**.

Un seul receveur peut recevoir le ballon. Une action produit donc **au plus une** valeur de ghost yards, et on n'additionne jamais les receveurs d'une même action. Tous les totaux (joueur, QB) sont des sommes de valeurs par action.

**Par joueur :**
- `ghost_yards_per_game` = somme de ses ghost yards / matchs joués ;
- il faut au moins 100 tracés : 110 joueurs sont classés (75 WR, 22 TE, 13 RB) ;
- le classement se fait par poste, et la note sur 10 est le décile dans le poste ;
- son ghost play est l'action où il a offert le plus (hors actions annulées par une pénalité).

*Exemple : Amari Cooper court 178 tracés en 7 matchs. Il est le fantôme sur 23 actions, soit 146,6 yards attendus au total et 20,9 par match.*

### 5. Verdict du QB (complément)
Deux questions **séparées** :
- **Décision**, qui compare deux attendus : *« Avait-il mieux et plus ouvert ailleurs ? »* C'est un bon choix si `gap` ≤ 0, discutable si l'écart est inférieur à 5 yards, et un mauvais choix au-delà.
- **Exécution**, qui compare le réel à l'attendu : *« L'action a-t-elle rapporté plus que prévu ? »* On compare les yards réels aux xYards de la cible.

On ne compare **jamais** les yards réels de la cible aux xYards d'une alternative.

Résultat sur la ligue : 58,9 % de bons choix, 26,0 % de discutables, 15,1 % de mauvais choix. Les QB (32, avec au moins 100 passes) sont présentés par écart à la moyenne de la ligue. La matrice 2×2 croise décision et exécution, en excluant les discutables.

## Validation
| | MAE (yards) |
|---|---|
| Modèle (out-of-fold, 6 166 cibles) | **6,91** |
| Baseline (prédire la moyenne) | 7,48 |

- Le gain est modeste, ce qui est attendu : une passe est complète ou non, et le résultat tient beaucoup au hasard.
- **Calibration :** les moyennes par décile de prédiction sont proches de la diagonale (14,9 prédits pour 14,0 réels sur le décile le plus haut).
- **Bon sens :** à profondeur de 10 à 20 yards, un receveur collé à son défenseur vaut 5,2 xYards, contre 13,7 s'il est seul.
- **Interception à -5 ou -15 :** les xYards restent corrélés à 0,97.

