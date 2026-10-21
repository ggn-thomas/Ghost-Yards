"""Stats for every play, player, QB, team, position and game (complements the ranked lists)."""
import pandas as pd
from src.ghost_yards import MIN_PASSES, MIN_ROUTES

RAW = "data_raw/data"
POSITIONS = {"WR": "WR", "TE": "TE", "RB": "RB", "FB": "RB"}
PLAY_COLS = ["quarter", "down", "yardsToGo", "defensiveTeam", "passResult"]


def load():
    df = pd.read_parquet("out/xyards.parquet")
    plays = pd.read_parquet("out/plays.parquet").merge(
        pd.read_csv(f"{RAW}/plays.csv", usecols=["gameId", "playId"] + PLAY_COLS), on=["gameId", "playId"])
    plays = plays.merge(pd.read_csv(f"{RAW}/games.csv", usecols=["gameId", "week"]), on="gameId")
    players = pd.read_csv(f"{RAW}/players.csv", usecols=["nflId", "displayName", "officialPosition"])
    return df, plays, players


def choice_stats(g):
    return pd.Series({"passes": len(g), "games": g.gameId.nunique(),
                      "ghost_yards_total": g.ghost_yards.sum(),
                      "good_choice_pct": (g.decision == "Bon choix").mean() * 100,
                      "bad_choice_pct": (g.decision == "Mauvais choix").mean() * 100})


def all_players(df, plays, players):
    r = df.groupby("nflId").agg(team=("possessionTeam", lambda s: s.mode().iloc[0]), games=("gameId", "nunique"),
                                routes=("playId", "size"), targets=("is_target", "sum"))
    ghosts = plays.groupby("ghost_id").agg(ghost_plays=("ghost_yards", lambda s: (s > 0).sum()),
                                           ghost_yards_total=("ghost_yards", "sum"))
    r = r.join(ghosts).fillna({"ghost_plays": 0, "ghost_yards_total": 0})
    r = r.join(players.set_index("nflId")).rename(columns={"displayName": "name"})
    r["pos"] = r.officialPosition.map(POSITIONS).fillna(r.officialPosition)
    r["ghost_yards_per_game"] = r.ghost_yards_total / r.games
    r["ghost_yards_per_100_routes"] = r.ghost_yards_total / r.routes * 100
    r["ranked"] = (r.routes >= MIN_ROUTES) & r.pos.isin(["WR", "TE", "RB"])
    return r.drop(columns="officialPosition").reset_index().sort_values("ghost_yards_per_game", ascending=False)


def all_qbs(plays, players):
    q = plays.groupby("qb_id").apply(choice_stats, include_groups=False)
    q["team"] = plays.groupby("qb_id").possessionTeam.agg(lambda s: s.mode().iloc[0])
    q["ghost_yards_ceded_per_game"] = q.ghost_yards_total / q.games
    q["good_vs_league"] = q.good_choice_pct - (plays.decision == "Bon choix").mean() * 100
    q = q.join(players.set_index("nflId").displayName.rename("name"))
    q["ranked"] = q.passes >= MIN_PASSES
    return q.reset_index().rename(columns={"qb_id": "nflId"}).sort_values("good_vs_league", ascending=False)


def teams(plays, players_all):
    t = plays.groupby("possessionTeam").apply(choice_stats, include_groups=False)
    t["ghost_yards_per_game"] = t.ghost_yards_total / t.games
    t["good_vs_league"] = t.good_choice_pct - (plays.decision == "Bon choix").mean() * 100
    top = players_all.sort_values("ghost_yards_total", ascending=False).drop_duplicates("team").set_index("team")
    t["top_ghost_player"] = top.nflId.reindex(t.index)
    return t.reset_index().rename(columns={"possessionTeam": "team"}).sort_values("ghost_yards_per_game")


def positions(plays, players_all):
    pos = players_all.set_index("nflId").pos
    p = plays.assign(target_pos=plays.target_id.map(pos), ghost_pos=plays.ghost_id.map(pos))
    tgt = p.groupby("target_pos").agg(targets=("playId", "size"), target_xyards_mean=("target_xyards", "mean"))
    gh = p[p.ghost_yards > 0].groupby("ghost_pos").agg(ghost_plays=("playId", "size"),
                                                       ghost_yards_total=("ghost_yards", "sum"))
    out = tgt.join(gh, how="outer").fillna(0)
    out["ghost_share_pct"] = out.ghost_yards_total / out.ghost_yards_total.sum() * 100
    return out.reset_index(names="pos")


def games(plays):
    g = pd.read_csv(f"{RAW}/games.csv", usecols=["gameId", "week", "gameDate", "homeTeamAbbr", "visitorTeamAbbr"])
    by_team = plays.rename(columns={"possessionTeam": "team"}).groupby(["gameId", "team"]).agg(passes=("playId", "size"),
                                                              ghost_yards=("ghost_yards", "sum"),
                                                              good_choice_pct=("decision",
                                                                               lambda s: (s == "Bon choix").mean() * 100))
    teams_json = by_team.reset_index().groupby("gameId").apply(
        lambda d: d.round(2).to_dict("records"), include_groups=False).rename("teams")
    return g.merge(teams_json.reset_index(), on="gameId").sort_values(["week", "gameId"])


def all_plays(plays):
    cols = ["gameId", "playId", "week", "quarter", "down", "yardsToGo", "possessionTeam", "defensiveTeam", "qb_id",
            "playDescription", "pff_passCoverageType", "passResult", "los_x", "target_id", "ghost_id",
            "target_xyards", "ghost_xyards", "ghost_yards", "actual_yards", "gap", "decision", "execution"]
    out = plays[cols].rename(columns={"playDescription": "description", "pff_passCoverageType": "coverage",
                                      "possessionTeam": "offense", "defensiveTeam": "defense"})
    out["coverage"] = out.coverage.fillna("Other")
    return out.sort_values(["gameId", "playId"])


def run():
    df, plays, players = load()
    pa = all_players(df, plays, players)
    return {"all_players": pa, "all_qbs": all_qbs(plays, players), "teams": teams(plays, pa),
            "positions": positions(plays, pa), "games": games(plays), "all_plays": all_plays(plays)}


if __name__ == "__main__":
    for k, v in run().items():
        print(k, len(v)); print(v.head(3).to_string()[:600])
