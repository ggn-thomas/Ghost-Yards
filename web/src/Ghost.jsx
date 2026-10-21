// Silhouette de fantôme vectorielle, centrée sur (0, 0), environ 2 unités de large.
export const GHOST_PATH =
  'M -1 1.2 L -1 0 A 1 1 0 0 1 1 0 L 1 1.2 L 0.66 0.92 L 0.33 1.2 L 0 0.92 L -0.33 1.2 L -0.66 0.92 Z'

export function GhostShape({ className = '' }) {
  return (
    <g className={className}>
      <path className="ghost-body" d={GHOST_PATH} />
      <ellipse className="ghost-eye" cx="-0.35" cy="-0.05" rx="0.16" ry="0.24" />
      <ellipse className="ghost-eye" cx="0.35" cy="-0.05" rx="0.16" ry="0.24" />
    </g>
  )
}

export function GhostLogo({ size = 56 }) {
  return (
    <svg className="ghost-logo" width={size} height={size} viewBox="-1.4 -1.4 2.8 2.9" aria-hidden="true">
      <GhostShape />
    </svg>
  )
}
