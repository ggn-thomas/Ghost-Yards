# Ghost Yards - Thomas Gaugain & Noah Palissier

Nous avons construit **Ghost Yards**, une métrique qui estime à l'instant du lancer, à partir du tracking Next Gen Stats, les yards attendus de chaque receveur, et mesure ce que le meilleur receveur ignoré, plus ouvert que la cible, offrait de plus qu'elle.
Elle révèle que dans 41 % des passes, un receveur plus libre offrait davantage, et qu'**Amari Cooper est le receveur le plus souvent laissé de côté alors qu'il était la meilleure option : 25,5 yards attendus par match** (Evan Engram chez les TE avec 14,1, D'Andre Swift chez les RB avec 5,3).
Un commentateur l'utiliserait pour expliquer en direct qui était ouvert et ce que le choix du QB a coûté, et un coach ou un recruteur pour repérer les receveurs qui se démarquent sans être servis et les QB qui manquent leurs meilleures options.

**Démo :** VERCEL_URL · **Méthode, validation et limites :** [algo.md](algo.md) · `python -m src.run_all` regénère `web/public/data.json`.
