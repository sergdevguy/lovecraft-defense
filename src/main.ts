import { PixiGame } from './presentation/pixi-game'
import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game-shell">
    <section class="game-frame" aria-label="Lovecraft Defense game">
      <div id="game"></div>
    </section>
  </main>
`

const game = new PixiGame()
void game.mount(document.querySelector<HTMLElement>('#game')!)
