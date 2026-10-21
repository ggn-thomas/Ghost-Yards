// Terrain SVG du play au moment du lancer. Coordonnées déjà normalisées (attaque vers +x).
import { GhostShape } from './Ghost.jsx'

const W = 120
const H = 53.3
const flip = (y) => H - y // SVG : y vers le bas -> on garde l'orientation habituelle

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

  return (
    <svg className="field" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Positions des joueurs au moment du lancer">
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

      <rect className="turf" x="0" y="0" width={W} height={H} />
      {STRIPES.map((x) => (
        <rect key={x} className="stripe" x={x} y="0" width="5" height={H} />
      ))}
      <rect className="endzone" x="0" y="0" width="10" height={H} />
      <rect className="endzone" x="110" y="0" width="10" height={H} />
      <text className="endzone-label" transform={`translate(5 ${H / 2}) rotate(-90)`}>GHOST</text>
      <text className="endzone-label" transform={`translate(115 ${H / 2}) rotate(90)`}>YARDS</text>

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

      {/* Traînée optionnelle (positions avant le lancer) */}
      {play.frame
        .filter((p) => Array.isArray(p.trail) && p.trail.length > 1)
        .map((p) => (
          <polyline
            key={`trail-${p.nflId}`}
            className={`trail trail-${kindOf(p, play)}`}
            points={[...p.trail, [p.x, p.y]].map(([x, y]) => `${x},${flip(y)}`).join(' ')}
          />
        ))}

      {/* Vecteurs de mouvement optionnels */}
      {play.frame
        .filter((p) => p.role !== 'football' && p.s != null && p.dir != null && p.s > 0.5)
        .map((p) => {
          const [ex, ey] = vectorEnd(p)
          return (
            <line
              key={`vec-${p.nflId}`}
              className={`vector vector-${kindOf(p, play)}`}
              x1={p.x}
              y1={flip(p.y)}
              x2={ex}
              y2={flip(ey)}
              markerEnd="url(#vec)"
            />
          )
        })}

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
        const kind = kindOf(p, play)
        const isKey = kind === 'target' || kind === 'ghost'
        const isSelected = selectedId != null && p.nflId === selectedId
        // Étiquettes : à gauche près de l'en-but droit, décalées après la mascotte, jamais coupées en haut ou en bas.
        const gap = kind === 'ghost' ? 3.4 : 2.4
        const toLeft = cx > W - 18
        const lx = toLeft ? cx - gap : cx + gap
        const anchor = toLeft ? 'end' : 'start'
        let nameY = cy - 1.5
        let ydsY = cy + 0.6
        if (nameY < 1.6) [nameY, ydsY] = [1.6, 3.7]
        if (ydsY > H - 0.6) [nameY, ydsY] = [H - 2.7, H - 0.6]
        return (
          <g key={p.nflId ?? `ball-${i}`}>
            {isSelected && <circle className="selected-ring" cx={cx} cy={cy} r={kind === 'ghost' ? 3 : 2} />}
            {kind === 'ghost' ? (
              <g transform={`translate(${cx} ${cy})`}>
                <circle className="ghost-halo" r="3.2" filter="url(#ghost-glow)" />
                <g transform="scale(2.4)">
                  <GhostShape className="ghost-float" />
                </g>
                <title>{p.name}</title>
              </g>
            ) : kind === 'ball' ? (
              <image className="ball-icon" href="/football.png" x={cx - 1.4} y={cy - 1.4} width="2.8" height="2.8">
                <title>Ballon</title>
              </image>
            ) : (
              <circle className={`dot ${kind}`} cx={cx} cy={cy} r="1.05">
                <title>{p.name}</title>
              </circle>
            )}
            {p.role === 'Pass Route' && p.xyards != null && (isKey || isSelected) && (
              <text className={`xyds ${isKey ? `xyds-${kind}` : ''}`} x={lx} y={ydsY} textAnchor={anchor}>
                {p.xyards.toFixed(1)} yds attendus
              </text>
            )}
            {(isKey || isSelected) && (
              <text className={`pname ${isSelected ? 'pname-selected' : ''}`} x={lx} y={nameY} textAnchor={anchor}>
                {shortName(p.name)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
