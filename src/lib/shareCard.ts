import type { Card } from '../types/game'
import { cardFaceSvg } from '../components/cards/cardSvg'
import { getAvatar } from './avatars'

/**
 * The match result as a picture people can post: every finished game is an
 * invite. Drawn on a canvas in the browser (no server), 1080x1350 so it fits
 * WhatsApp, Instagram and X without cropping.
 */

export interface ResultCardData {
  /** Headline, e.g. "I checked up" or "Tunde wins". */
  headline: string
  winner: { name: string; avatar: string }
  /** Up to two highlight lines: icon, title, detail. */
  highlights: { icon: string; title: string; detail: string }[]
  /** "3 players · 4 rounds" */
  meta: string
  /** Where the "play me" call to action points, shown without the scheme. */
  url: string
}

const W = 1080
const H = 1350

// Literal colours: a canvas can't read the CSS variables. These match index.css.
const TABLE_950 = '#0d1022'
const TABLE_800 = '#26305a'
const TABLE_700 = '#323d6e'
const FG = '#f5f3fb'
const FG_MUTED = '#bdbfd2'
const MARIGOLD = '#f2b93b'

const FAN: Card[] = [
  { id: 'share-circle', shape: 'circle', number: 14 },
  { id: 'share-whot', shape: 'whot', number: 20 },
  { id: 'share-star', shape: 'star', number: 5 },
]

export async function renderResultCard(data: ResultCardData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Fonts come from Google Fonts; draw in them if they've arrived, system fonts if not.
  await Promise.race([
    Promise.all([
      document.fonts.load('800 120px "Bricolage Grotesque"'),
      document.fonts.load('600 40px Inter'),
      document.fonts.load('700 40px Inter'),
    ]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]).catch(() => {})
  const display = (size: number, weight = 800) => `${weight} ${size}px "Bricolage Grotesque", Inter, system-ui, sans-serif`
  const body = (size: number, weight = 600) => `${weight} ${size}px Inter, system-ui, sans-serif`

  // Indigo felt, lit from above the table.
  const felt = ctx.createRadialGradient(W / 2, H * 0.36, 60, W / 2, H * 0.4, H * 0.85)
  felt.addColorStop(0, TABLE_800)
  felt.addColorStop(1, TABLE_950)
  ctx.fillStyle = felt
  ctx.fillRect(0, 0, W, H)
  dots(ctx)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = FG
  ctx.font = display(64)
  ctx.fillText('Last Card', W / 2, 120)

  // The oval table with a hand dealt onto it, same as the home page.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(W / 2, 470, 400, 120, 0, 0, Math.PI * 2)
  ctx.fillStyle = TABLE_700
  ctx.globalAlpha = 0.65
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(245, 243, 251, 0.12)'
  ctx.stroke()
  ctx.restore()
  const images = await Promise.all(FAN.map((card) => svgImage(cardFaceSvg(card))))
  const cardW = 210
  const cardH = cardW * 1.4
  const placements = [
    { x: -150, y: 18, rotate: -15 },
    { x: 0, y: 0, rotate: 0 },
    { x: 150, y: 18, rotate: 15 },
  ]
  for (const i of [0, 2, 1]) {
    const p = placements[i]
    ctx.save()
    ctx.translate(W / 2 + p.x, 530 + p.y)
    ctx.rotate((p.rotate * Math.PI) / 180)
    ctx.shadowColor = 'rgba(5, 6, 20, 0.55)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 12
    ctx.drawImage(images[i], -cardW / 2, -cardH, cardW, cardH)
    ctx.restore()
  }

  // Winner: avatar badge and the headline.
  const avatar = getAvatar(data.winner.avatar)
  ctx.beginPath()
  ctx.arc(W / 2, 690, 62, 0, Math.PI * 2)
  ctx.fillStyle = `oklch(0.42 0.09 ${avatar.hue})`
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = MARIGOLD
  ctx.stroke()
  ctx.font = '64px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(avatar.emoji, W / 2, 694)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = FG
  ctx.font = display(fitSize(ctx, data.headline, 96, W - 140, display))
  ctx.fillText(data.headline, W / 2, 850)
  ctx.fillStyle = FG_MUTED
  ctx.font = body(34, 500)
  ctx.fillText(data.meta, W / 2, 905)

  // Highlights as two calm rows.
  let y = 955
  for (const h of data.highlights.slice(0, 2)) {
    roundRect(ctx, 90, y, W - 180, 98, 26)
    ctx.fillStyle = 'rgba(38, 48, 90, 0.75)'
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.fillStyle = MARIGOLD
    ctx.font = body(26, 700)
    ctx.fillText(`${h.icon}  ${h.title.toUpperCase()}`, 126, y + 40)
    ctx.fillStyle = FG
    ctx.font = body(fitSize(ctx, h.detail, 34, W - 260, body), 600)
    ctx.fillText(h.detail, 126, y + 80)
    ctx.textAlign = 'center'
    y += 114
  }

  // The invite.
  const cta = `Play me: ${data.url.replace(/^https?:\/\//, '')}`
  ctx.font = body(38, 700)
  const ctaW = Math.min(W - 120, ctx.measureText(cta).width + 96)
  roundRect(ctx, (W - ctaW) / 2, H - 136, ctaW, 88, 44)
  ctx.fillStyle = MARIGOLD
  ctx.fill()
  ctx.fillStyle = TABLE_950
  ctx.font = body(fitSize(ctx, cta, 38, ctaW - 72, (s) => body(s, 700)), 700)
  ctx.textBaseline = 'middle'
  ctx.fillText(cta, W / 2, H - 91)

  return new Promise((resolve, reject) =>
    // JPEG: a fifth the size of PNG, which matters on mobile data; WhatsApp recompresses anyway.
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the result card'))), 'image/jpeg', 0.9),
  )
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Phones: the share sheet, image attached (straight to WhatsApp). Elsewhere:
 * save the image and copy the invite text, so it can be pasted with it.
 */
export async function shareResultCard(data: ResultCardData, text: string): Promise<ShareOutcome> {
  const blob = await renderResultCard(data)
  const file = new File([blob], 'last-card-result.jpg', { type: 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Some WebViews advertise file sharing and then refuse it: fall through to download.
    }
  }
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
  return 'downloaded'
}

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Largest font size (down to 60% of max) at which the text fits the width. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  width: number,
  font: (size: number, weight?: number) => string,
) {
  for (let size = max; size > max * 0.6; size -= 2) {
    ctx.font = font(size)
    if (ctx.measureText(text).width <= width) return size
  }
  return Math.round(max * 0.6)
}

/** The faint adire dot grid from the app background. */
function dots(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(245, 243, 251, 0.05)'
  for (let y = 22; y < H; y += 44) {
    for (let x = (y / 44) % 2 ? 44 : 22; x < W; x += 44) {
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
