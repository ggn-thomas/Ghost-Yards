// Silhouette de fantôme vectorielle, centrée sur (0, 0), environ 2 unités de large.
export const GHOST_PATH =
  'M -1 1.2 L -1 0 A 1 1 0 0 1 1 0 L 1 1.2 L 0.66 0.92 L 0.33 1.2 L 0 0.92 L -0.33 1.2 L -0.66 0.92 Z'

// Mascotte : fantôme casqué avec le ballon (image 260 × 280), centrée sur (0, 0).
export function GhostShape({ className = '' }) {
  return (
    <g className={className}>
      <image href="/ghost.png" x="-1.3" y="-1.4" width="2.6" height="2.8" />
    </g>
  )
}

export function GhostLogo({ size = 56 }) {
  return (
    <svg className="ghost-logo" width={size} height={size} viewBox="-1.4 -1.45 2.8 2.9" aria-hidden="true">
      <GhostShape />
    </svg>
  )
}
