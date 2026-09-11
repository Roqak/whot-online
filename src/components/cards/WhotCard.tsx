import { memo } from 'react'
import { Card, WHOT } from '../../types/game'
import { ShapeGlyph } from './shapes'

const INK = 'oklch(var(--ink))'
const INK_SOFT = 'oklch(var(--ink-soft))'
const PAPER = 'oklch(var(--paper))'

const CAPTIONS: Record<number, string> = {
  1: 'HOLD ON',
  2: 'PICK TWO',
  5: 'PICK THREE',
  8: 'SUSPENSION',
  14: 'GEN. MARKET',
}

const DISPLAY_FONT = '"Bricolage Grotesque", Inter, sans-serif'

function CornerIndex({ card, flipped = false }: { card: Card; flipped?: boolean }) {
  const label = card.shape === 'whot' ? '20' : String(card.number)
  return (
    <g transform={flipped ? 'translate(250 350) rotate(180)' : undefined}>
      <text
        x="24"
        y="30"
        fill={INK}
        fontFamily={DISPLAY_FONT}
        fontSize="40"
        fontWeight="800"
        letterSpacing="-1"
        dominantBaseline="hanging"
      >
        {label}
      </text>
      <g transform={`translate(26 ${label.length > 1 ? 78 : 76}) scale(0.24)`}>
        <ShapeGlyph shape={card.shape} fill={INK} />
      </g>
    </g>
  )
}

export interface WhotCardProps {
  card?: Card
  faceDown?: boolean
  /** Dims the face for cards that cannot be played right now. */
  muted?: boolean
  className?: string
}

/**
 * A Whot card drawn as SVG: cream stock, oxblood ink, index in both corners.
 * Sizing comes from the parent; the card keeps a 5:7 ratio.
 */
export const WhotCard = memo(function WhotCard({ card, faceDown, muted, className }: WhotCardProps) {
  const showBack = faceDown || !card
  return (
    <svg
      viewBox="0 0 250 350"
      className={className}
      style={{ aspectRatio: '5 / 7', display: 'block', width: '100%', height: 'auto' }}
      aria-hidden="true"
    >
      {showBack ? <CardBack /> : <CardFace card={card} muted={muted} />}
    </svg>
  )
})

function CardFace({ card, muted }: { card: Card; muted?: boolean }) {
  const caption = card.shape === 'whot' ? null : CAPTIONS[card.number]
  return (
    <g style={muted ? { filter: 'saturate(0.45) brightness(0.82)', opacity: 0.92 } : undefined}>
      <rect x="1" y="1" width="248" height="348" rx="22" fill={PAPER} />
      <rect x="1" y="1" width="248" height="348" rx="22" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="2" />
      <rect x="12" y="12" width="226" height="326" rx="14" fill="none" stroke={INK} strokeOpacity="0.18" strokeWidth="1.5" />

      <CornerIndex card={card} />
      <CornerIndex card={card} flipped />

      {card.shape === 'whot' ? (
        <g transform="translate(125 175)">
          <circle r="74" fill="none" stroke={INK} strokeOpacity="0.3" strokeWidth="2" />
          <text
            textAnchor="middle"
            y="-6"
            fill={INK}
            fontFamily={DISPLAY_FONT}
            fontSize="42"
            fontWeight="800"
            letterSpacing="1"
          >
            WHOT
          </text>
          <text textAnchor="middle" y="34" fill={INK_SOFT} fontFamily={DISPLAY_FONT} fontSize="30" fontWeight="600">
            {WHOT}
          </text>
        </g>
      ) : (
        <g transform="translate(65 115) scale(1.2)">
          <ShapeGlyph shape={card.shape} fill={INK} />
          {card.shape === 'star' && (
            <text
              x="50"
              y="56"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={PAPER}
              fontFamily={DISPLAY_FONT}
              fontSize="34"
              fontWeight="800"
            >
              {card.number}
            </text>
          )}
        </g>
      )}

      {caption && (
        <text
          x="125"
          y="282"
          textAnchor="middle"
          fill={INK_SOFT}
          fontFamily="Inter, sans-serif"
          fontSize="13"
          fontWeight="600"
          letterSpacing="1"
        >
          {caption}
        </text>
      )}
    </g>
  )
}

function CardBack() {
  return (
    <g>
      <rect x="1" y="1" width="248" height="348" rx="22" fill="oklch(0.3 0.11 22)" />
      <rect x="1" y="1" width="248" height="348" rx="22" fill="none" stroke={PAPER} strokeOpacity="0.35" strokeWidth="2" />
      <rect x="14" y="14" width="222" height="322" rx="14" fill="none" stroke={PAPER} strokeOpacity="0.22" strokeWidth="1.5" />
      <g fill={PAPER} opacity="0.16">
        {Array.from({ length: 7 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => (
            <circle key={`${row}-${col}`} cx={38 + col * 43} cy={42 + row * 44} r={row % 2 === col % 2 ? 6 : 3} />
          )),
        )}
      </g>
      <g transform="translate(125 175)">
        <ellipse rx="62" ry="40" fill="oklch(0.24 0.09 22)" stroke={PAPER} strokeOpacity="0.4" strokeWidth="2" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill={PAPER}
          fontFamily={DISPLAY_FONT}
          fontSize="26"
          fontWeight="800"
          letterSpacing="2"
        >
          WHOT
        </text>
      </g>
    </g>
  )
}
