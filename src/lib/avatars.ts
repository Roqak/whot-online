export interface Avatar {
  id: string
  emoji: string
  /** OKLCH hue for the avatar's backdrop. */
  hue: number
}

export const AVATARS: Avatar[] = [
  { id: 'lion', emoji: '🦁', hue: 70 },
  { id: 'elephant', emoji: '🐘', hue: 250 },
  { id: 'fox', emoji: '🦊', hue: 45 },
  { id: 'turtle', emoji: '🐢', hue: 150 },
  { id: 'eagle', emoji: '🦅', hue: 30 },
  { id: 'leopard', emoji: '🐆', hue: 85 },
  { id: 'owl', emoji: '🦉', hue: 300 },
  { id: 'crocodile', emoji: '🐊', hue: 130 },
  { id: 'zebra', emoji: '🦓', hue: 200 },
  { id: 'monkey', emoji: '🐒', hue: 55 },
  { id: 'parrot', emoji: '🦜', hue: 170 },
  { id: 'bee', emoji: '🐝', hue: 95 },
]

export const BOT_AVATAR = 'robot'
const ROBOT: Avatar = { id: BOT_AVATAR, emoji: '🤖', hue: 230 }

export function getAvatar(id: string): Avatar {
  if (id === BOT_AVATAR) return ROBOT
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0]
}

export function isValidAvatar(id: unknown): id is string {
  return typeof id === 'string' && AVATARS.some((a) => a.id === id)
}
