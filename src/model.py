"""Out-of-fold expected yards (xYards) for every route runner, trained on real targets only."""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold

INT_VALUE = -10
N_FOLDS = 5
NUM_FEATURES = ["depth", "sep1", "sep2", "dist_qb", "lateral", "speed", "v_downfield", "time_to_throw", "room"]
COVERAGES = ["Man", "Zone", "Other"]
FEATURES = NUM_FEATURES + [f"cov_{c}" for c in COVERAGES]
MONOTONIC = [1 if f in ("sep1", "sep2") else 0 for f in FEATURES]


def prepare(df, int_value):
    df = df.copy()
    cov = df.pff_passCoverageType.fillna("Other")
    for c in COVERAGES:
        df[f"cov_{c}"] = (cov == c).astype(int)
    df["y"] = np.select([df.passResult == "C", df.passResult == "IN"], [df.prePenaltyPlayResult, int_value], 0)
    return df


def new_model():
    return HistGradientBoostingRegressor(
        loss="squared_error", max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
        min_samples_leaf=50, monotonic_cst=MONOTONIC, early_stopping=False, random_state=0)


def oof_predict(df):
    # each fold: train on targets of 4 folds, predict every receiver of the held-out games
    df["xyards"], df["baseline"] = np.nan, np.nan
    for train_idx, test_idx in GroupKFold(N_FOLDS).split(df, groups=df.gameId):
        train = df.iloc[train_idx]
        train = train[train.is_target]
        model = new_model().fit(train[FEATURES], train.y)
        df.iloc[test_idx, df.columns.get_loc("xyards")] = model.predict(df.iloc[test_idx][FEATURES])
        df.iloc[test_idx, df.columns.get_loc("baseline")] = train.y.mean()
    df["xyards"] = np.minimum(df.xyards, df.max_gain)
    return df


def evaluate(df):
    t = df[df.is_target]
    mae, base = (t.y - t.xyards).abs().mean(), (t.y - t.baseline).abs().mean()
    t = t.assign(decile=pd.qcut(t.xyards, 10, labels=False, duplicates="drop"))
    calib = t.groupby("decile")[["xyards", "y"]].mean()
    return {"model_mae": round(mae, 3), "baseline_mae": round(base, 3), "n_plays": int(len(t))}, calib


def separation_check(df):
    # at equal depth, xYards should rise with separation
    d = df.assign(depth_bin=pd.cut(df.depth, [-20, 0, 5, 10, 20, 60]),
                  sep_bin=pd.cut(df.sep1, [0, 1, 2, 4, 7, 50]))
    return d.pivot_table(index="depth_bin", columns="sep_bin", values="xyards", aggfunc="mean", observed=True)


def plot_calibration(calib, path="out/calibration.png"):
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot(calib.xyards, calib.y, "o-", label="modèle (déciles)")
    lim = [min(calib.min()), max(calib.max())]
    ax.plot(lim, lim, "k--", label="parfait")
    ax.set_xlabel("xYards prédits"); ax.set_ylabel("yards réels"); ax.legend()
    fig.savefig(path, dpi=80, bbox_inches="tight")


def run(int_value=INT_VALUE, verbose=True):
    df = oof_predict(prepare(pd.read_parquet("out/receivers.parquet"), int_value))
    meta, calib = evaluate(df)
    meta["int_value"] = int_value
    if verbose:
        plot_calibration(calib)
        print(f"model: MAE {meta['model_mae']} vs baseline {meta['baseline_mae']} on {meta['n_plays']} targets")
        print("calibration (mean pred vs actual per decile):\n", calib.round(1).to_string())
        print("xYards by depth (rows) x separation (cols):\n", separation_check(df).round(1).to_string())
    df.to_parquet("out/xyards.parquet")
    json.dump(meta, open("out/model_meta.json", "w"))
    return df, meta


if __name__ == "__main__":
    run()
