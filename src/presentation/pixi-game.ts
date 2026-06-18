import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from 'pixi.js'
import { SignRecognizer } from '../application/sign-recognizer'
import type { TowerKind } from '../domain/game'
import { GameWorld } from '../domain/game'
import type { Vec2 } from '../domain/geometry'
import { distance, pointInRect, vec } from '../domain/geometry'

const worldWidth = 980
const worldHeight = 640
const ritualRect = { x: 676, y: 70, width: 260, height: 190 }

export class PixiGame {
  private readonly app = new Application()
  private readonly world = new GameWorld()
  private readonly recognizer = new SignRecognizer()
  private readonly root = new Container()
  private readonly board = new Graphics()
  private readonly entities = new Graphics()
  private readonly drawing = new Graphics()
  private readonly hud = new Text({ text: '', style: this.hudStyle() })
  private readonly hint = new Text({ text: '', style: this.smallStyle(0xd6fff7) })
  private readonly buttons = new Map<TowerKind, Graphics>()
  private readonly startScreen = new Container()
  private isGameStarted = false
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
    this.root.addChild(this.board, this.entities, this.drawing, this.hud, this.hint, this.startScreen)
    this.createTowerButtons()
    this.initStartScreen()
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
    if (this.isGameStarted) {
      this.world.update(Math.min(deltaSeconds, 0.05))
    }
    this.render()
  }

  private render(): void {
    const snapshot = this.world.snapshot()
    this.board.clear()
    this.entities.clear()

    this.drawBackground()
    this.drawPath(snapshot.path)
    this.drawTowerSlots()
    this.drawTowers()
    this.drawMonsters()
    this.drawProjectiles()
    this.drawFloatingTexts()
    this.drawRitualField()
    this.drawHud()
  }

  private drawBackground(): void {
    this.board
      .rect(0, 0, worldWidth, worldHeight)
      .fill(0x101517)
      .rect(26, 28, worldWidth - 52, worldHeight - 56)
      .stroke({ color: 0x36545b, width: 2, alpha: 0.7 })

    for (let x = 56; x < worldWidth; x += 48) {
      this.board.moveTo(x, 44).lineTo(x + 26, worldHeight - 46).stroke({ color: 0x193036, width: 1, alpha: 0.35 })
    }
  }

  private drawPath(path: Vec2[]): void {
    this.board.moveTo(path[0].x, path[0].y)
    for (const point of path.slice(1)) {
      this.board.lineTo(point.x, point.y)
    }
    this.board.stroke({ color: 0x3b2620, width: 58, alpha: 0.95 })

    this.board.moveTo(path[0].x, path[0].y)
    for (const point of path.slice(1)) {
      this.board.lineTo(point.x, point.y)
    }
    this.board.stroke({ color: 0xfa6a2a, width: 18, alpha: 0.44 })

    this.board.circle(928, 302, 42).fill({ color: 0x21191c, alpha: 0.95 }).stroke({ color: 0x9d2d36, width: 3 })
    this.board.circle(928, 302, 18).fill({ color: 0x7f1d1d, alpha: 0.8 })
  }

  private drawTowerSlots(): void {
    const snapshot = this.world.snapshot()
    for (const slot of snapshot.towerSlots) {
      const occupied = Boolean(slot.occupiedBy)
      this.entities
        .circle(slot.position.x, slot.position.y, 23)
        .fill({ color: occupied ? 0x172024 : 0x20353a, alpha: 0.92 })
        .stroke({ color: occupied ? 0xfcd34d : 0x7dd3fc, width: 2, alpha: occupied ? 0.7 : 0.54 })
    }
  }

  private drawTowers(): void {
    for (const tower of this.world.snapshot().towers) {
      const color = tower.kind === 'lantern' ? 0xfcd34d : 0xc4b5fd
      this.entities.circle(tower.position.x, tower.position.y, tower.range).stroke({ color, width: 1, alpha: 0.12 })
      this.entities
        .rect(tower.position.x - 13, tower.position.y - 19, 26, 38)
        .fill(0x161d21)
        .stroke({ color, width: 2 })
        .circle(tower.position.x, tower.position.y - 16, 8)
        .fill({ color, alpha: 0.92 })
    }
  }

  private drawMonsters(): void {
    for (const monster of this.world.snapshot().monsters) {
      const color = monster.kind === 'cultist' ? 0x86efac : monster.kind === 'deepOne' ? 0x67e8f9 : 0xf0abfc
      const radius = monster.kind === 'shoggoth' ? 19 : 13
      this.entities.circle(monster.position.x, monster.position.y, radius).fill(0x071112).stroke({ color, width: 3 })
      this.entities.circle(monster.position.x - 4, monster.position.y - 4, 2.4).fill(color)
      const hpWidth = 34
      this.entities.rect(monster.position.x - hpWidth / 2, monster.position.y - radius - 13, hpWidth, 4).fill(0x301b1b)
      this.entities
        .rect(monster.position.x - hpWidth / 2, monster.position.y - radius - 13, hpWidth * (monster.hp / monster.maxHp), 4)
        .fill(0xef4444)
    }
  }

  private drawProjectiles(): void {
    for (const projectile of this.world.snapshot().projectiles) {
      this.entities.circle(projectile.position.x, projectile.position.y, 4).fill(0xfef3c7)
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

  private drawRitualField(): void {
    this.entities
      .rect(ritualRect.x, ritualRect.y, ritualRect.width, ritualRect.height)
      .fill({ color: 0x10171d, alpha: 0.86 })
      .stroke({ color: 0x94f3e4, width: 2, alpha: 0.68 })
      .circle(ritualRect.x + ritualRect.width / 2, ritualRect.y + ritualRect.height / 2, 62)
      .stroke({ color: 0x94f3e4, width: 1, alpha: 0.32 })

    this.hint.text = 'Draw: line, triangle, spiral'
    this.hint.position.set(ritualRect.x + 18, ritualRect.y + ritualRect.height + 12)
  }

  private drawHud(): void {
    const snapshot = this.world.snapshot()
    this.hud.text = `Sanity ${snapshot.baseHp}  |  Coins ${snapshot.coins}  |  Wave ${snapshot.wave}  |  Score ${snapshot.score}`
    this.hud.position.set(34, 24)
    for (const [kind, button] of this.buttons) {
      button.alpha = snapshot.selectedTower === kind ? 1 : 0.72
    }
  }

  private createTowerButtons(): void {
    this.createTowerButton('lantern', 34, 580, 'Lantern 36')
    this.createTowerButton('obelisk', 170, 580, 'Obelisk 68')
  }

  private initStartScreen(): void {
    const overlay = new Graphics()
    overlay.rect(0, 0, worldWidth, worldHeight).fill({ color: 0x05080b, alpha: 0.88 })
    overlay.eventMode = 'static'
    this.startScreen.addChild(overlay)

    const title = new Text({
      text: 'Lavcraft Defense',
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 42,
        fill: 0xf5f5dc,
        fontWeight: 'bold',
      }),
    })
    title.anchor.set(0.5)
    title.position.set(worldWidth / 2, worldHeight / 2 - 120)
    this.startScreen.addChild(title)

    const buttonLabels = ['новая игра', 'магазин']
    buttonLabels.forEach((label, index) => {
      const button = new Graphics()
      button.roundRect(0, 0, 240, 56, 12).fill(0x16252c).stroke({ color: 0x81f5e1, width: 2, alpha: 0.85 })
      button.position.set((worldWidth - 240) / 2, worldHeight / 2 + index * 84)
      button.eventMode = 'static'
      button.cursor = 'pointer'
      button.on('pointertap', () => this.startNewGame())

      const buttonText = new Text({ text: label, style: this.buttonTextStyle() })
      buttonText.anchor.set(0.5)
      buttonText.position.set(120, 28)
      button.addChild(buttonText)
      this.startScreen.addChild(button)
    })
  }

  private startNewGame(): void {
    this.world.reset()
    this.isGameStarted = true
    this.startScreen.visible = false
  }

  private buttonTextStyle(): TextStyle {
    return new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 20,
      fill: 0xf5f5dc,
      letterSpacing: 0,
    })
  }

  private createTowerButton(kind: TowerKind, x: number, y: number, label: string): void {
    const button = new Graphics()
    button.label = `button-${kind}`
    button.roundRect(0, 0, 118, 38, 7).fill(0x182629).stroke({ color: 0x81f5e1, width: 1, alpha: 0.75 })
    button.position.set(x, y)
    button.eventMode = 'static'
    button.cursor = 'pointer'
    button.on('pointertap', () => this.world.selectTower(kind))

    const text = new Text({ text: label, style: this.smallStyle(0xf5f5dc) })
    text.anchor.set(0.5)
    text.position.set(59, 19)
    button.addChild(text)
    this.buttons.set(kind, button)
    this.root.addChild(button)
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

  private handleInputDown(point: Vec2, pointerId: number): void {
    if (!this.isGameStarted) {
      return
    }

    const selectedButton = this.buttonAt(point)
    if (selectedButton) {
      this.world.selectTower(selectedButton)
      return
    }

    const slot = this.world.snapshot().towerSlots.find((candidate) => distance(candidate.position, point) < 28)
    if (slot) {
      this.world.buildTower(slot.id)
      return
    }

    if (pointInRect(point, ritualRect)) {
      this.isDrawing = true
      this.activePointerId = pointerId
      this.drawingPoints = [point]
      this.drawing.clear().moveTo(point.x, point.y)
    }
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

  private buttonAt(point: Vec2): TowerKind | null {
    if (point.x >= 34 && point.x <= 152 && point.y >= 580 && point.y <= 618) {
      return 'lantern'
    }
    if (point.x >= 170 && point.x <= 288 && point.y >= 580 && point.y <= 618) {
      return 'obelisk'
    }
    return null
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

  private hudStyle(): TextStyle {
    return new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 18,
      fill: 0xf7fee7,
      letterSpacing: 0,
    })
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
