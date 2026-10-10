import { describe, expect, it } from 'vitest'
import { Card, PlayContext, playBlockedReason } from './game'

const card = (shape: Card['shape'], number: number): Card => ({ id: `${shape}-${number}`, shape, number })

const ctx = (patch: Partial<PlayContext> = {}): PlayContext => ({
  topCard: card('circle', 7),
  requestedShape: null,
  pendingPick: null,
  pickDefence: 'stack',
  ...patch,
})

describe('playBlockedReason', () => {
  it('is null for a card that can be played', () => {
    expect(playBlockedReason(card('circle', 3), ctx())).toBeNull()
    expect(playBlockedReason(card('star', 7), ctx())).toBeNull()
    expect(playBlockedReason(card('whot', 20), ctx())).toBeNull()
  })

  it('names the shape and number that would match', () => {
    expect(playBlockedReason(card('star', 3), ctx())).toBe('Needs a Circle or a 7, or Whot')
  })

  it('names the requested shape', () => {
    expect(playBlockedReason(card('circle', 7), ctx({ requestedShape: 'square' }))).toBe(
      'Square was asked for. Play a Square or Whot',
    )
  })

  it('explains how to block a pick', () => {
    const pendingPick = { amount: 2, number: 2 } as PlayContext['pendingPick']
    expect(playBlockedReason(card('circle', 7), ctx({ pendingPick }))).toBe(
      'Only a 2 can block Pick 2, or tap the market',
    )
    expect(playBlockedReason(card('circle', 2), ctx({ pendingPick, pickDefence: 'none' }))).toBe(
      'You have to pick 2. Tap the market',
    )
  })
})
