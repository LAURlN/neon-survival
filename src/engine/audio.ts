/**
 * Sound, fully synthesised with WebAudio - there are no audio files.
 *
 *   audio.play('boom')        one-shot effects, rate-limited per name
 *   audio.startMusic()        a generative synthwave loop that thickens with `intensity`
 *
 * Browsers only allow audio after a user gesture, so `unlock()` must be called
 * from a click / tap handler before anything is audible.
 */

export type Sfx =
  | 'shoot' | 'dart' | 'launch' | 'boom' | 'zap' | 'laser' | 'cryo' | 'wave' | 'flame' | 'buff'
  | 'purge' | 'hit' | 'kill' | 'pick' | 'heal' | 'level' | 'chest' | 'hurt' | 'shield' | 'boss'
  | 'over' | 'ui' | 'select';

/** Minimum seconds between two plays of the same effect. */
const MIN_GAP: Partial<Record<Sfx, number>> = {
  shoot: 0.05, dart: 0.06, hit: 0.045, kill: 0.04, boom: 0.07, zap: 0.06, pick: 0.03, flame: 0.25,
  cryo: 0.12, laser: 0.2, wave: 0.2, launch: 0.08,
};

const MUTE_KEY = 'magic-survival-web:muted';

// Am - F - C - G, as semitone offsets from A1 (55 Hz) for the bass and chord tones above it.
const CHORDS = [
  { root: 0, tones: [0, 3, 7] },
  { root: -4, tones: [-4, 0, 3] },
  { root: 3, tones: [3, 7, 10] },
  { root: -2, tones: [-2, 2, 5] },
];
const BPM = 112;
const STEP = 60 / BPM / 4; // one sixteenth note

const hz = (semitonesFromA1: number) => 55 * Math.pow(2, semitonesFromA1 / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lastPlayed = new Map<Sfx, number>();
  private pickCombo = 0;
  private lastPick = 0;

  private musicTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  /** 0..1 - how many layers of the track are playing. */
  intensity = 0;

  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage unavailable: default to sound on.
    }
  }

  /** Create / resume the audio context. Call from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = (this.ctx = new Ctor());
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.ratio.value = 8;
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(limiter);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.8;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);

      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Not persisted; fine.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  // ---- building blocks -----------------------------------------------------

  /** An oscillator sweeping from f0 to f1 with a percussive envelope. */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0, bus = this.sfxBus) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Filtered noise burst; the filter sweeps from f0 to f1. */
  private noise(filter: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, at = 0, bus = this.sfxBus, q = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // ---- sound effects -------------------------------------------------------

  /** `power` (roughly 0.5..2) scales loudness and, for explosions, depth. */
  play(name: Sfx, power = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name];
    if (gap) {
      if (now - (this.lastPlayed.get(name) ?? -1) < gap) return;
      this.lastPlayed.set(name, now);
    }
    const p = Math.min(2, Math.max(0.3, power));

    switch (name) {
      case 'shoot':
        this.tone('square', 980, 360, 0.07, 0.045);
        break;
      case 'dart':
        this.tone('triangle', 1500, 900, 0.06, 0.05);
        break;
      case 'launch':
        this.tone('sawtooth', 320, 110, 0.16, 0.07);
        break;
      case 'boom':
        this.noise('lowpass', 1400 / p, 70, 0.28 * p, 0.2 * p);
        this.tone('sine', 150 / p, 38, 0.3 * p, 0.28 * p);
        break;
      case 'zap':
        this.noise('bandpass', 4200, 900, 0.13, 0.16, 0, this.sfxBus, 3);
        this.tone('square', 1700, 160, 0.1, 0.05);
        break;
      case 'laser':
        this.tone('sawtooth', 1250, 880, 0.45, 0.035);
        this.tone('sawtooth', 1262, 892, 0.45, 0.035);
        break;
      case 'cryo':
        this.tone('sine', 2400, 500, 0.3, 0.07);
        this.noise('highpass', 6000, 2500, 0.25, 0.06);
        break;
      case 'wave':
        this.noise('lowpass', 180, 1500, 0.7, 0.16);
        break;
      case 'flame':
        this.noise('bandpass', 700, 1500, 0.45, 0.1, 0, this.sfxBus, 0.7);
        break;
      case 'buff':
        this.tone('sine', 280, 1300, 0.35, 0.09);
        this.tone('triangle', 560, 2600, 0.35, 0.04);
        break;
      case 'purge':
        this.noise('lowpass', 6000, 60, 1.2, 0.4);
        this.tone('sawtooth', 900, 30, 1.1, 0.2);
        this.tone('sine', 90, 28, 1.3, 0.4);
        break;
      case 'hit':
        this.noise('highpass', 3200, 2000, 0.03, 0.035);
        break;
      case 'kill':
        this.tone('square', 260, 55, 0.09, 0.05);
        this.noise('lowpass', 2200, 300, 0.07, 0.05);
        break;
      case 'pick': {
        // Quick successive pickups climb a scale, which makes vacuuming up shards satisfying.
        this.pickCombo = now - this.lastPick < 0.35 ? Math.min(this.pickCombo + 1, 14) : 0;
        this.lastPick = now;
        const f = 660 * Math.pow(2, [0, 2, 4, 7, 9][this.pickCombo % 5] / 12 + Math.floor(this.pickCombo / 5));
        this.tone('sine', f, f * 1.02, 0.07, 0.05);
        break;
      }
      case 'heal':
        this.tone('sine', 520, 1040, 0.25, 0.1);
        break;
      case 'level':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone('triangle', 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.16, 0.1, i * 0.06));
        break;
      case 'chest':
        [0, 7, 12, 19, 24].forEach((s, i) => this.tone('square', 392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), 0.14, 0.05, i * 0.07));
        this.noise('highpass', 7000, 9000, 0.5, 0.03);
        break;
      case 'hurt':
        this.tone('sawtooth', 190, 55, 0.25, 0.22);
        this.noise('lowpass', 900, 200, 0.18, 0.18);
        break;
      case 'shield':
        this.tone('sine', 1500, 320, 0.22, 0.14);
        this.noise('bandpass', 2600, 2600, 0.1, 0.08, 0, this.sfxBus, 6);
        break;
      case 'boss':
        for (let i = 0; i < 3; i++) {
          this.tone('sawtooth', 440, 440, 0.2, 0.09, i * 0.5);
          this.tone('sawtooth', 311, 311, 0.2, 0.09, i * 0.5 + 0.25);
        }
        break;
      case 'over':
        this.tone('sawtooth', 440, 40, 1.4, 0.2);
        this.noise('lowpass', 3000, 60, 1.4, 0.2);
        break;
      case 'ui':
        this.tone('sine', 700, 700, 0.04, 0.06);
        break;
      case 'select':
        this.tone('square', 660, 660, 0.05, 0.04);
        this.tone('square', 990, 990, 0.08, 0.04, 0.05);
        break;
    }
  }

  // ---- music ---------------------------------------------------------------

  startMusic() {
    const ctx = this.ctx;
    if (!ctx || this.musicTimer !== null) return;
    this.step = 0;
    this.intensity = 0;
    this.nextStepTime = ctx.currentTime + 0.1;
    this.musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.4);
    // Schedule slightly ahead of time so timing does not depend on frame rate.
    this.musicTimer = window.setInterval(() => {
      while (this.nextStepTime < ctx.currentTime + 0.18) {
        this.scheduleStep(this.step++, this.nextStepTime - ctx.currentTime);
        this.nextStepTime += STEP;
      }
    }, 45);
  }

  stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  /** Duck the music while a menu is open. */
  setPaused(paused: boolean) {
    if (!this.ctx || this.musicTimer === null) return;
    this.musicBus.gain.setTargetAtTime(paused ? 0.14 : 0.5, this.ctx.currentTime, 0.2);
  }

  private scheduleStep(step: number, at: number) {
    if (at < 0) at = 0;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = CHORDS[bar % CHORDS.length];
    const bus = this.musicBus;
    const k = this.intensity;

    // Kick on every beat; snare on 2 and 4 once things heat up.
    if (s % 4 === 0) this.tone('sine', 150, 42, 0.16, 0.5, at, bus);
    if (k > 0.25 && (s === 4 || s === 12)) this.noise('bandpass', 1900, 1500, 0.12, 0.16, at, bus, 0.8);
    // Off-beat hats.
    if (k > 0.1 && s % 2 === 1) this.noise('highpass', 8000, 8000, 0.03, s % 4 === 3 ? 0.07 : 0.04, at, bus);

    // Pumping eighth-note bass, an octave jump on the last beat of the bar.
    if (s % 2 === 0) {
      const f = hz(chord.root + (s >= 12 && s % 4 === 2 ? 12 : 0));
      this.bass(f, at, 300 + k * 900);
    }

    // Arpeggio joins later.
    if (k > 0.4) {
      const tone = chord.tones[s % 3] + 24 + (s % 8 >= 4 ? 12 : 0);
      this.tone('square', hz(tone), hz(tone), 0.09, 0.022 + k * 0.012, at, bus);
    }

    // A soft pad holds each chord.
    if (s === 0) for (const t of chord.tones) this.pad(hz(t + 24), at, STEP * 16);
  }

  private bass(freq: number, at: number, cutoff: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(cutoff * 2, t);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + STEP * 1.6);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.8);
    osc.connect(filter).connect(g).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + STEP * 2);
  }

  private pad(freq: number, at: number, dur: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900 + this.intensity * 1400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    filter.connect(g).connect(this.musicBus);
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}
