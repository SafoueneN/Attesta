/*
 * Son de la vidéo du tableau blanc : tout est synthétisé dans le navigateur (Web Audio), sans fichier ni
 * dépendance. Trois bus mixés puis compressés : bruitages (feutre, apparitions, éponge, impacts, carillon),
 * musique d'ambiance générée (accords doux, baissés pendant la voix off) et volume général.
 *
 * Le contexte audio n'est créé qu'au premier clic sur « Lecture » (règle d'autoplay des navigateurs).
 */

export interface AudioMix {
  volume: number;
  effects: boolean;
  music: boolean;
}

/** Accords de l'ambiance (fréquences en Hz) : do – sol – la mineur – fa, une mesure chacun. */
const CHORDS = [
  [130.81, 196.0, 261.63, 329.63],
  [98.0, 196.0, 246.94, 293.66],
  [110.0, 220.0, 261.63, 329.63],
  [87.31, 174.61, 220.0, 261.63],
];
const BAR_S = 3.2;

export class WhiteboardAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private music!: GainNode;
  private markerGain!: GainNode;
  private markerFilter!: BiquadFilterNode;
  private markerPan!: StereoPannerNode;
  private noise!: AudioBuffer;
  private musicTimer = 0;
  private nextBar = 0;
  private bar = 0;
  private mix: AudioMix = { volume: 0.7, effects: true, music: true };
  private ducked = false;
  private musicOn = false;

  /** À appeler depuis un geste de l'utilisateur (clic sur « Lecture »). */
  start() {
    if (typeof AudioContext === "undefined") return;
    if (!this.ctx) this.build(new AudioContext());
    void this.ctx!.resume();
    this.apply();
  }

  private build(ctx: AudioContext) {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(compressor).connect(ctx.destination);
    this.effects = ctx.createGain();
    this.effects.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);

    // Bruit rose (plus doux que le bruit blanc) : base du feutre et de l'éponge.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }

    // Feutre : bruit rose en boucle, filtré, avec un grain (modulation rapide) et un panoramique stéréo.
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 900;
    this.markerFilter = ctx.createBiquadFilter();
    this.markerFilter.type = "bandpass";
    this.markerFilter.frequency.value = 2400;
    this.markerFilter.Q.value = 1.2;
    const grain = ctx.createGain();
    grain.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.25;
    lfo.connect(lfoDepth).connect(grain.gain);
    lfo.start();
    this.markerGain = ctx.createGain();
    this.markerGain.gain.value = 0;
    this.markerPan = ctx.createStereoPanner();
    source
      .connect(highpass)
      .connect(this.markerFilter)
      .connect(grain)
      .connect(this.markerGain)
      .connect(this.markerPan)
      .connect(this.effects);
    source.start();
  }

  setMix(mix: AudioMix) {
    this.mix = mix;
    this.apply();
  }

  private apply() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.master.gain.setTargetAtTime(this.mix.volume, ctx.currentTime, 0.05);
    this.effects.gain.setTargetAtTime(this.mix.effects ? 1 : 0, ctx.currentTime, 0.05);
    const musicLevel = this.musicOn && this.mix.music ? (this.ducked ? 0.35 : 1) * 0.5 : 0;
    this.music.gain.setTargetAtTime(musicLevel, ctx.currentTime, this.ducked ? 0.15 : 0.6);
  }

  /** Voix off en cours : la musique s'efface derrière elle. */
  duck(on: boolean) {
    if (this.ducked === on) return;
    this.ducked = on;
    this.apply();
  }

  /** Feutre : audible pendant le tracé ; la vitesse de la main règle l'intensité et la hauteur. */
  marker(drawing: boolean, speed = 0, x = 0.5) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const intensity = drawing ? Math.min(1, 0.35 + speed / 28) : 0;
    this.markerGain.gain.setTargetAtTime(intensity * 0.22, t, drawing ? 0.02 : 0.04);
    this.markerFilter.frequency.setTargetAtTime(1900 + Math.min(1, speed / 30) * 1500, t, 0.05);
    this.markerPan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, x * 1.4 - 0.7)), t, 0.08);
  }

  private tone(freq: number, to: number, duration: number, level: number, type: OscillatorType, at = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.effects);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** Apparition d'un aplat : petit « pop » qui descend. */
  pop() {
    this.tone(720 + Math.random() * 120, 330, 0.14, 0.16, "sine");
  }

  /** Impact (secousse de l'image) : coup sourd. */
  thud() {
    this.tone(120, 45, 0.32, 0.45, "sine");
    this.tone(2200, 900, 0.04, 0.06, "triangle");
  }

  /** Nouveau chapitre : carillon de deux notes. */
  chime() {
    this.tone(659.25, 659.25, 0.9, 0.07, "triangle");
    this.tone(987.77, 987.77, 1.1, 0.05, "triangle", 0.12);
  }

  /** Coup d'éponge : souffle filtré qui balaie l'aigu. */
  whoosh(duration: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + duration * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.6, t);
    pan.pan.linearRampToValueAtTime(0.6, t + duration);
    source.connect(filter).connect(env).connect(pan).connect(this.effects);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  /** Ambiance : nappe d'accords lents, planifiée une mesure à l'avance tant que la vidéo joue. */
  playMusic(on: boolean) {
    const ctx = this.ctx;
    if (!ctx || this.musicOn === on) return;
    this.musicOn = on;
    this.apply();
    clearInterval(this.musicTimer);
    if (!on) return;
    this.nextBar = Math.max(this.nextBar, ctx.currentTime + 0.05);
    const schedule = () => {
      while (this.nextBar < ctx.currentTime + BAR_S) {
        this.chord(CHORDS[this.bar % CHORDS.length]!, this.nextBar);
        this.nextBar += BAR_S;
        this.bar++;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 500);
  }

  private chord(notes: number[], at: number) {
    const ctx = this.ctx!;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1100;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.06, at + 0.9);
    env.gain.setValueAtTime(0.06, at + BAR_S - 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, at + BAR_S + 0.8);
    lowpass.connect(env).connect(this.music);
    for (const [i, freq] of notes.entries()) {
      // Deux oscillateurs légèrement désaccordés par note : une nappe chaude, sans attaque.
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(lowpass);
        osc.start(at);
        osc.stop(at + BAR_S + 0.9);
      }
    }
    // Note de piano discrète sur le premier temps (sinus amorti, une octave au-dessus).
    const pluck = ctx.createOscillator();
    pluck.frequency.value = notes[2]! * 2;
    const pluckEnv = ctx.createGain();
    pluckEnv.gain.setValueAtTime(0.0001, at);
    pluckEnv.gain.exponentialRampToValueAtTime(0.035, at + 0.01);
    pluckEnv.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    pluck.connect(pluckEnv).connect(this.music);
    pluck.start(at);
    pluck.stop(at + 1.7);
  }

  close() {
    clearInterval(this.musicTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}

/* ------------------------------------------------------------------------------------------------------ */
/* Voix off                                                                                               */
/* ------------------------------------------------------------------------------------------------------ */

/**
 * Voix françaises du navigateur, les plus naturelles d'abord : voix neuronales d'Edge (« Online
 * (Natural) »), voix Google de Chrome, voix « Premium / Enhanced » de macOS, puis les voix locales.
 */
export function frenchVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return [];
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural/i.test(v.name) ? 100 : 0) +
    (/online/i.test(v.name) ? 30 : 0) +
    (/google/i.test(v.name) ? 60 : 0) +
    (/premium|enhanced|amélie|thomas|audrey/i.test(v.name) ? 40 : 0) +
    (v.lang === "fr-FR" ? 10 : 0) +
    (/denise|henri|vivienne|remy|eloise/i.test(v.name) ? 5 : 0);
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("fr"))
    .sort((a, b) => score(b) - score(a));
}

/**
 * Phrases de la narration : lues une à une (prosodie plus naturelle, reprise précise, pas de coupure).
 * Coupure seulement avant une majuscule : « Elle a un CV… mais » reste une seule phrase.
 */
export const sentences = (text: string) =>
  text
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«])/u)
    .map((s) => s.trim())
    .filter(Boolean);
