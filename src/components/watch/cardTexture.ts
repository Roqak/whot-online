import * as THREE from 'three'
import type { Card } from '../../types/game'
import { cardBackSvg, cardFaceSvg, svgDataUri } from '../cards/cardSvg'

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

/** Cards are drawn once as SVG and reused as textures. Pass null for a face-down card. */
export function cardTexture(card: Card | null): THREE.Texture {
  return card ? load(card.id, cardFaceSvg(card)) : load('back', cardBackSvg())
}

const emojiCache = new Map<string, THREE.Texture>()

export function emojiTexture(emoji: string): THREE.Texture {
  const existing = emojiCache.get(emoji)
  if (existing) return existing
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 64, 70)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  emojiCache.set(emoji, texture)
  return texture
}

export function disposeCardTextures() {
  for (const texture of cache.values()) texture.dispose()
  for (const texture of emojiCache.values()) texture.dispose()
  cache.clear()
  emojiCache.clear()
}
