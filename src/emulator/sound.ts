/**
 * Game.com Audio Synthesizer Engine
 * Emulates the 2-channel audio subsystem of the Tiger Game.com:
 * - Channel 1: Programmable tone / square wave generator & white/pink noise
 * - Channel 2: Programmable tone & 4-bit sample/PCM playback emulation
 * - Authentic system sound cues: boot chime ("Tiger game·com"), touch clicks, and game FX
 */

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume: number = 0.7;
  private isMuted: boolean = false;
  private lastCh0Time: number = 0;
  private lastCh1Time: number = 0;
  private lastCh2Time: number = 0;
  private activeClipSource: AudioBufferSourceNode | null = null;

  constructor() {
    // Attach one-time global interaction listeners so Web Audio unlocks on first click/key/touch
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.initContext();
      };
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true, passive: true });
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);
        this.createNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      // 4-bit digitized noise emulation (quantized 16 levels)
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02; // pinkish/brownish retro filtered
      data[i] = Math.round(lastOut * 8) / 8;
    }
    this.noiseBuffer = buffer;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Channel 1: Play raw tone with frequency and duration
   */
  public playTone(freq: number, durationSec: number = 0.1, type: OscillatorType = 'square', gainVal: number = 0.25) {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationSec);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + durationSec);
    } catch {
      // Ignore audio errors during suspended state
    }
  }

  /**
   * Channel 2: Noise / Percussive explosion / hit
   */
  public playNoise(durationSec: number = 0.15, gainVal: number = 0.3) {
    this.initContext();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.isMuted) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationSec);

      source.connect(gain);
      gain.connect(this.masterGain);

      source.start();
      source.stop(this.ctx.currentTime + durationSec);
    } catch {}
  }

  /**
   * Plays a digitized waveform audio stream from the Tiger Game.Com BIOS ($233F / $2354 -> $5F37)
   * or cartridge ROM. The SM8521 Timer 1 ISR ($5F37) streams 32-byte blocks into $0060-$007F
   * (SG0W0..SG1WF) and outputs 4-bit / 8-bit waveform samples.
   */
  public playBiosAudioClip(samples: Uint8Array, bank: number, addr: number) {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted || samples.length === 0) return;

    try {
      if (this.activeClipSource) {
        try {
          this.activeClipSource.stop();
        } catch {}
        this.activeClipSource = null;
      }

      // Unpack 4-bit nibbles (2 samples per byte) at ~8000 Hz effective sample rate
      // (or ~7200 Hz for the 3D Globe boot / Cartridge launch fanfare at bank 0x0E)
      const sampleRate = bank === 0x0e ? 7200 : 8000;
      const numFrames = samples.length * 2;
      const audioBuf = this.ctx.createBuffer(1, numFrames, sampleRate);
      const out = audioBuf.getChannelData(0);

      // Convert signed/unsigned 4-bit waveform nibbles with DC-blocking filter
      let prevX = 0;
      let prevY = 0;
      for (let i = 0; i < samples.length; i++) {
        const b = samples[i];
        const hi = ((b >> 4) & 0x0f) - 8;
        const lo = (b & 0x0f) - 8;

        const x0 = hi / 8.0;
        prevY = x0 - prevX + 0.96 * prevY;
        prevX = x0;
        out[i * 2] = Math.max(-1, Math.min(1, prevY * 0.45));

        const x1 = lo / 8.0;
        prevY = x1 - prevX + 0.96 * prevY;
        prevX = x1;
        out[i * 2 + 1] = Math.max(-1, Math.min(1, prevY * 0.45));
      }

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuf;

      // Smooth lowpass filter matching the Game.Com's single-speaker analog output stage
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3400;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.42;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      this.activeClipSource = source;
      source.start();

      // If this is the 3D Globe / Cartridge Loading fanfare (bank 0x0E, addr 0x6003),
      // layer the resonant chord harmonics that accompany the waveform table
      if (bank === 0x0e && addr === 0x6003) {
        this.playBootJingle();
      }
    } catch {
      // Ignore if AudioContext is still blocked by browser autoplay policy
    }
  }

  /**
   * Authentic Tiger Game.com Boot & Cartridge Loading Jingle
   * Ascending arpeggio + classic speech-like digitized formant "game·com"
   */
  public playBootJingle() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    // Chime chords: C4, E4, G4, C5, E5, G5
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0.18, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.25);
    });

    // Robotic digitized speech synth "TIGER GAME·COM" formant simulation
    setTimeout(() => {
      this.playSpeechCadence([
        { freq: 160, dur: 0.12 }, // "Ti-"
        { freq: 240, dur: 0.14 }, // "-ger"
        { freq: 140, dur: 0.16 }, // "Game"
        { freq: 210, dur: 0.22 }  // "Com"
      ]);
    }, 550);
  }

  private playSpeechCadence(syllables: Array<{ freq: number; dur: number }>) {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    let startTime = this.ctx.currentTime;
    for (const s of syllables) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(s.freq, startTime);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(s.freq * 3.5, startTime);
      filter.Q.value = 4.0;

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + s.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + s.dur);
      startTime += s.dur + 0.02;
    }
  }

  /**
   * Stylus Tap / Screen Click Sound
   */
  public playTouchBeep() {
    this.playTone(1800, 0.03, 'sine', 0.15);
  }

  /**
   * Button Press Click (Mechanical / Electronic Beep)
   */
  public playButtonPress() {
    this.playTone(950, 0.04, 'square', 0.12);
  }

  /**
   * Cartridge Insert / Eject Click
   */
  public playCartridgeClick() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    this.playNoise(0.06, 0.25);
    setTimeout(() => {
      this.playTone(400, 0.05, 'triangle', 0.2);
    }, 60);
  }

  /**
   * Resident Evil 2: Gunshot
   */
  public playHandgunShot() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    this.playTone(120, 0.05, 'sawtooth', 0.4);
    this.playNoise(0.2, 0.45);
  }

  /**
   * Resident Evil 2: Zombie Groan
   */
  public playZombieGroan() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.linearRampToValueAtTime(65, t + 0.4);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  /**
   * Sonic Jam: Ring Collect Sound
   */
  public playRingSound() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.50, t); // C6
    osc.frequency.setValueAtTime(1318.51, t + 0.05); // E6
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * Sonic Jam: Jump Spring Sound
   */
  public playJumpSound() {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /**
   * 14.4k Dial-up Modem Connect sound emulation
   */
  public playModemDialup(onComplete?: () => void) {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) {
      if (onComplete) setTimeout(onComplete, 1200);
      return;
    }

    const t = this.ctx.currentTime;
    // Dial tone
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.frequency.value = 350;
    osc2.frequency.value = 440;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.setValueAtTime(0, t + 0.4);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);

    // DTMF dialing tones
    const dtmfPairs = [[697, 1209], [770, 1336], [852, 1477], [941, 1336]];
    dtmfPairs.forEach((pair, i) => {
      const dt = t + 0.5 + i * 0.1;
      const d1 = this.ctx!.createOscillator();
      const d2 = this.ctx!.createOscillator();
      const dg = this.ctx!.createGain();
      d1.frequency.value = pair[0];
      d2.frequency.value = pair[1];
      dg.gain.setValueAtTime(0.12, dt);
      dg.gain.setValueAtTime(0.001, dt + 0.07);
      d1.connect(dg);
      d2.connect(dg);
      dg.connect(this.masterGain!);
      d1.start(dt);
      d2.start(dt);
      d1.stop(dt + 0.08);
      d2.stop(dt + 0.08);
    });

    // Handshake screech
    setTimeout(() => {
      this.playNoise(0.6, 0.18);
      this.playTone(2100, 0.4, 'sawtooth', 0.15);
      if (onComplete) {
        setTimeout(onComplete, 1000);
      }
    }, 950);
  }

  /**
   * Hardware Sound Generator (SM8521 $0040-$004E: SGC, SG0, SG1, SG2)
   * Note table at $4095 in Bank 5 uses 262144 / period (e.g. Middle C4 = $03EC = 1004 -> 261.1 Hz).
   */
  public updateFromHardwareRegisters(sound: {
    sgc: number;
    sg0l: number;
    sg1l: number;
    sg2l: number;
    sg0t: number;
    sg1t: number;
    sg2t: number;
  }) {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    if ((sound.sgc & 0x80) === 0) return;

    const now = this.ctx.currentTime;

    // Channel 0 programmable tone / wave
    if ((sound.sgc & 0x01) && sound.sg0t > 8 && (sound.sg0l & 0x1f) > 0) {
      if (now - this.lastCh0Time >= 0.025) {
        this.lastCh0Time = now;
        const freq = Math.min(4500, Math.max(55, 262144 / (sound.sg0t + 1)));
        const gain = ((sound.sg0l & 0x1f) / 31) * 0.15;
        this.playTone(freq, 0.055, 'square', gain);
      }
    }

    // Channel 1 programmable tone / wave
    if ((sound.sgc & 0x02) && sound.sg1t > 8 && (sound.sg1l & 0x1f) > 0) {
      if (now - this.lastCh1Time >= 0.025) {
        this.lastCh1Time = now;
        const freq = Math.min(4500, Math.max(55, 262144 / (sound.sg1t + 1)));
        const gain = ((sound.sg1l & 0x1f) / 31) * 0.15;
        this.playTone(freq, 0.055, 'triangle', gain);
      }
    }

    // Channel 2 programmable tone / noise
    if ((sound.sgc & 0x04) && sound.sg2t > 8 && (sound.sg2l & 0x1f) > 0) {
      if (now - this.lastCh2Time >= 0.025) {
        this.lastCh2Time = now;
        const freq = Math.min(4500, Math.max(55, 262144 / (sound.sg2t + 1)));
        const gain = ((sound.sg2l & 0x1f) / 31) * 0.12;
        this.playTone(freq, 0.05, 'sawtooth', gain);
      }
    }
  }
}

