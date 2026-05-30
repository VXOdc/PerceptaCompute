import { RiskLevel, Direction } from './types';

/**
 * SpatialAudio uses the Web Audio API to provide directional and urgency-based alerts.
 */
export class SpatialAudio {
  private ctx: AudioContext | null = null;
  private panner: StereoPannerNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private isActive = false;

  private init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.panner = this.ctx.createStereoPanner();
    this.gain = this.ctx.createGain();
    
    this.panner.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.gain.gain.value = 0;
  }

  /**
   * Update the audio state based on current risk and direction.
   */
  update(risk: RiskLevel, direction: Direction) {
    if (typeof window === 'undefined') return;
    if (risk === 'SAFE') {
      this.stop();
      return;
    }

    this.init();
    if (!this.ctx || !this.panner || !this.gain) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Set pan: LEFT = -1, FRONT = 0, RIGHT = 1
    let panValue = 0;
    if (direction === 'LEFT') panValue = -0.8;
    if (direction === 'RIGHT') panValue = 0.8;
    this.panner.pan.setTargetAtTime(panValue, this.ctx.currentTime, 0.1);

    // Set urgency: DANGER = high pitch/fast, WARNING = mid pitch/slow
    const frequency = risk === 'DANGER' ? 880 : 440;
    const volume = risk === 'DANGER' ? 0.3 : 0.15;

    if (!this.isActive) {
      this.start(frequency, volume);
    } else if (this.oscillator) {
      this.oscillator.frequency.setTargetAtTime(frequency, this.ctx.currentTime, 0.1);
      this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
  }

  private start(freq: number, vol: number) {
    if (!this.ctx || !this.gain) return;
    
    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.setValueAtTime(freq, this.ctx.currentTime);
    this.oscillator.connect(this.panner!);
    
    this.oscillator.start();
    this.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
    this.isActive = true;
  }

  stop() {
    if (!this.isActive || !this.gain || !this.ctx) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => {
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
        this.oscillator = null;
      }
      this.isActive = false;
    }, 150);
  }
}

export const audioEngine = new SpatialAudio();
