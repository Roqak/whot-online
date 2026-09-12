import type { Shape } from '../../types/game'
import { SHAPE_PATHS } from './shapePaths'

/** Every shape is drawn inside a 0 0 100 100 box so it can be placed at any scale. */
export function ShapeGlyph({ shape, fill = 'currentColor' }: { shape: Shape; fill?: string }) {
  if (shape === 'whot') {
    return (
      <g fill={fill}>
        <circle cx="50" cy="50" r="46" opacity="0.12" />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily='"Bricolage Grotesque", Inter, sans-serif'
          fontSize="30"
          fontWeight="800"
          letterSpacing="1"
        >
          WHOT
        </text>
      </g>
    )
  }
  return <path d={SHAPE_PATHS[shape]} fill={fill} />
}

/** Small inline shape for chips, labels and buttons. */
export function ShapeIcon({ shape, size = 16, className }: { shape: Shape; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <ShapeGlyph shape={shape} />
    </svg>
  )
}
