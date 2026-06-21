import {
  Application,
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Graphics,
  NoiseFilter,
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
import type { GameFxEvent, GameSnapshot, GameSoundEvent, GameStatus, LevelConfig, MonsterInfo, TowerInfo, TowerKind, TowerSlot } from '../domain/game'
import { GameWorld, levels, monsterCatalog, towerCatalog } from '../domain/game'
import type { Vec2 } from '../domain/geometry'
import { distance, vec } from '../domain/geometry'
import type { Locale } from '../i18n'
import { getLocale, locales, localeNames, onLocaleChange, setLocale, t } from '../i18n'
import type { TutorialAnchor, TutorialRect } from './tutorial'
import { TutorialController } from './tutorial'

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

type ScreenState = 'mainMenu' | 'levelSelect' | 'ready' | 'playing' | 'victory' | 'defeat' | 'help'
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

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: number
  gravity: number
  drag: number
  glow: boolean
}

// Расширяющееся кольцо: попадания, взрывы, смерти, касты рун.
type Ring = {
  x: number
  y: number
  radius: number
  maxRadius: number
  life: number
  maxLife: number
  color: number
  width: number
}

const maxParticles = 420
const maxRings = 80

const signFxColor: Record<'banish' | 'elder' | 'spiral', number> = {
  banish: 0x9dfcf4,
  elder: 0xffd783,
  spiral: 0xd3b8ff,
}

export class PixiGame {
  private readonly app = new Application()
  private readonly world = new GameWorld()
  private readonly recognizer = new SignRecognizer()
  private readonly audio = new AudioMixer()
  private readonly root = new Container()
  private readonly board = new Graphics()
  private readonly fog = new Graphics()
  private readonly entities = new Graphics()
  private readonly glow = new Graphics()
  private readonly vignette = new Graphics()
  private readonly grain = new Graphics()
  private readonly flash = new Graphics()
  private readonly grainFilter = new NoiseFilter({ noise: 0.55 })
  private particles: Particle[] = []
  private rings: Ring[] = []
  private shakeMag = 0
  private signFlashTime = 0
  private signFlashColor = 0xffffff
  private readonly towerMenu = new Container()
  private readonly towerActionMenu = new Container()
  private readonly speedButton = new Container()
  private readonly pauseButton = new Container()
  private readonly drawing = new Graphics()
  private readonly hud = new Graphics()
  private readonly hudText = new Container()
  private readonly hint = new Text({ text: '', style: this.smallStyle(0xa7f3d0) })
  private readonly screenLayer = new Container()
  private readonly settingsButton = new Container()
  private readonly settingsLayer = new Container()
  private isSettingsOpen = false
  private readonly tutorialLayer = new Container()
  private tutorial: TutorialController | null = null
  private helpFromPause = false
  private animTime = 0
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
      background: '#101517',
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
      this.fog,
      this.entities,
      this.glow,
      this.vignette,
      this.grain,
      this.flash,
      this.towerMenu,
      this.towerActionMenu,
      this.drawing,
      this.hud,
      this.hudText,
      this.hint,
      this.pauseButton,
      this.speedButton,
      this.screenLayer,
      this.settingsButton,
      this.settingsLayer,
      this.tutorialLayer,
    )
    this.setupFilters()
    this.drawPauseButton()
    this.drawSpeedButton()
    this.drawSettingsButton()
    this.tutorial = new TutorialController({
      layer: this.tutorialLayer,
      worldWidth,
      worldHeight,
      accent: 0x81f5e1,
      t: (key) => t(key),
      anchorOf: (anchor) => this.tutorialAnchor(anchor),
      onFinish: () => this.completeTutorial(),
      playClick: () => this.audio.playUi(),
    })
    onLocaleChange(() => this.onLocaleChanged())
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
    window.addEventListener('keydown', this.onKeyDown)
    this.app.renderer.on('resize', this.resize)
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS / 1000))
  }

  private tick(deltaSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.05)
    this.animTime += dt
    if (this.screen === 'playing' && !this.isPaused) {
      const speed = this.speedModes[this.speedModeIndex]
      this.world.update(Math.min(deltaSeconds * speed, 0.05 * speed))
      this.playWorldSounds()
      this.consumeFxEvents()
      this.spawnProjectileTrails()
      const status = this.world.snapshot().status
      if (status === 'victory' || status === 'defeat') {
        this.showEndScreen(status)
      }
    }
    this.updateParticles(dt)
    this.updateRings(dt)
    this.shakeMag = Math.max(0, this.shakeMag - dt * 42)
    this.signFlashTime = Math.max(0, this.signFlashTime - dt)
    this.render()
    this.tutorial?.render(this.animTime)
    this.applyShake()
  }

  private playWorldSounds(): void {
    for (const event of this.world.consumeSoundEvents()) {
      this.audio.playWorldEvent(event)
    }
  }

  private render(): void {
    const snapshot = this.world.snapshot()
    this.board.clear()
    this.fog.clear()
    this.entities.clear()
    this.glow.clear()
    this.vignette.clear()
    this.grain.clear()
    this.flash.clear()
    this.hud.clear()
    this.hudText.removeChildren().forEach((child) => child.destroy())

    this.drawFog()

    if (this.screen === 'mainMenu' || this.screen === 'help') {
      this.drawMenuBackground()
    } else {
      this.drawBackground()
    }

    if (this.screen === 'ready' || this.screen === 'playing' || this.screen === 'victory' || this.screen === 'defeat') {
      this.drawPath(snapshot.path)
      this.drawTowerSlots()
      this.drawTowers()
      this.drawMonsters()
      this.drawProjectiles()
      if (this.screen === 'playing') {
        this.drawFloatingTexts()
      } else {
        this.clearFloatingTextNodes()
      }
      // this.drawRitualField()
      this.drawHud()
    } else {
      this.clearFloatingTextNodes()
      this.hint.text = ''
    }

    this.drawParticles()
    this.drawRings()
    this.drawGlow(snapshot)
    this.drawVignette(snapshot.baseHp)
    this.drawGrain()
    this.drawFlash()
  }

  private setupFilters(): void {
    this.glow.filters = [new BlurFilter({ strength: 12, quality: 3 })]
    this.glow.blendMode = 'add'
    this.fog.filters = [new BlurFilter({ strength: 22, quality: 2 })]
    this.fog.blendMode = 'screen'
    this.grain.filters = [this.grainFilter]
    this.grain.blendMode = 'add'
    this.grain.alpha = 0.05

    // Лёгкий цветокор всей сцены: чуть насыщеннее и контрастнее — "плёночная" глубина.
    const cm = new ColorMatrixFilter()
    cm.saturate(0.16, true)
    cm.contrast(0.08, true)
    cm.brightness(1.02, true)
    this.root.filters = [cm]
  }

  // === Частицы =============================================================

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    options: { speed: number, life: number, size: number, color: number, gravity?: number, drag?: number, glow?: boolean },
  ): void {
    for (let index = 0; index < count; index += 1) {
      if (this.particles.length >= maxParticles) {
        this.particles.shift()
      }
      const angle = Math.random() * Math.PI * 2
      const velocity = options.speed * (0.35 + Math.random() * 0.65)
      const life = options.life * (0.6 + Math.random() * 0.5)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        maxLife: life,
        size: options.size * (0.7 + Math.random() * 0.6),
        color: options.color,
        gravity: options.gravity ?? 0,
        drag: options.drag ?? 2.2,
        glow: options.glow ?? true,
      })
    }
  }

  private updateParticles(dt: number): void {
    const survivors: Particle[] = []
    for (const particle of this.particles) {
      particle.life -= dt
      if (particle.life <= 0) {
        continue
      }
      const damp = Math.max(0, 1 - particle.drag * dt)
      particle.vx *= damp
      particle.vy = particle.vy * damp + particle.gravity * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      survivors.push(particle)
    }
    this.particles = survivors
  }

  private drawParticles(): void {
    for (const particle of this.particles) {
      const fade = Math.max(0, particle.life / particle.maxLife)
      const radius = Math.max(0.5, particle.size * fade)
      this.entities.circle(particle.x, particle.y, radius).fill({ color: particle.color, alpha: 0.35 + fade * 0.6 })
    }
  }

  // Bloom: мягкие размытые круги под яркими объектами + светящимися частицами.
  private drawGlow(snapshot: GameSnapshot): void {
    for (const particle of this.particles) {
      if (!particle.glow) {
        continue
      }
      const fade = Math.max(0, particle.life / particle.maxLife)
      this.glow.circle(particle.x, particle.y, particle.size * (1.6 + fade * 2)).fill({ color: particle.color, alpha: 0.12 * fade })
    }

    for (const projectile of snapshot.projectiles) {
      const color = projectile.splashRadius > 0 ? 0xfca5a5 : 0x9dfcf4
      this.glow.circle(projectile.position.x, projectile.position.y, 14).fill({ color, alpha: 0.22 })
    }

    for (const tower of snapshot.towers) {
      this.glow.circle(tower.position.x, tower.position.y, 18 + tower.level * 3).fill({ color: this.towerColor(tower.kind), alpha: 0.1 })
    }

    if (snapshot.path.length > 0) {
      const base = snapshot.path[snapshot.path.length - 1]
      const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 2.2)
      this.glow.circle(base.x, base.y, 40 + pulse * 10).fill({ color: 0x7f1d1d, alpha: 0.16 + pulse * 0.08 })
    }
  }

  // Короткоживущая частица-шлейф в позиции каждого летящего снаряда.
  private spawnProjectileTrails(): void {
    for (const projectile of this.world.snapshot().projectiles) {
      if (this.particles.length >= maxParticles) {
        break
      }
      const smoke = projectile.splashRadius > 0
      this.particles.push({
        x: projectile.position.x,
        y: projectile.position.y,
        vx: (Math.random() * 2 - 1) * 12,
        vy: (Math.random() * 2 - 1) * 12,
        life: smoke ? 0.4 : 0.22,
        maxLife: smoke ? 0.4 : 0.22,
        size: smoke ? 3.2 : 2,
        color: smoke ? 0x6b7280 : 0xfde68a,
        gravity: smoke ? -14 : 0,
        drag: 3,
        glow: !smoke,
      })
    }
  }

  // === Кольца (расширяющиеся ударные волны) ================================

  private spawnRing(x: number, y: number, maxRadius: number, life: number, color: number, width: number): void {
    if (this.rings.length >= maxRings) {
      this.rings.shift()
    }
    this.rings.push({ x, y, radius: maxRadius * 0.15, maxRadius, life, maxLife: life, color, width })
  }

  private updateRings(dt: number): void {
    const survivors: Ring[] = []
    for (const ring of this.rings) {
      ring.life -= dt
      if (ring.life <= 0) {
        continue
      }
      const progress = 1 - ring.life / ring.maxLife
      ring.radius = ring.maxRadius * (0.15 + 0.85 * progress)
      survivors.push(ring)
    }
    this.rings = survivors
  }

  private drawRings(): void {
    for (const ring of this.rings) {
      const fade = Math.max(0, ring.life / ring.maxLife)
      this.entities.circle(ring.x, ring.y, ring.radius).stroke({ color: ring.color, width: ring.width * fade + 0.5, alpha: 0.5 * fade })
      this.glow.circle(ring.x, ring.y, ring.radius).stroke({ color: ring.color, width: ring.width * fade + 1, alpha: 0.18 * fade })
    }
  }

  // === Тряска экрана =======================================================

  private addShake(magnitude: number): void {
    this.shakeMag = Math.min(16, this.shakeMag + magnitude)
  }

  private applyShake(): void {
    if (this.shakeMag <= 0.05) {
      this.root.position.set(this.offset.x, this.offset.y)
      return
    }
    const dx = (Math.random() * 2 - 1) * this.shakeMag
    const dy = (Math.random() * 2 - 1) * this.shakeMag
    this.root.position.set(this.offset.x + dx, this.offset.y + dy)
  }

  // === Виньетка / зерно / вспышка ==========================================

  // Виньетка темнит края и краснеет по мере падения рассудка — "безумие наступает".
  private drawVignette(baseHp: number): void {
    const sanity = Math.max(0, Math.min(1, baseHp / 20))
    const dread = 1 - sanity
    const edgeAlpha = 0.5 + dread * 0.32
    const color = this.mixColor(0x000000, 0x3a0608, dread)
    const steps = 9
    const maxInset = 110
    const stepWidth = maxInset / steps + 2
    for (let index = 0; index < steps; index += 1) {
      const t = index / (steps - 1)
      const inset = t * maxInset
      const alpha = (1 - t) * (1 - t) * edgeAlpha
      this.vignette
        .rect(inset, inset, worldWidth - inset * 2, worldHeight - inset * 2)
        .stroke({ color, width: stepWidth, alpha })
    }
  }

  private drawGrain(): void {
    this.grainFilter.seed = Math.random()
    this.grain.rect(0, 0, worldWidth, worldHeight).fill({ color: 0x8a8f8c, alpha: 0.5 })
  }

  private drawFlash(): void {
    if (this.signFlashTime <= 0) {
      return
    }
    const intensity = this.signFlashTime / 0.45
    this.flash.rect(0, 0, worldWidth, worldHeight).fill({ color: this.signFlashColor, alpha: 0.28 * intensity })
  }

  private consumeFxEvents(): void {
    for (const event of this.world.consumeFxEvents()) {
      this.applyFxEvent(event)
    }
  }

  private applyFxEvent(event: GameFxEvent): void {
    const { x, y } = event.position
    switch (event.kind) {
      case 'muzzle':
        this.spawnBurst(x, y, 5, { speed: 90, life: 0.22, size: 2.4, color: this.towerColor(event.towerKind), drag: 4 })
        break
      case 'hit':
        this.spawnBurst(x, y, 7, { speed: 130, life: 0.3, size: 2.2, color: 0xfde68a, drag: 3 })
        this.spawnRing(x, y, 22, 0.3, 0xfde68a, 2)
        break
      case 'death': {
        const color = event.monsterKind === 'shoggoth' ? 0xf0abfc : event.monsterKind === 'deepOne' ? 0x67e8f9 : 0x86efac
        const count = event.monsterKind === 'shoggoth' ? 28 : 16
        this.spawnBurst(x, y, count, { speed: 150, life: 0.55, size: 3, color, drag: 2.4 })
        // чернильное пятно — тёмные тяжёлые брызги
        this.spawnBurst(x, y, Math.round(count / 2), { speed: 70, life: 0.8, size: 4.5, color: 0x0a0510, gravity: 60, drag: 1.4, glow: false })
        this.spawnRing(x, y, event.monsterKind === 'shoggoth' ? 56 : 34, 0.45, color, 3)
        if (event.monsterKind === 'shoggoth') {
          this.addShake(5)
        }
        break
      }
      case 'explosion':
        this.spawnBurst(x, y, 24, { speed: event.radius * 3, life: 0.5, size: 3.4, color: 0xfca5a5, drag: 2.6 })
        this.spawnBurst(x, y, 10, { speed: event.radius * 1.6, life: 0.7, size: 2.2, color: 0xfff1f2, drag: 2 })
        this.spawnRing(x, y, event.radius, 0.45, 0xfca5a5, 4)
        this.addShake(Math.min(11, event.radius / 7))
        break
      case 'sanityLost':
        this.spawnBurst(x, y, 14, { speed: 120, life: 0.5, size: 3, color: 0xff8e8e, drag: 2.4 })
        this.spawnRing(x, y, 48, 0.5, 0xff8e8e, 3)
        this.signFlashTime = 0.45
        this.signFlashColor = 0x7f1d1d
        this.addShake(7)
        break
      case 'sign':
        this.signFlashColor = signFxColor[event.signKind]
        this.signFlashTime = 0.45
        this.spawnBurst(x, y, 18, { speed: 170, life: 0.5, size: 3, color: signFxColor[event.signKind], drag: 2.2 })
        this.spawnRing(x, y, 90, 0.6, signFxColor[event.signKind], 3)
        this.addShake(4)
        break
    }
  }

  // Deep-water vertical gradient approximated with stacked translucent bands.
  private drawDeepGradient(top: number, bottom: number): void {
    const bands = 14
    const height = worldHeight / bands
    for (let index = 0; index < bands; index += 1) {
      const tBand = index / (bands - 1)
      const color = this.mixColor(top, bottom, tBand)
      this.board.rect(0, index * height, worldWidth, height + 1).fill(color)
    }
  }

  private mixColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff
    const ag = (a >> 8) & 0xff
    const ab = a & 0xff
    const br = (b >> 16) & 0xff
    const bg = (b >> 8) & 0xff
    const bb = b & 0xff
    const r = Math.round(ar + (br - ar) * t)
    const g = Math.round(ag + (bg - ag) * t)
    const bl = Math.round(ab + (bb - ab) * t)
    return (r << 16) | (g << 8) | bl
  }

  // Pseudo-random but stable star field (no Math.random — deterministic per index).
  private drawStarfield(maxY: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const x = ((index * 197) % worldWidth)
      const y = ((index * 89) % Math.round(maxY))
      const twinkle = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(this.animTime * 1.4 + index))
      const radius = index % 7 === 0 ? 1.8 : 1
      this.board.circle(x, y, radius).fill({ color: 0xcfe9e4, alpha: twinkle })
    }
  }

  // Живой параллакс-туман: три слоя клубов дрейфуют с разной скоростью.
  // Рисуется в отдельный слой с сильным blur и blend 'screen' — мягкая дымка.
  private drawFog(): void {
    const layers = [
      { count: 5, speed: 14, radiusX: 200, radiusY: 86, alpha: 0.05, color: 0x1c4a52, y0: 150 },
      { count: 6, speed: 26, radiusX: 150, radiusY: 64, alpha: 0.06, color: 0x274e54, y0: 320 },
      { count: 7, speed: 40, radiusX: 110, radiusY: 50, alpha: 0.05, color: 0x356b6f, y0: 470 },
    ]
    for (let layer = 0; layer < layers.length; layer += 1) {
      const { count, speed, radiusX, radiusY, alpha, color, y0 } = layers[layer]
      const spacing = (worldWidth + radiusX * 2) / count
      for (let index = 0; index < count; index += 1) {
        const drift = (this.animTime * speed + index * spacing) % (worldWidth + radiusX * 2)
        const x = drift - radiusX
        const bob = Math.sin(this.animTime * 0.5 + index + layer) * 24
        const y = y0 + bob + (index % 2) * 70
        this.fog.ellipse(x, y, radiusX, radiusY).fill({ color, alpha })
      }
    }
  }

  // Eldritch summoning circle: nested rings + ticks + rotating triangle.
  private drawSigil(x: number, y: number, radius: number, color: number, alpha: number): void {
    this.board.circle(x, y, radius).stroke({ color, width: 2, alpha })
    this.board.circle(x, y, radius * 0.7).stroke({ color, width: 1, alpha: alpha * 0.8 })
    this.board.circle(x, y, radius * 0.34).stroke({ color: 0xf5f5dc, width: 1, alpha: alpha * 0.6 })
    const rot = this.animTime * 0.25
    for (let tri = 0; tri < 2; tri += 1) {
      const phase = rot + (tri * Math.PI) / 3
      const points: number[] = []
      for (let corner = 0; corner < 3; corner += 1) {
        const angle = phase + (corner * Math.PI * 2) / 3
        points.push(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7)
      }
      this.board.poly(points, true).stroke({ color, width: 1, alpha: alpha * 0.5 })
    }
    for (let tick = 0; tick < 24; tick += 1) {
      const angle = (tick / 24) * Math.PI * 2
      const inner = radius * 0.86
      this.board
        .moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner)
        .lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
        .stroke({ color, width: 1, alpha: alpha * 0.55 })
    }
  }

  private drawMenuBackground(): void {
    this.drawDeepGradient(0x05161c, 0x010608)
    this.drawStarfield(worldHeight, 90)

    // Looming Cthulhu silhouette behind the menu — head + wing arcs + many eyes.
    const cx = worldWidth / 2
    const cy = worldHeight / 2 + 30
    this.drawSigil(cx, cy, 250, 0x1f6f63, 0.12)
    this.board.ellipse(cx, cy - 40, 150, 180).fill({ color: 0x07181b, alpha: 0.55 })
    for (let side = -1; side <= 1; side += 2) {
      this.board
        .moveTo(cx, cy - 150)
        .bezierCurveTo(cx + side * 200, cy - 250, cx + side * 320, cy - 60, cx + side * 150, cy + 120)
        .stroke({ color: 0x123036, width: 3, alpha: 0.35 })
    }
    // dangling face tentacles
    for (let index = 0; index < 6; index += 1) {
      const sx = cx - 60 + index * 24
      const sway = Math.sin(this.animTime * 0.9 + index) * 18
      this.board
        .moveTo(sx, cy + 30)
        .bezierCurveTo(sx + sway, cy + 90, sx - sway, cy + 150, sx + sway * 0.5, cy + 210)
        .stroke({ color: 0x0d262a, width: 6 - (index % 3), alpha: 0.4 })
    }
    const eyeGlow = 0.4 + 0.25 * Math.sin(this.animTime * 2)
    this.board.circle(cx - 42, cy - 70, 9).fill({ color: 0x9d2d36, alpha: eyeGlow })
    this.board.circle(cx + 42, cy - 70, 9).fill({ color: 0x9d2d36, alpha: eyeGlow })
  }

  private drawBackground(): void {
    this.drawDeepGradient(0x0a1c22, 0x040b0e)
    this.drawStarfield(playRect.y, 46)

    this.drawPanel(
      this.board,
      playRect.x - playFramePadding,
      playRect.y - playFramePadding,
      playRect.width + playFramePadding * 2,
      playRect.height + playFramePadding * 2,
      0x0c1214,
      0x394548,
    )
    this.board.rect(playRect.x, playRect.y, playRect.width, playRect.height).fill({ color: 0x07171a, alpha: 0.9 })

    // submerged seabed texture: faint runic glyph rows
    for (let gy = playRect.y + 40; gy < playRect.y + playRect.height; gy += 86) {
      for (let gx = playRect.x + 40; gx < playRect.x + playRect.width; gx += 96) {
        this.board.circle(gx, gy, 2).fill({ color: 0x1c3b3d, alpha: 0.3 })
        this.board.moveTo(gx - 6, gy + 8).lineTo(gx + 6, gy + 8).stroke({ color: 0x1c3b3d, width: 1, alpha: 0.18 })
      }
    }

    // ambient eldritch glow top-right
    this.drawSigil(735, 150, 70, 0x2dd4bf, 0.12)
    this.board.circle(735, 150, 22).fill({ color: 0x67e8f9, alpha: 0.07 })

    // tentacles creeping from the deep along the bottom
    for (let index = 0; index < 6; index += 1) {
      const startX = 120 + index * 130
      const startY = playRect.y + playRect.height
      const sway = Math.sin(this.animTime * 0.7 + index * 1.3) * 26
      this.board
        .moveTo(startX, startY)
        .bezierCurveTo(startX + 60 + sway, startY - 80, startX - 40 + sway, startY - 170, startX + 30 + sway, startY - 240)
        .stroke({ color: 0x12343a, width: 9 - (index % 4), alpha: 0.22 })
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

    this.drawPathFlow(path)
    this.drawBase(path[path.length - 1])
  }

  // Бегущие к базе искры энергии — путь "дышит" и тянет монстров к порталу.
  private drawPathFlow(path: Vec2[]): void {
    if (path.length < 2) {
      return
    }
    const pulses = 8
    const accent = this.currentLevelAccent()
    for (let index = 0; index < pulses; index += 1) {
      const frac = (this.animTime * 0.16 + index / pulses) % 1
      const pos = this.pointOnPath(path, frac)
      const twinkle = 0.5 + 0.5 * Math.sin(this.animTime * 4 + index)
      this.board.circle(pos.x, pos.y, 3).fill({ color: accent, alpha: 0.4 + twinkle * 0.3 })
      this.glow.circle(pos.x, pos.y, 11).fill({ color: accent, alpha: 0.1 + twinkle * 0.05 })
    }
  }

  private pointOnPath(path: Vec2[], frac: number): Vec2 {
    let total = 0
    for (let index = 0; index < path.length - 1; index += 1) {
      total += distance(path[index], path[index + 1])
    }
    let remaining = Math.max(0, Math.min(1, frac)) * total
    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index]
      const to = path[index + 1]
      const segment = distance(from, to)
      if (remaining <= segment) {
        const t = segment === 0 ? 0 : remaining / segment
        return vec(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
      }
      remaining -= segment
    }
    return path[path.length - 1]
  }

  // The base under siege: an eldritch idol-gate where the deep ones break through.
  private drawBase(center: Vec2): void {
    const { x, y } = center
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 2.2)

    // outer summoning ground
    this.drawSigil(x, y, 52, 0x9d2d36, 0.32)

    // writhing tentacles bursting around the gate
    for (let index = 0; index < 7; index += 1) {
      const base = (index / 7) * Math.PI * 2
      const reach = 46 + Math.sin(this.animTime * 1.6 + index) * 12
      const sway = Math.sin(this.animTime * 2 + index * 1.7) * 18
      const tipX = x + Math.cos(base) * reach
      const tipY = y + Math.sin(base) * reach
      const midX = x + Math.cos(base) * reach * 0.55 + sway
      const midY = y + Math.sin(base) * reach * 0.55 - 10
      this.board
        .moveTo(x, y)
        .quadraticCurveTo(midX, midY, tipX, tipY)
        .stroke({ color: 0x1c4a44, width: 7 - (index % 3), alpha: 0.8 })
      this.board.circle(tipX, tipY, 3).fill({ color: 0x2dd4bf, alpha: 0.6 })
    }

    // stone arch ring
    this.board.circle(x, y, 38).fill({ color: 0x0a0608, alpha: 0.96 }).stroke({ color: 0x6b2f37, width: 4, alpha: 0.95 })
    this.board.circle(x, y, 38).stroke({ color: 0x9d2d36, width: 2, alpha: 0.5 })

    // void maw with inner glow
    this.board.circle(x, y, 24).fill({ color: 0x1a0a0d, alpha: 1 })
    this.board.circle(x, y, 16 + pulse * 5).fill({ color: 0x7f1d1d, alpha: 0.55 + pulse * 0.3 })
    this.board.circle(x, y, 7).fill({ color: 0xfca5a5, alpha: 0.5 + pulse * 0.4 })

    // watching eyes set into the arch
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2 + Math.PI / 6
      const ex = x + Math.cos(angle) * 33
      const ey = y + Math.sin(angle) * 33
      this.board.circle(ex, ey, 3.4).fill({ color: 0x040707, alpha: 1 })
      this.board.circle(ex, ey, 1.7).fill({ color: 0xfcd34d, alpha: 0.5 + pulse * 0.4 })
    }
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

  private drawEye(x: number, y: number, radius: number, color: number): void {
    this.entities.circle(x, y, radius).fill({ color: 0xf5f5dc, alpha: 0.95 })
    this.entities.circle(x, y, radius * 0.62).fill(color)
    this.entities.circle(x, y, radius * 0.28).fill(0x040707)
  }

  private drawMonsters(): void {
    for (const monster of this.world.snapshot().monsters) {
      const x = monster.position.x
      const y = monster.position.y
      const phase = x * 0.05 + y * 0.05
      const bob = Math.sin(this.animTime * 3 + phase) * 1.5
      const radius = monster.kind === 'shoggoth' ? 22 : monster.kind === 'deepOne' ? 16 : 13

      // contact shadow
      this.entities.ellipse(x, y + radius * 0.7, radius * 1.1, radius * 0.45).fill({ color: 0x020708, alpha: 0.55 })

      // рябь воды — расходящиеся круги под бредущим монстром
      for (let ripple = 0; ripple < 2; ripple += 1) {
        const cycle = (this.animTime * 0.8 + phase + ripple * 0.5) % 1
        const rippleRadius = radius * (0.6 + cycle * 1.4)
        this.entities
          .ellipse(x, y + radius * 0.7, rippleRadius, rippleRadius * 0.4)
          .stroke({ color: 0x3a6b6f, width: 1, alpha: 0.28 * (1 - cycle) })
      }

      if (monster.kind === 'cultist') {
        this.drawCultist(x, y + bob, radius, phase)
      } else if (monster.kind === 'deepOne') {
        this.drawDeepOne(x, y + bob, radius, phase)
      } else {
        this.drawShoggoth(x, y + bob, radius, phase)
      }

      const hpWidth = monster.kind === 'shoggoth' ? 46 : 36
      const hpY = y - radius - 15
      this.entities.rect(x - hpWidth / 2, hpY, hpWidth, 4).fill(0x301b1b)
      this.entities
        .rect(x - hpWidth / 2, hpY, hpWidth * Math.max(0, monster.hp / monster.maxHp), 4)
        .fill(0xef4444)
    }
  }

  // Robed cultist — hooded figure with a faint candle and glowing eyes.
  private drawCultist(x: number, y: number, radius: number, _phase: number): void {
    const accent = 0x86efac
    // robe
    this.entities
      .poly([x, y - radius * 0.2, x + radius * 0.9, y + radius * 1.1, x - radius * 0.9, y + radius * 1.1], true)
      .fill({ color: 0x0b1a16, alpha: 0.98 })
      .stroke({ color: accent, width: 1.5, alpha: 0.6 })
    // hood
    this.entities
      .moveTo(x - radius * 0.7, y)
      .quadraticCurveTo(x, y - radius * 1.5, x + radius * 0.7, y)
      .quadraticCurveTo(x, y - radius * 0.5, x - radius * 0.7, y)
      .fill({ color: 0x08120f, alpha: 1 })
      .stroke({ color: accent, width: 1.5, alpha: 0.7 })
    // shadowed face void
    this.entities.ellipse(x, y - radius * 0.45, radius * 0.42, radius * 0.5).fill(0x020605)
    // glowing eyes
    this.entities.circle(x - radius * 0.18, y - radius * 0.5, 1.8).fill(accent)
    this.entities.circle(x + radius * 0.18, y - radius * 0.5, 1.8).fill(accent)
  }

  // Deep One — fish-humanoid: finned body, gaping eye, waving feeler tentacles.
  private drawDeepOne(x: number, y: number, radius: number, phase: number): void {
    const accent = 0x67e8f9
    // dorsal fin
    this.entities
      .poly([x, y - radius * 1.5, x + radius * 0.5, y - radius * 0.3, x - radius * 0.5, y - radius * 0.3], true)
      .fill({ color: 0x103a44, alpha: 0.95 })
      .stroke({ color: accent, width: 1, alpha: 0.6 })
    // side fins
    for (const side of [-1, 1]) {
      this.entities
        .poly([x + side * radius * 0.6, y, x + side * radius * 1.4, y - radius * 0.4, x + side * radius * 1.3, y + radius * 0.5], true)
        .fill({ color: 0x0c2e36, alpha: 0.9 })
        .stroke({ color: accent, width: 1, alpha: 0.45 })
    }
    // waving feelers under the maw
    for (let index = 0; index < 4; index += 1) {
      const fx = x - radius * 0.5 + index * (radius / 3)
      const sway = Math.sin(this.animTime * 4 + phase + index) * 4
      this.entities
        .moveTo(fx, y + radius * 0.7)
        .quadraticCurveTo(fx + sway, y + radius * 1.2, fx + sway, y + radius * 1.7)
        .stroke({ color: accent, width: 2, alpha: 0.6 })
    }
    // scaled body
    this.entities
      .ellipse(x, y, radius * 0.85, radius)
      .fill({ color: 0x0a2228, alpha: 0.98 })
      .stroke({ color: accent, width: 2, alpha: 0.85 })
    // scales
    for (let row = 0; row < 2; row += 1) {
      this.entities.arc(x, y + row * 6 - 2, radius * 0.5, 0.2, Math.PI - 0.2).stroke({ color: accent, width: 1, alpha: 0.3 })
    }
    this.drawEye(x, y - radius * 0.15, radius * 0.42, accent)
  }

  // Shoggoth — amorphous bubbling mass studded with eyes.
  private drawShoggoth(x: number, y: number, radius: number, phase: number): void {
    const accent = 0xf0abfc
    // wobbling protoplasmic lobes
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2
      const wobble = radius * 0.7 + Math.sin(this.animTime * 3 + phase + index) * radius * 0.18
      const lx = x + Math.cos(angle) * wobble * 0.6
      const ly = y + Math.sin(angle) * wobble * 0.6
      this.entities.circle(lx, ly, radius * 0.55).fill({ color: 0x1a0f24, alpha: 0.85 })
    }
    this.entities
      .circle(x, y, radius)
      .fill({ color: 0x150b1e, alpha: 0.96 })
      .stroke({ color: accent, width: 2, alpha: 0.7 })
    // scattered eyes, sizes vary, blinking via time
    const eyes = [
      [x - radius * 0.4, y - radius * 0.3, 4],
      [x + radius * 0.35, y - radius * 0.1, 5.5],
      [x - radius * 0.1, y + radius * 0.35, 3.5],
      [x + radius * 0.45, y + radius * 0.4, 3],
      [x - radius * 0.5, y + radius * 0.2, 2.5],
      [x + radius * 0.05, y - radius * 0.45, 3],
    ] as const
    eyes.forEach(([ex, ey, er], index) => {
      const open = 0.6 + 0.4 * Math.sin(this.animTime * 2 + index * 1.3)
      this.drawEye(ex, ey, er * (0.6 + 0.4 * open), accent)
    })
  }

  private drawProjectiles(): void {
    for (const projectile of this.world.snapshot().projectiles) {
      if (projectile.splashRadius > 0) {
        // mortar shell: heavier round trailing the blast radius preview
        this.entities.circle(projectile.position.x, projectile.position.y, 7).fill(0x4b5563)
        this.entities.circle(projectile.position.x, projectile.position.y, 7).stroke({ color: 0xfca5a5, width: 2, alpha: 0.9 })
        this.entities.circle(projectile.position.x, projectile.position.y, projectile.splashRadius).stroke({ color: 0xfb7185, width: 1, alpha: 0.12 })
      } else {
        this.entities.circle(projectile.position.x, projectile.position.y, 5).fill(0xfef3c7)
        this.entities.circle(projectile.position.x, projectile.position.y, 10).stroke({ color: 0x81f5e1, width: 1, alpha: 0.18 })
      }
    }
  }

  private drawFloatingTexts(): void {
    this.clearFloatingTextNodes()

    for (const floating of this.world.snapshot().floatingTexts) {
      const text = new Text({ text: floating.text, style: this.smallStyle(floating.color) })
      text.label = 'floating-text'
      text.anchor.set(0.5)
      text.alpha = Math.max(0, 1 - floating.age)
      text.position.set(floating.position.x, floating.position.y)
      this.root.addChild(text)
    }
  }

  private clearFloatingTextNodes(): void {
    this.root.children
      .filter((child) => child.label === 'floating-text')
      .forEach((child) => child.destroy())
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
      { label: t('hud.sanity'), value: String(snapshot.baseHp), x: frameLeft, width: plaqueWidth, color: 0x86efac },
      { label: t('hud.coins'), value: String(snapshot.coins), x: frameLeft + (plaqueWidth + plaqueGap), width: plaqueWidth, color: 0xfcd34d },
      { label: t('hud.wave'), value: `${snapshot.wave}/${snapshot.maxWave}`, x: frameLeft + (plaqueWidth + plaqueGap) * 2, width: plaqueWidth, color: 0xc4b5fd },
      { label: t('hud.score'), value: String(snapshot.score), x: frameLeft + (plaqueWidth + plaqueGap) * 3, width: plaqueWidth, color: 0xf5f5dc },
      { label: t('hud.level'), value: this.levelName(snapshot.level), x: frameRight - levelWidth, width: levelWidth, color: 0x81f5e1 },
    ]

    for (const item of items) {
      this.drawPlaque(this.hud, item.x, 24, item.width, 36, `${item.label} ${item.value}`, item.color)
    }
  }

  private showMainMenu(): void {
    this.audio.stopTheme()
    this.screen = 'mainMenu'
    this.tutorial?.cancel()
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

    const title = new Text({ text: t('app.title'), style: this.titleStyle(48, 0xf5f5dc) })
    title.anchor.set(0.5)
    title.position.set(180, 92)
    const subtitle = new Text({ text: t('app.subtitle'), style: this.labelStyle(0x81f5e1, 20) })
    subtitle.anchor.set(0.5)
    subtitle.position.set(180, 132)
    panel.addChild(title, subtitle)
    panel.addChild(this.createMenuButton(94, 212, 172, 42, t('btn.start'), () => this.showLevelSelect()))
    panel.addChild(this.createMenuButton(94, 260, 172, 42, t('btn.levels'), () => this.showLevelSelect()))
    panel.addChild(this.createMenuButton(94, 308, 172, 42, t('btn.howToPlay'), () => this.showHelp()))

    const note = new Text({ text: t('menu.note'), style: this.smallStyle(0xb7bcae) })
    note.anchor.set(0.5)
    note.position.set(180, 384)
    panel.addChild(note)

    overlay.addChild(panel)
    this.screenLayer.addChild(overlay)
  }

  private showLevelSelect(): void {
    this.audio.stopTheme()
    this.screen = 'levelSelect'
    this.tutorial?.cancel()
    this.clearScreenLayer()
    this.isPaused = false
    this.speedButton.visible = false
    this.pauseButton.visible = false

    const overlay = this.screenOverlay()
    const title = new Text({ text: t('levelSelect.title'), style: this.titleStyle(36, 0xf5f5dc) })
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
    overlay.addChild(this.createMenuButton((worldWidth - 184) / 2, 554, 184, 42, t('btn.mainMenu'), () => this.showMainMenu()))
    this.screenLayer.addChild(overlay)
  }

  private showHelp(fromUserAction = true): void {
    if (fromUserAction) {
      this.helpFromPause = this.screen === 'playing' && this.isPaused
    }
    this.screen = 'help'
    this.clearScreenLayer()
    this.closeTowerMenu()
    this.closeTowerActionMenu()

    const overlay = this.screenOverlay()

    const title = new Text({ text: t('help.title'), style: this.titleStyle(34, 0xf5f5dc) })
    title.anchor.set(0.5, 0)
    title.position.set(worldWidth / 2, 26)
    overlay.addChild(title)

    const goalHeading = new Text({ text: t('help.goalHeading'), style: this.labelStyle(0x81f5e1, 14) })
    goalHeading.position.set(40, 76)
    const goalText = new Text({
      text: t('help.goalText'),
      style: new TextStyle({ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fill: 0xb7bcae, lineHeight: 18, wordWrap: true, wordWrapWidth: 770 }),
    })
    goalText.position.set(40, 96)
    overlay.addChild(goalHeading, goalText)

    const cardW = 256
    const gap = 16
    const startX = (worldWidth - (cardW * 3 + gap * 2)) / 2

    const towersHeading = new Text({ text: t('help.towersHeading'), style: this.labelStyle(0x81f5e1, 14) })
    towersHeading.position.set(40, 146)
    overlay.addChild(towersHeading)
    const towerKinds: TowerKind[] = ['lantern', 'obelisk', 'idol']
    towerKinds.forEach((kind, index) => {
      overlay.addChild(this.drawTowerHelpCard(towerCatalog[kind], startX + index * (cardW + gap), 166, cardW, 148))
    })

    const enemiesHeading = new Text({ text: t('help.enemiesHeading'), style: this.labelStyle(0x81f5e1, 14) })
    enemiesHeading.position.set(40, 336)
    overlay.addChild(enemiesHeading)
    const monsterKinds: MonsterInfo['kind'][] = ['cultist', 'deepOne', 'shoggoth']
    monsterKinds.forEach((kind, index) => {
      overlay.addChild(this.drawMonsterHelpCard(monsterCatalog[kind], startX + index * (cardW + gap), 356, cardW, 148))
    })

    overlay.addChild(this.createMenuButton((worldWidth - 184) / 2, 546, 184, 42, t('btn.back'), () => this.closeHelp()))
    this.screenLayer.addChild(overlay)
  }

  private closeHelp(): void {
    if (this.helpFromPause) {
      this.isPaused = false
      this.screen = 'playing'
      this.showPauseMenu()
      return
    }
    this.showMainMenu()
  }

  private drawTowerHelpCard(info: TowerInfo, x: number, y: number, width: number, height: number): Container {
    const card = new Container()
    card.position.set(x, y)
    const color = this.towerColor(info.kind)
    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, width, height, 0x0b1113, color)
    card.addChild(frame)

    const icon = new Graphics()
    this.drawTowerIcon(icon, info.kind, 42, 52, 42)
    card.addChild(icon)

    const name = new Text({ text: t(`tower.${info.kind}`), style: this.labelStyle(0xf5f5dc, 15) })
    name.position.set(76, 14)
    const desc = new Text({
      text: t(`help.tower.${info.kind}`),
      style: new TextStyle({ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fill: 0xb7bcae, lineHeight: 14, wordWrap: true, wordWrapWidth: width - 88 }),
    })
    desc.position.set(76, 36)
    card.addChild(name, desc)

    const stats = [
      `${t('help.dmg')} ${info.damage}    ${t('help.range')} ${info.range}`,
      `${t('help.rate')} ${info.fireRate}s    ${t('help.cost')} ${info.cost}`,
    ]
    if (info.splashRadius > 0) {
      stats.push(`${t('help.splash')} ${info.splashRadius}`)
    }
    stats.forEach((line, index) => {
      const text = new Text({ text: line, style: this.smallStyle(0xd6d3c2) })
      text.position.set(14, 92 + index * 17)
      card.addChild(text)
    })
    return card
  }

  private drawMonsterHelpCard(info: MonsterInfo, x: number, y: number, width: number, height: number): Container {
    const card = new Container()
    card.position.set(x, y)
    const color = info.kind === 'cultist' ? 0x86efac : info.kind === 'deepOne' ? 0x67e8f9 : 0xf0abfc
    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, width, height, 0x0b1113, color)
    card.addChild(frame)

    // упрощённая иконка врага
    const icon = new Graphics()
    const radius = info.kind === 'shoggoth' ? 24 : 18
    icon.circle(42, 50, radius).fill({ color: 0x0a1112, alpha: 0.98 }).stroke({ color, width: 2, alpha: 0.9 })
    icon.circle(42 - 5, 46, 2.6).fill(color)
    icon.circle(42 + 5, 46, 2.6).fill(color)
    card.addChild(icon)

    const name = new Text({ text: t(`monster.${info.kind}`), style: this.labelStyle(0xf5f5dc, 15) })
    name.position.set(76, 14)
    const desc = new Text({
      text: t(`help.monster.${info.kind}`),
      style: new TextStyle({ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fill: 0xb7bcae, lineHeight: 14, wordWrap: true, wordWrapWidth: width - 88 }),
    })
    desc.position.set(76, 36)
    card.addChild(name, desc)

    const stats = [
      `${t('help.hp')} ${info.hp}    ${t('help.speed')} ${info.speed}`,
      `${t('help.reward')} ${info.reward}    ${t('help.sanity')} ${info.baseDamage}`,
    ]
    stats.forEach((line, index) => {
      const text = new Text({ text: line, style: this.smallStyle(0xd6d3c2) })
      text.position.set(14, 96 + index * 17)
      card.addChild(text)
    })
    return card
  }

  private startLevel(levelId: number): void {
    if (levelId > this.unlockedLevelId) {
      this.audio.playUi()
      return
    }

    this.audio.startTheme()
    this.selectedLevelId = levelId
    this.world.reset(levelId)
    this.particles = []
    this.rings = []
    this.shakeMag = 0
    this.signFlashTime = 0
    this.clearScreenLayer()
    this.closeTowerMenu()
    this.closeTowerActionMenu()
    this.isPaused = false
    this.speedModeIndex = 0
    this.drawPauseButton()
    this.drawSpeedButton()
    this.speedButton.visible = false
    this.pauseButton.visible = false
    this.screen = 'ready'
    this.showReadyScreen()

    // Туториал — авто при первом входе на уровень 1.
    this.tutorial?.cancel()
    if (levelId === 1 && !this.isTutorialDone()) {
      this.tutorial?.start()
    }
  }

  // Фаза подготовки: поле открыто для постройки башен, волна стартует по ENTER.
  // Поэтому здесь не полноэкранная модалка, а компактный баннер под игровым полем.
  private showReadyScreen(): void {
    const snapshot = this.world.snapshot()
    const accent = this.currentLevelAccent()

    const overlay = new Container()
    const bannerWidth = 560
    const bannerHeight = 52
    const bx = (worldWidth - bannerWidth) / 2
    const by = playRect.y + playRect.height + playFramePadding + 4

    const frame = new Graphics()
    this.drawPanel(frame, bx, by, bannerWidth, bannerHeight, 0x0a0f10, accent)
    overlay.addChild(frame)

    const info = new Text({
      text: `${t('ready.level', { n: snapshot.level })} · ${this.levelName(snapshot.level)}`,
      style: this.labelStyle(accent, 14),
    })
    info.position.set(bx + 18, by + 9)
    const hint = new Text({ text: t('ready.hint'), style: this.smallStyle(0xb7bcae) })
    hint.position.set(bx + 18, by + 30)
    overlay.addChild(info, hint)

    overlay.addChild(this.createMenuButton(bx + bannerWidth - 180, by + 10, 164, 32, t('btn.startWave'), () => this.beginLevel()))

    this.screenLayer.addChild(overlay)
  }

  private currentLevelAccent(): number {
    return levels.find((level) => level.id === this.selectedLevelId)?.accentColor ?? 0x81f5e1
  }

  private beginLevel(): void {
    if (this.screen !== 'ready') {
      return
    }
    this.clearScreenLayer()
    this.isPaused = false
    this.speedButton.visible = true
    this.pauseButton.visible = true
    this.screen = 'playing'
    this.tutorial?.notify('waveStarted')
  }

  private isTutorialDone(): boolean {
    try {
      return localStorage.getItem('lovecraft-defense.tutorialDone') === '1'
    } catch {
      return false
    }
  }

  private completeTutorial(): void {
    try {
      localStorage.setItem('lovecraft-defense.tutorialDone', '1')
    } catch {
      // ignore
    }
  }

  // Координаты подсвечиваемого элемента для каждого шага туториала (мировые координаты).
  private tutorialAnchor(anchor: TutorialAnchor): TutorialRect | null {
    const snapshot = this.world.snapshot()
    const square = (x: number, y: number, r: number): TutorialRect => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 })

    if (anchor === 'base') {
      const portal = snapshot.path[snapshot.path.length - 1]
      return square(portal.x, portal.y, 50)
    }
    if (anchor === 'freeSlot') {
      const slot = snapshot.towerSlots.find((candidate) => !candidate.occupiedBy) ?? snapshot.towerSlots[0]
      return slot ? square(slot.position.x, slot.position.y, 30) : null
    }
    if (anchor === 'towerMenu') {
      const slot = snapshot.towerSlots.find((candidate) => candidate.id === this.activeTowerMenuSlotId)
      if (slot) {
        return square(slot.position.x, slot.position.y, towerMenuRadius + 10)
      }
      const free = snapshot.towerSlots.find((candidate) => !candidate.occupiedBy)
      return free ? square(free.position.x, free.position.y, 30) : null
    }
    if (anchor === 'banner') {
      const bannerWidth = 560
      const bx = (worldWidth - bannerWidth) / 2
      const by = playRect.y + playRect.height + playFramePadding + 4
      return { x: bx, y: by, w: bannerWidth, h: 52 }
    }
    if (anchor === 'monster') {
      const monster = snapshot.monsters[0]
      return monster ? square(monster.position.x, monster.position.y, 24) : null
    }
    if (anchor === 'tower') {
      const tower = snapshot.towers[0]
      return tower ? square(tower.position.x, tower.position.y, 30) : null
    }
    // controls — кнопки паузы и скорости в правом нижнем углу
    const right = worldWidth - speedButtonPadding
    const left = worldWidth - speedButtonPadding - speedButtonSize * 2 - 10
    const top = worldHeight - speedButtonPadding - speedButtonSize
    return { x: left, y: top, w: right - left, h: speedButtonSize }
  }

  private levelName(id: number): string {
    return t(`level.${id}.name`)
  }

  private levelSubtitle(id: number): string {
    return t(`level.${id}.subtitle`)
  }

  private drawSettingsButton(): void {
    for (const child of this.settingsButton.removeChildren()) {
      child.destroy({ children: true })
    }

    const x = worldWidth - speedButtonPadding - speedButtonSize
    const y = speedButtonPadding
    this.settingsButton.position.set(x, y)
    this.settingsButton.eventMode = 'static'
    this.settingsButton.cursor = 'pointer'
    this.settingsButton.removeAllListeners()
    this.settingsButton.on('pointertap', () => {
      this.audio.playUi()
      this.toggleSettings()
    })

    const plate = new Graphics()
    this.drawPanel(plate, 0, 0, speedButtonSize, speedButtonSize, 0x10181b, 0x81f5e1)
    const icon = new Graphics()
    const cx = speedButtonSize / 2
    const cy = speedButtonSize / 2
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI / 4) * index
      icon
        .moveTo(cx + Math.cos(angle) * 8, cy + Math.sin(angle) * 8)
        .lineTo(cx + Math.cos(angle) * 13, cy + Math.sin(angle) * 13)
        .stroke({ color: 0xf5f5dc, width: 2, alpha: 0.95, cap: 'round' })
    }
    icon.circle(cx, cy, 6).stroke({ color: 0xf5f5dc, width: 2, alpha: 0.95 })
    this.settingsButton.addChild(plate, icon)
  }

  private toggleSettings(): void {
    if (this.isSettingsOpen) {
      this.closeSettings()
    } else {
      this.openSettings()
    }
  }

  private closeSettings(): void {
    this.isSettingsOpen = false
    for (const child of this.settingsLayer.removeChildren()) {
      child.destroy({ children: true })
    }
  }

  private openSettings(): void {
    this.isSettingsOpen = true
    for (const child of this.settingsLayer.removeChildren()) {
      child.destroy({ children: true })
    }

    const shade = new Graphics()
    shade.rect(0, 0, worldWidth, worldHeight).fill({ color: 0x030607, alpha: 0.6 })
    shade.eventMode = 'static'
    shade.on('pointertap', () => {
      this.audio.playUi()
      this.closeSettings()
    })
    this.settingsLayer.addChild(shade)

    const panelWidth = 320
    const panelHeight = 80 + locales.length * 50
    const panel = new Container()
    panel.position.set((worldWidth - panelWidth) / 2, 200)
    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, panelWidth, panelHeight, 0x0a0f10, 0x81f5e1)
    panel.addChild(frame)

    const title = new Text({ text: t('settings.title'), style: this.titleStyle(28, 0xf5f5dc) })
    title.anchor.set(0.5)
    title.position.set(panelWidth / 2, 38)
    const label = new Text({ text: t('settings.language'), style: this.smallStyle(0xb7bcae) })
    label.position.set(24, 66)
    panel.addChild(title, label)

    const active = getLocale()
    locales.forEach((locale, index) => {
      panel.addChild(this.createLocaleButton(24, 86 + index * 50, panelWidth - 48, 40, locale, locale === active))
    })

    this.settingsLayer.addChild(panel)
  }

  private createLocaleButton(x: number, y: number, width: number, height: number, locale: Locale, active: boolean): Container {
    const button = new Container()
    button.position.set(x, y)
    button.eventMode = 'static'
    button.cursor = 'pointer'
    button.on('pointertap', () => {
      this.audio.playUi()
      setLocale(locale)
    })

    const plate = new Graphics()
    plate
      .roundRect(0, 0, width, height, 6)
      .fill(active ? 0x14323a : 0x10181b)
      .stroke({ color: active ? 0x81f5e1 : 0x6ee7d8, width: active ? 2 : 1, alpha: active ? 0.95 : 0.5 })
    const text = new Text({ text: localeNames[locale], style: this.labelStyle(active ? 0x81f5e1 : 0xf5f5dc, 15) })
    text.anchor.set(0.5)
    text.position.set(width / 2, height / 2)
    button.addChild(plate, text)
    return button
  }

  private onLocaleChanged(): void {
    this.rebuildCurrentScreen()
    if (this.isSettingsOpen) {
      this.openSettings()
    }
  }

  private rebuildCurrentScreen(): void {
    switch (this.screen) {
      case 'mainMenu':
        this.showMainMenu()
        break
      case 'levelSelect':
        this.showLevelSelect()
        break
      case 'ready':
        this.clearScreenLayer()
        this.showReadyScreen()
        break
      case 'playing':
        if (this.isPaused) {
          this.isPaused = false
          this.showPauseMenu()
        }
        break
      case 'help':
        this.showHelp(false)
        break
      case 'victory':
      case 'defeat': {
        const status = this.screen
        this.screen = 'playing'
        this.showEndScreen(status)
        break
      }
    }
  }

  private showEndScreen(status: Exclude<GameStatus, 'playing'>): void {
    if (this.screen === status) {
      return
    }

    this.screen = status
    this.isPaused = false
    this.tutorial?.cancel()
    this.speedButton.visible = false
    this.pauseButton.visible = false
    this.closeTowerMenu()
    this.closeTowerActionMenu()
    this.clearFloatingTextNodes()
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

    const title = new Text({ text: status === 'victory' ? t('end.victory') : t('end.defeat'), style: this.titleStyle(42, accent) })
    title.anchor.set(0.5)
    title.position.set(204, 56)
    const detail = new Text({
      text: status === 'victory' ? t('end.victoryDetail', { n: snapshot.maxWave }) : t('end.defeatDetail'),
      style: this.labelStyle(0xf5f5dc, 16),
    })
    detail.anchor.set(0.5)
    detail.position.set(204, 98)
    const stats = new Text({
      text: t('end.stats', { score: snapshot.score, level: this.levelName(snapshot.level), sanity: snapshot.baseHp }),
      style: this.smallStyle(0xd6d3c2),
    })
    stats.position.set(112, 128)
    panel.addChild(title, detail, stats)

    const primaryLabel = status === 'victory' ? t('btn.nextLevel') : t('btn.retry')
    const primaryAction = status === 'victory'
      ? () => this.startNextLevel()
      : () => this.startLevel(this.selectedLevelId)
    panel.addChild(this.createMenuButton(32, 190, 344, 38, primaryLabel, primaryAction))
    panel.addChild(this.createMenuButton(32, 238, 166, 34, t('btn.levels'), () => this.showLevelSelect()))
    panel.addChild(this.createMenuButton(210, 238, 166, 34, t('btn.menu'), () => this.showMainMenu()))

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
    panel.position.set((worldWidth - 408) / 2, 204)
    const frame = new Graphics()
    this.drawPanel(frame, 0, 0, 408, 262, 0x0a0f10, 0x81f5e1)
    panel.addChild(frame)

    const title = new Text({ text: t('pause.title'), style: this.titleStyle(40, 0xf5f5dc) })
    title.anchor.set(0.5)
    title.position.set(204, 54)
    panel.addChild(title)

    panel.addChild(this.createMenuButton(32, 98, 344, 40, t('btn.resume'), () => this.resumeGame()))
    panel.addChild(this.createMenuButton(32, 148, 344, 34, t('btn.howToPlay'), () => this.showHelp()))
    panel.addChild(this.createMenuButton(32, 196, 166, 34, t('btn.levels'), () => this.showLevelSelect()))
    panel.addChild(this.createMenuButton(210, 196, 166, 34, t('btn.menu'), () => this.showMainMenu()))

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
    const name = new Text({ text: this.levelName(level.id), style: this.labelStyle(locked ? 0x8c948d : 0xf5f5dc, 17) })
    name.position.set(72, 24)
    const subtitle = new Text({
      text: this.levelSubtitle(level.id),
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        fill: locked ? 0x6b7280 : 0xb7bcae,
        letterSpacing: 0,
        wordWrap: true,
        wordWrapWidth: 184,
        breakWords: true,
      }),
    })
    subtitle.position.set(20, 66)
    const waves = new Text({ text: t('card.waves', { n: level.maxWave }), style: this.labelStyle(locked ? 0x6b7280 : level.accentColor, 13) })
    waves.position.set(20, 104)
    card.addChild(number, name, subtitle, waves)

    if (locked) {
      const lockOverlay = new Graphics()
      lockOverlay.roundRect(0, 0, 232, 132, 7).fill({ color: 0x030607, alpha: 0.84 })
      lockOverlay.circle(188, 98, 15).stroke({ color: 0x9ca3af, width: 2, alpha: 0.74 })
      lockOverlay.rect(177, 96, 22, 16).fill({ color: 0x111827, alpha: 0.92 }).stroke({ color: 0x9ca3af, width: 2, alpha: 0.78 })
      const lockedText = new Text({ text: t('card.locked'), style: this.labelStyle(0x9ca3af, 12) })
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

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && this.screen === 'ready') {
      event.preventDefault()
      this.beginLevel()
    }
  }

  private handleInputDown(point: Vec2, _pointerId: number): void {
    // В фазе 'ready' волна стоит, но поле уже можно застраивать.
    if (this.screen !== 'playing' && this.screen !== 'ready') {
      return
    }

    if (this.isPaused) {
      return
    }

    // На info-шагах туториала поле заблокировано — доступны только кнопки карточки.
    if (this.tutorial?.isActive() && !this.tutorial.allowsGameInput()) {
      return
    }

    // Кнопки паузы/скорости активны только во время волны.
    if (this.screen === 'playing') {
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
        this.tutorial?.notify('towerBuilt')
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
    this.tutorial?.notify('slotOpened')

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

    const title = new Text({ text: t('tower.title', { name: t(`tower.${tower.kind}`), level: tower.level }), style: this.labelStyle(0xf5f5dc, 13) })
    title.position.set(12, 10)
    panel.addChild(title)

    const upgradeCost = this.world.getTowerUpgradeCost(tower.id)
    if (upgradeCost !== null) {
      panel.addChild(this.createActionButton(12, 38, 130, 32, t('tower.upgrade', { cost: upgradeCost }), 'upgrade'))
      this.towerActionOptions.push({ action: 'upgrade', center: vec(x + 77, y + 54), width: 130, height: 32 })
    } else {
      const max = new Text({ text: t('tower.maxLevel'), style: this.smallStyle(0xa7f3d0) })
      max.position.set(12, 46)
      panel.addChild(max)
    }

    const refund = this.world.getTowerRefund(tower.id)
    panel.addChild(this.createActionButton(12, 82, 130, 32, t('tower.sell', { refund }), 'sell'))
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
