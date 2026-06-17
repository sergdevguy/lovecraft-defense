import { distance } from '../domain/geometry'
import type { Vec2 } from '../domain/geometry'
import type { SignKind } from '../domain/game'

export type RecognizedSign = Readonly<{
  kind: SignKind
  confidence: number
  label: string
}>

export class SignRecognizer {
  recognize(points: Vec2[]): RecognizedSign | null {
    if (points.length < 8 || this.strokeLength(points) < 70) {
      return null
    }

    const bounds = this.bounds(points)
    const width = bounds.maxX - bounds.minX
    const height = bounds.maxY - bounds.minY
    const directness = distance(points[0], points[points.length - 1]) / this.strokeLength(points)
    const angleSum = this.totalTurn(points)
    const closedness = distance(points[0], points[points.length - 1]) / Math.max(width, height, 1)

    if (directness > 0.82 && width > height * 1.7) {
      return { kind: 'banish', confidence: directness, label: 'Banish line' }
    }

    if (closedness < 0.34 && Math.abs(angleSum) > Math.PI * 1.25 && width > 54 && height > 54) {
      return { kind: 'spiral', confidence: Math.min(1, Math.abs(angleSum) / (Math.PI * 2.6)), label: 'Spiral curse' }
    }

    const corners = this.cornerCount(points)
    if (corners >= 2 && corners <= 5 && closedness < 0.72 && width > 48 && height > 48) {
      return { kind: 'elder', confidence: 0.76, label: 'Elder sign' }
    }

    return null
  }

  private strokeLength(points: Vec2[]): number {
    let total = 0
    for (let index = 1; index < points.length; index += 1) {
      total += distance(points[index - 1], points[index])
    }
    return total
  }

  private totalTurn(points: Vec2[]): number {
    let total = 0
    for (let index = 2; index < points.length; index += 1) {
      const a = Math.atan2(points[index - 1].y - points[index - 2].y, points[index - 1].x - points[index - 2].x)
      const b = Math.atan2(points[index].y - points[index - 1].y, points[index].x - points[index - 1].x)
      let delta = b - a
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      total += delta
    }
    return total
  }

  private cornerCount(points: Vec2[]): number {
    let corners = 0
    for (let index = 6; index < points.length - 6; index += 6) {
      const previous = points[index - 6]
      const current = points[index]
      const next = points[index + 6]
      const incoming = Math.atan2(current.y - previous.y, current.x - previous.x)
      const outgoing = Math.atan2(next.y - current.y, next.x - current.x)
      const turn = Math.abs(outgoing - incoming)
      if (Math.min(turn, Math.PI * 2 - turn) > 0.86) {
        corners += 1
      }
    }
    return corners
  }

  private bounds(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
    return points.reduce(
      (bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
      }),
      { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 },
    )
  }
}
