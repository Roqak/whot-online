import { getAvatar } from '../lib/avatars'

interface AvatarProps {
  id: string
  size?: number
  className?: string
  dimmed?: boolean
}

export function Avatar({ id, size = 40, className = '', dimmed }: AvatarProps) {
  const avatar = getAvatar(id)
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        lineHeight: 1,
        background: `oklch(0.34 0.07 ${avatar.hue})`,
        border: `1px solid oklch(0.6 0.1 ${avatar.hue} / 0.55)`,
        filter: dimmed ? 'grayscale(1) brightness(0.8)' : undefined,
      }}
      aria-hidden="true"
    >
      {avatar.emoji}
    </span>
  )
}
