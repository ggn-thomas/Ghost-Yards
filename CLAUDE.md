# Ghost Yards

Hackathon NFL Big Data Bowl, Paris (AWS x NFL), 21/10/2026. Équipe de 2.
Gel du code **15h30**, soumission **16h00**. Thème : insights sur les receveurs (WR / TE / RB) à partir du tracking.
Public : commentateurs et spectateurs. Jury : pertinence sportive, exécution technique, communication, originalité.
Priorité : un résultat **juste et livré à temps**. Si un point bloque plus de 10 min, simplifier.

**Idée** : au lancer, le QB choisit un receveur parmi 3 à 5. Combien de yards offraient ceux qu'il a ignorés ?
Accroche : *« Les yards que le receveur offrait, mais que le quarterback n'a jamais vus. »*
Projet d'analyse, pas une stat officielle NFL.

## Équipe et dossiers
- **Algo** : `src/` → écrit `web/public/data.json`. Point d'entrée unique : `python -m src.run_all`.
- **Front (Noah)** : `web/` (Vite + React, déployé sur Vercel, Root Directory = `web`). Contexte dédié : `web/CLAUDE.md`.
- `data.json` est le seul contrat entre les deux (format dans `web/CLAUDE.md`). Ne pas le changer sans prévenir le front.

```
src/extract.py      DuckDB : tracking -> out/{throw_frame,snap_frame,pre_throw}.parquet
src/check_plot.py   tracé de vérification (attaque vers la droite)
src/features.py     appariement cible + features par receveur
src/model.py        xYards out-of-fold
src/ghost_yards.py  ghost yards, verdicts, agrégats joueurs / QB
src/export.py       -> web/public/data.json
src/run_all.py      enchaîne tout
```

## Environnement
```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
git clone --depth 1 https://github.com/ThompsonJamesBliss/nfl-big-data-bowl-regional-event-data data_raw
.venv/bin/python -m src.run_all
```
`data_raw/` (826 Mo), `out/` et `*.parquet` sont ignorés par git. **Ne jamais committer de données brutes.**

## Données (format BDB 2023, `data_raw/data/`)
8 557 passes, semaines 1 à 8 de 2021, 122 matchs.
- `plays.csv` : `passResult` (C, I, S, IN, R), `playResult`, `prePenaltyPlayResult`, `playDescription`, `possessionTeam`, `pff_passCoverageType`.
- `players.csv` : `displayName` = **nom complet** (« Tom Brady »), pas « T.Brady ».
- `pffScoutingData.csv` : `pff_role` ∈ Pass (QB), Pass Route (receveur), Pass Block, Pass Rush, Coverage.
- `tracking/tracking_<gameId>.csv` : 10 Hz, le ballon a `nflId` NA et `team` = "football". Le tracking s'arrête ~0,5 s après le lancer.

## Règles de calcul (à respecter)
- Rôles : toujours comparer en minuscules, par ex. `pff_role.str.lower() == "pass route"`.
- Normalisation (déjà faite dans `extract.py`) : si `playDirection == "left"` alors x = 120 - x, y = 53.3 - y, dir et o + 180.
  Angles : 0° = +y, 90° = +x. Vitesse vers l'avant = `s * sin(radians(dir))`.
- Frame du lancer = 1re frame avec `pass_forward` ou `autoevent_passforward`. Snap = `ball_snap` ou `autoevent_ballsnap`.
- `los_x` = x du ballon au snap.
- Cible : regex `pass (?:incomplete )?(?:short|deep) (?:left|right|middle) (?:intended for |to )([A-Z][a-zA-Z'.\-]+)`,
  comparée à l'abrégé « Initiale.Nom » construit depuis `displayName`, parmi les « pass route » de l'équipe en attaque.
  Viser ~96 % d'appariement, ignorer le reste.
- Actions gardées : `passResult` ∈ {C, I, IN} avec une cible appariée.
- Variable cible du modèle : `prePenaltyPlayResult` pour C, 0 pour I, `INT_VALUE = -10` pour IN (tester -5 et -15).
- Features par receveur au lancer : depth (x - los_x), sep1 et sep2 (défenseurs « coverage » les plus proches), dist_qb,
  lateral (|y - y du ballon au snap|), speed, v_downfield, time_to_throw, room (110 - x), coverage (one-hot).
- Modèle : `HistGradientBoostingRegressor`, entraîné **uniquement sur les cibles réelles**.
- **Toutes les xYards sont out-of-fold** : `GroupKFold(5)` par `gameId`. Chaque pli prédit tous les receveurs des matchs laissés de côté.
- Plafond : `xYards = min(pred, 110 - los_x)`, la place restante jusqu'à l'en-but.
- Validation : MAE du modèle contre MAE de la baseline (moyenne), calibration par décile,
  contrôle « à profondeur égale, plus de séparation ⇒ plus de xYards ».
- Un seul receveur peut recevoir le ballon : **une action = au plus une valeur de ghost yards**.
  `ghost_id` = receveur non ciblé **plus ouvert que la cible** (`sep1` supérieur) avec le plus de xYards ;
  sans alternative plus ouverte : `gap = 0`, pas de fantôme. Ce filtre corrige le biais du modèle vers les receveurs profonds.
  `ghost_yards` = `max(0, gap)`, attribué **uniquement** à `ghost_id`.
  **Ne jamais additionner les receveurs d'une même action.** Les totaux (joueur, QB, équipe, accroche) sont des sommes de `ghost_yards` par action.
- Joueurs : somme des ghost yards des actions où il est `ghost_id` / matchs joués, minimum 100 tracés,
  classement par poste, `score10` = décile dans le poste.
- Wording : « yards attendus laissés sur la table », jamais « yards perdus » (ce sont des espérances).
- Verdict du QB : `gap` = xYards du fantôme - xYards_cible. Bon choix si ≤ 0, Discutable si < 5, Mauvais choix si ≥ 5.
  QB présentés **par rapport à la moyenne de la ligue** (`good_vs_league`). Mettre en avant les rangs, pas les yards absolus.
  Exécution = yards réels - xYards_cible.
  **Ne jamais comparer des yards réels aux xYards d'une alternative.**
- Bonus (narration seulement) : max des xYards sur les 10 frames avant le lancer. Ne pas l'utiliser dans la stat.

## Style de code
- Python simple : pandas, scikit-learn, DuckDB. Pas d'abstraction inutile.
- **Fonctions courtes** (≈ 20 lignes max), une responsabilité chacune. Chaque module expose `run()`.
- **Au plus une ligne de commentaire** par bloc. Une docstring d'une ligne par module.
- Constantes en majuscules en haut du fichier (`INT_VALUE`, `DECISION_THRESHOLD`, `MIN_ROUTES`).
- Les fichiers intermédiaires vont dans `out/` (parquet). Chaque étape relit ce que la précédente a écrit.
- Afficher les chiffres clés en console (taux d'appariement, MAE, nombre de plays).
- Vérifier visuellement avant de faire confiance à un chiffre.

## Git
- **Jamais de push direct sur `main`.** Une branche `feat/<sujet>` par tâche, puis une PR vers `main`.
- Titre de PR et message de commit préfixés `feat: ...`. PR petites et fréquentes, rebase sur `main` avant de merger.
- L'algo ne touche pas à `web/` sauf `web/public/data.json`. Le front ne touche pas à `src/`.

## Planning
1. Extraction, normalisation, tracé de vérification : fait.
2. Appariement de la cible et features : avant 14h30.
3. Modèle, validation, ghost yards, classement : avant 15h00 (MVP).
4. Vrai `data.json` livré au front : 15h00. Interface et Vercel : avant 15h30.
5. README, capture d'écran, push final : avant 15h50.

## README (livrable, 3 à 5 lignes ; le détail va dans algo.md)
3 à 5 phrases, la 1re = l'insight avec un chiffre. Puis : lien Vercel, capture, commande pour relancer, MAE contre baseline.
Limites : ouvert au lancer ≠ ouvert à l'arrivée ; pression et progression de lecture non modélisées ; 8 semaines de 2021 ;
valeur des interceptions arbitraire ; verdict indicatif sur une action, fiable en agrégé ;
**biais de sélection** : le modèle n'apprend que sur les passes lancées, il surévalue les options profondes
(sans filtre, son meilleur choix coïncide avec celui du QB 24 % du temps, contre 22 % au hasard) ;
d'où la règle « fantôme plus ouvert que la cible » ; le décile le plus haut des xYards est surestimé (17,4 prédits pour 14,1 réels).
Travaux liés : EHCP (Deshpande & Evans, 2019), ESPN Open Score, Prime Targets (Prime Video) :
« Prime Targets montre en direct qui est ouvert ; Ghost Yards fait le bilan de ce que ça a coûté. »
