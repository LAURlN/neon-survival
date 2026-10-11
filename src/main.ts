import './style.css';
import { VOCAB } from './data/theme';
import { DIFFICULTIES } from './data/tuning';
import { AudioEngine } from './engine/audio';
import { Input } from './engine/input';
import { Game } from './game/game';
import { clearRun, loadRun, restore, saveRun } from './game/save';
import { Renderer } from './render/renderer';
import { BoardEditor } from './ui/editor';
import { UI, formatTime, loadDifficulty } from './ui/ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(canvas);
const renderer = new Renderer(canvas);
const ui = new UI();
const audio = new AudioEngine();
const editor = new BoardEditor();

let game: Game | null = null;
let difficulty = loadDifficulty();
/** True while the simulation should advance. */
let running = false;
let last = performance.now();
/** Seconds of play since the run was last written to storage. */
let sinceSave = 0;
const SAVE_EVERY = 5;

/** Write the current run to storage so it can be continued after a reload. */
function save() {
  if (game && !game.over) saveRun(game);
  sinceSave = 0;
}

/** Begin a run: a fresh one, or the saved one if `resume` is set. */
function start(resume = false) {
  // Browsers only allow audio after a gesture; start() always runs from a button press.
  audio.unlock();
  audio.stopMusic();
  audio.startMusic();
  const saved = resume ? loadRun() : null;
  try {
    game = saved ? restore(input, saved) : new Game(input, difficulty);
  } catch {
    // A save from an incompatible version: drop it and start clean.
    clearRun();
    game = new Game(input, difficulty);
  }
  // "Jack in again" after a continued run should stay on that run's difficulty.
  difficulty = game.difficulty;
  game.sound = (name, power) => audio.play(name, power);
  ui.close();
  ui.showHud(true);
  input.reset();
  running = true;
}

function toTitle() {
  audio.stopMusic();
  save();
  running = false;
  game = null;
  ui.showHud(false);
  const saved = loadRun();
  const label = saved
    ? `${DIFFICULTIES.find((d) => d.id === saved.difficulty)?.name ?? ''} · ${formatTime(saved.time)} · Lv ${saved.level} · ${saved.kills} kills`
    : null;
  ui.showTitle(difficulty, (d) => {
    difficulty = d;
    start();
  }, label, () => start(true));
}

function pause() {
  if (!game || !running) return;
  running = false;
  input.reset();
  audio.setPaused(true);
  save();
  const resume = () => {
    ui.close();
    audio.setPaused(false);
    running = true;
  };
  ui.showPause(game, resume, () => {
    resume();
    openEditor();
  }, toTitle);
}

/** Pause the run and open the circuit editor; closing it resumes. */
function openEditor() {
  if (!game || !running) return;
  running = false;
  input.reset();
  audio.setPaused(true);
  editor.open(game.board, () => {
    save();
    input.reset();
    audio.setPaused(false);
    running = true;
  });
}

/** Hand out any pending level-ups and chests, one choice screen at a time. */
async function drainChoices(g: Game) {
  running = false;
  input.reset();
  audio.setPaused(true);
  // A choice only stops counting as pending once it has been made, so a run saved
  // while a choice is on screen offers it again when it is continued.
  while (g.pendingLegendary > 0 || g.pendingChests > 0 || g.pendingLevelUps > 0) {
    save();
    if (g.pendingLegendary > 0) {
      await ui.choose(VOCAB.legendary, g.progression.legendaryOffers());
      g.pendingLegendary--;
    } else if (g.pendingChests > 0) {
      await ui.choose(VOCAB.chest, g.progression.chestOffers());
      g.pendingChests--;
    } else {
      await ui.choose(`${VOCAB.levelUp} ${g.level - g.pendingLevelUps + 1}`, g.progression.levelOffers());
      g.pendingLevelUps--;
    }
    if (game !== g) return; // The run was abandoned while a choice was open.
  }
  save();
  input.reset();
  audio.setPaused(false);
  running = true;
}

function frame(now: number) {
  // Clamp the step so a background tab or a long frame cannot tunnel things through each other.
  const dt = Math.min(0.05, (now - last) / 1000);
  if (game && running) renderer.adapt(now - last);
  last = now;

  if (game) {
    if (running) {
      input.poll();
      game.update(dt);
      // The soundtrack adds layers as the run heats up.
      audio.intensity = Math.min(1, game.time / 240 + game.enemies.length / 500);
      if ((sinceSave += dt) > SAVE_EVERY) save();
      if (game.over) {
        clearRun();
        running = false;
        audio.stopMusic();
        audio.play('over');
        ui.showResult(game, start, toTitle);
      } else if (game.pendingLegendary > 0 || game.pendingChests > 0 || game.pendingLevelUps > 0) {
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
ui.onCircuit = openEditor;
editor.sfx = (name) => audio.play(name);
ui.onMute = () => audio.toggleMute();
ui.sfx = (name) => audio.play(name);
ui.setMuted(audio.muted);
window.addEventListener('keydown', (e) => {
  if (editor.isOpen || e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
  else if (e.code === 'KeyE') openEditor();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  save();
  pause();
});
window.addEventListener('pagehide', save);
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
