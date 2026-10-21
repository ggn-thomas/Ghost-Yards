# Ghost Yards - Thomas Gaugain & Noah Palissier

Nous avons construit **Ghost Yards**, une métrique qui estime à l'instant du lancer, à partir du tracking Next Gen Stats, les yards attendus de chaque receveur, et mesure ce que le meilleur receveur ignoré, plus ouvert que la cible, offrait de plus qu'elle.
Elle révèle que dans 41 % des passes, un receveur plus libre offrait davantage, et qu'**Amari Cooper est le receveur le plus souvent laissé de côté alors qu'il était la meilleure option : 25,5 yards attendus par match** (Evan Engram chez les TE avec 14,1, D'Andre Swift chez les RB avec 5,3).
Un commentateur l'utiliserait pour expliquer en direct qui était ouvert et ce que le choix du QB a coûté, et un coach ou un recruteur pour repérer les receveurs qui se démarquent sans être servis et les QB qui manquent leurs meilleures options.

**Démo :** VERCEL_URL · **Méthode, validation et limites :** [algo.md](algo.md) · `python -m src.run_all` regénère `web/public/data.json`.

## Installer et tester
Prérequis : Python 3.11 ou plus, git (et Node 18 ou plus pour l'interface).
```bash
git clone https://github.com/ggn-thomas/Ghost-Yards.git && cd Ghost-Yards
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
git clone --depth 1 https://github.com/ThompsonJamesBliss/nfl-big-data-bowl-regional-event-data data_raw   # données, 826 Mo

python -m src.run_all        # pipeline complet, environ 15 s : extraction → features → modèle → ghost yards → web/public/data.json
python -m src.check_plot     # contrôle visuel : out/check_plays.png (l'attaque doit aller vers la droite)
```
Sortie attendue de `run_all` : `target match 95.5%`, `MAE 6.809 vs baseline 7.393`, Amari Cooper en tête des WR avec 25,5 yards par match.
La calibration du modèle est tracée dans `out/calibration.png`. Chaque étape se relance seule (`python -m src.features`, `src.model`, `src.ghost_yards`, `src.export`).

Interface en local : `cd web && npm install && npm run dev`.
