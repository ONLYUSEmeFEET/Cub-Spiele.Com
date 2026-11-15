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

  private volume: number = 0.2;
  private isMuted: boolean = false;
  private activeClipSource: AudioBufferSourceNode | null = null;

  // Cycle-accurate SM8521 SG0/SG1 32-step wavetable + SG2 15-bit LFSR noise synthesizer
  private toneSgc: number = 0;
  private toneSg0l: number = 0;
  private toneSg1l: number = 0;
  private toneSg2l: number = 0;
  private toneSg0t: number = 0;
  private toneSg1t: number = 0;
  private toneSg2t: number = 0;
  private toneSg0w: Uint8Array = new Uint8Array(16);
  private toneSg1w: Uint8Array = new Uint8Array(16);
  private sg0Run: boolean = false;
  private sg0Index: number = 0;
  private sg0Div: number = 0;
  private sg0Sample: number = 0;
  private sg1Run: boolean = false;
  private sg1Index: number = 0;
  private sg1Div: number = 0;
  private sg1Sample: number = 0;
  private sg2Run: boolean = false;
  private sg2Div: number = 0;
  private sg2Lfsr: number = 0x7fff;
  private sg2Sample: number = 0;
  private lastToneCycle: number = 0;
  private toneCycleAccum: number = 0;
  private toneFrameSamples: number[] = [];
  private toneDcPrevX: number = 0;
  private toneDcPrevY: number = 0;
  private nextTonePlayTime: number = 0;
  private scheduledToneSources: AudioBufferSourceNode[] = [];
  private suppressToneOutput: boolean = false;

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
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          this.tryPlayPendingBootCapture();
        })
        .catch(() => {});
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
    this.resetToneSynthesizer();
  }

  public resetToneSynthesizer() {
    this.toneSgc = 0;
    this.toneSg0l = 0;
    this.toneSg1l = 0;
    this.toneSg2l = 0;
    this.toneSg0t = 0;
    this.toneSg1t = 0;
    this.toneSg2t = 0;
    this.toneSg0w.fill(0);
    this.toneSg1w.fill(0);
    this.sg0Run = false;
    this.sg0Index = 0;
    this.sg0Div = 0;
    this.sg0Sample = 0;
    this.sg1Run = false;
    this.sg1Index = 0;
    this.sg1Div = 0;
    this.sg1Sample = 0;
    this.sg2Run = false;
    this.sg2Div = 0;
    this.sg2Lfsr = 0x7fff;
    this.sg2Sample = 0;
    this.lastToneCycle = 0;
    this.toneCycleAccum = 0;
    this.toneFrameSamples.length = 0;
    this.toneDcPrevX = 0;
    this.toneDcPrevY = 0;
    this.nextTonePlayTime = 0;
    for (const src of this.scheduledToneSources) {
      try {
        src.stop();
      } catch {}
    }
    this.scheduledToneSources.length = 0;
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
   * Play hardware programmable tone with frequency and duration through the internal speaker filter chain
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

  private readSignedWaveSample(wave: Uint8Array, step: number): number {
    const byte = wave[(step >> 1) & 0x0f] || 0;
    const nib = (step & 1) === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
    return nib >= 8 ? nib - 16 : nib;
  }

  private integrateWaveChannel(
    ch: 0 | 1,
    period: number,
    cyclesWindow: number
  ): number {
    const wave = ch === 0 ? this.toneSg0w : this.toneSg1w;
    let div = ch === 0 ? this.sg0Div : this.sg1Div;
    let index = ch === 0 ? this.sg0Index : this.sg1Index;
    let sample = ch === 0 ? this.sg0Sample : this.sg1Sample;
    let sum = 0;
    let left = cyclesWindow;

    while (left > 0) {
      const stepSpan = div + 1;
      if (stepSpan > left) {
        sum += sample * left;
        div -= left;
        left = 0;
      } else {
        sum += sample * stepSpan;
        left -= stepSpan;
        div = period;
        sample = this.readSignedWaveSample(wave, index);
        index = index === 31 ? 0 : index + 1;
      }
    }

    if (ch === 0) {
      this.sg0Div = div;
      this.sg0Index = index;
      this.sg0Sample = sample;
    } else {
      this.sg1Div = div;
      this.sg1Index = index;
      this.sg1Sample = sample;
    }
    return sum / cyclesWindow;
  }

  private integrateNoiseChannel(period: number, cyclesWindow: number): number {
    let div = this.sg2Div;
    let lfsr = this.sg2Lfsr;
    let sample = this.sg2Sample;
    let sum = 0;
    let left = cyclesWindow;

    while (left > 0) {
      const stepSpan = div + 1;
      if (stepSpan > left) {
        sum += sample * left;
        div -= left;
        left = 0;
      } else {
        sum += sample * stepSpan;
        left -= stepSpan;
        div = period;
        const nextBit = (lfsr ^ (lfsr >> 1)) & 1;
        const shifted = ((lfsr >> 1) | (nextBit << 14)) & 0x7fff;
        lfsr = shifted === 0 ? 0x7fff : shifted;
        sample = (lfsr & 1) === 0 ? 7 : -8;
      }
    }

    this.sg2Div = div;
    this.sg2Lfsr = lfsr;
    this.sg2Sample = sample;
    return sum / cyclesWindow;
  }

  private advanceToneSamples(targetCycles: number) {
    const deltaCycles = targetCycles - this.lastToneCycle;
    if (deltaCycles < 0) {
      this.lastToneCycle = targetCycles;
      this.toneCycleAccum = 0;
      return;
    }
    if (deltaCycles === 0) return;
    this.lastToneCycle = targetCycles;

    if (this.suppressToneOutput || !this.ctx || !this.speakerInput || this.isMuted || this.ctx.state !== 'running') {
      return;
    }

    const sgc = this.toneSgc;
    const p0 = this.toneSg0t & 0x0fff;
    const p1 = this.toneSg1t & 0x0fff;
    const p2 = this.toneSg2t & 0x0fff;
    const ch0Active = (sgc & 0x80) !== 0 && (sgc & 0x01) !== 0 && p0 > 1;
    const ch1Active = (sgc & 0x80) !== 0 && (sgc & 0x02) !== 0 && p1 > 1;
    const ch2Active = (sgc & 0x80) !== 0 && (sgc & 0x04) !== 0 && p2 > 1;
    const anyChannelOn =
      (sgc & 0x80) !== 0 && ((sgc & 0x01) !== 0 || (sgc & 0x02) !== 0 || (sgc & 0x04) !== 0);

    // Fast path: skip silent or pure direct-DAC segments when no frame audio is pending
    if (!anyChannelOn && this.toneFrameSamples.length === 0) {
      return;
    }

    const targetRate = this.ctx.sampleRate || 44100;
    const cyclesPerSample = 4915200 / targetRate;
    this.toneCycleAccum += deltaCycles;

    const l0 = (this.toneSg0l & 0x1f) / (32 * 16);
    const l1 = (this.toneSg1l & 0x1f) / (32 * 16);
    const l2 = (this.toneSg2l & 0x1f) / (32 * 16);

    while (this.toneCycleAccum >= cyclesPerSample) {
      this.toneCycleAccum -= cyclesPerSample;

      let mix = 0;
      if (ch0Active) {
        mix += this.integrateWaveChannel(0, p0, cyclesPerSample) * l0;
      } else if ((sgc & 0x80) !== 0 && (sgc & 0x01) !== 0) {
        mix += this.sg0Sample * l0;
      }

      if (ch1Active) {
        mix += this.integrateWaveChannel(1, p1, cyclesPerSample) * l1;
      } else if ((sgc & 0x80) !== 0 && (sgc & 0x02) !== 0) {
        mix += this.sg1Sample * l1;
      }

      if (ch2Active) {
        mix += this.integrateNoiseChannel(p2, cyclesPerSample) * l2;
      } else if ((sgc & 0x80) !== 0 && (sgc & 0x04) !== 0) {
        mix += this.sg2Sample * l2;
      }

      if (mix > 1) mix = 1;
      else if (mix < -1) mix = -1;

      const dcFree = mix - this.toneDcPrevX + 0.996 * this.toneDcPrevY;
      this.toneDcPrevX = mix;
      this.toneDcPrevY = dcFree;
      this.toneFrameSamples.push(Math.max(-1, Math.min(1, dcFree * 0.72)));
    }
  }

  /**
   * Hardware Sound Generator (SM8521 $0040-$004E, $0060-$007F):
   * - SG0 / SG1: 32-step signed 4-bit wavetable channels (SG0W / SG1W, low nibble first)
   * - SG2: 15-bit LFSR noise channel (bit0 ^ bit1 -> bit14, reload $7FFF on zero)
   * - 12-bit period registers (SGxTH[3:0]:SGxTL, active for period > 1, N+1 phi0 ticks)
   * - SGC channel bits pause without resetting phase; period <= 1 resets generator state
   */
  public updateFromHardwareRegisters(
    sound: {
      sgc: number;
      sg0l: number;
      sg1l: number;
      sg2l: number;
      sg0t: number;
      sg1t: number;
      sg2t: number;
      sg0w?: Uint8Array;
      sg1w?: Uint8Array;
    },
    currentCycles?: number
  ) {
    if (currentCycles !== undefined) {
      this.advanceToneSamples(currentCycles);
    }

    this.toneSgc = sound.sgc & 0xff;
    this.toneSg0l = sound.sg0l & 0xff;
    this.toneSg1l = sound.sg1l & 0xff;
    this.toneSg2l = sound.sg2l & 0xff;
    this.toneSg0t = sound.sg0t & 0xffff;
    this.toneSg1t = sound.sg1t & 0xffff;
    this.toneSg2t = sound.sg2t & 0xffff;
    if (sound.sg0w) this.toneSg0w.set(sound.sg0w);
    if (sound.sg1w) this.toneSg1w.set(sound.sg1w);

    const p0 = this.toneSg0t & 0x0fff;
    const p1 = this.toneSg1t & 0x0fff;
    const p2 = this.toneSg2t & 0x0fff;
    const globalOn = (this.toneSgc & 0x80) !== 0;

    if (globalOn && (this.toneSgc & 0x01) !== 0 && p0 > 1) {
      if (!this.sg0Run) {
        this.sg0Run = true;
        this.sg0Index = 1;
        this.sg0Div = p0;
        this.sg0Sample = this.readSignedWaveSample(this.toneSg0w, 0);
      }
    } else if (p0 <= 1) {
      this.sg0Run = false;
      this.sg0Index = 0;
      this.sg0Div = 0;
      this.sg0Sample = 0;
    }

    if (globalOn && (this.toneSgc & 0x02) !== 0 && p1 > 1) {
      if (!this.sg1Run) {
        this.sg1Run = true;
        this.sg1Index = 1;
        this.sg1Div = p1;
        this.sg1Sample = this.readSignedWaveSample(this.toneSg1w, 0);
      }
    } else if (p1 <= 1) {
      this.sg1Run = false;
      this.sg1Index = 0;
      this.sg1Div = 0;
      this.sg1Sample = 0;
    }

    if (globalOn && (this.toneSgc & 0x04) !== 0 && p2 > 1) {
      if (!this.sg2Run) {
        this.sg2Run = true;
        this.sg2Div = p2;
        this.sg2Lfsr = 0x7fff;
        this.sg2Sample = 0;
      }
    } else if (p2 <= 1) {
      this.sg2Run = false;
      this.sg2Div = 0;
      this.sg2Lfsr = 0x7fff;
      this.sg2Sample = 0;
    }
  }

  public setSuppressToneOutput(suppress: boolean) {
    this.suppressToneOutput = suppress;
    if (suppress) {
      this.toneFrameSamples.length = 0;
      this.nextTonePlayTime = 0;
    }
  }

  public endToneFrame(currentCycles: number, suppress: boolean = false) {
    this.suppressToneOutput = suppress;
    this.advanceToneSamples(currentCycles);

    if (
      suppress ||
      !this.ctx ||
      !this.speakerInput ||
      this.isMuted ||
      this.ctx.state !== 'running'
    ) {
      this.toneFrameSamples.length = 0;
      this.nextTonePlayTime = 0;
      return;
    }

    if (this.toneFrameSamples.length === 0) {
      return;
    }

    try {
      const targetRate = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, this.toneFrameSamples.length, targetRate);
      buf.getChannelData(0).set(this.toneFrameSamples);
      this.toneFrameSamples.length = 0;

      const source = this.ctx.createBufferSource();
      source.buffer = buf;
      source.connect(this.speakerInput);

      const now = this.ctx.currentTime;
      if (this.nextTonePlayTime < now + 0.005 || this.nextTonePlayTime > now + 0.09) {
        this.nextTonePlayTime = now + 0.015;
      }

      source.start(this.nextTonePlayTime);
      this.nextTonePlayTime += buf.length / targetRate;

      this.scheduledToneSources.push(source);
      source.onended = () => {
        const idx = this.scheduledToneSources.indexOf(source);
        if (idx !== -1) {
          this.scheduledToneSources.splice(idx, 1);
        }
      };
    } catch {
      this.toneFrameSamples.length = 0;
    }
  }
}
