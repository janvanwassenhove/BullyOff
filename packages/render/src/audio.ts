/**
 * Placeholder audio layer (ADR-013 §audio): synthesised one-shots via WebAudio so
 * the *timing* of sound is designed now — stick-on-ball crack (dry) / slap (wet),
 * whistle, crowd swell on a goal. Real recorded SFX replace the synths later;
 * the API stays. Silent until `enable()` (browser autoplay policy) and if
 * WebAudio is unavailable (tests, SSR).
 */
export class AudioLayer {
  private ctx: AudioContext | null = null;

  enable(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AC) return;
    this.ctx = new AC();
  }

  /** A hit/push: short noise burst; drier turf = brighter crack; harder = louder. */
  strike(speed: number, surface: string): void {
    const c = this.ctx; if (!c) return;
    const dur = 0.05;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = surface === 'dry' ? 'highpass' : 'lowpass'; f.frequency.value = surface === 'dry' ? 1800 : 900;
    const g = c.createGain(); g.gain.value = Math.min(0.5, 0.08 + speed / 80);
    src.connect(f).connect(g).connect(c.destination); src.start();
  }

  /** Umpire's whistle: 1 = short peep, 2 = long blast. */
  whistle(kind: 1 | 2): void {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 2900;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 2900 * 1.03; // pea-whistle beat
    const g = c.createGain(); g.gain.value = 0.0001;
    const t = c.currentTime; const len = kind === 1 ? 0.18 : 0.6;
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); o2.connect(g); g.connect(c.destination); o.start(t); o2.start(t); o.stop(t + len); o2.stop(t + len);
  }

  /** Crowd swell: filtered noise with a 2 s envelope. */
  crowd(): void {
    const c = this.ctx; if (!c) return;
    const dur = 2.4;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.6;
    const g = c.createGain(); const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start();
  }
}
