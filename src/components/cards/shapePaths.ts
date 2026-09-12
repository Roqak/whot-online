import type { Shape } from '../../types/game'

/** Shape outlines in a 0 0 100 100 box, shared by the React cards and the 3D textures. */
export const SHAPE_PATHS: Record<Exclude<Shape, 'whot'>, string> = {
  circle: 'M8 50a42 42 0 1 0 84 0a42 42 0 1 0-84 0Z',
  triangle: 'M50 6 96 92H4Z',
  cross: 'M36 4h28v32h32v28H64v32H36V64H4V36h32Z',
  square: 'M8 8h84v84H8Z',
  star: 'M50 6 63 41l37 1-29 23 10 36-31-21-31 21 10-36L0 42l37-1Z',
}
