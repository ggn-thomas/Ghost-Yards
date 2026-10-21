# Ghost Yards — contexte front (Noah)

## Le projet
Hackathon NFL Big Data Bowl, Paris (AWS x NFL), 21 octobre 2026. Équipe de 3.
- Gel du code : **15h30**. Soumission : **16h00** pile.
- Thème : insights sur les receveurs (WR / TE / RB) à partir du tracking Next Gen Stats (passes, semaines 1 à 8 de 2021).
- Public : commentateurs et spectateurs. Jury : pertinence sportive, exécution technique, communication, originalité.
- Priorité absolue : une page qui marche et qui est déployée à temps. Pas de perfection.

**Ghost Yards** : au moment du lancer, 3 à 5 receveurs sont disponibles, mais le QB n'en choisit qu'un.
Un modèle (côté algo) estime les **xYards** (yards attendus) de chaque receveur à la frame du lancer.
`ghost_yards` = combien un receveur ignoré offrait de plus que la cible réelle (`max(0, xYards_receveur - xYards_cible)`).
Accroche : *« Les yards que le receveur offrait, mais que le quarterback n'a jamais vus. »*

## Répartition
- **Noah (toi)** : tout ce qui est dans `web/`. Ne jamais modifier `src/`, `out/`, `data_raw/`.
- **Algo (Thomas + équipe)** : `src/` génère `web/public/data.json` via `python -m src.run_all`.
- Vers **15h00**, le vrai `data.json` remplace le mock actuel. Le format ne change pas.

## Stack et déploiement
- **Vite + React** dans `web/`. Créer l'app avec `npm create vite@latest web -- --template react`, depuis la racine du dépôt
  (le dossier n'est pas vide : choisir « Ignore files and continue », et **garder** `web/public/data.json`).
- Charger les données avec `fetch('/data.json')`. Aucune autre source.
- **Aucun calcul de stat côté navigateur** : tout vient de `data.json`. Seuls le tri, le filtrage et l'affichage sont autorisés.
- Pas de dépendance lourde. Le SVG est écrit à la main (pas de lib de charts nécessaire).
- Vercel : importer le dépôt GitHub `ggn-thomas/Ghost-Yards` avec **Root Directory = `web`** (framework Vite détecté automatiquement).
  Chaque merge sur `main` redéploie (les PR ont une preview Vercel). Vérifier que `npm run build` passe en local.
- **Jamais de push direct sur `main`.** Une branche `feat/<sujet>` par tâche, puis une PR vers `main`, titre et commits préfixés `feat: ...`.
- Uniquement des fichiers de `web/`. Rebase sur `main` avant de merger.

## Contrat `data.json`
Le mock actuel (`web/public/data.json`) respecte exactement ce format. `meta.mock = true` sur le mock : dans ce cas,
afficher un petit bandeau « données factices ». Le champ disparaîtra dans le vrai fichier.

```json
{
  "meta": {"model_mae": 0.0, "baseline_mae": 0.0, "n_plays": 0, "int_value": -10, "decision_threshold": 3},
  "players": [{
    "nflId": 0, "name": "", "team": "", "pos": "WR|TE|RB",
    "games": 0, "routes": 0, "ghost_yards_per_game": 0.0,
    "rank_in_pos": 1, "score10": 9,
    "ghost_play": {"gameId": 0, "playId": 0}
  }],
  "qbs": [{
    "nflId": 0, "name": "", "team": "", "passes": 0,
    "good_choice_pct": 0.0, "ghost_yards_ceded_per_game": 0.0
  }],
  "matrix": {
    "good_above": {"count": 0, "examples": [{"gameId": 0, "playId": 0}]},
    "good_below": {"count": 0, "examples": []},
    "bad_above":  {"count": 0, "examples": []},
    "bad_below":  {"count": 0, "examples": []}
  },
  "plays": [{
    "gameId": 0, "playId": 0, "description": "", "coverage": "Man|Zone|Other", "los_x": 0.0,
    "target_id": 0, "ghost_id": 0,
    "target_xyards": 0.0, "ghost_xyards": 0.0, "ghost_yards": 0.0,
    "actual_yards": 0.0, "gap": 0.0,
    "decision": "Bon choix|Discutable|Mauvais choix",
    "execution": "Au-dessus de l'attendu|En dessous",
    "frame": [{"nflId": 0, "name": "", "x": 0.0, "y": 0.0, "role": "Pass Route", "xyards": 0.0}]
  }]
}
```

Règles :
- Un play se retrouve par la paire `(gameId, playId)`. `ghost_play` et `matrix.*.examples` pointent vers `plays`.
  Si un play référencé est absent, ne pas planter : afficher « action indisponible ».
- `frame` = positions de tous les joueurs à la frame du lancer. Coordonnées **déjà normalisées** : l'attaque va toujours vers la droite (+x).
  - `x` de 0 à 120 (en-buts de 0 à 10 et de 110 à 120), `y` de 0 à 53,3.
  - `role` vaut `"Pass"` (QB), `"Pass Route"` (receveur), `"Pass Block"` (bloqueur), `"Pass Rush"` ou `"Coverage"` (défense), ou `"football"` (ballon, `nflId: null`).
  - `xyards` n'existe que pour les `"Pass Route"`.
- `matrix` : `good_*` = bon choix, `bad_*` = mauvais choix ; `*_above` = au-dessus de l'attendu, `*_below` = en dessous. Les « Discutable » sont exclus.

## Ce que la page doit contenir (par ordre de priorité)

### P1, le MVP (à finir en premier)
1. **En-tête** : titre « Ghost Yards », l'accroche ci-dessus, et une phrase de méthode :
   *« Un modèle estime les yards attendus de chaque receveur à l'instant du lancer ; les ghost yards mesurent ce que le receveur ignoré offrait de plus que la cible choisie. »*
2. **Sélecteur de receveur** : filtre par poste (WR / TE / RB), puis une liste déroulante des joueurs.
   Pour le joueur choisi : nom, équipe, poste, ghost yards par match, rang dans son poste, note sur 10 (`score10`), nombre de matchs et de tracés.
3. **Terrain SVG** (`viewBox="0 0 120 53.3"`), affichant le `ghost_play` du joueur choisi :
   - fond vert, en-buts colorés (0–10 et 110–120), lignes tous les 10 yards, numéros de yards (`x - 10` si x ≤ 60, sinon `110 - x`) ;
   - ligne de scrimmage en pointillés bleus à `los_x` ;
   - **cible réelle** (`target_id`) en **rouge** ;
   - **receveur ignoré** (`ghost_id`) en **vert, style « fantôme »** (semi-transparent, contour pointillé, halo) ;
   - autres receveurs en **bleu** ; défenseurs en **gris** ; QB et bloqueurs en couleur neutre ; ballon en marron ;
   - les **xYards** écrits à côté de chaque receveur (ex. « 12.4 xYds ») ;
   - **flèche QB → cible** ;
   - sous le terrain : `description` de l'action, couverture, et les deux badges (voir P2).
   - Attention : en SVG, l'axe y pointe vers le bas. Utiliser `53.3 - y` pour garder l'orientation habituelle (optionnel, mais rester cohérent).
4. **Tableau du top 10 par poste** (WR, TE, RB) : rang, nom, équipe, ghost yards par match, note sur 10.
   Cliquer sur une ligne sélectionne le joueur et affiche son ghost play.

### P2, le verdict de décision du QB (complément ; les receveurs restent le sujet principal)
5. **Badges** sur chaque action affichée :
   - décision : « Bon choix » (vert), « Discutable » (orange), « Mauvais choix » (rouge), avec `gap` (« +9.3 yds offerts ailleurs ») ;
   - exécution : « Au-dessus de l'attendu » ou « En dessous », avec `actual_yards` contre `target_xyards`.
6. **Matrice 2×2** (décision × exécution) avec les `count`. Chaque case est cliquable et affiche un de ses `examples` sur le terrain.
7. **Tableau QB** : % de bons choix, ghost yards cédés par match, nombre de passes.

### P3, si le temps le permet
8. Bloc « Le modèle » : `model_mae` contre `baseline_mae`, `n_plays`, hypothèse `int_value` pour les interceptions.
9. Petit encart « Limites » : ouvert au lancer ≠ ouvert à l'arrivée ; pression et progression de lecture du QB non modélisées ; 8 semaines de 2021 seulement.
10. Responsive mobile, et une jolie mise en forme du thème « fantôme ».

## Planning front
- **14h30** : app Vite créée, mock chargé, terrain SVG qui dessine un play.
- **15h00** : P1 complet, premier déploiement Vercel qui marche (envoyer l'URL à l'équipe).
- **15h00–15h20** : brancher le vrai `data.json` (simple remplacement du fichier), P2.
- **15h20** : `npm run build` OK, dernière PR mergée, vérification de l'URL Vercel. **Plus de merge front après 15h30.**
- Faire une capture d'écran de la page pour le README (à déposer dans `web/public/screenshot.png`).

## Ton et wording
Texte en français, ton « télé » : clair pour un spectateur, pas de jargon statistique non expliqué.
« Ghost Yards » est un projet d'analyse, pas une stat officielle de la NFL : ne pas le présenter autrement.
