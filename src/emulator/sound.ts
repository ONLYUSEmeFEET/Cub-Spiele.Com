/**
 * Game.com Hardware Audio & Internal Speaker Acoustic Engine
 *
 * Emulates the Sharp SM8521 audio subsystem and the physical acoustic response of the
 * 1997 Tiger Game.Com 28mm internal speaker:
 * - Hardware 8-bit DAC ($004E SGDA) streaming driven by Timer 1 ISR ($56A3 -> $357F ADPCM engine)
 * - Sample-Rate Conversion (SRC) from the hardware ~7,877 Hz DAC clock to Web Audio sampleRate
 *   with 8-bit DAC staircase quantization, DC-coupling high-pass filter, and ZOH + Hermite reconstruction
 * - Internal Speaker Band-Pass Filter & Slight Distortion Chain:
 *   High-Pass (310 Hz) -> Band-Pass / Enclosure Resonance (1,220-1,350 Hz) -> Soft-Clipping WaveShaper -> Low-Pass (3,450 Hz)
 * - Programmable tone channels SG0, SG1, SG2 ($0040-$004D) & 32-byte waveform streamer ($2354 -> $5F37)
 */

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private speakerInput: GainNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  private bandPassFilter: BiquadFilterNode | null = null;
  private midResonanceFilter: BiquadFilterNode | null = null;
  private speakerDistortion: WaveShaperNode | null = null;
  private lowPassFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private volume: number = 0.2;
  private isMuted: boolean = false;
  private lastCh0Time: number = 0;
  private lastCh1Time: number = 0;
  private lastCh2Time: number = 0;
  private activeClipSource: AudioBufferSourceNode | null = null;

  // Hardware SGDA ($004E) 8-bit DAC streaming & sample-rate conversion state
  private dacSampleQueue: number[] = [];
  private currentDacRate: number = 7877;
  private dcPrevX: number = 0;
  private dcPrevY: number = 0;
  private prevSampleMinus1: number = 0;
  private prevSample0: number = 0;
  private nextDacPlayTime: number = 0;
  private scheduledDacSources: AudioBufferSourceNode[] = [];
  private idleFramesSinceDacWrite: number = 0;

  // Boot chime capture in case browser AudioContext is suspended during initial page load
  private bootCaptureSamples: number[] = [];
  private bootCaptureRate: number = 7877;
  private bootCaptureTimestamp: number = 0;
  private hasPlayedUnlockedBootCapture: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.initContext();
        this.tryPlayPendingBootCapture();
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  /**
   * Builds the asymmetric soft-clipping transfer curve modeling the slight harmonic distortion
   * of the Game.Com's single-supply internal speaker amplifier and 28mm mylar cone.
   */
  private createSpeakerDistortionCurve(drive: number = 1.65): Float32Array<ArrayBuffer> {
    const numSamples = 8192;
    const buffer = new ArrayBuffer(numSamples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < numSamples; i++) {
      const x = (i * 2) / (numSamples - 1) - 1;
      // Slight Class-AB push-pull asymmetry + soft knee saturation
      const biased = x + 0.035 * x * x;
      curve[i] = Math.tanh(biased * drive) / Math.tanh(drive);
    }
    return curve;
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        // 1. Pre-filter speaker input bus
        this.speakerInput = this.ctx.createGain();
        this.speakerInput.gain.value = 1.15;

        // 2. High-Pass Filter (310 Hz): mimics bass roll-off of the tiny 28mm handheld speaker cone
        this.highPassFilter = this.ctx.createBiquadFilter();
        this.highPassFilter.type = 'highpass';
        this.highPassFilter.frequency.value = 310;
        this.highPassFilter.Q.value = 0.85;

        // 3. Band-Pass Filter (center = 1,350 Hz, Q = 0.65) + parallel direct passband blend
        //    to model the mid-focused acoustic passband (310 Hz - 3,450 Hz) of the plastic enclosure
        this.bandPassFilter = this.ctx.createBiquadFilter();
        this.bandPassFilter.type = 'bandpass';
        this.bandPassFilter.frequency.value = 1350;
        this.bandPassFilter.Q.value = 0.65;

        const bandPassWetGain = this.ctx.createGain();
        bandPassWetGain.gain.value = 0.65;

        const passbandDryGain = this.ctx.createGain();
        passbandDryGain.gain.value = 0.55;

        // 4. Enclosure Mid-Presence Resonance Peak (1,220 Hz, +3.8 dB)
        this.midResonanceFilter = this.ctx.createBiquadFilter();
        this.midResonanceFilter.type = 'peaking';
        this.midResonanceFilter.frequency.value = 1220;
        this.midResonanceFilter.Q.value = 1.45;
        this.midResonanceFilter.gain.value = 3.8;

        // 5. Slight Speaker Cone & Amplifier Distortion (WaveShaperNode)
        this.speakerDistortion = this.ctx.createWaveShaper();
        this.speakerDistortion.curve = this.createSpeakerDistortionCurve(1.65);
        this.speakerDistortion.oversample = '2x';

        // 6. Post-Distortion Low-Pass Roll-off (3,450 Hz): smooths ultrasonic harmonics
        this.lowPassFilter = this.ctx.createBiquadFilter();
        this.lowPassFilter.type = 'lowpass';
        this.lowPassFilter.frequency.value = 3450;
        this.lowPassFilter.Q.value = 0.8;

        // 7. Master Volume & Mute Stage
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume;

        // Connect acoustic chain:
        // speakerInput -> highPassFilter -> (bandPassFilter + passbandDry) -> midResonanceFilter -> speakerDistortion -> lowPassFilter -> masterGain -> destination
        this.speakerInput.connect(this.highPassFilter);

        this.highPassFilter.connect(this.bandPassFilter);
        this.bandPassFilter.connect(bandPassWetGain);
        bandPassWetGain.connect(this.midResonanceFilter);

        this.highPassFilter.connect(passbandDryGain);
        passbandDryGain.connect(this.midResonanceFilter);

        this.midResonanceFilter.connect(this.speakerDistortion);
        this.speakerDistortion.connect(this.lowPassFilter);
        this.lowPassFilter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.createNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.tryPlayPendingBootCapture();
      }).catch(() => {});
    }
  }

  private getOutputNode(): AudioNode | null {
    return this.speakerInput || this.masterGain;
  }

  /**
   * Sample-Rate Conversion (SRC) from the Game.Com's hardware Timer 1 DAC rate (~7,877 Hz)
   * to the Web Audio Context sample rate (44,100 Hz / 48,000 Hz).
   * Combines Zero-Order Hold (staircase DAC register hold) with 4-point Hermite cubic
   * interpolation to preserve the authentic 8-bit DAC texture while preventing harsh aliasing.
   */
  public resampleSampleStream(
    sourceSamples: Float32Array,
    sourceRate: number,
    targetRate: number
  ): Float32Array {
    if (sourceSamples.length === 0) return new Float32Array(0);
    if (sourceRate === targetRate) return sourceSamples;

    const ratio = sourceRate / targetRate;
    const outLength = Math.max(1, Math.ceil(sourceSamples.length / ratio));
    const output = new Float32Array(outLength);
    const n = sourceSamples.length;

    for (let i = 0; i < outLength; i++) {
      const srcPos = i * ratio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;

      // Zero-Order Hold value (hardware SGDA $004E latch register holds voltage across sample period)
      const s0 = sourceSamples[Math.min(n - 1, idx)];

      // 4-point Hermite cubic interpolation for band-limited reconstruction
      const sm1 = idx > 0 ? sourceSamples[idx - 1] : this.prevSampleMinus1;
      const sp1 = idx + 1 < n ? sourceSamples[idx + 1] : s0;
      const sp2 = idx + 2 < n ? sourceSamples[idx + 2] : sp1;

      const c0 = s0;
      const c1 = 0.5 * (sp1 - sm1);
      const c2 = sm1 - 2.5 * s0 + 2.0 * sp1 - 0.5 * sp2;
      const c3 = 0.5 * (sp2 - sm1) + 1.5 * (s0 - sp1);
      const hermite = ((c3 * frac + c2) * frac + c1) * frac + c0;

      // Blend 65% band-limited Hermite with 35% Zero-Order Hold staircase for authentic 1997 DAC grit
      output[i] = 0.65 * hermite + 0.35 * s0;
    }

    if (n >= 2) {
      this.prevSampleMinus1 = sourceSamples[n - 2];
      this.prevSample0 = sourceSamples[n - 1];
    } else if (n === 1) {
      this.prevSampleMinus1 = this.prevSample0;
      this.prevSample0 = sourceSamples[0];
    }

    return output;
  }

  /**
   * Called when the BIOS starts a new ADPCM DAC stream at $56A3 -> $56B4 (Bank 5).
   * If a previous fast-boot stream is still queued far ahead, cancels the skipped stream
   * so the newly triggered sound (e.g. Cartridge Launch Chime) plays immediately.
   */
  public onDacStreamStart(isFastBooting: boolean = false) {
    this.dcPrevX = 0;
    this.dcPrevY = 0;
    if (isFastBooting) {
      this.clearScheduledDacStream();
    } else if (this.ctx && this.nextDacPlayTime - this.ctx.currentTime > 0.35) {
      this.clearScheduledDacStream();
    }
  }

  public clearScheduledDacStream() {
    this.dacSampleQueue.length = 0;
    this.bootCaptureSamples.length = 0;
    for (const src of this.scheduledDacSources) {
      try {
        src.stop();
      } catch {}
    }
    this.scheduledDacSources.length = 0;
    if (this.ctx) {
      this.nextDacPlayTime = this.ctx.currentTime;
    }
  }

  /**
   * Receives an 8-bit unsigned PCM sample (0..255, centered at 128) written by the SM8521 CPU
   * to the SGDA ($004E) register during the BIOS boot chime, cartridge fanfare, or game audio.
   */
  public pushDacSample(u8Val: number, hwSampleRate: number = 7877) {
    this.initContext();
    this.currentDacRate = hwSampleRate;
    this.idleFramesSinceDacWrite = 0;

    // Normalize 8-bit unsigned DAC step (0..255 -> -1.0..+0.992)
    const quantized = ((u8Val & 0xff) - 128) / 128.0;

    // 1st-order high-pass DC blocker (models series electrolytic coupling capacitor)
    const dcFree = quantized - this.dcPrevX + 0.994 * this.dcPrevY;
    this.dcPrevX = quantized;
    this.dcPrevY = dcFree;

    const clamped = Math.max(-1.0, Math.min(1.0, dcFree * 0.85));
    this.dacSampleQueue.push(clamped);

    // If AudioContext is still suspended on initial page load, capture the boot chime
    // so it can play if the user interacts within a few seconds of boot
    if (!this.ctx || this.ctx.state !== 'running') {
      if (this.bootCaptureSamples.length < 65536) {
        if (this.bootCaptureSamples.length === 0) {
          this.bootCaptureTimestamp = performance.now();
        }
        this.bootCaptureRate = hwSampleRate;
        this.bootCaptureSamples.push(clamped);
      }
      if (this.dacSampleQueue.length >= 2048) {
        this.dacSampleQueue.length = 0;
      }
      return;
    }

    if (this.dacSampleQueue.length >= 512) {
      this.flushDacStream();
    }
  }

  /**
   * Called once per hardware frame to flush any remaining DAC samples when a stream ends.
   */
  public endFrameDacCheck() {
    if (this.dacSampleQueue.length > 0) {
      this.idleFramesSinceDacWrite++;
      if (this.idleFramesSinceDacWrite >= 2) {
        this.flushDacStream();
      }
    }
  }

  public flushDacStream() {
    if (this.dacSampleQueue.length === 0) return;
    if (!this.ctx || !this.speakerInput || this.isMuted || this.ctx.state !== 'running') {
      this.dacSampleQueue.length = 0;
      return;
    }

    const rawChunk = new Float32Array(this.dacSampleQueue);
    this.dacSampleQueue.length = 0;

    this.scheduleResampledBuffer(rawChunk, this.currentDacRate, 0.72);
  }

  private scheduleResampledBuffer(
    rawSamples: Float32Array,
    sourceRate: number,
    gainLevel: number = 0.72
  ) {
    if (!this.ctx || !this.speakerInput || rawSamples.length === 0) return;

    try {
      const targetRate = this.ctx.sampleRate;
      const resampled = this.resampleSampleStream(rawSamples, sourceRate, targetRate);
      if (resampled.length === 0) return;

      const audioBuf = this.ctx.createBuffer(1, resampled.length, targetRate);
      audioBuf.getChannelData(0).set(resampled);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuf;

      const chunkGain = this.ctx.createGain();
      chunkGain.gain.value = gainLevel;

      source.connect(chunkGain);
      chunkGain.connect(this.speakerInput);

      const now = this.ctx.currentTime;
      if (this.nextDacPlayTime < now + 0.005) {
        this.nextDacPlayTime = now + 0.012;
      }

      source.start(this.nextDacPlayTime);
      this.nextDacPlayTime += resampled.length / targetRate;

      this.scheduledDacSources.push(source);
      source.onended = () => {
        const idx = this.scheduledDacSources.indexOf(source);
        if (idx !== -1) {
          this.scheduledDacSources.splice(idx, 1);
        }
      };
    } catch {
      // Ignore scheduling errors if context is suspended
    }
  }

  private tryPlayPendingBootCapture() {
    if (
      this.hasPlayedUnlockedBootCapture ||
      this.bootCaptureSamples.length < 1024 ||
      !this.ctx ||
      this.ctx.state !== 'running'
    ) {
      return;
    }
    this.hasPlayedUnlockedBootCapture = true;
    // Play captured boot chime if unlocked within 6 seconds of initial boot
    if (performance.now() - this.bootCaptureTimestamp <= 6000 && this.scheduledDacSources.length === 0) {
      const captured = new Float32Array(this.bootCaptureSamples);
      this.bootCaptureSamples.length = 0;
      this.scheduleResampledBuffer(captured, this.bootCaptureRate, 0.72);
    } else {
      this.bootCaptureSamples.length = 0;
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
      lastOut = (lastOut + 0.02 * white) / 1.02;
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
   * Channel 1: Play raw tone with frequency and duration through the internal speaker filter chain
   */
  public playTone(
    freq: number,
    durationSec: number = 0.1,
    type: OscillatorType = 'square',
    gainVal: number = 0.25
  ) {
    this.initContext();
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || this.isMuted) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationSec);

      osc.connect(gain);
      gain.connect(outNode);

      osc.start();
      osc.stop(this.ctx.currentTime + durationSec);
    } catch {
      // Ignore audio errors during suspended state
    }
  }

  /**
   * Channel 2: Noise / Percussive explosion / hit through the internal speaker filter chain
   */
  public playNoise(durationSec: number = 0.15, gainVal: number = 0.3) {
    this.initContext();
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || !this.noiseBuffer || this.isMuted) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationSec);

      source.connect(gain);
      gain.connect(outNode);

      source.start();
      source.stop(this.ctx.currentTime + durationSec);
    } catch {}
  }

  /**
   * Plays a digitized 4-bit waveform stream from the Tiger Game.Com BIOS ($2354 -> $5F37)
   * using sample-rate conversion (~7,877 Hz -> AudioContext.sampleRate) and the speaker band-pass chain.
   */
  public playBiosAudioClip(samples: Uint8Array, bank: number, _addr: number) {
    this.initContext();
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || this.isMuted || samples.length === 0) return;

    try {
      if (this.activeClipSource) {
        try {
          this.activeClipSource.stop();
        } catch {}
        this.activeClipSource = null;
      }

      const sourceRate = bank === 0x0e ? 7877 : 8000;
      const numFrames = samples.length * 2;
      const rawMono = new Float32Array(numFrames);

      let prevX = 0;
      let prevY = 0;
      for (let i = 0; i < samples.length; i++) {
        const b = samples[i];
        const lo = (b & 0x0f) - 8;
        const hi = ((b >> 4) & 0x0f) - 8;

        const x0 = lo / 8.0;
        prevY = x0 - prevX + 0.985 * prevY;
        prevX = x0;
        rawMono[i * 2] = Math.max(-1, Math.min(1, prevY * 0.6));

        const x1 = hi / 8.0;
        prevY = x1 - prevX + 0.985 * prevY;
        prevX = x1;
        rawMono[i * 2 + 1] = Math.max(-1, Math.min(1, prevY * 0.6));
      }

      const targetRate = this.ctx.sampleRate;
      const resampled = this.resampleSampleStream(rawMono, sourceRate, targetRate);
      const audioBuf = this.ctx.createBuffer(1, resampled.length, targetRate);
      audioBuf.getChannelData(0).set(resampled);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuf;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.55;

      source.connect(gain);
      gain.connect(outNode);

      this.activeClipSource = source;
      source.start();
    } catch {
      // Ignore if AudioContext is still blocked by browser autoplay policy
    }
  }

  /**
   * Fallback synthesized boot jingle routed through the internal speaker band-pass & distortion stage
   */
  public playBootJingle() {
    this.initContext();
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0.18, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.22);

      osc.connect(gain);
      gain.connect(outNode);

      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.25);
    });
  }

  /**
   * Stylus Tap — Emulator UI sound effects removed for pure SM8521 hardware audio accuracy.
   */
  public playTouchBeep() {
    this.initContext();
  }

  /**
   * Button Press — Emulator UI sound effects removed for pure SM8521 hardware audio accuracy.
   */
  public playButtonPress() {
    this.initContext();
  }

  /**
   * Cartridge Insert / Eject — Emulator UI sound effects removed for pure SM8521 hardware audio accuracy.
   */
  public playCartridgeClick() {
    this.initContext();
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
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.linearRampToValueAtTime(65, t + 0.4);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(outNode);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  /**
   * Sonic Jam: Ring Collect Sound
   */
  public playRingSound() {
    this.initContext();
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, t); // C6
    osc.frequency.setValueAtTime(1318.51, t + 0.05); // E6
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(outNode);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * Sonic Jam: Jump Spring Sound
   */
  public playJumpSound() {
    this.initContext();
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(outNode);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /**
   * 14.4k Dial-up Modem Connect sound emulation
   */
  public playModemDialup(onComplete?: () => void) {
    this.initContext();
    const outNode = this.getOutputNode();
    if (!this.ctx || !outNode || this.isMuted) {
      if (onComplete) setTimeout(onComplete, 1200);
      return;
    }

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.frequency.value = 350;
    osc2.frequency.value = 440;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.setValueAtTime(0, t + 0.4);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(outNode);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);

    const dtmfPairs = [
      [697, 1209],
      [770, 1336],
      [852, 1477],
      [941, 1336]
    ];
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
      dg.connect(outNode);
      d1.start(dt);
      d2.start(dt);
      d1.stop(dt + 0.08);
      d2.stop(dt + 0.08);
    });

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
        const gain = ((sound.sg0l & 0x1f) / 31) * 0.16;
        this.playTone(freq, 0.055, 'square', gain);
      }
    }

    // Channel 1 programmable tone / wave
    if ((sound.sgc & 0x02) && sound.sg1t > 8 && (sound.sg1l & 0x1f) > 0) {
      if (now - this.lastCh1Time >= 0.025) {
        this.lastCh1Time = now;
        const freq = Math.min(4500, Math.max(55, 262144 / (sound.sg1t + 1)));
        const gain = ((sound.sg1l & 0x1f) / 31) * 0.16;
        this.playTone(freq, 0.055, 'triangle', gain);
      }
    }

    // Channel 2 programmable tone / noise
    if ((sound.sgc & 0x04) && sound.sg2t > 8 && (sound.sg2l & 0x1f) > 0) {
      if (now - this.lastCh2Time >= 0.025) {
        this.lastCh2Time = now;
        const freq = Math.min(4500, Math.max(55, 262144 / (sound.sg2t + 1)));
        const gain = ((sound.sg2l & 0x1f) / 31) * 0.13;
        this.playTone(freq, 0.05, 'sawtooth', gain);
      }
    }
  }
}


