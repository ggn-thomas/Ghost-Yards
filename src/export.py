"""Write web/public/data.json (contract in web/CLAUDE.md) from the out/ artifacts."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from src import breakdowns

RAW = "data_raw/data"
OUT_JSON = "web/public/data.json"
FRAMES_DIR = Path("web/public/frames")
TOP_GLOBAL = 20


def clean(v):
    # numpy -> plain JSON values, NaN -> null
    if isinstance(v, (float, np.floating)):
        return None if np.isnan(v) else round(float(v), 2)
    if isinstance(v, np.integer):
        return int(v)
    return v


INT_COLS = {"nflId", "target_id", "ghost_id", "qb_id", "top_ghost_player", "passes", "games", "routes", "targets",
            "ghost_plays"}


def records(df):
    return [{k: id_or_none(v) if k in INT_COLS else clean(v) for k, v in row.items()}
            for row in df.to_dict("records")]


def text(v):
    return None if pd.isna(v) else v


def is_route(role):
    return isinstance(role, str) and role.lower() == "pass route"


def id_or_none(v):
    return None if pd.isna(v) else int(v)


def players_json(ranked):
    out = []
    for r in ranked.itertuples():
        gp = None if pd.isna(r.gp_game) else {"gameId": int(r.gp_game), "playId": int(r.gp_play)}
        out.append({"nflId": int(r.nflId), "name": r.displayName, "team": r.team, "pos": r.pos,
                    "games": int(r.games), "routes": int(r.routes),
                    "ghost_yards_per_game": clean(r.ghost_yards_per_game),
                    "rank_in_pos": int(r.rank_in_pos), "score10": int(r.score10), "ghost_play": gp})
    return out


def qbs_json(qbs):
    q = qbs.rename(columns={"qb_id": "nflId", "displayName": "name", "good": "good_choice_pct"})
    q = q.sort_values("good_vs_league", ascending=False)
    return records(q[["nflId", "name", "team", "passes", "good_choice_pct", "good_vs_league",
                      "ghost_yards_ceded_per_game"]])


def selected_keys(plays, ranked, matrix):
    keys = set(zip(ranked.gp_game.dropna().astype(int), ranked.gp_play.dropna().astype(int)))
    top = plays[~plays.playDescription.str.contains("No Play", regex=False)].nlargest(TOP_GLOBAL, "ghost_yards")
    keys |= set(zip(top.gameId, top.playId))
    keys |= {(e["gameId"], e["playId"]) for cell in matrix.values() for e in cell["examples"]}
    return keys


def frames(keys):
    tf = pd.read_parquet("out/throw_frame.parquet")
    tf = tf[pd.Series(list(zip(tf.gameId, tf.playId)), index=tf.index).isin(keys)]
    pff = pd.read_csv(f"{RAW}/pffScoutingData.csv", usecols=["gameId", "playId", "nflId", "pff_role"])
    names = pd.read_csv(f"{RAW}/players.csv", usecols=["nflId", "displayName"])
    xy = pd.read_parquet("out/xyards.parquet", columns=["gameId", "playId", "nflId", "xyards"])
    f = tf.merge(pff, on=["gameId", "playId", "nflId"], how="left").merge(names, on="nflId", how="left")
    f = f.merge(xy, on=["gameId", "playId", "nflId"], how="left")
    ball = f.team == "football"
    f.loc[ball, ["displayName", "pff_role"]] = "football"
    # stable order so re-running the pipeline does not rewrite unchanged files
    return f.sort_values(["gameId", "playId", "nflId"], na_position="last")


def play_json(p, frame):
    rows = [{"nflId": id_or_none(r.nflId), "name": text(r.displayName), "x": clean(r.x), "y": clean(r.y),
             "role": text(r.pff_role), **({"xyards": clean(r.xyards)} if is_route(r.pff_role) else {})}
            for r in frame.itertuples()]
    return {"gameId": int(p.gameId), "playId": int(p.playId), "description": p.playDescription,
            "coverage": p.pff_passCoverageType if isinstance(p.pff_passCoverageType, str) else "Other",
            "los_x": clean(p.los_x), "target_id": int(p.target_id), "ghost_id": id_or_none(p.ghost_id),
            "target_xyards": clean(p.target_xyards), "ghost_xyards": clean(p.ghost_xyards),
            "ghost_yards": clean(p.ghost_yards), "actual_yards": clean(p.actual_yards), "gap": clean(p.gap),
            "decision": p.decision, "execution": p.execution, "frame": rows}


def plays_json(plays, keys):
    f = frames(keys).groupby(["gameId", "playId"])
    sel = plays[pd.Series(list(zip(plays.gameId, plays.playId)), index=plays.index).isin(keys)]
    return [play_json(p, f.get_group((p.gameId, p.playId))) for p in sel.itertuples()]


def game_frames(f):
    # {"names": {nflId: name}, "plays": {playId: [frame rows]}} for one game
    named = f.dropna(subset=["nflId"]).drop_duplicates("nflId")
    names = {str(int(r.nflId)): text(r.displayName) for r in named.itertuples()}
    rows = {str(pid): [{"nflId": id_or_none(r.nflId), "x": clean(r.x), "y": clean(r.y), "role": text(r.pff_role),
                        **({"xyards": clean(r.xyards)} if is_route(r.pff_role) else {})}
                       for r in g.itertuples()] for pid, g in f.groupby("playId")}
    return {"names": names, "plays": rows}


def write_frames(plays):
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    f = frames(set(zip(plays.gameId, plays.playId)))
    for game_id, g in f.groupby("gameId"):
        with open(FRAMES_DIR / f"{game_id}.json", "w") as fh:
            json.dump(game_frames(g), fh, ensure_ascii=False, separators=(",", ":"))
    return f.gameId.nunique()


def run():
    plays = pd.read_parquet("out/plays.parquet")
    ranked, qbs = pd.read_parquet("out/players.parquet"), pd.read_parquet("out/qbs.parquet")
    summary, meta = json.load(open("out/summary.json")), json.load(open("out/model_meta.json"))
    meta.update(decision_threshold=summary["decision_threshold"], headline=summary["headline"])
    keys = selected_keys(plays, ranked, summary["matrix"])
    data = {"meta": {k: clean(v) for k, v in meta.items()}, "players": players_json(ranked),
            "qbs": qbs_json(qbs), "matrix": summary["matrix"], "plays": plays_json(plays, keys)}
    data.update({k: records(v) for k, v in breakdowns.run().items()})
    n_games = write_frames(plays)
    with open(OUT_JSON, "w") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"export: {len(data['players'])} players, {len(data['qbs'])} QBs, {len(data['plays'])} plays, "
          f"{len(data['all_plays'])} all_plays, {n_games} frame files -> {OUT_JSON}")


if __name__ == "__main__":
    run()
