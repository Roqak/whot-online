import type { Card } from '../../types/game'
import { SHAPE_PATHS } from './shapePaths'

/**
 * Standalone SVG markup for a card, used as a texture in the 3D watch view.
 * It cannot rely on CSS variables or web fonts, so colours and fonts are literal.
 */
const PAPER = '#f5eee1'
const INK = '#8b2a23'
const INK_SOFT = '#a8574c'
const BACK = '#4d1614'
const BACK_DEEP = '#3a1011'
const FONT = 'Helvetica, Arial, sans-serif'

const CAPTIONS: Record<number, string> = {
  1: 'HOLD ON',
  2: 'PICK TWO',
  5: 'PICK THREE',
  8: 'SUSPENSION',
  14: 'GEN. MARKET',
}

function corner(card: Card, flipped: boolean): string {
  const label = card.shape === 'whot' ? '20' : String(card.number)
  const glyph =
    card.shape === 'whot'
      ? `<text x="26" y="88" font-family="${FONT}" font-size="15" font-weight="bold" fill="${INK}">W</text>`
      : `<g transform="translate(26 76) scale(0.24)"><path d="${SHAPE_PATHS[card.shape]}" fill="${INK}"/></g>`
  return `<g${flipped ? ' transform="translate(250 350) rotate(180)"' : ''}>
      <text x="24" y="30" font-family="${FONT}" font-size="40" font-weight="bold" fill="${INK}" dominant-baseline="hanging">${label}</text>
      ${glyph}
    </g>`
}

function centre(card: Card): string {
  if (card.shape === 'whot') {
    return `<g transform="translate(125 175)">
      <circle r="74" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="2"/>
      <text text-anchor="middle" y="8" font-family="${FONT}" font-size="40" font-weight="bold" fill="${INK}">WHOT</text>
      <text text-anchor="middle" y="44" font-family="${FONT}" font-size="26" fill="${INK_SOFT}">20</text>
    </g>`
  }
  const number =
    card.shape === 'star'
      ? `<text x="50" y="58" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="34" font-weight="bold" fill="${PAPER}">${card.number}</text>`
      : ''
  return `<g transform="translate(65 115) scale(1.2)"><path d="${SHAPE_PATHS[card.shape]}" fill="${INK}"/>${number}</g>`
}

export function cardFaceSvg(card: Card): string {
  const caption = card.shape === 'whot' ? '' : CAPTIONS[card.number]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 250 350">
    <rect x="1" y="1" width="248" height="348" rx="22" fill="${PAPER}"/>
    <rect x="1" y="1" width="248" height="348" rx="22" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="2"/>
    <rect x="12" y="12" width="226" height="326" rx="14" fill="none" stroke="${INK}" stroke-opacity="0.18" stroke-width="1.5"/>
    ${corner(card, false)}
    ${corner(card, true)}
    ${centre(card)}
    ${
      caption
        ? `<text x="125" y="282" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" letter-spacing="1" fill="${INK_SOFT}">${caption}</text>`
        : ''
    }
  </svg>`
}

export function cardBackSvg(): string {
  const dots: string[] = []
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      dots.push(`<circle cx="${38 + col * 43}" cy="${42 + row * 44}" r="${row % 2 === col % 2 ? 6 : 3}"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 250 350">
    <rect x="1" y="1" width="248" height="348" rx="22" fill="${BACK}"/>
    <rect x="1" y="1" width="248" height="348" rx="22" fill="none" stroke="${PAPER}" stroke-opacity="0.35" stroke-width="2"/>
    <rect x="14" y="14" width="222" height="322" rx="14" fill="none" stroke="${PAPER}" stroke-opacity="0.22" stroke-width="1.5"/>
    <g fill="${PAPER}" opacity="0.16">${dots.join('')}</g>
    <g transform="translate(125 175)">
      <ellipse rx="62" ry="40" fill="${BACK_DEEP}" stroke="${PAPER}" stroke-opacity="0.4" stroke-width="2"/>
      <text text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="24" font-weight="bold" letter-spacing="2" fill="${PAPER}">WHOT</text>
    </g>
  </svg>`
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
