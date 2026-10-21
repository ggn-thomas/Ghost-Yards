import { useEffect, useMemo, useState } from 'react'
import Field from './Field.jsx'

const POSITIONS = ['WR', 'TE', 'RB']
const POS_LABEL = { WR: 'Wide receivers', TE: 'Tight ends', RB: 'Running backs' }

const DECISION_CLASS = { 'Bon choix': 'good', Discutable: 'meh', 'Mauvais choix': 'bad' }

const playKey = (ref) => (ref ? `${ref.gameId}-${ref.playId}` : null)
const fmt = (v, d = 1) => (v == null ? '–' : Number(v).toFixed(d))

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [pos, setPos] = useState('WR')
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    fetch('/data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  const playsByKey = useMemo(() => {
    const m = new Map()
    for (const p of data?.plays ?? []) m.set(playKey(p), p)
    return m
  }, [data])

  const byPos = useMemo(() => {
    const m = { WR: [], TE: [], RB: [] }
    for (const p of data?.players ?? []) m[p.pos]?.push(p)
    for (const k of POSITIONS) m[k].sort((a, b) => a.rank_in_pos - b.rank_in_pos)
    return m
  }, [data])

  if (error) return <div className="state">Impossible de charger les données ({error}).</div>
  if (!data) return <div className="state">Chargement…</div>

  const list = byPos[pos]
  const player = list.find((p) => p.nflId === selectedId) ?? list[0]
  const play = player ? playsByKey.get(playKey(player.ghost_play)) : null

  const selectPlayer = (p) => {
    setPos(p.pos)
    setSelectedId(p.nflId)
  }

  return (
    <div className="page">
      {data.meta?.mock && <div className="mock-banner">Données factices : affichage de démonstration</div>}

      <header className="hero">
        <p className="kicker">NFL Big Data Bowl · Saison 2021, semaines 1 à 8</p>
        <h1>Ghost Yards</h1>
        <p className="tagline">Les yards que le receveur offrait, mais que le quarterback n'a jamais vus.</p>
        <p className="method">
          Un modèle estime les yards attendus de chaque receveur à l'instant du lancer ; les ghost yards mesurent ce
          que le receveur ignoré offrait de plus que la cible choisie.
        </p>
      </header>

      <section className="panel spotlight">
        <div className="controls">
          <div className="seg" role="tablist" aria-label="Poste">
            {POSITIONS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={pos === k}
                className={pos === k ? 'active' : ''}
                onClick={() => {
                  setPos(k)
                  setSelectedId(null)
                }}
              >
                {k}
              </button>
            ))}
          </div>
          <select
            value={player?.nflId ?? ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            aria-label="Joueur"
          >
            {list.map((p) => (
              <option key={p.nflId} value={p.nflId}>
                #{p.rank_in_pos} {p.name} ({p.team})
              </option>
            ))}
          </select>
        </div>

        {player ? (
          <div className="player-card">
            <div className="player-id">
              <h2>{player.name}</h2>
              <span className="meta">
                {player.team} · {player.pos}
              </span>
            </div>
            <div className="stats">
              <Stat value={fmt(player.ghost_yards_per_game)} label="ghost yards / match" big />
              <Stat value={`#${player.rank_in_pos}`} label={`rang ${player.pos}`} />
              <Stat value={`${player.score10}/10`} label="note" />
              <Stat value={player.games} label="matchs" />
              <Stat value={player.routes} label="tracés" />
            </div>
          </div>
        ) : (
          <p className="muted">Aucun joueur pour ce poste.</p>
        )}

        <PlayView play={play} />
      </section>

      <section className="panel">
        <h2 className="section-title">Top 10 par poste</h2>
        <div className="tops">
          {POSITIONS.map((k) => (
            <TopTable key={k} pos={k} rows={byPos[k].slice(0, 10)} selected={player} onSelect={selectPlayer} />
          ))}
        </div>
      </section>

      <footer className="footer">
        Ghost Yards est un projet d'analyse réalisé pendant un hackathon, pas une statistique officielle de la NFL.
      </footer>
    </div>
  )
}

function Stat({ value, label, big }) {
  return (
    <div className={`stat ${big ? 'big' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function PlayView({ play }) {
  if (!play) return <div className="unavailable">Action indisponible</div>
  return (
    <div className="play">
      <div className="legend">
        <span><i className="sw target" /> Cible réelle</span>
        <span><i className="sw ghost" /> Receveur ignoré</span>
        <span><i className="sw receiver" /> Autres receveurs</span>
        <span><i className="sw defense" /> Défense</span>
        <span><i className="sw los" /> Ligne de scrimmage</span>
      </div>
      <div className="field-wrap">
        <Field play={play} />
      </div>
      <p className="description">{play.description}</p>
      <div className="badges">
        <span className="badge neutral">Couverture : {play.coverage}</span>
        <span className={`badge ${DECISION_CLASS[play.decision] ?? 'neutral'}`}>
          {play.decision}
          {play.gap > 0 && ` · +${fmt(play.gap)} yds offerts ailleurs`}
        </span>
        <span className={`badge ${play.execution?.startsWith('Au-dessus') ? 'good' : 'bad'}`}>
          {play.execution} · {fmt(play.actual_yards)} yds réels contre {fmt(play.target_xyards)} attendus
        </span>
      </div>
    </div>
  )
}

function TopTable({ pos, rows, selected, onSelect }) {
  return (
    <div className="top">
      <h3>{POS_LABEL[pos]}</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Joueur</th>
            <th>Équipe</th>
            <th className="num">GY/match</th>
            <th className="num">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.nflId}
              className={selected?.nflId === p.nflId ? 'selected' : ''}
              onClick={() => onSelect(p)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(p)}
            >
              <td>{p.rank_in_pos}</td>
              <td>{p.name}</td>
              <td>{p.team}</td>
              <td className="num">{fmt(p.ghost_yards_per_game)}</td>
              <td className="num">{p.score10}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">Aucun joueur</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
