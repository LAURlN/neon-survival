import './style.css';
import { Input } from './engine/input';
import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { UI } from './ui/ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(canvas);
const renderer = new Renderer(canvas);
const ui = new UI();

let game: Game | null = null;
/** True while the simulation should advance. */
let running = false;
let last = performance.now();

function start() {
  game = new Game(input);
  ui.close();
  ui.showHud(true);
  input.reset();
  running = true;
}

function toTitle() {
  running = false;
  game = null;
  ui.showHud(false);
  ui.showTitle(start);
}

function pause() {
  if (!game || !running) return;
  running = false;
  input.reset();
  ui.showPause(game, () => {
    ui.close();
    running = true;
  }, toTitle);
}

/** Hand out any pending level-ups and chests, one choice screen at a time. */
async function drainChoices(g: Game) {
  running = false;
  input.reset();
  while (g.pendingChests > 0 || g.pendingLevelUps > 0) {
    if (g.pendingChests > 0) {
      g.pendingChests--;
      await ui.choose('TREASURE', g.progression.chestOffers());
    } else {
      g.pendingLevelUps--;
      await ui.choose(`LEVEL ${g.level - g.pendingLevelUps}`, g.progression.levelOffers());
    }
    if (game !== g) return; // The run was abandoned while a choice was open.
  }
  input.reset();
  running = true;
}

function frame(now: number) {
  // Clamp the step so a background tab or a long frame cannot tunnel things through each other.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game) {
    if (running) {
      input.poll();
      game.update(dt);
      if (game.over) {
        running = false;
        ui.showResult(game, start);
      } else if (game.pendingChests > 0 || game.pendingLevelUps > 0) {
        void drainChoices(game);
      }
    }
    renderer.draw(game, input);
    ui.updateHud(game);
  }
  requestAnimationFrame(frame);
}

ui.onPause = pause;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

toTitle();
requestAnimationFrame(frame);

// Handy for tinkering from the browser console.
declare global {
  interface Window {
    game: Game | null;
  }
}
Object.defineProperty(window, 'game', { get: () => game });
