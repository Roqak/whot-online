import type { Highlight } from '../engine/highlights'

export interface HighlightLine {
  icon: string
  title: string
  detail: string
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** Words for a highlight. `name` should say "You" for the viewer. */
export function describeHighlight(h: Highlight, name: (id: string) => string): HighlightLine {
  const who = name(h.playerId)
  const you = who === 'You'
  switch (h.kind) {
    case 'checkups':
      return { icon: '👑', title: 'Check-up king', detail: `${who} checked up ${h.value} times` }
    case 'pick':
      return { icon: '🌶️', title: 'Biggest pick', detail: `${who} made ${name(h.targetId) === 'You' ? 'you' : name(h.targetId)} pick ${h.value}` }
    case 'specials':
      return { icon: '🃏', title: 'Special-card fiend', detail: `${who} played ${h.value} specials` }
    case 'catches':
      return {
        icon: '👀',
        title: 'Sharp eyes',
        detail: h.value === 1 ? `${who} caught someone napping` : `${who} caught ${h.value} people napping`,
      }
    case 'fastest':
      return { icon: '⚡', title: 'Fastest check-up', detail: `${who} ${you ? 'were' : 'was'} out in ${clock(h.value)}` }
    case 'market':
      return { icon: '🛒', title: 'Market regular', detail: `${who} picked ${h.value} cards from market` }
  }
}
