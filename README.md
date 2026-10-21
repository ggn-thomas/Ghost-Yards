# Ghost Yards

*Les yards que le receveur offrait, mais que le quarterback n'a jamais vus.*

Sur les semaines 1 à 8 de la saison 2021, **Amari Cooper est le receveur le plus souvent laissé de côté alors qu'il était la meilleure option : 25,1 yards attendus par match** offerts sans recevoir le ballon (Evan Engram chez les TE avec 14,1, Austin Ekeler chez les RB avec 5,1).
Ghost Yards estime, à l'instant exact du lancer, les yards attendus (xYards) de chaque receveur à partir du tracking Next Gen Stats : profondeur, séparation avec les défenseurs, distance au QB, vitesse, type de couverture.
Sur chaque action, on compare la cible choisie au meilleur receveur ignoré **plus ouvert qu'elle** : l'écart, s'il est positif, ce sont les ghost yards, attribués à ce seul receveur.
Dans 41 % des passes, un receveur plus libre offrait davantage, et 1 passe sur 7 est un « mauvais choix » (au moins 5 yards attendus d'écart).
C'est un projet d'analyse pour commentateurs et spectateurs, pas une statistique officielle de la NFL.

**Démo :** VERCEL_URL

![Ghost Yards](web/public/screenshot.png)

## Relancer
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
git clone --depth 1 https://github.com/ThompsonJamesBliss/nfl-big-data-bowl-regional-event-data data_raw
.venv/bin/python -m src.run_all          # environ 15 s, écrit web/public/data.json
cd web && npm install && npm run dev     # interface
```

## Méthode
1. `extract.py` : DuckDB lit les 122 fichiers de tracking, normalise le sens du jeu et garde les frames du snap et du lancer.
2. `features.py` : la cible est extraite de la description de l'action et appariée aux receveurs (95,5 % des passes). On calcule ensuite une ligne de features par receveur à l'instant du lancer.
3. `model.py` : `HistGradientBoostingRegressor` entraîné sur les cibles réelles. Une passe complète vaut ses yards, une incomplète 0, une interception -10. La séparation a un effet croissant imposé par une contrainte de monotonie. Toutes les prédictions sont out-of-fold (GroupKFold par match), recalibrées par régression isotone, et plafonnées à la distance de l'en-but.
4. `ghost_yards.py` : une valeur par action au maximum, classement par poste (minimum 100 tracés), verdict de décision du QB et matrice décision × exécution.
5. `export.py` : écrit `web/public/data.json`, lu par l'interface Vite + React (aucun calcul dans le navigateur).

## Modèle
| | MAE (yards) |
|---|---|
| Ghost Yards (out-of-fold, 7 227 cibles) | **6,81** |
| Baseline (moyenne) | 7,39 |

Le gain reste modeste, ce qui est attendu : le résultat d'une passe tient beaucoup au hasard (complète ou non). La calibration par décile est proche de la diagonale, et à profondeur égale, un receveur plus séparé vaut plus de xYards.

Le verdict de décision et l'exécution sont toujours mesurés séparément. La décision compare des attendus entre eux (fantôme contre cible), l'exécution compare le réel à l'attendu de la cible. On ne compare jamais des yards réels aux xYards d'une alternative.

## Limites
- Ouvert au lancer ne veut pas dire ouvert à l'arrivée du ballon : le tracking s'arrête environ 0,5 s après le lancer.
- La pression sur le QB, le timing des routes et la progression de lecture ne sont pas modélisés.
- **Biais de sélection** : le modèle n'apprend que sur les passes réellement lancées, et il surévalue donc les options profondes. Sans filtre, son meilleur choix coïncidait avec celui du QB dans 24 % des cas, contre 22 % au hasard. D'où la règle « le fantôme doit être plus ouvert que la cible » et la recalibration isotone.
- Seulement 8 semaines de la saison 2021, et uniquement des actions de passe.
- La valeur d'une interception (-10) est arbitraire. À -5 ou -15, les xYards restent corrélés à 0,98.
- Le verdict sur une action isolée est indicatif. Il n'est fiable qu'en agrégé.

## Travaux liés
- EHCP, Expected Hypothetical Completion Probability (Deshpande & Evans, 2019).
- ESPN Open Score.
- Prime Targets (Prime Video) : *Prime Targets montre en direct qui est ouvert ; Ghost Yards fait le bilan de ce que ça a coûté.*
