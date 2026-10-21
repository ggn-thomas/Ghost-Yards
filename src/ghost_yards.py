"""Ghost yards per play (once per play, best alternative only), player ranking, QB verdicts and 2x2 matrix."""
import json
import numpy as np
import pandas as pd

RAW = "data_raw/data"
DECISION_THRESHOLD = 5
MIN_ROUTES = 100
MIN_PASSES = 100
POSITIONS = {"WR": "WR", "TE": "TE", "RB": "RB", "FB": "RB"}
N_EXAMPLES = 3


def decision(gap, threshold):
    return np.select([gap <= 0, gap < threshold], ["Bon choix", "Discutable"], "Mauvais choix")


def open_alternatives(df):
    # a ghost must be more open than the target (limits the model's bias toward deep receivers)
    target_sep = df[df.is_target].set_index(["gameId", "playId"]).sep1.rename("target_sep1")
    alts = df[~df.is_target].join(target_sep, on=["gameId", "playId"])
    return alts[alts.sep1 > alts.target_sep1]


def per_play(df, threshold=DECISION_THRESHOLD):
    key = ["gameId", "playId"]
    target = df[df.is_target].set_index(key)
    alts = open_alternatives(df).sort_values("xyards", ascending=False).drop_duplicates(key).set_index(key)
    p = target[["nflId", "xyards", "y", "possessionTeam", "playDescription", "pff_passCoverageType", "los_x"]]
    p = p.rename(columns={"nflId": "target_id", "xyards": "target_xyards", "y": "actual_yards"})
    p = p.join(alts[["nflId", "xyards"]].rename(columns={"nflId": "ghost_id", "xyards": "ghost_xyards"}))
    p["gap"] = (p.ghost_xyards - p.target_xyards).fillna(0)
    p["ghost_yards"] = p.gap.clip(lower=0)
    p["decision"] = decision(p.gap, threshold)
    p["execution"] = np.where(p.actual_yards > p.target_xyards, "Au-dessus de l'attendu", "En dessous")
    return p.reset_index()


def rank_players(df, plays, players):
    # routes and games from all route rows; ghost yards only from plays where the player is ghost_id
    r = df.groupby("nflId").agg(games=("gameId", "nunique"), routes=("playId", "size"),
                                team=("possessionTeam", lambda s: s.mode().iloc[0]))
    r["ghost_total"] = plays.groupby("ghost_id").ghost_yards.sum().reindex(r.index).fillna(0)
    r = r.join(players.set_index("nflId")[["displayName", "officialPosition"]])
    r["pos"] = r.officialPosition.map(POSITIONS)
    r = r[(r.routes >= MIN_ROUTES) & r.pos.notna()].copy()
    r["ghost_yards_per_game"] = r.ghost_total / r.games
    r["rank_in_pos"] = r.groupby("pos").ghost_yards_per_game.rank(ascending=False, method="min").astype(int)
    pct = r.groupby("pos").ghost_yards_per_game.rank(pct=True)
    r["score10"] = np.ceil(pct * 10).astype(int)
    best = plays.sort_values("ghost_yards", ascending=False).drop_duplicates("ghost_id").set_index("ghost_id")
    r = r.join(best[["gameId", "playId"]].rename(columns={"gameId": "gp_game", "playId": "gp_play"}))
    return r.reset_index().sort_values(["pos", "rank_in_pos"])


def attach_qb(plays):
    pff = pd.read_csv(f"{RAW}/pffScoutingData.csv", usecols=["gameId", "playId", "nflId", "pff_role"])
    qb = pff[pff.pff_role.str.lower() == "pass"].drop_duplicates(["gameId", "playId"])
    return plays.merge(qb[["gameId", "playId", "nflId"]].rename(columns={"nflId": "qb_id"}), on=["gameId", "playId"])


def rank_qbs(plays, players):
    q = plays.groupby("qb_id").agg(passes=("playId", "size"), games=("gameId", "nunique"),
                                   good=("decision", lambda s: (s == "Bon choix").mean() * 100),
                                   ceded=("ghost_yards", "sum"), team=("possessionTeam", lambda s: s.mode().iloc[0]))
    q = q[q.passes >= MIN_PASSES]
    q["ghost_yards_ceded_per_game"] = q.ceded / q.games
    q["good_vs_league"] = q.good - (plays.decision == "Bon choix").mean() * 100
    q = q.join(players.set_index("nflId").displayName)
    return q.reset_index().sort_values("good", ascending=False)


def matrix(plays):
    cells = {}
    for d_key, d_val, asc in [("good", "Bon choix", True), ("bad", "Mauvais choix", False)]:
        for e_key, e_val in [("above", "Au-dessus de l'attendu"), ("below", "En dessous")]:
            c = plays[(plays.decision == d_val) & (plays.execution == e_val)].sort_values("gap", ascending=asc)
            cells[f"{d_key}_{e_key}"] = {"count": int(len(c)),
                                         "examples": c[["gameId", "playId"]].head(N_EXAMPLES).to_dict("records")}
    return cells


def headline(plays, ranked):
    # relative figures first: leaders per position, then league-wide context
    team_games = plays.groupby("possessionTeam").gameId.nunique().sum()
    leaders = ranked[ranked.rank_in_pos == 1].set_index("pos")
    return {"leaders": {pos: {"name": r.displayName, "team": r.team,
                              "ghost_yards_per_game": round(float(r.ghost_yards_per_game), 1)}
                        for pos, r in leaders.iterrows()},
            "ghost_yards_per_team_game": round(float(plays.ghost_yards.sum() / team_games), 1),
            "pct_bad_choice": round(float((plays.decision == "Mauvais choix").mean() * 100), 1),
            "pct_good_choice": round(float((plays.decision == "Bon choix").mean() * 100), 1)}


def run(threshold=DECISION_THRESHOLD, verbose=True):
    df = pd.read_parquet("out/xyards.parquet")
    players = pd.read_csv(f"{RAW}/players.csv")
    plays = attach_qb(per_play(df, threshold))
    ranked, qbs = rank_players(df, plays, players), rank_qbs(plays, players)
    plays.to_parquet("out/plays.parquet")
    ranked.to_parquet("out/players.parquet")
    qbs.to_parquet("out/qbs.parquet")
    summary = {"matrix": matrix(plays), "headline": headline(plays, ranked), "decision_threshold": threshold}
    json.dump(summary, open("out/summary.json", "w"), ensure_ascii=False)
    if verbose:
        report(plays, ranked, qbs, summary)
    return plays, ranked, qbs


def report(plays, ranked, qbs, summary):
    print(f"ghost_yards: {len(plays)} plays, headline {summary['headline']}")
    print(plays.decision.value_counts().to_dict())
    print({k: v["count"] for k, v in summary["matrix"].items()})
    for pos, g in ranked.groupby("pos"):
        print(f"{pos} ({len(g)} ranked):", g.head(5)[["displayName", "team", "ghost_yards_per_game", "routes"]]
              .round(1).to_string(index=False), sep="\n")
    print("QBs:", qbs.head(5)[["displayName", "passes", "good", "ghost_yards_ceded_per_game"]].round(1)
          .to_string(index=False), sep="\n")


if __name__ == "__main__":
    run()
