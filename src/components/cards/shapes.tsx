import type { Shape } from '../../types/game'

/** Every shape is drawn inside a 0 0 100 100 box so it can be placed at any scale. */
export function ShapeGlyph({ shape, fill = 'currentColor' }: { shape: Shape; fill?: string }) {
  switch (shape) {
    case 'circle':
      return <circle cx="50" cy="50" r="42" fill={fill} />
    case 'triangle':
      return <path d="M50 6 96 92H4Z" fill={fill} />
    case 'cross':
      return <path d="M36 4h28v32h32v28H64v32H36V64H4V36h32Z" fill={fill} />
    case 'square':
      return <rect x="8" y="8" width="84" height="84" rx="4" fill={fill} />
    case 'star':
      return <path d="M50 2 63 37l37 1-29 23 10 36-31-21-31 21 10-36L0 38l37-1Z" fill={fill} transform="translate(0 4)" />
    case 'whot':
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
}

/** Small inline shape for chips, labels and buttons. */
export function ShapeIcon({ shape, size = 16, className }: { shape: Shape; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <ShapeGlyph shape={shape} />
    </svg>
  )
}
