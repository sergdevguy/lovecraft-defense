import './style.css'
import { PixiGame } from './presentation/pixi-game'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game-shell">
    <section class="game-frame" aria-label="Lavcraft Defense game">
      <div id="game"></div>
    </section>
  </main>
`

const game = new PixiGame()
void game.mount(document.querySelector<HTMLElement>('#game')!)
