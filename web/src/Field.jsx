// Terrain SVG vertical du play au moment du lancer : l'attaque monte vers le haut de l'écran.
// Coordonnées des données déjà normalisées (attaque vers +x) ; S() les projette à l'écran.
import { GhostShape } from './Ghost.jsx'

const W = 120
const H = 53.3
// Projection d'affichage : +x (vers l'en-but adverse) vers le haut, gauche de l'attaque (+y) à gauche.
const S = (x, y) => [H - y, W - x]

const STRIPES = Array.from({ length: 20 }, (_, i) => 10 + i * 5).filter((_, i) => i % 2 === 0)
const YARD_LINES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]
const NUMBERS = [20, 30, 40, 50, 60, 70, 80, 90, 100]
const VECTOR_SECONDS = 0.5 // longueur des flèches de mouvement = déplacement sur 0,5 s

function shortName(name) {
  if (!name) return ''
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

// Projection d'affichage : dir en degrés, 0° = +y, 90° = +x (convention NGS).
function vectorEnd(p) {
  const rad = (p.dir * Math.PI) / 180
  const len = p.s * VECTOR_SECONDS
  return [p.x + len * Math.sin(rad), p.y + len * Math.cos(rad)]
}

function kindOf(p, play) {
  if (p.role === 'football') return 'ball'
  if (p.nflId === play.target_id) return 'target'
  if (play.ghost_id != null && p.nflId === play.ghost_id) return 'ghost'
  if (p.role === 'Pass Route') return 'receiver'
  if (p.role === 'Coverage' || p.role === 'Pass Rush') return 'defense'
  return 'offense'
}

export default function Field({ play, selectedId }) {
  const qb = play.frame.find((p) => p.role === 'Pass')
  const target = play.frame.find((p) => p.nflId === play.target_id)

  // Ordre de dessin : défense et ligne d'abord, receveurs ensuite, ballon au-dessus.
  const order = { 'Pass Block': 0, 'Pass Rush': 0, Coverage: 1, Pass: 2, 'Pass Route': 3, football: 4 }
  const players = [...play.frame].sort((a, b) => (order[a.role] ?? 0) - (order[b.role] ?? 0))

  // Recadrage d'affichage autour de l'action (tous les joueurs restent visibles).
  const xs = play.frame.map((p) => p.x)
  const lo = Math.max(0, Math.min(play.los_x - 8, ...xs) - 3)
  const hi = Math.min(W, Math.max(play.los_x + 25, ...xs) + 5)
  const [qx, qy] = qb ? S(qb.x, qb.y) : [0, 0]
  const [tx, ty] = target ? S(target.x, target.y) : [0, 0]
  const [, losY] = S(play.los_x, 0)

  return (
    <svg
      className="field"
      viewBox={`0 ${W - hi} ${H} ${hi - lo}`}
      role="img"
      aria-label="Positions des joueurs au moment du lancer, l'attaque monte vers le haut"
    >
      <defs>
        <filter id="ghost-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
        </marker>
        <marker id="vec" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,1 L9,5 L0,9 z" fill="context-stroke" />
        </marker>
      </defs>

      <rect className="turf" x="0" y="0" width={H} height={W} />
      {STRIPES.map((x) => (
        <rect key={x} className="stripe" x="0" y={W - x - 5} width={H} height="5" />
      ))}
      <rect className="endzone" x="0" y="0" width={H} height="10" />
      <rect className="endzone" x="0" y={W - 10} width={H} height="10" />
      <text className="endzone-label" x={H / 2} y="5">YARDS</text>
      <text className="endzone-label" x={H / 2} y={W - 5}>GHOST</text>

      {YARD_LINES.map((x) => (
        <line key={x} className="yard-line" x1="0" x2={H} y1={W - x} y2={W - x} />
      ))}
      {NUMBERS.map((x) => {
        const label = x <= 60 ? x - 10 : 110 - x
        return (
          <g key={x} className="yard-number">
            <text x="4" y={W - x} dominantBaseline="central">{label}</text>
            <text x={H - 4} y={W - x} dominantBaseline="central">{label}</text>
          </g>
        )
      })}

      <line className="los" x1="0" x2={H} y1={losY} y2={losY} />

      {/* Traînée optionnelle (positions avant le lancer) */}
      {play.frame
        .filter((p) => Array.isArray(p.trail) && p.trail.length > 1)
        .map((p) => (
          <polyline
            key={`trail-${p.nflId}`}
            className={`trail trail-${kindOf(p, play)}`}
            points={[...p.trail, [p.x, p.y]].map(([x, y]) => S(x, y).join(',')).join(' ')}
          />
        ))}

      {/* Vecteurs de mouvement optionnels */}
      {play.frame
        .filter((p) => p.role !== 'football' && p.s != null && p.dir != null && p.s > 0.5)
        .map((p) => {
          const [x1, y1] = S(p.x, p.y)
          const [x2, y2] = S(...vectorEnd(p))
          return (
            <line
              key={`vec-${p.nflId}`}
              className={`vector vector-${kindOf(p, play)}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              markerEnd="url(#vec)"
            />
          )
        })}

      {qb && target && <line className="throw" x1={qx} y1={qy} x2={tx} y2={ty} markerEnd="url(#arrow)" />}

      {players.map((p, i) => {
        const [cx, cy] = S(p.x, p.y)
        const kind = kindOf(p, play)
        const isKey = kind === 'target' || kind === 'ghost'
        const isSelected = selectedId != null && p.nflId === selectedId
        // Étiquette à gauche du joueur s'il est près du bord droit.
        const flipLabel = cx > H - 16
        const lx = flipLabel ? cx - 2.4 : cx + 2.4
        const anchor = flipLabel ? 'end' : 'start'
        return (
          <g key={p.nflId ?? `ball-${i}`}>
            {isSelected && <circle className="selected-ring" cx={cx} cy={cy} r={kind === 'ghost' ? 3 : 2} />}
            {kind === 'ghost' ? (
              <g transform={`translate(${cx} ${cy})`}>
                <circle className="ghost-halo" r="3.2" filter="url(#ghost-glow)" />
                <g transform="scale(1.6)">
                  <GhostShape className="ghost-float" />
                </g>
                <title>{p.name}</title>
              </g>
            ) : (
              <circle className={`dot ${kind}`} cx={cx} cy={cy} r={kind === 'ball' ? 0.55 : 1.05}>
                <title>{p.name}</title>
              </circle>
            )}
            {p.role === 'Pass Route' && p.xyards != null && (isKey || isSelected) && (
              <text className={`xyds ${isKey ? `xyds-${kind}` : ''}`} x={lx} y={cy + 0.6} textAnchor={anchor}>
                {p.xyards.toFixed(1)} yds attendus
              </text>
            )}
            {(isKey || isSelected) && (
              <text className={`pname ${isSelected ? 'pname-selected' : ''}`} x={lx} y={cy - 1.5} textAnchor={anchor}>
                {shortName(p.name)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
