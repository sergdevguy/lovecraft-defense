export type Vec2 = Readonly<{
  x: number
  y: number
}>

export const vec = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y)

export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y)

export const scale = (v: Vec2, amount: number): Vec2 => vec(v.x * amount, v.y * amount)

export const length = (v: Vec2): number => Math.hypot(v.x, v.y)

export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b))

export const normalize = (v: Vec2): Vec2 => {
  const size = length(v)
  return size === 0 ? vec(0, 0) : scale(v, 1 / size)
}

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const pointInRect = (
  point: Vec2,
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height
