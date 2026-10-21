"""Match the targeted receiver and build one feature row per route runner at the throw frame."""
import re
import numpy as np
import pandas as pd

RAW = "data_raw/data"
TARGET_RE = re.compile(
    r"pass (?:incomplete )?(?:short|deep) (?:left|right|middle) (?:intended for |to )([A-Z][a-zA-Z'.\-]+)")
SUFFIXES = re.compile(r"\s+(jr\.?|sr\.?|ii|iii|iv|v)$", re.IGNORECASE)
KEEP_RESULTS = ["C", "I", "IN"]
ENDZONE_X = 110


def name_key(s):
    return re.sub(r"[^a-z]", "", s.lower())


def split_name(display_name):
    # "Amon-Ra St. Brown Jr." -> ("amonra", "stbrown")
    first, _, last = SUFFIXES.sub("", display_name).partition(" ")
    return name_key(first), name_key(last)


def split_target(target_name):
    # "Dj.Moore." -> ("dj", "moore")
    first, _, last = target_name.rstrip(".").partition(".")
    return name_key(first), name_key(last)


def load_plays():
    plays = pd.read_csv(f"{RAW}/plays.csv")
    plays = plays[plays.passResult.isin(KEEP_RESULTS)].copy()
    plays["target_name"] = plays.playDescription.str.extract(TARGET_RE, expand=False)
    return plays


def load_roles():
    pff = pd.read_csv(f"{RAW}/pffScoutingData.csv", usecols=["gameId", "playId", "nflId", "pff_role"])
    pff["role"] = pff.pff_role.str.lower()
    return pff


def pick_target(group):
    # first-name prefix + last name, then last name alone; must be unique
    first, last = split_target(group.target_name.iloc[0])
    same_first = group.first.str.startswith(first)
    for mask in (same_first & (group["last"] == last),
                 same_first & group["last"].str.startswith(last),
                 group["last"] == last):
        if mask.sum() == 1:
            return group.nflId[mask].iloc[0]
    return np.nan


def match_targets(plays, routes, players):
    r = routes.merge(players[["nflId", "displayName"]], on="nflId")
    r[["first", "last"]] = r.displayName.map(split_name).tolist()
    r = r.merge(plays[["gameId", "playId", "target_name"]].dropna(), on=["gameId", "playId"])
    targets = r.groupby(["gameId", "playId"]).apply(pick_target, include_groups=False).rename("target_id")
    return plays.merge(targets.reset_index(), on=["gameId", "playId"], how="left")


def separations(rec, cov):
    d = rec[["gameId", "playId", "nflId", "x", "y"]].merge(
        cov[["gameId", "playId", "x", "y"]], on=["gameId", "playId"], suffixes=("", "_d"))
    d["dist"] = np.hypot(d.x - d.x_d, d.y - d.y_d)
    d["rank"] = d.groupby(["gameId", "playId", "nflId"]).dist.rank(method="first")
    sep = d[d["rank"] <= 2].pivot_table(index=["gameId", "playId", "nflId"], columns="rank", values="dist")
    sep.columns = ["sep1", "sep2"]
    return sep.reset_index()


def play_context(tf, snap, roles):
    ball = snap[snap.team == "football"][["gameId", "playId", "x", "y"]].rename(columns={"x": "los_x", "y": "ball_y"})
    qb = tf.merge(roles[roles.role == "pass"], on=["gameId", "playId", "nflId"])
    qb = qb.drop_duplicates(["gameId", "playId"])[["gameId", "playId", "x", "y"]]
    timing = tf.groupby(["gameId", "playId"])[["snap_frame", "throw_frame"]].first().reset_index()
    timing["time_to_throw"] = (timing.throw_frame - timing.snap_frame) / 10
    return ball.merge(qb.rename(columns={"x": "qb_x", "y": "qb_y"}), on=["gameId", "playId"]).merge(
        timing[["gameId", "playId", "time_to_throw"]], on=["gameId", "playId"])


def receiver_features(rec, ctx, sep):
    f = rec.merge(ctx, on=["gameId", "playId"]).merge(sep, on=["gameId", "playId", "nflId"], how="left")
    f["depth"] = f.x - f.los_x
    f["dist_qb"] = np.hypot(f.x - f.qb_x, f.y - f.qb_y)
    f["lateral"] = (f.y - f.ball_y).abs()
    f["speed"] = f.s
    f["v_downfield"] = f.s * np.sin(np.radians(f.dir))
    f["room"] = ENDZONE_X - f.x
    f["max_gain"] = ENDZONE_X - f.los_x
    return f


def run():
    plays, roles = load_plays(), load_roles()
    players = pd.read_csv(f"{RAW}/players.csv")
    tf = pd.read_parquet("out/throw_frame.parquet").dropna(subset=["snap_frame", "throw_frame"])
    snap = pd.read_parquet("out/snap_frame.parquet")
    tf = tf.merge(roles, on=["gameId", "playId", "nflId"], how="left")
    rec, cov = tf[tf.role == "pass route"], tf[tf.role == "coverage"]

    plays = match_targets(plays, rec[["gameId", "playId", "nflId"]], players)
    rate = plays.target_id.notna().mean()
    plays = plays.dropna(subset=["target_id"])

    f = receiver_features(rec, play_context(tf, snap, roles), separations(rec, cov))
    cols = ["gameId", "playId", "possessionTeam", "passResult", "prePenaltyPlayResult",
            "pff_passCoverageType", "playDescription", "target_id"]
    f = f.merge(plays[cols], on=["gameId", "playId"])
    f["is_target"] = f.nflId == f.target_id
    f = f[f.groupby(["gameId", "playId"]).is_target.transform("any")]
    f.to_parquet("out/receivers.parquet")
    print(f"features: target match {rate:.1%}, {f.playId.groupby(f.gameId).nunique().sum()} plays, "
          f"{len(f)} receiver rows, {f.groupby(['gameId', 'playId']).size().mean():.2f} receivers/play")


if __name__ == "__main__":
    run()
