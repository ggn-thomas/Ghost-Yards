"""Sanity check: plot plays at the throw frame, coloured by pff_role (offense must go right)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

COLORS = {"pass": "black", "pass route": "red", "pass block": "orange",
          "pass rush": "purple", "coverage": "grey"}


def run(n=4, seed=0):
    tf = pd.read_parquet("out/throw_frame.parquet")
    snap = pd.read_parquet("out/snap_frame.parquet")
    pff = pd.read_csv("data_raw/data/pffScoutingData.csv", usecols=["gameId", "playId", "nflId", "pff_role"])
    pff["role"] = pff.pff_role.str.lower()
    keys = tf[["gameId", "playId"]].drop_duplicates().sample(n, random_state=seed)
    fig, axes = plt.subplots(n, 1, figsize=(12, 5 * n))
    for ax, (g, p) in zip(axes, keys.itertuples(index=False)):
        fr = tf[(tf.gameId == g) & (tf.playId == p)].merge(pff, on=["gameId", "playId", "nflId"], how="left")
        los = snap[(snap.gameId == g) & (snap.playId == p) & (snap.team == "football")].x.iloc[0]
        for role, c in COLORS.items():
            d = fr[fr.role == role]
            ax.scatter(d.x, d.y, c=c, label=role, s=40)
        ball = fr[fr.team == "football"]
        ax.scatter(ball.x, ball.y, c="brown", marker="D", label="ball")
        ax.axvline(los, color="blue", ls="--", label="LOS")
        ax.set_xlim(0, 120); ax.set_ylim(0, 53.3); ax.set_title(f"{g} / {p}")
        ax.legend(loc="upper left", fontsize=7)
    fig.savefig("out/check_plays.png", dpi=70, bbox_inches="tight")


if __name__ == "__main__":
    run()
