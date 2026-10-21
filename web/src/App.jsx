import { useEffect, useMemo, useRef, useState } from 'react'
import Field from './Field.jsx'
import { GhostLogo } from './Ghost.jsx'

const POSITIONS = ['WR', 'TE', 'RB']
const POS_LABEL = { WR: 'Wide receivers', TE: 'Tight ends', RB: 'Running backs' }

const DECISION_CLASS = { 'Bon choix': 'good', Discutable: 'meh', 'Mauvais choix': 'bad' }

// Cases de la matrice décision × exécution (les « Discutable » sont exclus côté algo).
const MATRIX_CELLS = [
  { key: 'good_above', tone: 'good', title: 'Bon choix, bien exécuté', hint: 'Le QB voit juste et le jeu rapporte plus que prévu.' },
  { key: 'good_below', tone: 'meh', title: 'Bon choix, mal converti', hint: 'La bonne lecture, mais le jeu rapporte moins que prévu.' },
  { key: 'bad_above', tone: 'meh', title: 'Mauvais choix, sauvé', hint: 'Un receveur ignoré offrait plus, mais la cible a fait mieux que prévu.' },
  { key: 'bad_below', tone: 'bad', title: 'Mauvais choix, sanctionné', hint: 'Un receveur ignoré offrait plus, et la cible n\'a pas compensé.' },
]

const QB_SORTS = {
  good_choice_pct: 'Bons choix',
  ghost_yards_ceded_per_game: 'Ghost yards cédés / match',
  passes: 'Passes',
}

const playKey = (ref) => (ref ? `${ref.gameId}-${ref.playId}` : null)
const fmt = (v, d = 1) => (v == null ? '–' : Number(v).toFixed(d))
const fmtInt = (v) => (v == null ? '–' : Number(v).toLocaleString('fr-FR'))

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [pos, setPos] = useState('WR')
  const [selectedId, setSelectedId] = useState(null)
  const [focus, setFocus] = useState(null) // { cell, index } quand une case de la matrice est affichée
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
    for (const p of data?.plays ?? []) for (const f of p.frame) if (f.nflId != null) m.set(f.nflId, f.name)
    return m
  }, [data])

  if (error) return <div className="state">Impossible de charger les données ({error}).</div>
  if (!data) return <div className="state">Chargement…</div>

  const list = byPos[pos]
  const player = list.find((p) => p.nflId === selectedId) ?? list[0]

  const focusCell = focus ? MATRIX_CELLS.find((c) => c.key === focus.cell) : null
  const focusExamples = focus ? (data.matrix?.[focus.cell]?.examples ?? []) : []
  const play = focus
    ? playsByKey.get(playKey(focusExamples[focus.index]))
    : player
      ? playsByKey.get(playKey(player.ghost_play))
      : null

  const scrollToStage = () => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const selectPlayer = (p, scroll = false) => {
    setPos(p.pos)
    setSelectedId(p.nflId)
    setFocus(null)
    if (scroll) scrollToStage()
  }

  const showCell = (cell) => {
    setFocus({ cell, index: 0 })
    scrollToStage()
  }

  return (
    <div className="page">
      {data.meta?.mock && <div className="mock-banner">Données factices · affichage de démonstration</div>}

      <header className="hero reveal" style={{ '--d': 0 }}>
        <GhostLogo size={64} />
        <p className="kicker">NFL Big Data Bowl · Saison 2021, semaines 1 à 8</p>
        <h1>Ghost Yards</h1>
        <p className="tagline">Les yards que le receveur offrait, mais que le quarterback n'a jamais vus.</p>
        <p className="method">
          Un modèle estime les yards attendus de chaque receveur à l'instant du lancer ; les ghost yards mesurent ce
          que le receveur ignoré offrait de plus que la cible choisie.
        </p>
      </header>

      <section className="panel spotlight reveal" style={{ '--d': 1 }} ref={stageRef}>
        <div className="controls">
          <div className="seg" role="tablist" aria-label="Poste">
            {POSITIONS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={pos === k && !focus}
                className={pos === k && !focus ? 'active' : ''}
                onClick={() => {
                  setPos(k)
                  setSelectedId(null)
                  setFocus(null)
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
              setFocus(null)
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

        {focus ? (
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
              <button className="ghost-btn" onClick={() => setFocus(null)}>
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

        <PlayView play={play} namesById={namesById} />
      </section>

      <section className="panel reveal" style={{ '--d': 2 }}>
        <SectionHead
          title="Top 10 par poste"
          sub="Ghost yards par match : les yards attendus laissés sur la table quand le receveur était la meilleure option ignorée. Cliquez sur un joueur pour voir son action fantôme."
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

      <div className="split">
        <section className="panel reveal" style={{ '--d': 3 }}>
          <SectionHead
            title="Le choix du QB, puis l'exécution"
            sub="Le QB a-t-il visé la meilleure option, et le jeu a-t-il rapporté plus ou moins que prévu ? Cliquez sur une case pour voir un exemple."
          />
          <Matrix matrix={data.matrix} active={focus?.cell} onPick={showCell} />
        </section>

        <section className="panel reveal" style={{ '--d': 4 }}>
          <SectionHead
            title="Les quarterbacks"
            sub="Part des passes vers la meilleure option, et yards attendus laissés sur la table par match."
          />
          <QbTable qbs={data.qbs ?? []} />
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

      <footer className="footer">
        Ghost Yards est un projet d'analyse réalisé pendant un hackathon, pas une statistique officielle de la NFL.
      </footer>
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

function PlayView({ play, namesById }) {
  if (!play) return <div className="unavailable">Action indisponible</div>
  const hasVectors = play.frame.some((p) => p.s != null && p.dir != null)
  const targetName = namesById.get(play.target_id)
  const ghostName = namesById.get(play.ghost_id)
  return (
    <div className="play">
      <div className="legend">
        <span><i className="sw target" /> Cible réelle{targetName ? ` (${targetName})` : ''}</span>
        <span>
          <GhostLogo size={16} /> Receveur ignoré{ghostName ? ` (${ghostName})` : ''}
        </span>
        <span><i className="sw receiver" /> Autres receveurs</span>
        <span><i className="sw defense" /> Défense</span>
        <span><i className="sw los" /> Ligne de scrimmage</span>
        {hasVectors && (
          <span><i className="sw vec" /> Déplacement sur 0,5 s</span>
        )}
      </div>
      <div className="field-wrap" key={playKey(play)}>
        <Field play={play} />
        {play.ghost_yards > 0 && (
          <div className="field-callout">
            <span className="callout-value">+{fmt(play.ghost_yards)}</span>
            <span className="callout-label">ghost yards sur l'action</span>
          </div>
        )}
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
              <td className="rank">{p.rank_in_pos}</td>
              <td className="name">{p.name}</td>
              <td className="team">{p.team}</td>
              <td className="num strong">{fmt(p.ghost_yards_per_game)}</td>
              <td className="num">
                <Score value={p.score10} />
              </td>
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

function Matrix({ matrix, active, onPick }) {
  if (!matrix) return <p className="muted">Matrice indisponible.</p>
  return (
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
  )
}

function QbTable({ qbs }) {
  const [sort, setSort] = useState('good_choice_pct')
  const asc = sort === 'ghost_yards_ceded_per_game' // moins de yards cédés = mieux
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
              <th>Quarterback</th>
              <th>Équipe</th>
              <th>Bons choix</th>
              <th className="num">GY cédés / match</th>
              <th className="num">Passes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.nflId} className="static">
                <td className="name">{q.name}</td>
                <td className="team">{q.team}</td>
                <td>
                  <span className="pct">
                    <span className="pct-bar">
                      <span style={{ width: `${Math.min(100, Math.max(0, q.good_choice_pct))}%` }} />
                    </span>
                    <span className="pct-value">{fmt(q.good_choice_pct)} %</span>
                  </span>
                </td>
                <td className="num strong">{fmt(q.ghost_yards_ceded_per_game)}</td>
                <td className="num">{fmtInt(q.passes)}</td>
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
    <section className="panel model reveal" style={{ '--d': 5 }}>
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
