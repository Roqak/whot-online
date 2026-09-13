import * as THREE from 'three'
import type { Card, Suit } from '../../types/game'
import { SHAPE_PATHS } from '../cards/shapePaths'
import { cardBackSvg, cardFaceSvg, svgDataUri } from '../cards/cardSvg'
import { getAvatar } from '../../lib/avatars'

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()

function load(key: string, svg: string): THREE.Texture {
  const existing = cache.get(key)
  if (existing) return existing
  const texture = loader.load(svgDataUri(svg))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  cache.set(key, texture)
  return texture
}

function canvas2d(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

/** Cards are drawn once as SVG and reused as textures. Pass null for a face-down card. */
export function cardTexture(card: Card | null): THREE.Texture {
  return card ? load(card.id, cardFaceSvg(card)) : load('back', cardBackSvg())
}

const emojiCache = new Map<string, THREE.Texture>()

export function emojiTexture(emoji: string): THREE.Texture {
  const existing = emojiCache.get(emoji)
  if (existing) return existing
  const { canvas, ctx } = canvas2d(128, 128)
  ctx.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 64, 70)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  emojiCache.set(emoji, texture)
  return texture
}

/** Round avatar medallion with the character's hue behind the emoji. */
export function avatarTexture(avatarId: string): THREE.Texture {
  const existing = emojiCache.get(`avatar:${avatarId}`)
  if (existing) return existing
  const avatar = getAvatar(avatarId)
  const { canvas, ctx } = canvas2d(128, 128)
  const hue = avatar.hue
  ctx.fillStyle = `oklch(0.42 0.09 ${hue})`
  ctx.beginPath()
  ctx.arc(64, 64, 63, 0, Math.PI * 2)
  ctx.fill()
  const glow = ctx.createRadialGradient(64, 46, 8, 64, 64, 64)
  glow.addColorStop(0, `oklch(0.55 0.12 ${hue} / 0.9)`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(64, 64, 63, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '72px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(avatar.emoji, 64, 70)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  emojiCache.set(`avatar:${avatarId}`, texture)
  return texture
}

/**
 * Radial glow in a player's suit colour, used for the floor ring under whoever
 * is on turn and for shape-request shockwaves.
 */
export function glowTexture(color: string): THREE.Texture {
  const existing = emojiCache.get(`glow:${color}`)
  if (existing) return existing
  const { canvas, ctx } = canvas2d(256, 256)
  const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 128)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.55, color.replace(' / 1)', ' / 0.35)'))
  gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  emojiCache.set(`glow:${color}`, texture)
  return texture
}

/** White suit glyph on transparent, tinted per material. Used for shape chips. */
export function shapeTexture(shape: Suit): THREE.Texture {
  const existing = emojiCache.get(`shape:${shape}`)
  if (existing) return existing
  const { canvas, ctx } = canvas2d(128, 128)
  const path = new Path2D(SHAPE_PATHS[shape])
  ctx.translate(64 - 50, 64 - 50)
  ctx.scale(1.28, 1.28)
  ctx.fillStyle = '#f6efe2'
  ctx.fill(path)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  emojiCache.set(`shape:${shape}`, texture)
  return texture
}

let felt: THREE.Texture | null = null

/** Deep indigo felt with the adire dot weave, drawn once and shared. */
export function feltTexture(): THREE.Texture {
  if (felt) return felt
  const size = 512
  const { canvas, ctx } = canvas2d(size, size)
  ctx.fillStyle = '#232a52'
  ctx.fillRect(0, 0, size, size)
  // Weave: staggered dots like the 2D adire pattern.
  ctx.fillStyle = 'rgba(246, 239, 226, 0.05)'
  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 11; col++) {
      const x = 24 + col * 46 + (row % 2 ? 23 : 0)
      const y = 24 + row * 46
      ctx.beginPath()
      ctx.arc(x, y, row % 2 === col % 2 ? 4 : 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Subtle fibres so the surface reads as cloth under light.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'
  for (let i = 0; i < 90; i++) {
    ctx.beginPath()
    const x = Math.random() * size
    const y = Math.random() * size
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.random() * 40 - 20, y + Math.random() * 40 - 20)
    ctx.stroke()
  }
  felt = new THREE.CanvasTexture(canvas)
  felt.colorSpace = THREE.SRGBColorSpace
  felt.wrapS = THREE.RepeatWrapping
  felt.wrapT = THREE.RepeatWrapping
  felt.anisotropy = 8
  return felt
}

export function disposeCardTextures() {
  for (const texture of cache.values()) texture.dispose()
  for (const texture of emojiCache.values()) texture.dispose()
  felt?.dispose()
  felt = null
  cache.clear()
  emojiCache.clear()
}

export function suitColor(shape: Suit | 'whot'): string {
  if (shape === 'whot') return '#f2c14e'
  const hues: Record<Suit, string> = {
    circle: '#6c7ae0',
    triangle: '#e2725b',
    cross: '#5aae7d',
    square: '#8f7ae8',
    star: '#f2c14e',
  }
  return hues[shape]
}