import './style.css';
import { VOCAB } from './data/theme';
import { AudioEngine } from './engine/audio';
import { Input } from './engine/input';
import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { UI } from './ui/ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(canvas);
const renderer = new Renderer(canvas);
const ui = new UI();
const audio = new AudioEngine();

let game: Game | null = null;
/** True while the simulation should advance. */
let running = false;
let last = performance.now();

function start() {
  // Browsers only allow audio after a gesture; start() always runs from a button press.
  audio.unlock();
  audio.stopMusic();
  audio.startMusic();
  game = new Game(input);
  game.sound = (name, power) => audio.play(name, power);
  ui.close();
  ui.showHud(true);
  input.reset();
  running = true;
}

function toTitle() {
  audio.stopMusic();
  running = false;
  game = null;
  ui.showHud(false);
  ui.showTitle(start);
}

function pause() {
  if (!game || !running) return;
  running = false;
  input.reset();
  audio.setPaused(true);
  ui.showPause(game, () => {
    ui.close();
    audio.setPaused(false);
    running = true;
  }, toTitle);
}

/** Hand out any pending level-ups and chests, one choice screen at a time. */
async function drainChoices(g: Game) {
  running = false;
  input.reset();
  audio.setPaused(true);
  while (g.pendingChests > 0 || g.pendingLevelUps > 0) {
    if (g.pendingChests > 0) {
      g.pendingChests--;
      await ui.choose(VOCAB.chest, g.progression.chestOffers());
    } else {
      g.pendingLevelUps--;
      await ui.choose(`${VOCAB.levelUp} ${g.level - g.pendingLevelUps}`, g.progression.levelOffers());
    }
    if (game !== g) return; // The run was abandoned while a choice was open.
  }
  input.reset();
  audio.setPaused(false);
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
      // The soundtrack adds layers as the run heats up.
      audio.intensity = Math.min(1, game.time / 240 + game.enemies.length / 500);
      if (game.over) {
        running = false;
        audio.stopMusic();
        audio.play('over');
        ui.showResult(game, start);
      } else if (game.pendingChests > 0 || game.pendingLevelUps > 0) {
        void drainChoices(game);
      }
    }
    renderer.draw(game, input);
    ui.updateHud(game);
  } else {
    renderer.drawIdle(now / 1000);
  }
  requestAnimationFrame(frame);
}

ui.onPause = pause;
ui.onMute = () => audio.toggleMute();
ui.sfx = (name) => audio.play(name);
ui.setMuted(audio.muted);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
// Mobile browsers suspend audio when the tab loses focus; any tap brings it back.
window.addEventListener('pointerdown', () => audio.unlock());

toTitle();
requestAnimationFrame(frame);

// Handy for tinkering from the browser console.
declare global {
  interface Window {
    game: Game | null;
  }
}
Object.defineProperty(window, 'game', { get: () => game });
