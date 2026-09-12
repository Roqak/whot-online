export type Suit = 'circle' | 'triangle' | 'cross' | 'square' | 'star'
export type Shape = Suit | 'whot'
export type BotLevel = 'easy' | 'normal' | 'hard'

export interface Card {
  id: string
  shape: Shape
  number: number
}

export const SUITS: Suit[] = ['circle', 'triangle', 'cross', 'square', 'star']

export const SHAPE_NAMES: Record<Shape, string> = {
  circle: 'Circle',
  triangle: 'Triangle',
  cross: 'Cross',
  square: 'Square',
  star: 'Star',
  whot: 'Whot',
}

export const HOLD_ON = 1
export const PICK_TWO = 2
export const PICK_THREE = 5
export const SUSPENSION = 8
export const GENERAL_MARKET = 14
export const WHOT = 20

export const SPECIAL_NAMES: Record<number, string> = {
  [HOLD_ON]: 'Hold On',
  [PICK_TWO]: 'Pick Two',
  [PICK_THREE]: 'Pick Three',
  [SUSPENSION]: 'Suspension',
  [GENERAL_MARKET]: 'General Market',
  [WHOT]: 'Whot',
}

export const SPECIAL_NUMBERS = [HOLD_ON, PICK_TWO, PICK_THREE, SUSPENSION, GENERAL_MARKET, WHOT]

export function isSpecial(card: Card): boolean {
  return SPECIAL_NUMBERS.includes(card.number)
}

export function cardLabel(card: Card): string {
  if (card.shape === 'whot') return 'Whot 20'
  const special = SPECIAL_NAMES[card.number]
  return special ? `${card.number} ${SHAPE_NAMES[card.shape]} (${special})` : `${card.number} ${SHAPE_NAMES[card.shape]}`
}

/** Penalty points a card is worth when left in hand at the end of a round. Stars count double. */
export function cardPoints(card: Card): number {
  if (card.shape === 'whot') return WHOT
  if (card.shape === 'star') return card.number * 2
  return card.number
}

export function handPoints(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + cardPoints(card), 0)
}

/** How a Pick Two or Pick Three can be answered. Tables disagree, so it is a setting. */
export type PickDefence =
  /** Defend with the same number and the total grows: 3, then 6, then 9. */
  | 'stack'
  /** Defend with the same number and the same penalty moves on: 3 stays 3. */
  | 'pass'
  /** No defending. Whoever is hit goes to market. */
  | 'none'

export const PICK_DEFENCES: PickDefence[] = ['stack', 'pass', 'none']

export const PICK_DEFENCE_LABELS: Record<PickDefence, string> = {
  stack: 'Stack up',
  pass: 'Pass on',
  none: 'No defence',
}

export interface GameSettings {
  /** Cards dealt to each player per round. */
  handSize: number
  /** Penalty points at which a player is eliminated. 0 plays a single round. */
  targetScore: number
  /** What a player may do about a Pick Two or Pick Three aimed at them. */
  pickDefence: PickDefence
  /** Seconds a player has to act before auto-drawing. 0 disables the timer. */
  turnSeconds: number
}

export const DEFAULT_SETTINGS: GameSettings = {
  handSize: 5,
  targetScore: 100,
  pickDefence: 'stack',
  turnSeconds: 30,
}

export const SETTING_LIMITS = {
  handSize: { min: 3, max: 8 },
  targetScores: [0, 50, 100, 150, 200],
  turnSeconds: [0, 15, 30, 45, 60],
  pickDefences: PICK_DEFENCES,
}

export function sanitizeSettings(input: Partial<GameSettings>, base: GameSettings = DEFAULT_SETTINGS): GameSettings {
  const next = { ...base }
  if (typeof input.handSize === 'number' && Number.isInteger(input.handSize)) {
    next.handSize = Math.min(SETTING_LIMITS.handSize.max, Math.max(SETTING_LIMITS.handSize.min, input.handSize))
  }
  if (typeof input.targetScore === 'number' && SETTING_LIMITS.targetScores.includes(input.targetScore)) {
    next.targetScore = input.targetScore
  }
  if (typeof input.pickDefence === 'string' && PICK_DEFENCES.includes(input.pickDefence)) {
    next.pickDefence = input.pickDefence
  }
  if (typeof input.turnSeconds === 'number' && SETTING_LIMITS.turnSeconds.includes(input.turnSeconds)) {
    next.turnSeconds = input.turnSeconds
  }
  return next
}

export type GamePhase = 'playing' | 'roundOver' | 'matchOver'

export interface GamePlayer {
  id: string
  name: string
  avatar: string
  isBot: boolean
  botLevel?: BotLevel
  hand: Card[]
  /** Accumulated penalty points across rounds. */
  score: number
  eliminated: boolean
  /** Left the room mid-match. Implies eliminated. */
  left: boolean
  announcedLastCard: boolean
}

export interface PendingPick {
  /** Cards the current player must draw unless they defend. */
  amount: number
  /** The card number that can defend (2 or 5). */
  number: typeof PICK_TWO | typeof PICK_THREE
}

export interface RoundResult {
  round: number
  winnerId: string
  reason: 'checkup' | 'tender'
  hands: { playerId: string; cards: Card[]; points: number }[]
  eliminatedIds: string[]
}

export interface GameState {
  phase: GamePhase
  players: GamePlayer[]
  market: Card[]
  pile: Card[]
  turnIndex: number
  /** Increments whenever the turn passes or a player plays again. */
  turnId: number
  starterIndex: number
  requestedShape: Suit | null
  pendingPick: PendingPick | null
  round: number
  settings: GameSettings
  lastRound: RoundResult | null
  matchWinnerId: string | null
}

export type GameAction =
  | { type: 'play'; cardId: string; requestedShape?: Suit }
  | { type: 'draw' }
  | { type: 'lastCard' }
  | { type: 'catch'; targetId: string }

export type DrawReason = 'market' | 'pick' | 'generalMarket' | 'penalty' | 'timeout' | 'finalPick'

export type GameEvent =
  | { type: 'played'; playerId: string; card: Card }
  | { type: 'drew'; playerId: string; count: number; reason: DrawReason }
  | { type: 'holdOn'; playerId: string }
  | { type: 'suspended'; playerId: string; targetId: string }
  | { type: 'pick'; playerId: string; targetId: string; amount: number }
  | { type: 'generalMarket'; playerId: string }
  | { type: 'shapeRequested'; playerId: string; shape: Suit }
  | { type: 'lastCard'; playerId: string }
  | { type: 'caught'; byId: string; targetId: string }
  | { type: 'reshuffled' }
  | { type: 'playerLeft'; playerId: string }
  | { type: 'roundOver'; result: RoundResult }
  | { type: 'matchOver'; winnerId: string }
  | { type: 'roundStarted'; round: number }

export interface PublicPlayer {
  id: string
  name: string
  avatar: string
  isBot: boolean
  botLevel?: BotLevel
  handCount: number
  score: number
  eliminated: boolean
  left: boolean
  announcedLastCard: boolean
  connected: boolean
}

/** What one player is allowed to see of the game. */
export interface GameView {
  myId: string
  phase: GamePhase
  players: PublicPlayer[]
  myHand: Card[]
  /** Most recent cards on the pile, oldest first. */
  pile: Card[]
  pileCount: number
  marketCount: number
  turnPlayerId: string
  turnId: number
  requestedShape: Suit | null
  pendingPick: PendingPick | null
  round: number
  settings: GameSettings
  lastRound: RoundResult | null
  matchWinnerId: string | null
  /** Epoch ms when the current turn times out, or the next round auto-starts. */
  deadline: number | null
}

export interface PlayContext {
  topCard: Card | null
  requestedShape: Suit | null
  pendingPick: PendingPick | null
  pickDefence: PickDefence
}

export function canPlayCard(card: Card, ctx: PlayContext): boolean {
  if (ctx.pendingPick) {
    return ctx.pickDefence !== 'none' && card.shape !== 'whot' && card.number === ctx.pendingPick.number
  }
  if (card.shape === 'whot') return true
  if (ctx.requestedShape) return card.shape === ctx.requestedShape
  if (!ctx.topCard || ctx.topCard.shape === 'whot') return true
  return card.shape === ctx.topCard.shape || card.number === ctx.topCard.number
}
