// Terrain SVG du play au moment du lancer. Coordonnées déjà normalisées (attaque vers +x).
const W = 120
const H = 53.3
const flip = (y) => H - y // SVG : y vers le bas -> on garde l'orientation habituelle

const YARD_LINES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]
const NUMBERS = [20, 30, 40, 50, 60, 70, 80, 90, 100]

function shortName(name) {
  if (!name) return ''
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

export default function Field({ play }) {
  const qb = play.frame.find((p) => p.role === 'Pass')
  const target = play.frame.find((p) => p.nflId === play.target_id)

  const playerClass = (p) => {
    if (p.role === 'football') return 'dot ball'
    if (p.nflId === play.target_id) return 'dot target'
    if (p.nflId === play.ghost_id) return 'dot ghost'
    if (p.role === 'Pass Route') return 'dot receiver'
    if (p.role === 'Coverage' || p.role === 'Pass Rush') return 'dot defense'
    return 'dot offense'
  }

  // Ordre de dessin : défense et ligne d'abord, receveurs ensuite, ballon au-dessus.
  const order = { 'Pass Block': 0, 'Pass Rush': 0, Coverage: 1, Pass: 2, 'Pass Route': 3, football: 4 }
  const players = [...play.frame].sort((a, b) => (order[a.role] ?? 0) - (order[b.role] ?? 0))

  return (
    <svg className="field" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Positions des joueurs au moment du lancer">
      <defs>
        <filter id="ghost-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
        </marker>
      </defs>

      <rect className="turf" x="0" y="0" width={W} height={H} />
      <rect className="endzone" x="0" y="0" width="10" height={H} />
      <rect className="endzone" x="110" y="0" width="10" height={H} />

      {YARD_LINES.map((x) => (
        <line key={x} className="yard-line" x1={x} x2={x} y1="0" y2={H} />
      ))}
      {NUMBERS.map((x) => {
        const label = x <= 60 ? x - 10 : 110 - x
        return (
          <g key={x} className="yard-number">
            <text x={x} y={H - 4}>{label}</text>
            <text x={x} y={6}>{label}</text>
          </g>
        )
      })}

      <line className="los" x1={play.los_x} x2={play.los_x} y1="0" y2={H} />

      {qb && target && (
        <line
          className="throw"
          x1={qb.x}
          y1={flip(qb.y)}
          x2={target.x}
          y2={flip(target.y)}
          markerEnd="url(#arrow)"
        />
      )}

      {players.map((p, i) => {
        const cx = p.x
        const cy = flip(p.y)
        const isGhost = p.nflId === play.ghost_id
        const isKey = p.nflId === play.target_id || isGhost
        return (
          <g key={p.nflId ?? `ball-${i}`}>
            {isGhost && <circle className="ghost-halo" cx={cx} cy={cy} r="2.6" filter="url(#ghost-glow)" />}
            <circle className={playerClass(p)} cx={cx} cy={cy} r={p.role === 'football' ? 0.55 : 1.05}>
              <title>{p.name}</title>
            </circle>
            {p.role === 'Pass Route' && p.xyards != null && (
              <text className={`xyds ${isKey ? (isGhost ? 'xyds-ghost' : 'xyds-target') : ''}`} x={cx + 1.8} y={cy + 0.6}>
                {p.xyards.toFixed(1)} xYds
              </text>
            )}
            {isKey && (
              <text className="pname" x={cx + 1.8} y={cy - 1.4}>
                {shortName(p.name)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
