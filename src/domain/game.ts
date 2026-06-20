import type { Vec2 } from './geometry'
import { add, clamp, distance, lerp, normalize, scale, vec } from './geometry'

export type TowerKind = 'lantern' | 'obelisk' | 'idol'

export type SignKind = 'banish' | 'elder' | 'spiral'

export type GameStatus = 'playing' | 'victory' | 'defeat'

export type GameSoundEvent =
  | Readonly<{ kind: 'towerShoot', towerKind: TowerKind }>
  | Readonly<{ kind: 'enemyDeath' }>
  | Readonly<{ kind: 'victory' }>
  | Readonly<{ kind: 'defeat' }>

export type LevelConfig = Readonly<{
  id: number
  name: string
  subtitle: string
  accentColor: number
  difficultyMultiplier: number
  maxWave: number
}>

export type Monster = {
  id: string
  kind: 'cultist' | 'deepOne' | 'shoggoth'
  position: Vec2
  hp: number
  maxHp: number
  speed: number
  reward: number
  pathProgress: number
  slowUntil: number
}

export type Tower = {
  id: string
  kind: TowerKind
  position: Vec2
  level: number
  invested: number
  range: number
  cooldown: number
  fireRate: number
  damage: number
}

export type Projectile = {
  id: string
  position: Vec2
  targetId: string
  speed: number
  damage: number
}

export type FloatingText = {
  id: string
  position: Vec2
  text: string
  age: number
  color: number
}

export type TowerSlot = {
  id: string
  position: Vec2
  occupiedBy?: string
}

export type GameSnapshot = Readonly<{
  baseHp: number
  coins: number
  level: number
  levelName: string
  wave: number
  maxWave: number
  score: number
  time: number
  status: GameStatus
  monsters: Monster[]
  towers: Tower[]
  projectiles: Projectile[]
  floatingTexts: FloatingText[]
  towerSlots: TowerSlot[]
  path: Vec2[]
  selectedTower: TowerKind
}>

const monsterBook: Record<Monster['kind'], Omit<Monster, 'id' | 'position' | 'pathProgress' | 'slowUntil'>> = {
  cultist: { kind: 'cultist', hp: 42, maxHp: 42, speed: 43, reward: 7 },
  deepOne: { kind: 'deepOne', hp: 78, maxHp: 78, speed: 34, reward: 11 },
  shoggoth: { kind: 'shoggoth', hp: 180, maxHp: 180, speed: 22, reward: 24 },
}

const towerBook: Record<TowerKind, Omit<Tower, 'id' | 'position' | 'cooldown' | 'level' | 'invested'>> = {
  lantern: { kind: 'lantern', range: 140, fireRate: 0.50, damage: 15 },
  obelisk: { kind: 'obelisk', range: 100, fireRate: 1.50, damage: 35 },
  idol: { kind: 'idol', range: 200, fireRate: 2.50, damage: 50 },
}

const towerCost: Record<TowerKind, number> = {
  lantern: 36,
  obelisk: 68,
  idol: 52,
}

const projectileSpeed: Record<TowerKind, number> = {
  lantern: 400,
  obelisk: 300,
  idol: 500,
}

export const levels: readonly LevelConfig[] = [
  { id: 1, name: 'Innsmouth Coast', subtitle: 'A drowned road under watchful stars', accentColor: 0x81f5e1, difficultyMultiplier: 1, maxWave: 12 },
  { id: 2, name: 'Black Reef', subtitle: 'The tide brings older hunger', accentColor: 0x67e8f9, difficultyMultiplier: 1.18, maxWave: 12 },
  { id: 3, name: 'Miskatonic Gate', subtitle: 'Ruins breathe beneath the stones', accentColor: 0xc4b5fd, difficultyMultiplier: 1.38, maxWave: 12 },
  { id: 4, name: "R'lyeh Shoals", subtitle: 'Geometry bends toward the deep', accentColor: 0x5eead4, difficultyMultiplier: 1.62, maxWave: 12 },
  { id: 5, name: 'Elder Causeway', subtitle: 'No lantern burns without a cost', accentColor: 0xfcd34d, difficultyMultiplier: 1.9, maxWave: 12 },
  { id: 6, name: 'The Sunken Throne', subtitle: 'The dreamer stirs below', accentColor: 0xfb7185, difficultyMultiplier: 2.25, maxWave: 12 },
]

export class GameWorld {
  private readonly monsters = new Map<string, Monster>()
  private readonly towers = new Map<string, Tower>()
  private readonly projectiles = new Map<string, Projectile>()
  private readonly floatingTexts = new Map<string, FloatingText>()
  private readonly path = [
    vec(-35, 348),
    vec(130, 348),
    vec(200, 232),
    vec(360, 232),
    vec(455, 442),
    vec(620, 442),
    vec(720, 302),
    vec(850, 302),
  ]
  private readonly towerSlots: TowerSlot[] = [
    { id: 'slot-1', position: vec(150, 246) },
    { id: 'slot-2', position: vec(270, 330) },
    { id: 'slot-3', position: vec(390, 146) },
    { id: 'slot-4', position: vec(510, 346) },
    { id: 'slot-5', position: vec(615, 542) },
    { id: 'slot-6', position: vec(760, 396) },
  ]
  private baseHp = 20
  private coins = 90
  private score = 0
  private wave = 1
  private currentLevel = levels[0]
  private status: GameStatus = 'playing'
  private time = 0
  private spawnTimer = 0
  private spawnedInWave = 0
  private selectedTower: TowerKind = 'lantern'
  private soundEvents: GameSoundEvent[] = []
  private id = 0

  update(deltaSeconds: number): void {
    if (this.status !== 'playing') {
      return
    }

    if (this.baseHp <= 0) {
      this.status = 'defeat'
      this.emitSound({ kind: 'defeat' })
      return
    }

    this.time += deltaSeconds
    this.spawnTimer -= deltaSeconds
    this.spawnWaveMonsters()
    this.updateMonsters(deltaSeconds)
    this.updateTowers(deltaSeconds)
    this.updateProjectiles(deltaSeconds)
    this.updateFloatingTexts(deltaSeconds)
  }

  reset(levelId = this.currentLevel.id): void {
    this.monsters.clear()
    this.towers.clear()
    this.projectiles.clear()
    this.floatingTexts.clear()
    this.towerSlots.forEach((slot) => {
      slot.occupiedBy = undefined
    })
    this.currentLevel = levels.find((level) => level.id === levelId) ?? levels[0]
    this.baseHp = 20
    this.coins = 90
    this.score = 0
    this.wave = 1
    this.status = 'playing'
    this.time = 0
    this.spawnTimer = 0
    this.spawnedInWave = 0
    this.selectedTower = 'lantern'
    this.soundEvents = []
    this.id = 0
  }

  selectTower(kind: TowerKind): void {
    this.selectedTower = kind
  }

  getTowerCost(kind: TowerKind): number {
    return towerCost[kind]
  }

  getTowerUpgradeCost(towerId: string): number | null {
    const tower = this.towers.get(towerId)
    if (!tower || tower.level >= 3) {
      return null
    }

    return Math.round(towerCost[tower.kind] * (tower.level === 1 ? 0.6 : 0.9))
  }

  getTowerRefund(towerId: string): number {
    const tower = this.towers.get(towerId)
    return tower ? Math.floor(tower.invested * 0.5) : 0
  }

  consumeSoundEvents(): GameSoundEvent[] {
    const events = this.soundEvents
    this.soundEvents = []
    return events
  }

  buildTower(slotId: string, kind = this.selectedTower): boolean {
    if (this.status !== 'playing') {
      return false
    }

    const slot = this.towerSlots.find((candidate) => candidate.id === slotId)
    if (!slot || slot.occupiedBy || this.coins < towerCost[kind]) {
      return false
    }

    const tower: Tower = {
      ...towerBook[kind],
      id: this.nextId('tower'),
      position: slot.position,
      level: 1,
      invested: towerCost[kind],
      cooldown: 0,
    }

    this.coins -= towerCost[kind]
    slot.occupiedBy = tower.id
    this.towers.set(tower.id, tower)
    this.say(slot.position, kind, 0xd8f4ff)
    return true
  }

  upgradeTower(towerId: string): boolean {
    const tower = this.towers.get(towerId)
    const cost = this.getTowerUpgradeCost(towerId)
    if (!tower || cost === null || this.coins < cost || this.status !== 'playing') {
      return false
    }

    this.coins -= cost
    tower.level += 1
    tower.invested += cost
    tower.damage = Math.round(tower.damage * (tower.level === 2 ? 1.35 : 1.45))
    tower.range = Math.round(tower.range * 1.1)
    tower.fireRate *= 0.9
    this.say(tower.position, `level ${tower.level}`, 0xfef3c7)
    return true
  }

  removeTower(towerId: string): boolean {
    const tower = this.towers.get(towerId)
    if (!tower || this.status !== 'playing') {
      return false
    }

    const slot = this.towerSlots.find((candidate) => candidate.occupiedBy === towerId)
    if (slot) {
      slot.occupiedBy = undefined
    }

    const refund = this.getTowerRefund(towerId)
    this.coins += refund
    this.towers.delete(towerId)
    this.say(tower.position, `+${refund}`, 0xbbf7d0)
    return true
  }

  castSign(kind: SignKind, points: Vec2[]): void {
    if (points.length < 2 || this.status !== 'playing') {
      return
    }

    if (kind === 'banish') {
      let kills = 0
      for (const monster of this.monsters.values()) {
        const close = points.some((point) => distance(point, monster.position) < 46)
        if (close) {
          monster.hp -= 74
          this.say(monster.position, '-74', 0x9dfcf4)
          if (monster.hp <= 0) {
            kills += 1
          }
        }
      }
      if (kills > 0) {
        this.say(points[points.length - 1], `banished x${kills}`, 0x9dfcf4)
      }
      return
    }

    if (kind === 'elder') {
      for (const monster of this.monsters.values()) {
        if (monster.position.x > 610) {
          monster.hp -= 48
          monster.speed *= 0.92
          this.say(monster.position, 'ward', 0xffd783)
        }
      }
      this.say(points[0], 'elder sign', 0xffd783)
      return
    }

    for (const monster of this.monsters.values()) {
      monster.slowUntil = this.time + 4.2
      monster.hp -= 24
      this.say(monster.position, 'dread', 0xd3b8ff)
    }
    this.say(points[0], 'spiral curse', 0xd3b8ff)
  }

  snapshot(): GameSnapshot {
    return {
      baseHp: this.baseHp,
      coins: this.coins,
      level: this.currentLevel.id,
      levelName: this.currentLevel.name,
      wave: this.wave,
      maxWave: this.currentLevel.maxWave,
      score: this.score,
      time: this.time,
      status: this.status,
      monsters: [...this.monsters.values()].map((monster) => ({ ...monster })),
      towers: [...this.towers.values()].map((tower) => ({ ...tower })),
      projectiles: [...this.projectiles.values()].map((projectile) => ({ ...projectile })),
      floatingTexts: [...this.floatingTexts.values()].map((text) => ({ ...text })),
      towerSlots: this.towerSlots.map((slot) => ({ ...slot })),
      path: [...this.path],
      selectedTower: this.selectedTower,
    }
  }

  private spawnWaveMonsters(): void {
    const waveSize = Math.round((7 + this.wave * 2) * this.currentLevel.difficultyMultiplier)
    if (this.spawnedInWave >= waveSize) {
      if (this.monsters.size === 0) {
        if (this.wave >= this.currentLevel.maxWave) {
          this.status = 'victory'
          this.emitSound({ kind: 'victory' })
          this.say(vec(492, 86), 'victory', 0xbbf7d0)
          return
        }

        this.wave += 1
        this.spawnedInWave = 0
        this.spawnTimer = 1.4
        this.coins += 22
        this.say(vec(492, 86), `wave ${this.wave}`, 0xfff7bc)
      }
      return
    }

    if (this.spawnTimer > 0) {
      return
    }

    const kind = this.pickMonsterKind()
    const stats = monsterBook[kind]
    const monster: Monster = {
      ...stats,
      id: this.nextId('monster'),
      hp: Math.round((stats.hp + this.wave * 5) * this.currentLevel.difficultyMultiplier),
      maxHp: Math.round((stats.maxHp + this.wave * 5) * this.currentLevel.difficultyMultiplier),
      speed: stats.speed + Math.min(24, this.wave * 1.4 * this.currentLevel.difficultyMultiplier),
      position: this.path[0],
      pathProgress: 0,
      slowUntil: 0,
    }

    this.monsters.set(monster.id, monster)
    this.spawnedInWave += 1
    this.spawnTimer = clamp(0.95 - this.wave * 0.035, 0.38, 0.95)
  }

  private updateMonsters(deltaSeconds: number): void {
    for (const monster of [...this.monsters.values()]) {
      const slowFactor = monster.slowUntil > this.time ? 0.45 : 1
      monster.pathProgress += (monster.speed * slowFactor * deltaSeconds) / this.totalPathLength()
      monster.position = this.positionOnPath(monster.pathProgress)

      if (monster.hp <= 0) {
        this.monsters.delete(monster.id)
        this.coins += monster.reward
        this.score += monster.reward * 10
        this.emitSound({ kind: 'enemyDeath' })
        this.say(monster.position, `+${monster.reward}`, 0xbbf7d0)
      } else if (monster.pathProgress >= 1) {
        this.monsters.delete(monster.id)
        this.baseHp -= monster.kind === 'shoggoth' ? 3 : 1
        this.say(vec(904, 252), '-sanity', 0xff8e8e)
        if (this.baseHp <= 0) {
          this.baseHp = 0
          this.status = 'defeat'
          this.emitSound({ kind: 'defeat' })
        }
      }
    }
  }

  private updateTowers(deltaSeconds: number): void {
    for (const tower of this.towers.values()) {
      tower.cooldown -= deltaSeconds
      if (tower.cooldown > 0) {
        continue
      }

      const target = [...this.monsters.values()]
        .filter((monster) => distance(monster.position, tower.position) <= tower.range)
        .sort((a, b) => b.pathProgress - a.pathProgress)[0]

      if (!target) {
        continue
      }

      const projectileId = this.nextId('projectile')
      this.projectiles.set(projectileId, {
        id: projectileId,
        position: tower.position,
        targetId: target.id,
        speed: projectileSpeed[tower.kind],
        damage: tower.damage,
      })
      this.emitSound({ kind: 'towerShoot', towerKind: tower.kind })
      tower.cooldown = tower.fireRate
    }
  }

  private updateProjectiles(deltaSeconds: number): void {
    for (const projectile of [...this.projectiles.values()]) {
      const target = this.monsters.get(projectile.targetId)
      if (!target) {
        this.projectiles.delete(projectile.id)
        continue
      }

      const toTarget = add(target.position, scale(projectile.position, -1))
      const step = projectile.speed * deltaSeconds
      if (distance(projectile.position, target.position) <= step) {
        target.hp -= projectile.damage
        this.say(target.position, `-${projectile.damage}`, 0xfcd34d)
        this.projectiles.delete(projectile.id)
      } else {
        projectile.position = add(projectile.position, scale(normalize(toTarget), step))
      }
    }
  }

  private updateFloatingTexts(deltaSeconds: number): void {
    for (const text of [...this.floatingTexts.values()]) {
      text.age += deltaSeconds
      text.position = add(text.position, vec(0, -26 * deltaSeconds))
      if (text.age > 1.05) {
        this.floatingTexts.delete(text.id)
      }
    }
  }

  private positionOnPath(progress: number): Vec2 {
    const total = this.totalPathLength()
    let remaining = clamp(progress, 0, 1) * total

    for (let index = 0; index < this.path.length - 1; index += 1) {
      const from = this.path[index]
      const to = this.path[index + 1]
      const segment = distance(from, to)
      if (remaining <= segment) {
        return lerp(from, to, remaining / segment)
      }
      remaining -= segment
    }

    return this.path[this.path.length - 1]
  }

  private totalPathLength(): number {
    let total = 0
    for (let index = 0; index < this.path.length - 1; index += 1) {
      total += distance(this.path[index], this.path[index + 1])
    }
    return total
  }

  private pickMonsterKind(): Monster['kind'] {
    if (this.wave % 4 === 0 && this.spawnedInWave % 6 === 0) {
      return 'shoggoth'
    }
    if (this.wave > 1 && this.spawnedInWave % 3 === 0) {
      return 'deepOne'
    }
    return 'cultist'
  }

  private say(position: Vec2, text: string, color: number): void {
    const id = this.nextId('text')
    this.floatingTexts.set(id, { id, position, text, age: 0, color })
  }

  private emitSound(event: GameSoundEvent): void {
    this.soundEvents.push(event)
  }

  private nextId(prefix: string): string {
    this.id += 1
    return `${prefix}-${this.id}`
  }
}
