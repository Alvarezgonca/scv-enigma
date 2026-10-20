/**
 * Som mecânico sintetizado na hora com a Web Audio API (nenhum arquivo de áudio de terceiros):
 * a tecla é um estalo de ruído filtrado com um baque grave; cada rotor que anda é um clique de
 * catraca; o ambiente é um chiado de rádio com Morse ao fundo.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let ambience: { stop: () => void } | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!enabled) return null;
  if (ctx === null) {
    const Ctor = globalThis.AudioContext as typeof AudioContext | undefined;
    if (Ctor === undefined) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return master === null ? null : { ctx, out: master };
}

let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer === null || noiseBuffer.sampleRate !== c.sampleRate) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function burst(at: number, opts: { freq: number; q: number; gain: number; decay: number; type?: BiquadFilterType }): void {
  const a = audio();
  if (a === null) return;
  const src = a.ctx.createBufferSource();
  src.buffer = noise(a.ctx);
  const filter = a.ctx.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(opts.gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.decay);
  src.connect(filter).connect(g).connect(a.out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + opts.decay + 0.02);
}

function thump(at: number, freq: number, gain: number, decay: number): void {
  const a = audio();
  if (a === null) return;
  const osc = a.ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq * 1.6, at);
  osc.frequency.exponentialRampToValueAtTime(freq, at + 0.03);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(g).connect(a.out);
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

export const sound = {
  setEnabled(on: boolean): void {
    enabled = on;
    if (!on) this.ambience(false);
  },
  get enabled(): boolean {
    return enabled;
  },
  /** Tecla descendo: estalo metálico + baque da alavanca. */
  keyDown(): void {
    const a = audio();
    if (a === null) return;
    const t = a.ctx.currentTime;
    burst(t, { freq: 2600, q: 1.2, gain: 0.5, decay: 0.045 });
    burst(t + 0.004, { freq: 5200, q: 3, gain: 0.18, decay: 0.02 });
    thump(t, 95, 0.55, 0.09);
  },
  /** Cada rotor que anda dá um clique de catraca (dois cliques no passo duplo). */
  steps(count: number): void {
    const a = audio();
    if (a === null) return;
    const t = a.ctx.currentTime + 0.012;
    for (let i = 0; i < count; i++) {
      burst(t + i * 0.016, { freq: 3400 + i * 300, q: 6, gain: 0.32, decay: 0.018, type: 'highpass' });
      thump(t + i * 0.016, 180, 0.12, 0.03);
    }
  },
  keyUp(): void {
    const a = audio();
    if (a === null) return;
    const t = a.ctx.currentTime;
    burst(t, { freq: 1800, q: 1.5, gain: 0.16, decay: 0.03 });
  },
  /** Tampa batendo ou rotor encaixando. */
  clunk(): void {
    const a = audio();
    if (a === null) return;
    const t = a.ctx.currentTime;
    thump(t, 70, 0.7, 0.18);
    burst(t, { freq: 900, q: 0.8, gain: 0.35, decay: 0.12 });
  },
  /** Cabo entrando na tomada. */
  plug(): void {
    const a = audio();
    if (a === null) return;
    const t = a.ctx.currentTime;
    burst(t, { freq: 4200, q: 4, gain: 0.25, decay: 0.03 });
    thump(t + 0.01, 240, 0.2, 0.05);
  },
  /** Bipe curto de rádio (QR lido, parte recebida). */
  beep(ok = true): void {
    const a = audio();
    if (a === null) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(ok ? 880 : 220, t);
    if (ok) osc.frequency.setValueAtTime(1320, t + 0.07);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.16 : 0.35));
    osc.connect(g).connect(a.out);
    osc.start(t);
    osc.stop(t + 0.4);
  },
  /** Ambiente da sala de rádio: chiado marrom e Morse distante. */
  ambience(on: boolean): void {
    if (!on) {
      ambience?.stop();
      ambience = null;
      return;
    }
    const a = audio();
    if (a === null || ambience !== null) return;
    const src = a.ctx.createBufferSource();
    src.buffer = noise(a.ctx);
    src.loop = true;
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = a.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(a.out);
    src.start();
    const morse = '... -.-. ...- / . -. .. --. -- .-';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const play = (): void => {
      const c = audio();
      if (c === null) return;
      let t = c.ctx.currentTime + 0.1;
      const dit = 0.07;
      for (const ch of morse) {
        if (ch === ' ' || ch === '/') {
          t += dit * (ch === '/' ? 7 : 3);
          continue;
        }
        const len = ch === '.' ? dit : dit * 3;
        const osc = c.ctx.createOscillator();
        osc.frequency.value = 640;
        const og = c.ctx.createGain();
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.03, t + 0.005);
        og.gain.setValueAtTime(0.03, t + len - 0.005);
        og.gain.exponentialRampToValueAtTime(0.0001, t + len);
        osc.connect(og).connect(c.out);
        osc.start(t);
        osc.stop(t + len + 0.01);
        t += len + dit;
      }
      timer = setTimeout(play, 9000 + Math.random() * 6000);
    };
    timer = setTimeout(play, 1500);
    ambience = {
      stop: () => {
        if (timer !== null) clearTimeout(timer);
        src.stop();
        src.disconnect();
      },
    };
  },
};
