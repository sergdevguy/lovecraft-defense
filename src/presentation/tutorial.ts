import { Container, Graphics, Text, TextStyle } from 'pixi.js'

export type TutorialRect = Readonly<{ x: number; y: number; w: number; h: number }>

// Якорь — какой элемент подсвечивает шаг. Хост разрешает его в координаты.
export type TutorialAnchor = 'base' | 'freeSlot' | 'towerMenu' | 'banner' | 'monster' | 'tower' | 'controls'

// Событие игры, по которому action-шаг продвигается дальше.
export type TutorialEvent = 'slotOpened' | 'towerBuilt' | 'waveStarted'

type StepMode = 'info' | 'action'

type Step = Readonly<{
  key: string
  mode: StepMode
  anchor: TutorialAnchor
  advanceOn: TutorialEvent | null
}>

const STEPS: readonly Step[] = [
  { key: 'tutorial.goal', mode: 'info', anchor: 'base', advanceOn: null },
  { key: 'tutorial.placeTower', mode: 'action', anchor: 'freeSlot', advanceOn: 'slotOpened' },
  { key: 'tutorial.chooseTower', mode: 'action', anchor: 'towerMenu', advanceOn: 'towerBuilt' },
  { key: 'tutorial.startWave', mode: 'action', anchor: 'banner', advanceOn: 'waveStarted' },
  { key: 'tutorial.enemies', mode: 'info', anchor: 'monster', advanceOn: null },
  { key: 'tutorial.upgrade', mode: 'info', anchor: 'tower', advanceOn: null },
  { key: 'tutorial.controls', mode: 'info', anchor: 'controls', advanceOn: null },
]

export type TutorialDeps = Readonly<{
  layer: Container
  worldWidth: number
  worldHeight: number
  accent: number
  t: (key: string) => string
  anchorOf: (anchor: TutorialAnchor) => TutorialRect | null
  onFinish: () => void
  playClick: () => void
}>

const cardWidth = 470

export class TutorialController {
  private stepIndex = 0
  private active = false
  private readonly dim = new Graphics()
  private card = new Container()
  private readonly deps: TutorialDeps

  constructor(deps: TutorialDeps) {
    this.deps = deps
    this.deps.layer.addChild(this.dim, this.card)
  }

  isActive(): boolean {
    return this.active
  }

  // На action-шаге игроку нужно совершить действие на поле — пропускаем ввод.
  // На info-шаге поле заблокировано, доступны только кнопки карточки.
  allowsGameInput(): boolean {
    return this.active && this.currentStep().mode === 'action'
  }

  private currentStep(): Step {
    return STEPS[this.stepIndex]
  }

  start(): void {
    this.stepIndex = 0
    this.active = true
    this.buildCard()
  }

  notify(event: TutorialEvent): void {
    if (this.active && this.currentStep().advanceOn === event) {
      this.advance()
    }
  }

  private advance(): void {
    this.stepIndex += 1
    if (this.stepIndex >= STEPS.length) {
      this.finish()
      return
    }
    this.buildCard()
  }

  skip(): void {
    this.finish()
  }

  // Прерывание без отметки «пройдено» (выход в меню, поражение).
  cancel(): void {
    if (!this.active) {
      return
    }
    this.active = false
    this.dim.clear()
    this.clearCard()
  }

  private finish(): void {
    this.active = false
    this.dim.clear()
    this.clearCard()
    this.deps.onFinish()
  }

  private clearCard(): void {
    for (const child of this.card.removeChildren()) {
      child.destroy({ children: true })
    }
  }

  // Перерисовка подсветки каждый кадр (пульс рамки следует за движущимся якорем).
  render(time: number): void {
    this.dim.clear()
    if (!this.active) {
      return
    }

    const anchor = this.deps.anchorOf(this.currentStep().anchor)
    const w = this.deps.worldWidth
    const h = this.deps.worldHeight
    const shade = 0x03060a
    const alpha = 0.62

    if (!anchor) {
      this.dim.rect(0, 0, w, h).fill({ color: shade, alpha })
      return
    }

    const pad = 14
    const hx = anchor.x - pad
    const hy = anchor.y - pad
    const hw = anchor.w + pad * 2
    const hh = anchor.h + pad * 2

    // затемнение всего экрана, кроме «дырки» вокруг якоря
    this.dim.rect(0, 0, w, hy).fill({ color: shade, alpha })
    this.dim.rect(0, hy + hh, w, h - (hy + hh)).fill({ color: shade, alpha })
    this.dim.rect(0, hy, hx, hh).fill({ color: shade, alpha })
    this.dim.rect(hx + hw, hy, w - (hx + hw), hh).fill({ color: shade, alpha })

    // пульсирующая рамка вокруг цели
    const pulse = 0.5 + 0.5 * Math.sin(time * 4)
    this.dim.roundRect(hx, hy, hw, hh, 10).stroke({ color: this.deps.accent, width: 2 + pulse * 2, alpha: 0.6 + pulse * 0.4 })
  }

  private buildCard(): void {
    this.clearCard()
    const step = this.currentStep()
    const w = this.deps.worldWidth
    const h = this.deps.worldHeight

    // карточку ставим в половину экрана, противоположную якорю, чтобы не перекрыть цель
    const anchor = this.deps.anchorOf(step.anchor)
    const anchorInTop = anchor ? anchor.y + anchor.h / 2 < h / 2 : false
    const cardHeight = 132
    const cardX = (w - cardWidth) / 2
    const cardY = anchorInTop ? h - cardHeight - 24 : 24

    const frame = new Graphics()
    frame.roundRect(0, 0, cardWidth, cardHeight, 9).fill({ color: 0x0a0f10, alpha: 0.97 }).stroke({ color: this.deps.accent, width: 2, alpha: 0.7 })
    this.card.addChild(frame)

    const counter = new Text({
      text: `${this.stepIndex + 1} / ${STEPS.length}`,
      style: this.labelStyle(this.deps.accent, 12),
    })
    counter.position.set(18, 14)
    this.card.addChild(counter)

    const body = new Text({
      text: this.deps.t(step.key),
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 15,
        fill: 0xf5f5dc,
        lineHeight: 21,
        wordWrap: true,
        wordWrapWidth: cardWidth - 36,
      }),
    })
    body.position.set(18, 38)
    this.card.addChild(body)

    // кнопки: info → Далее/Понятно; везде → Пропустить
    const isLast = this.stepIndex === STEPS.length - 1
    this.card.addChild(this.button(cardWidth - 150, cardHeight - 44, 132, 32, this.deps.t('btn.skip'), 0x6b7280, () => this.skip()))
    if (step.mode === 'info') {
      const label = isLast ? this.deps.t('btn.done') : this.deps.t('btn.next')
      this.card.addChild(this.button(18, cardHeight - 44, 150, 32, label, this.deps.accent, () => {
        this.deps.playClick()
        this.advance()
      }))
    }

    this.card.position.set(cardX, cardY)
  }

  private button(x: number, y: number, width: number, height: number, label: string, color: number, onTap: () => void): Container {
    const button = new Container()
    button.position.set(x, y)
    button.eventMode = 'static'
    button.cursor = 'pointer'
    button.on('pointertap', onTap)

    const plate = new Graphics()
    plate.roundRect(0, 0, width, height, 6).fill(0x10181b).stroke({ color, width: 1, alpha: 0.7 })
    const text = new Text({ text: label, style: this.labelStyle(0xf5f5dc, 13) })
    text.anchor.set(0.5)
    text.position.set(width / 2, height / 2)
    button.addChild(plate, text)
    return button
  }

  private labelStyle(fill: number, fontSize: number): TextStyle {
    return new TextStyle({ fontFamily: 'Inter, system-ui, sans-serif', fontSize, fill, fontWeight: '600', letterSpacing: 0.5 })
  }
}
