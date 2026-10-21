import { useEffect, useMemo, useRef, useState } from 'react'
import Field from './Field.jsx'
import { GhostLogo } from './Ghost.jsx'

const POSITIONS = ['WR', 'TE', 'RB']
const DECISION_CLASS = { 'Bon choix': 'good', Discutable: 'meh', 'Mauvais choix': 'bad' }
const POS_LABEL = { WR: 'Wide receivers', TE: 'Tight ends', RB: 'Running backs' }


// Cases de la matrice décision × exécution (les « Discutable » sont exclus côté algo).
const MATRIX_CELLS = [
  { key: 'good_above', tone: 'good', title: 'Bon choix, bien exécuté', hint: 'Le QB voit juste et le jeu rapporte plus que prévu.' },
  { key: 'good_below', tone: 'meh', title: 'Bon choix, mal converti', hint: 'La bonne lecture, mais le jeu rapporte moins que prévu.' },
  { key: 'bad_above', tone: 'meh', title: 'Mauvais choix, sauvé', hint: 'Un receveur plus libre et plus rentable a été ignoré, mais la cible a fait mieux que prévu.' },
  { key: 'bad_below', tone: 'bad', title: 'Mauvais choix, sanctionné', hint: 'Un receveur plus libre et plus rentable a été ignoré, et la cible n\'a pas compensé.' },
]

const QB_SORTS = {
  good_vs_league: 'vs moyenne',
  ghost_yards_ceded_per_game: 'Yards laissés / match',
  passes: 'Passes',
}

const playKey = (ref) => (ref ? `${ref.gameId}-${ref.playId}` : null)
const fmt = (v, d = 1) => (v == null ? '–' : Number(v).toFixed(d))
const fmtSigned = (v, d = 1) => (v == null ? '–' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}`)
const fmtInt = (v) => (v == null ? '–' : Number(v).toLocaleString('fr-FR'))

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [pos, setPos] = useState('WR')
  const [selectedId, setSelectedId] = useState(null)
  const [focus, setFocus] = useState(null) // { cell, index } quand une case de la matrice est affichée
  const [custom, setCustom] = useState(null) // { play, title, sub } quand une action est choisie dans l'explorateur
  const stageRef = useRef(null)

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

  const namesById = useMemo(() => {
    const m = new Map()
    for (const p of [...(data?.all_players ?? []), ...(data?.all_qbs ?? [])]) m.set(p.nflId, p.name)
    for (const p of data?.plays ?? []) for (const f of p.frame) if (f.nflId != null) m.set(f.nflId, f.name)
    return m
  }, [data])

  if (error) return <div className="state">Impossible de charger les données ({error}).</div>
  if (!data) return <div className="state">Chargement…</div>

  const list = byPos[pos]
  const player = list.find((p) => p.nflId === selectedId) ?? list[0]

  const focusCell = focus ? MATRIX_CELLS.find((c) => c.key === focus.cell) : null
  const focusExamples = focus ? (data.matrix?.[focus.cell]?.examples ?? []) : []
  const play = custom
    ? custom.play
    : focus
    ? playsByKey.get(playKey(focusExamples[focus.index]))
    : player
      ? playsByKey.get(playKey(player.ghost_play))
      : null

  const reset = () => {
    setFocus(null)
    setCustom(null)
  }

  const showCustom = (c) => {
    setFocus(null)
    setCustom(c)
    scrollToStage()
  }

  const scrollToStage = () => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const selectPlayer = (p, scroll = false) => {
    setPos(p.pos)
    setSelectedId(p.nflId)
    reset()
    if (scroll) scrollToStage()
  }

  const showCell = (cell) => {
    setCustom(null)
    setFocus({ cell, index: 0 })
    scrollToStage()
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="Ghost Yards, haut de page">
            <GhostLogo size={30} />
            <span>Ghost Yards</span>
          </a>
          <nav className="mainnav" aria-label="Sections">
            <a href="#receveurs">Receveurs</a>
            <a href="#equipes">Équipes</a>
            <a href="#top10">Top 10</a>
            <a href="#quarterbacks">Quarterbacks</a>
          </nav>
        </div>
      </div>

      <Ticker qbs={data.qbs ?? []} />

      <header className="hero" id="top">
        <div className="hero-inner reveal" style={{ '--d': 0 }}>
          {data.meta?.mock && <div className="mock-banner">Données factices · affichage de démonstration</div>}
          <p className="kicker">Big Data Bowl · Tracking 2021, semaines 1 à 8 · Analyse</p>
          <h1>Ghost Yards</h1>
          <p className="tagline">Les yards que le receveur offrait, mais que le quarterback n'a jamais vus.</p>
          <p className="method">
            Un modèle estime les yards attendus de chaque receveur à l'instant du lancer. Quand un receveur plus libre
            et plus rentable a été ignoré, l'écart avec la cible choisie devient des ghost yards : des yards attendus
            laissés sur la table.
          </p>
          <Headline headline={data.meta?.headline} players={data.players ?? []} onSelect={(p) => selectPlayer(p, true)} />
        </div>
      </header>

    <div className="page">
      <section className="panel spotlight reveal" style={{ '--d': 1 }} ref={stageRef} id="receveurs">
        <div className="controls">
          <div className="tabs" role="tablist" aria-label="Poste">
            {POSITIONS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={pos === k && !focus}
                className={pos === k && !focus ? 'active' : ''}
                onClick={() => {
                  setPos(k)
                  setSelectedId(null)
                  reset()
                }}
              >
                {k}
              </button>
            ))}
          </div>
          <select
            value={player?.nflId ?? ''}
            onChange={(e) => {
              setSelectedId(Number(e.target.value))
              reset()
            }}
            aria-label="Joueur"
          >
            {list.map((p) => (
              <option key={p.nflId} value={p.nflId}>
                #{p.rank_in_pos} {p.name} ({p.team})
              </option>
            ))}
          </select>
        </div>

        {custom ? (
          <div className="focus-bar">
            <div>
              <span className="lower-third-tag">Explorer</span>
              <h2>{custom.title}</h2>
              <p className="muted">{custom.sub}</p>
            </div>
            <div className="focus-actions">
              <button className="ghost-btn" onClick={() => document.getElementById('equipes')?.scrollIntoView({ behavior: 'smooth' })}>
                ↓ Autres actions
              </button>
              <button className="ghost-btn" onClick={reset}>
                ← Revenir à {player?.name ?? 'la sélection'}
              </button>
            </div>
          </div>
        ) : focus ? (
          <div className="focus-bar">
            <div>
              <span className={`lower-third-tag ${focusCell.tone}`}>Matrice du QB</span>
              <h2>{focusCell.title}</h2>
              <p className="muted">{focusCell.hint}</p>
            </div>
            <div className="focus-actions">
              {focusExamples.length > 1 && (
                <button
                  className="ghost-btn"
                  onClick={() => setFocus({ ...focus, index: (focus.index + 1) % focusExamples.length })}
                >
                  Exemple suivant ({focus.index + 1}/{focusExamples.length})
                </button>
              )}
              <button className="ghost-btn" onClick={() => reset()}>
                ← Revenir à {player?.name ?? 'la sélection'}
              </button>
            </div>
          </div>
        ) : player ? (
          <div className="player-card">
            <div className="player-id">
              <span className="lower-third-tag">Ghost play · #{player.rank_in_pos} {player.pos}</span>
              <h2>{player.name}</h2>
              <span className="meta">
                {player.team} · {player.pos}
              </span>
            </div>
            <div className="stats">
              <Stat value={fmt(player.ghost_yards_per_game)} label="yards laissés sur la table / match" big />
              <Stat value={`#${player.rank_in_pos}`} label={`des ${player.pos}`} />
            </div>
          </div>
        ) : (
          <p className="muted">Aucun joueur pour ce poste.</p>
        )}

        <PlayView play={play} namesById={namesById} selectedId={focus || custom ? null : player?.nflId} />
      </section>

      <Explorer data={data} namesById={namesById} onShow={showCustom} />

      <section className="panel reveal" style={{ '--d': 2 }} id="top10">
        <SectionHead
          title="Top 10 par poste"
          sub="Classement par poste et note sur 10 : quels receveurs étaient le plus souvent l'option plus libre et plus rentable que le QB n'a pas choisie. Cliquez sur un joueur pour voir son action fantôme."
        />
        <div className="tops">
          {POSITIONS.map((k) => (
            <TopTable
              key={k}
              pos={k}
              rows={byPos[k].slice(0, 10)}
              selected={focus ? null : player}
              onSelect={(p) => selectPlayer(p, true)}
            />
          ))}
        </div>
      </section>

      <section className="panel reveal" style={{ '--d': 4 }} id="quarterbacks">
          <SectionHead
            title="Les quarterbacks"
            sub="Part de bons choix comparée à la moyenne de la ligue, en points. Le pourcentage brut est indiqué en petit."
          />
          <QbTable qbs={data.qbs ?? []} />
      </section>

      <details className="panel more reveal" style={{ '--d': 5 }}>
        <summary>
          <span className="section-title">Pour aller plus loin</span>
          <span className="muted">La matrice des choix du QB, le modèle et ses limites</span>
        </summary>
      <div className="split">
        <section className="panel reveal" style={{ '--d': 3 }} id="matrice">
          <SectionHead
            title="Le choix du QB, puis l'exécution"
            sub="Le QB a-t-il visé la meilleure option, et le jeu a-t-il rapporté plus ou moins que prévu ? Cliquez sur une case pour voir un exemple."
          />
          <Matrix matrix={data.matrix} threshold={data.meta?.decision_threshold} active={focus?.cell} onPick={showCell} />
        </section>

      </div>

      <div className="split">
        <ModelBlock meta={data.meta} />
        <section className="panel limits reveal" style={{ '--d': 6 }}>
          <SectionHead title="Limites" />
          <ul>
            <li>Ouvert au moment du lancer ne veut pas dire ouvert à l'arrivée du ballon.</li>
            <li>La pression sur le QB et sa progression de lecture ne sont pas modélisées.</li>
            <li>Huit semaines de la saison 2021 seulement.</li>
            <li>Le verdict est indicatif sur une action, plus fiable en cumul.</li>
          </ul>
        </section>
      </div>

      </details>

      <footer className="footer">
        Ghost Yards est un projet d'analyse réalisé pendant un hackathon, pas une statistique officielle de la NFL.
      </footer>
    </div>
    </>
  )
}

const byLeague = (a, b) => (b.good_vs_league ?? -Infinity) - (a.good_vs_league ?? -Infinity)

function Ticker({ qbs }) {
  const top = [...qbs].sort(byLeague).slice(0, 5)
  if (!top.length) return null
  return (
    <div className="ticker" aria-label="Quarterbacks au-dessus de la moyenne">
      <div className="ticker-inner">
        <span className="ticker-label">QB</span>
        {top.map((q, i) => (
          <a key={q.nflId} className="ticker-item" href="#quarterbacks">
            <span className="ticker-pos">#{i + 1}</span>
            <span className="ticker-name">{q.name}</span>
            <span className="ticker-team">{q.team}</span>
            <span className="ticker-value">{fmtSigned(q.good_vs_league)} pts</span>
            <span className="ticker-unit">vs moyenne</span>
          </a>
        ))}
      </div>
    </div>
  )
}

// Accroche : les trois leaders fournis par meta.headline (pas de total cumulé).
function Headline({ headline, players, onSelect }) {
  const leaders = headline?.leaders
  if (!leaders) return null
  const find = (k, l) => players.find((p) => p.pos === k && p.name === l.name && p.team === l.team)
  return (
    <div className="headline">
      <p className="headline-title">Les receveurs que les QB ont le plus laissés de côté</p>
      <div className="leaders">
        {POSITIONS.filter((k) => leaders[k]).map((k) => {
          const l = leaders[k]
          const p = find(k, l)
          return (
            <button key={k} className="leader" onClick={() => p && onSelect(p)} disabled={!p}>
              <span className="leader-pos">N°1 {k}</span>
              <span className="leader-name">{l.name}</span>
              <span className="leader-team">{l.team}</span>
              <span className="leader-value">
                {fmt(l.ghost_yards_per_game)} <small>yards attendus laissés sur la table / match</small>
              </span>
              {p && <span className="leader-cta">Voir son action fantôme →</span>}
            </button>
          )
        })}
      </div>
      {(headline.pct_good_choice != null || headline.pct_bad_choice != null) && (
        <p className="headline-facts">
          {headline.pct_good_choice != null && (
            <span>
              <strong className="good-text">{fmt(headline.pct_good_choice, 0)} %</strong> des passes vont vers la bonne
              option
            </span>
          )}
          {headline.pct_bad_choice != null && (
            <span>
              <strong className="bad-text">{fmt(headline.pct_bad_choice, 0)} %</strong> ignorent un receveur plus libre et
              plus rentable
            </span>
          )}
        </p>
      )}
    </div>
  )
}

function SectionHead({ title, sub }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {sub && <p className="muted">{sub}</p>}
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

const lastName = (n) => (n ? n.split(' ').slice(-1)[0] : '')

function PlayView({ play, namesById, selectedId }) {
  if (!play) return <div className="unavailable">Action indisponible</div>
  const hasGhost = play.ghost_id != null && play.ghost_yards > 0
  const nameOf = (id) => namesById.get(id) ?? play.frame.find((f) => f.nflId === id)?.name
  const targetName = nameOf(play.target_id)
  const ghostName = hasGhost ? nameOf(play.ghost_id) : null
  return (
    <div className="play">
      <div className="verdict">
        {hasGhost ? (
          <>
            <span className="verdict-value">+{fmt(play.ghost_yards)}</span>
            <p className="verdict-text">
              <strong>yards laissés sur la table.</strong> Le QB a lancé vers <span className="t-target">{targetName}</span>{' '}
              ({fmt(play.target_xyards)} yards attendus) alors que <span className="t-ghost">{ghostName}</span>, plus libre,
              en offrait {fmt(play.ghost_xyards)}.
            </p>
          </>
        ) : (
          <p className="verdict-text">
            <strong>Pas d'option plus ouverte.</strong> Le QB a lancé vers <span className="t-target">{targetName}</span>
            {' '}: aucun receveur plus libre n'offrait davantage.
          </p>
        )}
      </div>
      <div className="legend">
        <span><i className="sw target" /> Cible choisie{targetName ? ` : ${lastName(targetName)}` : ''}</span>
        {hasGhost && (
          <span>
            <GhostLogo size={16} /> Ignoré, plus libre{ghostName ? ` : ${lastName(ghostName)}` : ''}
          </span>
        )}
        <span><i className="sw receiver" /> Autres receveurs</span>
        <span><i className="sw defense" /> Défense</span>
      </div>
      <div className="field-wrap" key={playKey(play)}>
        <Field play={play} selectedId={selectedId} />
      </div>
      <p className="description">
        <span className="muted">Action :</span> {play.description}
      </p>
      <div className="badges">
        {play.coverage && <span className="badge neutral">Couverture : {play.coverage}</span>}
        {play.decision && (
          <span className={`badge ${DECISION_CLASS[play.decision] ?? 'neutral'}`}>{play.decision}</span>
        )}
        {play.execution && (
          <span className={`badge ${play.execution.startsWith('Au-dessus') ? 'good' : 'bad'}`}>
            {play.execution} · {fmt(play.actual_yards)} yds réels contre {fmt(play.target_xyards)} attendus
          </span>
        )}
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
            <th className="sorted">Rang</th>
            <th>Joueur</th>
            <th>Équipe</th>
            <th className="num">Note</th>
            <th className="num" title="Yards attendus laissés sur la table par match">Yds / match</th>
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
              <td className="rank sorted">{p.rank_in_pos}</td>
              <td className="name">{p.name}</td>
              <td className="team">{p.team}</td>
              <td className="num">
                <Score value={p.score10} />
              </td>
              <td className="num small-num">{fmt(p.ghost_yards_per_game)}</td>
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

function Score({ value }) {
  return (
    <span className="score" style={{ '--v': value }} title={`${value}/10`}>
      {value}
    </span>
  )
}

function Matrix({ matrix, threshold, active, onPick }) {
  if (!matrix) return <p className="muted">Matrice indisponible.</p>
  return (
    <>
      <div className="matrix">
        <span className="axis axis-x axis-x1">Au-dessus de l'attendu</span>
        <span className="axis axis-x axis-x2">En dessous</span>
        <span className="axis axis-y axis-y1">Bon choix</span>
        <span className="axis axis-y axis-y2">Mauvais choix</span>
        {MATRIX_CELLS.map((c) => {
          const cell = matrix[c.key] ?? { count: 0, examples: [] }
          const disabled = !cell.examples?.length
          return (
            <button
              key={c.key}
              className={`cell ${c.tone} ${active === c.key ? 'active' : ''}`}
              style={{ gridArea: c.key }}
              onClick={() => onPick(c.key)}
              disabled={disabled}
              title={disabled ? 'Aucun exemple disponible' : 'Voir un exemple sur le terrain'}
            >
              <span className="cell-count">{fmtInt(cell.count)}</span>
              <span className="cell-title">{c.title}</span>
              <span className="cell-cta">{disabled ? 'Aucun exemple' : 'Voir un exemple →'}</span>
            </button>
          )
        })}
      </div>
      {threshold != null && (
        <p className="matrix-note muted">
          Mauvais choix : un receveur plus libre offrait au moins {threshold} yards attendus de plus que la cible. Les cas
          intermédiaires (« Discutable ») ne sont pas comptés ici.
        </p>
      )}
    </>
  )
}

function QbTable({ qbs }) {
  const [sort, setSort] = useState('good_vs_league')
  const asc = sort === 'ghost_yards_ceded_per_game' // moins de yards laissés = mieux
  const rows = [...qbs].sort((a, b) => (asc ? a[sort] - b[sort] : b[sort] - a[sort]))
  if (!qbs.length) return <p className="muted">Aucun quarterback.</p>
  return (
    <>
      <div className="seg small" role="group" aria-label="Trier les quarterbacks">
        {Object.entries(QB_SORTS).map(([k, label]) => (
          <button key={k} className={sort === k ? 'active' : ''} onClick={() => setSort(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="qb-table">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Quarterback</th>
              <th>Équipe</th>
              <th className={sort === 'good_vs_league' ? 'sorted' : ''}>Bons choix vs moyenne</th>
              <th className={`num ${sort === 'ghost_yards_ceded_per_game' ? 'sorted' : ''}`}>Yds laissés / match</th>
              <th className={`num ${sort === 'passes' ? 'sorted' : ''}`}>Passes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q, i) => (
              <tr key={q.nflId} className="static">
                <td className="rank">{i + 1}</td>
                <td className="name">{q.name}</td>
                <td className="team">{q.team}</td>
                <td className={sort === 'good_vs_league' ? 'sorted' : ''}>
                  <span className={`vs-league ${q.good_vs_league > 0 ? 'up' : q.good_vs_league < 0 ? 'down' : ''}`}>
                    {fmtSigned(q.good_vs_league)} pts
                  </span>
                  <span className="raw-pct">{fmt(q.good_choice_pct)} % de bons choix</span>
                </td>
                <td className={`num ${sort === 'ghost_yards_ceded_per_game' ? 'sorted' : ''}`}>
                  {fmt(q.ghost_yards_ceded_per_game)}
                </td>
                <td className={`num ${sort === 'passes' ? 'sorted' : ''}`}>{fmtInt(q.passes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ModelBlock({ meta }) {
  if (!meta) return null
  const max = Math.max(meta.model_mae ?? 0, meta.baseline_mae ?? 0) || 1
  return (
    <section className="panel model reveal" style={{ '--d': 5 }} id="modele">
      <SectionHead
        title="Le modèle"
        sub="Erreur moyenne en yards sur des matchs jamais vus à l'entraînement : plus c'est court, mieux c'est."
      />
      <div className="mae">
        <MaeBar label="Ghost Yards" value={meta.model_mae} max={max} accent />
        <MaeBar label="Référence (moyenne simple)" value={meta.baseline_mae} max={max} />
      </div>
      <dl className="facts">
        <div>
          <dt>Actions analysées</dt>
          <dd>{fmtInt(meta.n_plays)}</dd>
        </div>
        <div>
          <dt>Valeur d'une interception</dt>
          <dd>{meta.int_value} yds</dd>
        </div>
        <div>
          <dt>Seuil « mauvais choix »</dt>
          <dd>{meta.decision_threshold} yds</dd>
        </div>
      </dl>
    </section>
  )
}

function MaeBar({ label, value, max, accent }) {
  return (
    <div className={`mae-row ${accent ? 'accent' : ''}`}>
      <span className="mae-label">{label}</span>
      <span className="mae-track">
        <span style={{ width: `${((value ?? 0) / max) * 100}%` }} />
      </span>
      <span className="mae-value">{fmt(value)} yds</span>
    </div>
  )
}

// Positions d'un match chargées à la demande (un fichier par match), gardées en cache.
const framesCache = new Map()
function loadFrames(gameId) {
  if (!framesCache.has(gameId)) {
    const req = fetch(`/frames/${gameId}.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    req.catch(() => framesCache.delete(gameId))
    framesCache.set(gameId, req)
  }
  return framesCache.get(gameId)
}

const DOWN_LABEL = { 1: '1er', 2: '2e', 3: '3e', 4: '4e' }

function Explorer({ data, onShow }) {
  const teams = useMemo(() => [...(data.teams ?? [])].sort((a, b) => a.team.localeCompare(b.team)), [data])
  const [team, setTeam] = useState('')
  const [gameId, setGameId] = useState(null)
  const [onlyGhost, setOnlyGhost] = useState(true)
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)

  const games = useMemo(
    () =>
      (data.games ?? [])
        .filter((g) => g.homeTeamAbbr === team || g.visitorTeamAbbr === team)
        .sort((a, b) => a.week - b.week),
    [data, team],
  )
  const game = games.find((g) => g.gameId === gameId)
  const plays = useMemo(
    () =>
      (data.all_plays ?? [])
        .filter((p) => p.gameId === gameId && p.offense === team)
        .filter((p) => !onlyGhost || (p.ghost_id != null && p.ghost_yards > 0))
        .sort((a, b) => a.quarter - b.quarter || a.playId - b.playId),
    [data, gameId, team, onlyGhost],
  )
  if (!data.all_plays || !data.games) return null

  const open = async (p) => {
    setLoading(p.playId)
    setError(null)
    try {
      const f = await loadFrames(p.gameId)
      const raw = f.plays?.[String(p.playId)]
      if (!raw) throw new Error('positions absentes')
      const frame = raw.map((x) => ({ ...x, name: x.nflId != null ? f.names?.[String(x.nflId)] : 'football' }))
      const opp = p.offense === game.homeTeamAbbr ? `contre ${game.visitorTeamAbbr}` : `à ${game.homeTeamAbbr}`
      onShow({
        play: { ...p, frame },
        title: `Semaine ${game.week} · ${p.offense} ${opp}`,
        sub: `${p.quarter === 1 ? '1er' : `${p.quarter}e`} quart-temps · ${DOWN_LABEL[p.down] ?? p.down} & ${p.yardsToGo}`,
      })
    } catch (e) {
      setError(`Action indisponible (${e.message})`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <section className="panel reveal" style={{ '--d': 2 }} id="equipes">
      <SectionHead
        title="Explorer par équipe"
        sub="Choisissez une équipe, puis un match : chaque passe s'affiche sur le terrain au moment du lancer."
      />
      <div className="explorer-controls">
        <select
          value={team}
          onChange={(e) => {
            setTeam(e.target.value)
            setGameId(null)
          }}
          aria-label="Équipe"
        >
          <option value="">Choisir une équipe…</option>
          {teams.map((t) => (
            <option key={t.team} value={t.team}>
              {t.team} · {fmt(t.ghost_yards_per_game)} yds laissés / match
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyGhost} onChange={(e) => setOnlyGhost(e.target.checked)} />
          Seulement les actions avec des yards laissés sur la table
        </label>
      </div>

      {team && (
        <div className="games">
          {games.map((g) => {
            const t = g.teams?.find((x) => x.team === team)
            const home = g.homeTeamAbbr === team
            return (
              <button
                key={g.gameId}
                className={`game ${g.gameId === gameId ? 'active' : ''}`}
                onClick={() => setGameId(g.gameId)}
              >
                <span className="game-week">S{g.week}</span>
                <span className="game-teams">{home ? `${team} – ${g.visitorTeamAbbr}` : `${team} @ ${g.homeTeamAbbr}`}</span>
                <span className="game-date">{g.gameDate}</span>
                {t && <span className="game-gy">{fmt(t.ghost_yards)} yds laissés</span>}
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="unavailable small">{error}</p>}

      {game && (
        <div className="table-scroll plays-list">
          <table>
            <thead>
              <tr>
                <th>QT</th>
                <th>Situation</th>
                <th>Action</th>
                <th className="num sorted">Yds laissés</th>
              </tr>
            </thead>
            <tbody>
              {plays.map((p) => (
                <tr key={p.playId} onClick={() => open(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(p)}>
                  <td className="rank">{p.quarter}</td>
                  <td className="team">
                    {DOWN_LABEL[p.down] ?? p.down} & {p.yardsToGo}
                  </td>
                  <td className="name">{loading === p.playId ? 'Chargement…' : p.description}</td>
                  <td className="num strong sorted">{p.ghost_yards > 0 ? `+${fmt(p.ghost_yards)}` : '–'}</td>
                </tr>
              ))}
              {plays.length === 0 && (
                <tr className="static">
                  <td colSpan={4} className="muted">Aucune action pour ce filtre.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
