interface TurnRingProps {
  size: number
  /** 1 = full time left, 0 = out of time. */
  fraction: number
  active: boolean
  urgent?: boolean
}

/** Ring around the avatar of whoever is on turn, doubling as the countdown. */
export function TurnRing({ size, fraction, active, urgent }: TurnRingProps) {
  const stroke = 3
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="oklch(var(--fg) / 0.12)"
        strokeWidth={stroke}
      />
      {active && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? 'oklch(var(--ember))' : 'oklch(var(--marigold))'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (fraction || 1))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
      )}
    </svg>
  )
}
