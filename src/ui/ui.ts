/** DOM user interface: HUD and the overlay screens (title, choices, pause, result). */
import { VOCAB } from '../data/theme';
import type { Sfx } from '../engine/audio';
import type { Game } from '../game/game';
import type { Offer } from '../game/progression';
import { SPELL_NAMES } from '../game/effects';
import { SPELL_DEFS } from '../game/content';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export const formatTime = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Two-letter badge for a name: "Magic Bolt" -> "MB", "Fireball" -> "Fi". */
const initials = (name: string) => {
  const words = name.split(/[\s-]+/).filter(Boolean);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2);
};

const SPELL_COLOR: Record<string, string> = Object.fromEntries(SPELL_DEFS.map((s) => [s.key, s.color]));

export interface Record_ {
  time: number;
  kills: number;
  level: number;
}

const STORAGE_KEY = 'magic-survival-web:best';

export function loadBest(): Record_ | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveBest(r: Record_) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {
    // Private browsing: records just don't persist.
  }
}

export class UI {
  private readonly hud = $('hud');
  private readonly overlay = $('overlay');
  private readonly xpFill = $('xp-fill');
  private readonly level = $('level');
  private readonly timer = $('timer');
  private readonly kills = $('kills');
  private readonly loadout = $('loadout');
  private readonly announce = $('announce');
  private chips = new Map<number, HTMLElement>();
  private lastSecond = -1;

  onPause: () => void = () => {};
  /** Toggles mute and returns the new state. */
  onMute: () => boolean = () => false;
  /** UI sound hook. */
  sfx: (name: Sfx) => void = () => {};

  private readonly muteBtn = $('mute');

  constructor() {
    $('pause').addEventListener('click', () => this.onPause());
    this.muteBtn.addEventListener('click', () => this.setMuted(this.onMute()));
  }

  setMuted(muted: boolean) {
    this.muteBtn.classList.toggle('off', muted);
    this.muteBtn.setAttribute('aria-pressed', String(muted));
  }

  get overlayOpen() {
    return !this.overlay.hidden;
  }

  // ---- HUD -----------------------------------------------------------------

  showHud(show: boolean) {
    this.hud.hidden = !show;
    // Always start from a clean slate: the chips belong to one run.
    this.chips.clear();
    this.loadout.replaceChildren();
    this.lastSecond = -1;
  }

  updateHud(g: Game) {
    this.xpFill.style.width = `${Math.min(100, (g.xp / g.xpNeeded) * 100)}%`;
    const second = Math.floor(g.time);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      this.timer.textContent = formatTime(g.time);
    }
    this.level.textContent = `Lv ${g.level}`;
    this.kills.textContent = String(g.kills);

    for (const [id, spell] of g.progression.spells) {
      let chip = this.chips.get(id);
      if (!chip) {
        chip = el('div', 'chip');
        chip.style.setProperty('--c', spell.color);
        chip.append(el('span'));
        chip.title = spell.def.name;
        this.loadout.append(chip);
        this.chips.set(id, chip);
      }
      chip.style.setProperty('--cd', spell.cooldownLeft.toFixed(2));
      const label = String(spell.level + spell.overLevel);
      const span = chip.firstElementChild!;
      if (span.textContent !== label) span.textContent = label;
    }

    const a = g.director.announce;
    this.announce.classList.toggle('show', a.t > 0);
    if (a.t > 0 && this.announce.textContent !== a.text) this.announce.textContent = a.text;
  }

  // ---- overlays ------------------------------------------------------------

  private open(...children: (HTMLElement | null)[]) {
    const panel = el('div', 'panel');
    panel.append(...children.filter((c): c is HTMLElement => c !== null));
    this.overlay.replaceChildren(panel);
    this.overlay.hidden = false;
    this.overlay.scrollTop = 0;
  }

  close() {
    this.overlay.hidden = true;
    this.overlay.replaceChildren();
  }

  private button(text: string, onClick: () => void, primary = false) {
    const b = el('button', primary ? 'btn primary' : 'btn', text);
    b.addEventListener('click', () => {
      this.sfx('ui');
      onClick();
    });
    return b;
  }

  showTitle(onStart: () => void) {
    const best = loadBest();
    const title = el('h1', 'glitch', VOCAB.title);
    title.dataset.text = VOCAB.title;
    this.open(
      title,
      el('p', 'sub', VOCAB.tagline),
      el('p', 'sub', 'Drag anywhere to move (or WASD). Programs fire on their own. Collect data shards to level up and install new programs.'),
      best ? el('p', 'sub', `Best: ${formatTime(best.time)} · ${best.kills} kills · Lv ${best.level}`) : null,
      this.button('JACK IN', onStart, true),
    );
  }

  /**
   * Show a set of choices. Resolves once the player has picked one - including
   * any follow-up choice the pick leads to (e.g. a trait).
   */
  choose(heading: string, offers: Offer[]): Promise<void> {
    return new Promise((resolve) => {
      const render = (title: string, list: Offer[]) => {
        const cards = list.map((offer) => {
          const card = el('button', 'card');
          card.style.setProperty('--c', offer.color);
          card.disabled = true;
          const ul = el('ul');
          for (const line of offer.lines) ul.append(el('li', '', line));
          const icon = el('div', 'icon');
          icon.append(el('span', '', initials(offer.title)));
          card.append(icon, el('div', 'title', offer.title),
                      el('div', 'tag', offer.tag), ul);
          card.addEventListener('click', () => {
            this.sfx('select');
            const next = offer.apply();
            if (next && next.length > 0) render(VOCAB.chooseTrait.toUpperCase(), next);
            else {
              this.close();
              resolve();
            }
          });
          return card;
        });
        this.open(el('h2', '', title), ...cards);
        // Guard against a stray tap from the thumb that was steering a moment ago.
        setTimeout(() => cards.forEach((c) => (c.disabled = false)), 350);
      };
      render(heading, offers);
    });
  }

  private loadoutList(g: Game) {
    const list = el('div', 'list');
    const pr = g.progression;
    for (const s of pr.spells.values()) {
      const row = el('div');
      const traits = s.def.traitGroups.flat().filter((t) => s.has(t.id)).map((t) => t.name);
      row.textContent = `${s.def.name} — Lv ${s.level}${s.overLevel ? ` +${s.overLevel}` : ''}` +
                        (traits.length ? ` (${traits.join(', ')})` : '');
      row.style.color = s.color;
      list.append(row);
    }
    if (pr.artifacts.length) list.append(el('div', '', `Cyberware: ${pr.artifacts.map((a) => a.name).join(', ')}`));
    return list;
  }

  showPause(g: Game, onResume: () => void, onQuit: () => void) {
    this.open(
      el('h2', '', 'PAUSED'),
      this.loadoutList(g),
      this.button('Resume', onResume, true),
      this.button('Disconnect', onQuit),
    );
  }

  showResult(g: Game, onRestart: () => void) {
    const record: Record_ = { time: g.time, kills: g.kills, level: g.level };
    const best = loadBest();
    const isBest = !best || record.time > best.time;
    if (isBest) saveBest(record);

    const stats = el('div', 'stats');
    for (const [value, label] of [[formatTime(g.time), 'survived'], [String(g.kills), 'kills'], [String(g.level), 'level']]) {
      const cell = el('div');
      cell.append(el('b', '', value), el('small', '', label));
      stats.append(cell);
    }

    // Damage dealt per spell, like the original's combat record.
    const list = el('div', 'list');
    const entries = [...g.damageBy.entries()].sort((a, b) => b[1] - a[1]);
    const top = entries[0]?.[1] ?? 1;
    for (const [key, dmg] of entries) {
      const row = el('div', 'row');
      const bar = el('div', 'bar');
      bar.style.setProperty('--c', SPELL_COLOR[key] ?? '#ffb347');
      bar.style.width = `${Math.max(2, (dmg / top) * 100)}%`;
      row.append(el('span', '', SPELL_NAMES[key] ?? 'Cyberware'), bar, el('span', '', Math.round(dmg).toLocaleString()));
      list.append(row);
    }

    this.open(
      el('h2', 'danger', VOCAB.over),
      isBest ? el('div', 'new-best', 'New best time!') : null,
      stats,
      entries.length ? list : null,
      this.button('JACK IN AGAIN', onRestart, true),
    );
  }
}
