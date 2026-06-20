import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from 'pixi.js'
import { SignRecognizer } from '../application/sign-recognizer'
import enemyDeathSoundUrl from '../assets/audio/enemy_death.wav'
import gameThemeUrl from '../assets/audio/game_theme.ogg'
import defeatSoundUrl from '../assets/audio/loose.wav'
import towerIdolShootUrl from '../assets/audio/tower_idol_shoot.wav'
import towerLanternShootUrl from '../assets/audio/tower_lantern_shoot.wav'
import towerObeliskShootUrl from '../assets/audio/tower_obelisc_shoot.wav'
import uiClickSoundUrl from '../assets/audio/ui-clicks.wav'
import victorySoundUrl from '../assets/audio/win.wav'
import type { GameSoundEvent, GameStatus, LevelConfig, TowerKind, TowerSlot } from '../domain/game'
import { GameWorld, levels } from '../domain/game'
import type { Vec2 } from '../domain/geometry'
import { distance, vec } from '../domain/geometry'

const worldWidth = 850
const worldHeight = 720
const playRect = { x: 10, y: 76, width: 830, height: 560 }
const playFramePadding = 10
// const sidebarRect = { x: 884, y: 28, width: 270, height: 596 }
// const ritualRect = { x: 906, y: 86, width: 226, height: 174 }
const towerMenuRadius = 72
const towerMenuOptionWidth = 58
const towerMenuOptionHeight = 62
const speedButtonSize = 42
const speedButtonPadding = 20

type ScreenState = 'mainMenu' | 'levelSelect' | 'playing' | 'victory' | 'defeat'
type TowerAction = 'upgrade' | 'sell'
type SoundName =
  | 'uiClick'
  | 'enemyDeath'
  | 'defeat'
  | 'victory'
  | 'lanternShoot'
  | 'obeliskShoot'
  | 'idolShoot'

const soundSources: Record<SoundName, string> = {
  uiClick: uiClickSoundUrl,
  enemyDeath: enemyDeathSoundUrl,
  defeat: defeatSoundUrl,
  victory: victorySoundUrl,
  lanternShoot: towerLanternShootUrl,
  obeliskShoot: towerObeliskShootUrl,
  idolShoot: towerIdolShootUrl,
}

const soundVolumes: Record<SoundName, number> = {
  uiClick: 0.4,
  enemyDeath: 0.2,
  defeat: 0.8,
  victory: 0.8,
  lanternShoot: 0.05,
  obeliskShoot: 0.1,
  idolShoot: 0.1,
}

class AudioMixer {
  private readonly pools = new Map<SoundName, HTMLAudioElement[]>()
  private readonly theme = new Audio(gameThemeUrl)
  private themeStarted = false

  constructor() {
    this.theme.loop = true
    this.theme.volume = 0.26

    for (const [name, source] of Object.entries(soundSources) as Array<[SoundName, string]>) {
      const poolSize = name.includes('Shoot') || name === 'enemyDeath' || name === 'uiClick' ? 5 : 2
      this.pools.set(name, Array.from({ length: poolSize }, () => this.createAudio(source, soundVolumes[name])))
    }
  }

  playUi(): void {
    this.play('uiClick')
  }

  playWorldEvent(event: GameSoundEvent): void {
    if (event.kind === 'towerShoot') {
      this.play(`${event.towerKind}Shoot`)
      return
    }
    this.play(event.kind)
  }

  startTheme(): void {
    if (this.themeStarted) {
      return
    }

    this.themeStarted = true
    this.theme.play().catch(() => {
      this.themeStarted = false
    })
  }

  stopTheme(): void {
    this.theme.pause()
    this.theme.currentTime = 0
    this.themeStarted = false
  }

  private play(name: SoundName): void {
    const pool = this.pools.get(name)
    const audio = pool?.find((candidate) => candidate.paused || candidate.ended) ?? pool?.[0]
    if (!audio) {
      return
    }

    audio.currentTime = 0
    audio.play().catch(() => undefined)
  }

  private createAudio(source: string, volume: number): HTMLAudioElement {
    const audio = new Audio(source)
    audio.preload = 'auto'
    audio.volume = volume
    return audio
  }
}

type TowerMenuOption = {
  kind: TowerKind
  center: Vec2
  width: number
  height: number
}

type TowerActionOption = {
  action: TowerAction
  center: Vec2
  width: number
  height: number
}

export class PixiGame {
  private readonly app = new Application()
  private readonly world = new GameWorld()
  private readonly recognizer = new SignRecognizer()
  private readonly audio = new AudioMixer()
  private readonly root = new Container()
  private readonly board = new Graphics()
  private readonly entities = new Graphics()
  private readonly towerMenu = new Container()
  private readonly towerActionMenu = new Container()
  private readonly speedButton = new Container()
  private readonly pauseButton = new Container()
  private readonly drawing = new Graphics()
  private readonly hud = new Graphics()
  private readonly hudText = new Container()
  private readonly hint = new Text({ text: '', style: this.smallStyle(0xa7f3d0) })
  private readonly screenLayer = new Container()
  private readonly speedModes = [1, 2, 4] as const
  private screen: ScreenState = 'mainMenu'
  private selectedLevelId = 1
  private unlockedLevelId = 1
  private speedModeIndex = 0
  private isPaused = false
  private activeTowerMenuSlotId: string | null = null
  private activeTowerActionTowerId: string | null = null
  private towerMenuOptions: TowerMenuOption[] = []
  private towerActionOptions: TowerActionOption[] = []
  private drawingPoints: Vec2[] = []
  private isDrawing = false
  private activePointerId: number | null = null
  private lastPointerEventAt = 0
  private scale = 1
  private offset = vec(0, 0)

  async mount(element: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: element,
      background: '#080c0e',
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true,
    })

    element.appendChild(this.app.canvas)
    this.app.stage.addChild(this.root)
    this.initGameScene()
  }

  private initGameScene(): void {
    this.root.addChild(
      this.board,
      this.entities,
      this.towerMenu,
      this.towerActionMenu,
      this.drawing,
      this.hud,
      this.hudText,
      this.hint,
      this.pauseButton,
      this.speedButton,
      this.screenLayer,
    )
    this.drawPauseButton()
    this.drawSpeedButton()
    this.showMainMenu()
    this.resize()

    this.app.canvas.addEventListener('pointerdown', this.onCanvasPointerDown)
    this.app.canvas.addEventListener('pointermove', this.onCanvasPointerMove)
    this.app.canvas.addEventListener('pointerup', this.onCanvasPointerUp)
    this.app.canvas.addEventListener('pointercancel', this.onCanvasPointerUp)
    this.app.canvas.addEventListener('mousedown', this.onCanvasMouseDown)
    this.app.canvas.addEventListener('mousemove', this.onCanvasMouseMove)
    this.app.canvas.addEventListener('mouseup', this.onCanvasMouseUp)
    this.app.canvas.addEventListener('mouseleave', this.onCanvasMouseUp)
    this.app.canvas.addEventListener('click', this.onCanvasClick)
    this.app.renderer.on('resize', this.resize)
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS / 1000))
  }

  private tick(deltaSeconds: number): void {
    if (this.screen === 'playing' && !this.isPaused) {
      const speed = this.speedModes[this.speedModeIndex]
      this.world.update(Math.min(deltaSeconds * speed, 0.05 * speed))
      this.playWorldSounds()
      const status = this.world.snapshot().status
      if (status === 'victory' || status === 'defeat') {
        this.showEndScreen(status)
      }
    }
    this.render()
  }

  private playWorldSounds(): void {
    for (const event of this.world.consumeSoundEvents()) {
      this.audio.playWorldEvent(event)
    }
  }

  private render(): void {
    const snapshot = this.world.snapshot()
    this.board.clear()
    this.entities.clear()
    this.hud.clear()
    this.hudText.removeChildren().forEach((child) => child.destroy())

    if (this.screen === 'mainMenu') {
      this.drawMenuBackground()
    } else {
      this.drawBackground()
    }

    if (this.screen === 'playing' || this.screen === 'victory' || this.screen === 'defeat') {
      this.drawPath(snapshot.path)
      this.drawTowerSlots()
      this.drawTowers()
      this.drawMonsters()
      this.drawProjectiles()
      this.drawFloatingTexts()
      // this.drawRitualField()
      this.drawHud()
    } else {
      this.hint.text = ''
    }
  }

  private drawMenuBackground(): void {
    this.board.rect(0, 0, worldWidth, worldHeight).fill(0x060a0c)

    for (let index = 0; index < 16; index += 1) {
      const x = 94 + index * 72
      const y = 86 + (index % 4) * 118
      this.board.circle(x, y, 74 + (index % 3) * 20).fill({ color: 0x0f2426, alpha: 0.14 })
    }

    this.board.circle(worldWidth / 2, worldHeight / 2, 240).stroke({ color: 0x2dd4bf, width: 2, alpha: 0.08 })
    this.board.circle(worldWidth / 2, worldHeight / 2, 128).stroke({ color: 0xf5f5dc, width: 1, alpha: 0.06 })
  }

  private drawBackground(): void {
    this.board.rect(0, 0, worldWidth, worldHeight).fill(0x080c0e)

    for (let index = 0; index < 18; index += 1) {
      const x = 40 + index * 67
      const y = 84 + (index % 5) * 86
      this.board.circle(x, y, 80 + (index % 3) * 18).fill({ color: 0x102224, alpha: 0.1 })
    }

    this.drawPanel(
      this.board,
      playRect.x - playFramePadding,
      playRect.y - playFramePadding,
      playRect.width + playFramePadding * 2,
      playRect.height + playFramePadding * 2,
      0x0c1214,
      0x394548,
    )
    this.board.rect(playRect.x, playRect.y, playRect.width, playRect.height).fill({ color: 0x0b1517, alpha: 0.86 })

    for (let x = playRect.x + 20; x < playRect.x + playRect.width; x += 42) {
      this.board.moveTo(x, playRect.y + 8).lineTo(x + 16, playRect.y + playRect.height - 12).stroke({ color: 0x20393a, width: 1, alpha: 0.22 })
    }

    this.board.circle(735, 150, 66).stroke({ color: 0x2dd4bf, width: 2, alpha: 0.12 })
    this.board.circle(740, 150, 22).fill({ color: 0x67e8f9, alpha: 0.08 })
    this.drawTentacles()
  }

  private drawTentacles(): void {
    const color = 0x1f3b3f
    for (let index = 0; index < 5; index += 1) {
      const startX = 710 + index * 28
      const startY = 500 - index * 38
      this.board
        .moveTo(startX, startY)
        .bezierCurveTo(startX + 80, startY - 55, startX - 20, startY - 132, startX + 64, startY - 184)
        .stroke({ color, width: 8 - index, alpha: 0.18 })
    }
  }

  private drawPath(path: Vec2[]): void {
    this.board.moveTo(path[0].x, path[0].y)
    for (const point of path.slice(1)) {
      this.board.lineTo(point.x, point.y)
    }
    this.board.stroke({ color: 0x14100d, width: 68, alpha: 0.98 })

    this.board.moveTo(path[0].x, path[0].y)
    for (const point of path.slice(1)) {
      this.board.lineTo(point.x, point.y)
    }
    this.board.stroke({ color: 0x51483b, width: 48, alpha: 0.9 })

    this.board.moveTo(path[0].x, path[0].y)
    for (const point of path.slice(1)) {
      this.board.lineTo(point.x, point.y)
    }
    this.board.stroke({ color: 0x8f7b5e, width: 2, alpha: 0.32 })

    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index]
      const to = path[index + 1]
      const steps = Math.max(2, Math.floor(distance(from, to) / 34))
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        const x = from.x + (to.x - from.x) * t
        const y = from.y + (to.y - from.y) * t
        this.board.circle(x, y, 2).fill({ color: 0xd6c7a7, alpha: 0.18 })
      }
    }

    const portal = path[path.length - 1]
    this.board.circle(portal.x, portal.y, 42).fill({ color: 0x180f12, alpha: 0.95 }).stroke({ color: 0x9d2d36, width: 3 })
    this.board.circle(portal.x, portal.y, 18).fill({ color: 0x7f1d1d, alpha: 0.8 })
  }

  private drawTowerSlots(): void {
    for (const slot of this.world.snapshot().towerSlots) {
      const occupied = Boolean(slot.occupiedBy)
      this.entities
        .circle(slot.position.x, slot.position.y, 25)
        .fill({ color: occupied ? 0x11191b : 0x17282b, alpha: 0.95 })
        .stroke({ color: occupied ? 0xd6b85d : 0x6ee7d8, width: 2, alpha: occupied ? 0.65 : 0.45 })
        .circle(slot.position.x, slot.position.y, 15)
        .stroke({ color: 0x0f766e, width: 1, alpha: occupied ? 0.1 : 0.38 })
    }
  }

  private drawTowers(): void {
    for (const tower of this.world.snapshot().towers) {
      const color = this.towerColor(tower.kind)
      this.entities.circle(tower.position.x, tower.position.y, tower.range).stroke({ color, width: 1, alpha: 0.12 })
      this.drawTowerIcon(this.entities, tower.kind, tower.position.x, tower.position.y, 38 + tower.level * 4)
      this.entities.rect(tower.position.x - 13, tower.position.y + 25, 26, 4).fill(0x0d1112)
      this.entities.rect(tower.position.x - 13, tower.position.y + 25, (26 * tower.level) / 3, 4).fill({ color, alpha: 0.9 })
    }
  }

  private drawMonsters(): void {
    for (const monster of this.world.snapshot().monsters) {
      const color = monster.kind === 'cultist' ? 0x86efac : monster.kind === 'deepOne' ? 0x67e8f9 : 0xf0abfc
      const radius = monster.kind === 'shoggoth' ? 20 : 14
      this.entities.circle(monster.position.x, monster.position.y + 4, radius + 4).fill({ color: 0x020708, alpha: 0.75 })
      this.entities
        .circle(monster.position.x, monster.position.y, radius)
        .fill({ color: 0x0a1112, alpha: 0.98 })
        .stroke({ color, width: 2, alpha: 0.88 })
      this.entities.circle(monster.position.x - 4, monster.position.y - 5, 2.4).fill(color)
      this.entities.circle(monster.position.x + 4, monster.position.y - 5, 2.4).fill(color)

      const hpWidth = 36
      this.entities.rect(monster.position.x - hpWidth / 2, monster.position.y - radius - 13, hpWidth, 4).fill(0x301b1b)
      this.entities
        .rect(monster.position.x - hpWidth / 2, monster.position.y - radius - 13, hpWidth * (monster.hp / monster.maxHp), 4)
        .fill(0xef4444)
    }
  }

  private drawProjectiles(): void {
    for (const projectile of this.world.snapshot().projectiles) {
      this.entities.circle(projectile.position.x, projectile.position.y, 5).fill(0xfef3c7)
      this.entities.circle(projectile.position.x, projectile.position.y, 10).stroke({ color: 0x81f5e1, width: 1, alpha: 0.18 })
    }
  }

  private drawFloatingTexts(): void {
    this.root.children
      .filter((child) => child.label === 'floating-text')
      .forEach((child) => child.destroy())

    for (const floating of this.world.snapshot().floatingTexts) {
      const text = new Text({ text: floating.text, style: this.smallStyle(floating.color) })
      text.label = 'floating-text'
      text.anchor.set(0.5)
      text.alpha = Math.max(0, 1 - floating.age)
      text.position.set(floating.position.x, floating.position.y)
      this.root.addChild(text)
    }
  }

  // private drawRitualField(): void {
  //   this.drawPlaque(this.board, sidebarRect.x + 22, sidebarRect.y + 18, sidebarRect.width - 44, 34, 'DRAW MAGIC', 0xa7f3d0)
  //   this.drawRuneFrame(this.entities, ritualRect.x, ritualRect.y, ritualRect.width, ritualRect.height)
  //   this.entities.circle(ritualRect.x + ritualRect.width / 2, ritualRect.y + ritualRect.height / 2, 58).stroke({ color: 0x6ee7b7, width: 2, alpha: 0.34 })
  //   this.entities
  //     .moveTo(ritualRect.x + 73, ritualRect.y + 100)
  //     .bezierCurveTo(ritualRect.x + 112, ritualRect.y + 40, ritualRect.x + 176, ritualRect.y + 78, ritualRect.x + 137, ritualRect.y + 106)
  //     .bezierCurveTo(ritualRect.x + 104, ritualRect.y + 130, ritualRect.x + 106, ritualRect.y + 75, ritualRect.x + 142, ritualRect.y + 83)
  //     .stroke({ color: 0x7fffd4, width: 4, alpha: 0.72, cap: 'round' })
  //
  //   const signs = [
  //     { x: 925, label: 'line' },
  //     { x: 977, label: 'tri' },
  //     { x: 1029, label: 'spiral' },
  //     { x: 1081, label: 'ward' },
  //   ]
  //   for (const sign of signs) {
  //     this.drawIconButton(this.entities, sign.x, 284, 38, 34, sign.label === 'spiral')
  //   }
  //
  //   this.drawPanel(this.entities, sidebarRect.x + 22, 352, sidebarRect.width - 44, 116, 0x080d0f, 0x2f3d40)
  //   const title = new Text({ text: 'ELDRITCH BLAST', style: this.labelStyle(0xa7f3d0, 16) })
  //   title.position.set(sidebarRect.x + 90, 372)
  //   this.hudText.addChild(title)
  //   const body = new Text({
  //     text: 'Draw line, triangle or spiral\nto curse the path.',
  //     style: this.smallStyle(0xd6d3c2),
  //   })
  //   body.position.set(sidebarRect.x + 90, 398)
  //   this.hudText.addChild(body)
  //   this.entities.circle(sidebarRect.x + 58, 406, 25).stroke({ color: 0x7fffd4, width: 3, alpha: 0.8 })
  //
  //   this.hint.text = 'Draw: line, triangle, spiral'
  //   this.hint.position.set(ritualRect.x + 8, ritualRect.y + ritualRect.height + 52)
  // }

  private drawHud(): void {
    const snapshot = this.world.snapshot()
    const frameLeft = playRect.x - playFramePadding
    const frameRight = playRect.x + playRect.width + playFramePadding
    const plaqueWidth = 120
    const plaqueGap = 8
    const levelWidth = 236
    const items = [
      { label: 'SANITY', value: String(snapshot.baseHp), x: frameLeft, width: plaqueWidth, color: 0x86efac },
      { label: 'COINS', value: String(snapshot.coins), x: frameLeft + (plaqueWidth + plaqueGap), width: plaqueWidth, color: 0xfcd34d },
      { label: 'WAVE', value: `${snapshot.wave}/${snapshot.maxWave}`, x: frameLeft + (plaqueWidth + plaqueGap) * 2, width: plaqueWidth, color: 0xc4b5fd },
      { label: 'SCORE', value: String(snapshot.score), x: frameLeft + (plaqueWidth + plaqueGap) * 3, width: plaqueWidth, color: 0xf5f5dc },
      { label: 'LEVEL', value: snapshot.levelName, x: frameRight - levelWidth, width: levelWidth, color: 0x81f5e1 },
    ]

    for (const item of items) {
      this.drawPlaque(this.hud, item.x, 24, item.width, 36, `${item.label} ${item.value}`, item.color)
    }
  }

  private showMainMenu(): void {
    this.audio.stopTheme()
    this.screen = 'mainMenu'
    this.clearScreenLayer()
    this.closeTowerMenu()
    this.closeTowerActionMenu()
    this.isPaused = false
    this.speedButton.visible = false
    this.pauseButton.visible = false

    const overlay = this.screenOverlay()
    const panel = new Container()
    panel.position.set((worldWidth - 360) / 2, (worldHeight - 430) / 2)
    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, 360, 430, 0x0b1113, 0x344247)
    panel.addChild(frame)

    const title = new Text({ text: 'LAVCRAFT', style: this.titleStyle(48, 0xf5f5dc) })
    title.anchor.set(0.5)
    title.position.set(180, 92)
    const subtitle = new Text({ text: 'DEFENSE', style: this.labelStyle(0x81f5e1, 20) })
    subtitle.anchor.set(0.5)
    subtitle.position.set(180, 132)
    panel.addChild(title, subtitle)
    panel.addChild(this.createMenuButton(94, 218, 172, 42, 'START', () => this.showLevelSelect()))
    panel.addChild(this.createMenuButton(94, 268, 172, 42, 'LEVELS', () => this.showLevelSelect()))
    // panel.addChild(this.createMenuButton(94, 302, 172, 42, 'SETTINGS', () => undefined))

    const note = new Text({ text: 'Six cursed routes. Twelve waves each.', style: this.smallStyle(0xb7bcae) })
    note.anchor.set(0.5)
    note.position.set(180, 370)
    panel.addChild(note)

    overlay.addChild(panel)
    this.screenLayer.addChild(overlay)
  }

  private showLevelSelect(): void {
    this.audio.stopTheme()
    this.screen = 'levelSelect'
    this.clearScreenLayer()
    this.isPaused = false
    this.speedButton.visible = false
    this.pauseButton.visible = false

    const overlay = this.screenOverlay()
    const title = new Text({ text: 'SELECT LEVEL', style: this.titleStyle(36, 0xf5f5dc) })
    title.anchor.set(0.5)
    title.position.set(worldWidth / 2, 82)
    overlay.addChild(title)

    const cardWidth = 232
    const cardGap = 38
    const levelGridWidth = cardWidth * 3 + cardGap * 2
    const levelGridX = (worldWidth - levelGridWidth) / 2
    levels.forEach((level, index) => {
      const column = index % 3
      const row = Math.floor(index / 3)
      overlay.addChild(this.createLevelCard(level, levelGridX + column * (cardWidth + cardGap), 148 + row * 172))
    })
    overlay.addChild(this.createMenuButton((worldWidth - 184) / 2, 554, 184, 42, 'MAIN MENU', () => this.showMainMenu()))
    this.screenLayer.addChild(overlay)
  }

  private startLevel(levelId: number): void {
    if (levelId > this.unlockedLevelId) {
      this.audio.playUi()
      return
    }

    this.audio.startTheme()
    this.selectedLevelId = levelId
    this.world.reset(levelId)
    this.clearScreenLayer()
    this.closeTowerMenu()
    this.closeTowerActionMenu()
    this.isPaused = false
    this.speedModeIndex = 0
    this.drawPauseButton()
    this.drawSpeedButton()
    this.speedButton.visible = true
    this.pauseButton.visible = true
    this.screen = 'playing'
  }

  private showEndScreen(status: Exclude<GameStatus, 'playing'>): void {
    if (this.screen === status) {
      return
    }

    this.screen = status
    this.isPaused = false
    this.speedButton.visible = false
    this.pauseButton.visible = false
    this.closeTowerMenu()
    this.closeTowerActionMenu()
    this.clearScreenLayer()

    const snapshot = this.world.snapshot()
    if (status === 'victory') {
      this.unlockNextLevel()
    }

    const overlay = new Container()
    const shade = new Graphics()
    shade.rect(0, 0, worldWidth, worldHeight).fill({ color: 0x030607, alpha: 0.58 })
    overlay.addChild(shade)

    const panel = new Container()
    panel.position.set((worldWidth - 408) / 2, 184)
    const accent = status === 'victory' ? 0x86efac : 0xfb7185
    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, 408, 282, 0x0a0f10, accent)
    panel.addChild(frame)

    const title = new Text({ text: status === 'victory' ? 'VICTORY' : 'DEFEAT', style: this.titleStyle(42, accent) })
    title.anchor.set(0.5)
    title.position.set(204, 56)
    const detail = new Text({
      text: status === 'victory' ? `Wave ${snapshot.maxWave} completed` : 'Your sanity has been lost',
      style: this.labelStyle(0xf5f5dc, 16),
    })
    detail.anchor.set(0.5)
    detail.position.set(204, 98)
    const stats = new Text({
      text: `Score ${snapshot.score}\nLevel ${snapshot.levelName}\nSanity ${snapshot.baseHp}`,
      style: this.smallStyle(0xd6d3c2),
    })
    stats.position.set(112, 128)
    panel.addChild(title, detail, stats)

    const primaryLabel = status === 'victory' ? 'NEXT LEVEL' : 'RETRY'
    const primaryAction = status === 'victory'
      ? () => this.startNextLevel()
      : () => this.startLevel(this.selectedLevelId)
    panel.addChild(this.createMenuButton(32, 190, 344, 38, primaryLabel, primaryAction))
    panel.addChild(this.createMenuButton(32, 238, 166, 34, 'LEVELS', () => this.showLevelSelect()))
    panel.addChild(this.createMenuButton(210, 238, 166, 34, 'MENU', () => this.showMainMenu()))

    overlay.addChild(panel)
    this.screenLayer.addChild(overlay)
  }

  private showPauseMenu(): void {
    if (this.isPaused) {
      return
    }

    this.isPaused = true
    this.isDrawing = false
    this.activePointerId = null
    this.drawing.clear()
    this.closeTowerMenu()
    this.closeTowerActionMenu()
    this.clearScreenLayer()

    const overlay = new Container()
    const shade = new Graphics()
    shade.rect(0, 0, worldWidth, worldHeight).fill({ color: 0x030607, alpha: 0.56 })
    overlay.addChild(shade)

    const panel = new Container()
    panel.position.set((worldWidth - 408) / 2, 218)
    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, 408, 220, 0x0a0f10, 0x81f5e1)
    panel.addChild(frame)

    const title = new Text({ text: 'PAUSED', style: this.titleStyle(40, 0xf5f5dc) })
    title.anchor.set(0.5)
    title.position.set(204, 58)
    panel.addChild(title)

    panel.addChild(this.createMenuButton(32, 104, 344, 40, 'RESUME', () => this.resumeGame()))
    panel.addChild(this.createMenuButton(32, 158, 166, 34, 'LEVELS', () => this.showLevelSelect()))
    panel.addChild(this.createMenuButton(210, 158, 166, 34, 'MENU', () => this.showMainMenu()))

    overlay.addChild(panel)
    this.screenLayer.addChild(overlay)
  }

  private resumeGame(): void {
    this.isPaused = false
    this.clearScreenLayer()
  }

  private startNextLevel(): void {
    const nextLevelId = this.selectedLevelId + 1
    if (nextLevelId <= this.unlockedLevelId && levels.some((level) => level.id === nextLevelId)) {
      this.startLevel(nextLevelId)
      return
    }

    this.showLevelSelect()
  }

  private unlockNextLevel(): void {
    const nextLevelId = this.selectedLevelId + 1
    if (levels.some((level) => level.id === nextLevelId)) {
      this.unlockedLevelId = Math.max(this.unlockedLevelId, nextLevelId)
    }
  }

  private createLevelCard(level: LevelConfig, x: number, y: number): Container {
    const locked = level.id > this.unlockedLevelId
    const card = new Container()
    card.position.set(x, y)
    card.eventMode = locked ? 'none' : 'static'
    card.cursor = locked ? 'default' : 'pointer'
    card.on('pointertap', () => {
      this.audio.playUi()
      this.startLevel(level.id)
    })

    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, 232, 132, locked ? 0x0f1112 : 0x0b1113, locked ? 0x4b5563 : level.accentColor)
    card.addChild(frame)

    const number = new Text({ text: `0${level.id}`, style: this.titleStyle(30, locked ? 0x6b7280 : level.accentColor) })
    number.position.set(18, 16)
    const name = new Text({ text: level.name, style: this.labelStyle(locked ? 0x8c948d : 0xf5f5dc, 17) })
    name.position.set(72, 24)
    const subtitle = new Text({ text: level.subtitle, style: this.smallStyle(locked ? 0x6b7280 : 0xb7bcae) })
    subtitle.position.set(20, 70)
    const waves = new Text({ text: `${level.maxWave} WAVES`, style: this.labelStyle(locked ? 0x6b7280 : level.accentColor, 13) })
    waves.position.set(20, 104)
    card.addChild(number, name, subtitle, waves)

    if (locked) {
      const lockOverlay = new Graphics()
      lockOverlay.roundRect(0, 0, 232, 132, 7).fill({ color: 0x030607, alpha: 0.84 })
      lockOverlay.circle(188, 98, 15).stroke({ color: 0x9ca3af, width: 2, alpha: 0.74 })
      lockOverlay.rect(177, 96, 22, 16).fill({ color: 0x111827, alpha: 0.92 }).stroke({ color: 0x9ca3af, width: 2, alpha: 0.78 })
      const lockedText = new Text({ text: 'LOCKED', style: this.labelStyle(0x9ca3af, 12) })
      lockedText.anchor.set(0.5)
      lockedText.position.set(116, 104)
      card.addChild(lockOverlay, lockedText)
    }

    return card
  }

  private screenOverlay(): Container {
    const overlay = new Container()
    const shade = new Graphics()
    shade.rect(0, 0, worldWidth, worldHeight).fill({ color: 0x05080a, alpha: 0.72 })
    overlay.addChild(shade)
    return overlay
  }

  private clearScreenLayer(): void {
    for (const child of this.screenLayer.removeChildren()) {
      child.destroy({ children: true })
    }
  }

  private createMenuButton(x: number, y: number, width: number, height: number, label: string, onTap: () => void): Container {
    const button = new Container()
    button.position.set(x, y)
    button.eventMode = 'static'
    button.cursor = 'pointer'
    button.on('pointertap', () => {
      this.audio.playUi()
      onTap()
    })

    const plate = new Graphics()
    plate.roundRect(0, 0, width, height, 6).fill(0x10181b).stroke({ color: 0x6ee7d8, width: 1, alpha: 0.62 })
    const text = new Text({ text: label, style: this.labelStyle(0xf5f5dc, 14) })
    text.anchor.set(0.5)
    text.position.set(width / 2, height / 2)
    button.addChild(plate, text)
    return button
  }

  private onCanvasPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    this.lastPointerEventAt = performance.now()
    const point = this.toWorldFromEvent(event)
    this.handleInputDown(point, event.pointerId)
    if (this.isDrawing && this.activePointerId === event.pointerId) {
      this.app.canvas.setPointerCapture(event.pointerId)
    }
  }

  private onCanvasPointerMove = (event: PointerEvent): void => {
    this.lastPointerEventAt = performance.now()
    this.handleInputMove(event.pointerId, this.toWorldFromEvent(event), event)
  }

  private onCanvasPointerUp = (event: PointerEvent): void => {
    this.lastPointerEventAt = performance.now()
    this.handleInputUp(event.pointerId, event)
  }

  private onCanvasMouseDown = (event: MouseEvent): void => {
    if (performance.now() - this.lastPointerEventAt < 80 || event.button !== 0) {
      return
    }

    event.preventDefault()
    this.handleInputDown(this.toWorldFromEvent(event), -1)
  }

  private onCanvasMouseMove = (event: MouseEvent): void => {
    if (performance.now() - this.lastPointerEventAt < 80) {
      return
    }

    this.handleInputMove(-1, this.toWorldFromEvent(event), event)
  }

  private onCanvasMouseUp = (event: MouseEvent): void => {
    if (performance.now() - this.lastPointerEventAt < 80) {
      return
    }

    this.handleInputUp(-1, event)
  }

  private onCanvasClick = (event: MouseEvent): void => {
    if (performance.now() - this.lastPointerEventAt < 120) {
      return
    }

    event.preventDefault()
    this.handleInputDown(this.toWorldFromEvent(event), -2)
  }

  private handleInputDown(point: Vec2, _pointerId: number): void {
    if (this.screen !== 'playing') {
      return
    }

    if (this.isPaused) {
      return
    }

    if (this.pauseButtonAt(point)) {
      this.audio.playUi()
      this.showPauseMenu()
      return
    }

    if (this.speedButtonAt(point)) {
      this.audio.playUi()
      this.cycleGameSpeed()
      return
    }

    const towerAction = this.towerActionAt(point)
    if (towerAction && this.activeTowerActionTowerId) {
      this.audio.playUi()
      if (towerAction === 'upgrade') {
        this.world.upgradeTower(this.activeTowerActionTowerId)
      } else {
        this.world.removeTower(this.activeTowerActionTowerId)
      }
      this.closeTowerActionMenu()
      return
    }

    const menuOption = this.towerMenuOptionAt(point)
    if (menuOption && this.activeTowerMenuSlotId) {
      this.audio.playUi()
      if (this.world.buildTower(this.activeTowerMenuSlotId, menuOption)) {
        this.closeTowerMenu()
      }
      return
    }

    const snapshot = this.world.snapshot()
    const slot = snapshot.towerSlots.find((candidate) => distance(candidate.position, point) < 28)
    if (slot) {
      this.audio.playUi()
      if (slot.occupiedBy) {
        this.openTowerActionMenu(slot)
      } else {
        this.openTowerMenu(slot)
      }
      return
    }

    this.closeTowerMenu()
    this.closeTowerActionMenu()

    // if (pointInRect(point, ritualRect)) {
    //   this.audio.playUi()
    //   this.isDrawing = true
    //   this.activePointerId = _pointerId
    //   this.drawingPoints = [point]
    //   this.drawing.clear().moveTo(point.x, point.y)
    // }
  }

  private handleInputMove(pointerId: number, point: Vec2, event: Event): void {
    if (!this.isDrawing || pointerId !== this.activePointerId) {
      return
    }

    event.preventDefault()
    this.drawingPoints.push(point)
    this.drawing.lineTo(point.x, point.y).stroke({ color: 0x9dfcf4, width: 5, alpha: 0.85 })
  }

  private handleInputUp(pointerId: number, event: Event): void {
    if (!this.isDrawing || pointerId !== this.activePointerId) {
      return
    }

    event.preventDefault()
    const sign = this.recognizer.recognize(this.drawingPoints)
    if (sign) {
      this.world.castSign(sign.kind, this.drawingPoints)
    }
    this.isDrawing = false
    this.activePointerId = null
    window.setTimeout(() => this.drawing.clear(), 180)
  }

  private openTowerMenu(slot: TowerSlot): void {
    if (this.activeTowerMenuSlotId === slot.id) {
      return
    }

    this.closeTowerActionMenu()
    this.closeTowerMenu()
    this.activeTowerMenuSlotId = slot.id

    const ring = new Graphics()
    ring
      .circle(slot.position.x, slot.position.y, 34)
      .stroke({ color: 0x81f5e1, width: 2, alpha: 0.9 })
      .circle(slot.position.x, slot.position.y, 43)
      .stroke({ color: 0x81f5e1, width: 1, alpha: 0.28 })
    this.towerMenu.addChild(ring)

    const options: Array<{ kind: TowerKind, angle: number }> = [
      { kind: 'lantern', angle: -Math.PI * 0.75 },
      { kind: 'idol', angle: -Math.PI / 2 },
      { kind: 'obelisk', angle: -Math.PI * 0.25 },
    ]

    for (const option of options) {
      const color = this.towerColor(option.kind)
      const center = vec(
        slot.position.x + Math.cos(option.angle) * towerMenuRadius,
        slot.position.y + Math.sin(option.angle) * towerMenuRadius,
      )
      this.towerMenuOptions.push({ kind: option.kind, center, width: towerMenuOptionWidth, height: towerMenuOptionHeight })

      const optionGroup = new Container()
      optionGroup.position.set(center.x, center.y)
      optionGroup.eventMode = 'static'
      optionGroup.cursor = 'pointer'

      const plate = new Graphics()
      this.drawPanel(plate, -towerMenuOptionWidth / 2, -towerMenuOptionHeight / 2, towerMenuOptionWidth, towerMenuOptionHeight, 0x10181b, color)
      const icon = new Graphics()
      this.drawTowerIcon(icon, option.kind, 0, -10, 24)
      const text = new Text({ text: String(this.world.getTowerCost(option.kind)), style: this.smallStyle(0xf5f5dc) })
      text.anchor.set(0.5)
      text.position.set(0, 20)

      optionGroup.addChild(plate, icon, text)
      this.towerMenu.addChild(optionGroup)
    }
  }

  private closeTowerMenu(): void {
    for (const child of this.towerMenu.removeChildren()) {
      child.destroy({ children: true })
    }
    this.activeTowerMenuSlotId = null
    this.towerMenuOptions = []
  }

  private towerMenuOptionAt(point: Vec2): TowerKind | null {
    for (const option of this.towerMenuOptions) {
      const isInsideX = Math.abs(point.x - option.center.x) <= option.width / 2
      const isInsideY = Math.abs(point.y - option.center.y) <= option.height / 2
      if (isInsideX && isInsideY) {
        return option.kind
      }
    }
    return null
  }

  private openTowerActionMenu(slot: TowerSlot): void {
    const tower = this.world.snapshot().towers.find((candidate) => candidate.id === slot.occupiedBy)
    if (!tower) {
      return
    }

    this.closeTowerMenu()
    this.closeTowerActionMenu()
    this.activeTowerActionTowerId = tower.id

    const x = Math.min(slot.position.x + 36, playRect.x + playRect.width - 166)
    const y = Math.max(playRect.y + 22, slot.position.y - 60)
    const panel = new Container()
    panel.position.set(x, y)

    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, 154, 126, 0x0b1113, this.towerColor(tower.kind))
    panel.addChild(frame)

    const title = new Text({ text: `${tower.kind.toUpperCase()} L${tower.level}`, style: this.labelStyle(0xf5f5dc, 13) })
    title.position.set(12, 10)
    panel.addChild(title)

    const upgradeCost = this.world.getTowerUpgradeCost(tower.id)
    if (upgradeCost !== null) {
      panel.addChild(this.createActionButton(12, 38, 130, 32, `UP ${upgradeCost}`, 'upgrade'))
      this.towerActionOptions.push({ action: 'upgrade', center: vec(x + 77, y + 54), width: 130, height: 32 })
    } else {
      const max = new Text({ text: 'MAX LEVEL', style: this.smallStyle(0xa7f3d0) })
      max.position.set(12, 46)
      panel.addChild(max)
    }

    const refund = this.world.getTowerRefund(tower.id)
    panel.addChild(this.createActionButton(12, 82, 130, 32, `SELL ${refund}`, 'sell'))
    this.towerActionOptions.push({ action: 'sell', center: vec(x + 77, y + 98), width: 130, height: 32 })
    this.towerActionMenu.addChild(panel)
  }

  private createActionButton(x: number, y: number, width: number, height: number, label: string, action: TowerAction): Container {
    const button = new Container()
    button.position.set(x, y)
    button.eventMode = 'static'
    button.cursor = 'pointer'
    const plate = new Graphics()
    plate.roundRect(0, 0, width, height, 5).fill(0x111a1d).stroke({ color: action === 'upgrade' ? 0xa7f3d0 : 0xfb7185, width: 1, alpha: 0.72 })
    const text = new Text({ text: label, style: this.labelStyle(0xf5f5dc, 12) })
    text.anchor.set(0.5)
    text.position.set(width / 2, height / 2)
    button.addChild(plate, text)
    return button
  }

  private closeTowerActionMenu(): void {
    for (const child of this.towerActionMenu.removeChildren()) {
      child.destroy({ children: true })
    }
    this.activeTowerActionTowerId = null
    this.towerActionOptions = []
  }

  private towerActionAt(point: Vec2): TowerAction | null {
    for (const option of this.towerActionOptions) {
      const isInsideX = Math.abs(point.x - option.center.x) <= option.width / 2
      const isInsideY = Math.abs(point.y - option.center.y) <= option.height / 2
      if (isInsideX && isInsideY) {
        return option.action
      }
    }
    return null
  }

  private drawPauseButton(): void {
    for (const child of this.pauseButton.removeChildren()) {
      child.destroy({ children: true })
    }

    const x = worldWidth - speedButtonPadding - speedButtonSize * 2 - 10
    const y = worldHeight - speedButtonPadding - speedButtonSize
    this.pauseButton.position.set(x, y)
    this.pauseButton.eventMode = 'static'
    this.pauseButton.cursor = 'pointer'

    const plate = new Graphics()
    this.drawPanel(plate, 0, 0, speedButtonSize, speedButtonSize, 0x10181b, 0x81f5e1)
    const icon = new Graphics()
    icon
      .roundRect(14, 12, 5, 18, 2)
      .fill({ color: 0xf5f5dc, alpha: 0.95 })
      .roundRect(23, 12, 5, 18, 2)
      .fill({ color: 0xf5f5dc, alpha: 0.95 })
    this.pauseButton.addChild(plate, icon)
  }

  private pauseButtonAt(point: Vec2): boolean {
    const left = worldWidth - speedButtonPadding - speedButtonSize * 2 - 10
    const top = worldHeight - speedButtonPadding - speedButtonSize
    return point.x >= left && point.x <= left + speedButtonSize && point.y >= top && point.y <= top + speedButtonSize
  }

  private drawSpeedButton(): void {
    for (const child of this.speedButton.removeChildren()) {
      child.destroy({ children: true })
    }

    const x = worldWidth - speedButtonPadding - speedButtonSize
    const y = worldHeight - speedButtonPadding - speedButtonSize
    this.speedButton.position.set(x, y)
    this.speedButton.eventMode = 'static'
    this.speedButton.cursor = 'pointer'

    const plate = new Graphics()
    this.drawPanel(plate, 0, 0, speedButtonSize, speedButtonSize, 0x10181b, 0x81f5e1)
    const icon = new Graphics()
    this.drawSpeedChevrons(icon, this.speedModes[this.speedModeIndex], speedButtonSize / 2, speedButtonSize / 2)
    this.speedButton.addChild(plate, icon)
  }

  private cycleGameSpeed(): void {
    this.speedModeIndex = (this.speedModeIndex + 1) % this.speedModes.length
    this.drawSpeedButton()
  }

  private speedButtonAt(point: Vec2): boolean {
    const left = worldWidth - speedButtonPadding - speedButtonSize
    const top = worldHeight - speedButtonPadding - speedButtonSize
    return point.x >= left && point.x <= left + speedButtonSize && point.y >= top && point.y <= top + speedButtonSize
  }

  private drawSpeedChevrons(graphics: Graphics, count: number, x: number, y: number): void {
    const spacing = 6
    const width = 6
    const height = 12
    const startX = x - ((count - 1) * spacing + width) / 2

    for (let index = 0; index < count; index += 1) {
      const chevronX = startX + index * spacing
      graphics
        .moveTo(chevronX - width / 2, y - height / 2)
        .lineTo(chevronX + width / 2, y)
        .lineTo(chevronX - width / 2, y + height / 2)
        .stroke({ color: 0xf5f5dc, width: 2, alpha: 0.95, cap: 'round', join: 'round' })
    }
  }

  private drawTowerIcon(graphics: Graphics, kind: TowerKind, x: number, y: number, size: number): void {
    const color = this.towerColor(kind)
    const half = size / 2
    const glow = half + 7

    graphics.circle(x, y + 4, glow).fill({ color, alpha: 0.1 })
    graphics.rect(x - half * 0.5, y + half * 0.2, half, half * 0.9).fill(0x080d0f).stroke({ color, width: 1, alpha: 0.8 })

    if (kind === 'lantern') {
      graphics.rect(x - half * 0.52, y - half * 0.35, half * 1.04, half * 1.25).fill(0x0c1517).stroke({ color, width: 2, alpha: 0.82 })
      graphics.circle(x, y - half * 0.18, half * 0.42).fill({ color, alpha: 0.9 })
      graphics.circle(x, y - half * 0.18, half * 0.72).stroke({ color: 0xfef3c7, width: 2, alpha: 0.4 })
      graphics.moveTo(x, y - half * 0.9).lineTo(x, y - half * 1.35).stroke({ color, width: 2, alpha: 0.85 })
      return
    }

    if (kind === 'obelisk') {
      graphics
        .poly([x, y - half * 1.45, x + half * 0.65, y - half * 0.55, x + half * 0.55, y + half, x - half * 0.55, y + half, x - half * 0.65, y - half * 0.55], true)
        .fill(0x111022)
        .stroke({ color, width: 2, alpha: 0.9 })
      graphics.circle(x, y - half * 0.46, half * 0.28).fill({ color, alpha: 0.9 })
      return
    }

    graphics
      .poly([x, y - half * 1.28, x + half * 0.95, y + half, x - half * 0.95, y + half], true)
      .fill(0x0a1a18)
      .stroke({ color, width: 2, alpha: 0.9 })
    graphics.circle(x, y - half * 0.08, half * 0.32).fill({ color, alpha: 0.86 })
  }

  private towerColor(kind: TowerKind): number {
    if (kind === 'lantern') {
      return 0xfcd34d
    }
    if (kind === 'obelisk') {
      return 0xc4b5fd
    }
    return 0x5eead4
  }

  private drawPanel(graphics: Graphics, x: number, y: number, width: number, height: number, fill: number, stroke: number): void {
    graphics.roundRect(x, y, width, height, 7).fill({ color: fill, alpha: 0.94 }).stroke({ color: stroke, width: 2, alpha: 0.58 })
    graphics.rect(x + 6, y + 6, width - 12, height - 12).stroke({ color: 0xf5f5dc, width: 1, alpha: 0.12 })
    graphics.circle(x + 8, y + 8, 2).fill({ color: stroke, alpha: 0.6 })
    graphics.circle(x + width - 8, y + 8, 2).fill({ color: stroke, alpha: 0.6 })
    graphics.circle(x + 8, y + height - 8, 2).fill({ color: stroke, alpha: 0.6 })
    graphics.circle(x + width - 8, y + height - 8, 2).fill({ color: stroke, alpha: 0.6 })
  }

  private drawPlaque(graphics: Graphics, x: number, y: number, width: number, height: number, label: string, color: number): void {
    graphics.roundRect(x, y, width, height, 5).fill({ color: 0x0d1416, alpha: 0.96 }).stroke({ color, width: 1, alpha: 0.5 })
    graphics.circle(x + 17, y + height / 2, 8).stroke({ color, width: 2, alpha: 0.75 })
    const text = new Text({ text: label, style: this.labelStyle(0xf5f5dc, 13) })
    text.position.set(x + 32, y + 10)
    this.hudText.addChild(text)
  }

  // private drawRuneFrame(graphics: Graphics, x: number, y: number, width: number, height: number): void {
  //   graphics.rect(x, y, width, height).fill({ color: 0x050a0b, alpha: 0.92 }).stroke({ color: 0x425254, width: 2, alpha: 0.72 })
  //   graphics.rect(x + 8, y + 8, width - 16, height - 16).stroke({ color: 0xa7f3d0, width: 1, alpha: 0.16 })
  // }
  //
  // private drawIconButton(graphics: Graphics, x: number, y: number, width: number, height: number, active: boolean): void {
  //   graphics.roundRect(x, y, width, height, 4).fill({ color: active ? 0x12352f : 0x11181a, alpha: 0.95 }).stroke({ color: active ? 0x7fffd4 : 0x3f4d50, width: 1, alpha: 0.72 })
  // }

  private titleStyle(fontSize: number, color: number): TextStyle {
    return new TextStyle({
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize,
      fill: color,
      fontWeight: 'bold',
      letterSpacing: 0,
    })
  }

  private labelStyle(color: number, fontSize: number): TextStyle {
    return new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize,
      fill: color,
      fontWeight: 'bold',
      letterSpacing: 0,
    })
  }

  private toWorldFromEvent(event: MouseEvent | PointerEvent): Vec2 {
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return this.toWorldFromClient(event.clientX, event.clientY)
    }

    return this.toWorldFromCanvasPoint(event.offsetX, event.offsetY)
  }

  private toWorldFromClient(clientX: number, clientY: number): Vec2 {
    const bounds = this.app.canvas.getBoundingClientRect()
    const canvasX = clientX - bounds.left
    const canvasY = clientY - bounds.top
    return this.toWorldFromCanvasPoint(canvasX, canvasY)
  }

  private toWorldFromCanvasPoint(canvasX: number, canvasY: number): Vec2 {
    return vec((canvasX - this.offset.x) / this.scale, (canvasY - this.offset.y) / this.scale)
  }

  private resize = (): void => {
    this.scale = Math.min(this.app.screen.width / worldWidth, this.app.screen.height / worldHeight)
    this.offset = vec((this.app.screen.width - worldWidth * this.scale) / 2, (this.app.screen.height - worldHeight * this.scale) / 2)
    this.root.scale.set(this.scale)
    this.root.position.set(this.offset.x, this.offset.y)
  }

  private smallStyle(color: number): TextStyle {
    return new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 14,
      fill: color,
      letterSpacing: 0,
    })
  }
}
