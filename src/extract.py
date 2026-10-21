"""Extract snap-frame and throw-frame tracking for every play with DuckDB -> parquet."""
from pathlib import Path
import duckdb

RAW = Path("data_raw/data")
OUT = Path("out")


def run():
    OUT.mkdir(exist_ok=True)
    con = duckdb.connect()
    # Read all 122 tracking files at once and normalise direction: offense always moves toward +x.
    con.execute(f"""
        CREATE TABLE t AS
        SELECT gameId, playId, nflId, frameId, team, event,
               CASE WHEN playDirection = 'left' THEN 120 - x ELSE x END AS x,
               CASE WHEN playDirection = 'left' THEN 53.3 - y ELSE y END AS y,
               s, a,
               CASE WHEN playDirection = 'left' THEN (dir + 180) % 360 ELSE dir END AS dir,
               CASE WHEN playDirection = 'left' THEN (o + 180) % 360 ELSE o END AS o
        FROM read_csv('{RAW}/tracking/tracking_*.csv', header = true, nullstr = 'NA',
                      types = {{'nflId': 'DOUBLE'}})
    """)
    con.execute("""
        CREATE TABLE keyframes AS
        SELECT gameId, playId,
               MIN(frameId) FILTER (WHERE event IN ('ball_snap', 'autoevent_ballsnap')) AS snap_frame,
               MIN(frameId) FILTER (WHERE event IN ('pass_forward', 'autoevent_passforward')) AS throw_frame
        FROM t GROUP BY 1, 2
    """)
    for name, cond in [
        ("throw_frame", "t.frameId = k.throw_frame"),
        ("snap_frame", "t.frameId = k.snap_frame"),
        # 10 frames before the throw, for the bonus "best moment" narration only.
        ("pre_throw", "t.frameId BETWEEN k.throw_frame - 10 AND k.throw_frame"),
    ]:
        con.execute(f"""
            COPY (SELECT t.*, k.snap_frame, k.throw_frame
                  FROM t JOIN keyframes k USING (gameId, playId) WHERE {cond})
            TO '{OUT}/{name}.parquet'
        """)
    n, n_snap, n_throw = con.execute(
        "SELECT COUNT(*), COUNT(snap_frame), COUNT(throw_frame) FROM keyframes").fetchone()
    print(f"extract: {n} plays, {n_snap} with snap, {n_throw} with throw")


if __name__ == "__main__":
    run()
