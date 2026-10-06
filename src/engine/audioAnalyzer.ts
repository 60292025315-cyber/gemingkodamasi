// ============================================================
// Kiro Dash Studio - 音声解析エンジン（Web Audio API）
// ============================================================

import type { BeatInfo, AudioState } from '../types';

export class AudioAnalyzer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private startTime = 0;
  private pausedAt = 0;
  private isPlaying = false;
  private fileName = '';
  private onBeat?: (beat: BeatInfo) => void;
  private animFrameId = 0;
  private lastSyncTime = 0;    // 最後に seekTo を呼んだ audioCtx 時刻
  private lastNotifyTime = 0;  // notifyState の throttle 用

  // 波形データ（全体、一度解析すれば変わらない）
  private _waveformData: Float32Array | null = null;
  // 検出済みビートリスト
  private _beats: BeatInfo[] = [];
  // リアルタイム周波数データ
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  // BPM推定
  private _bpm = 0;
  // 状態変更コールバック
  private onStateChange?: (state: AudioState) => void;

  // -------- 初期化 --------

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  setOnBeat(cb: (beat: BeatInfo) => void): void {
    this.onBeat = cb;
  }

  setOnStateChange(cb: (state: AudioState) => void): void {
    this.onStateChange = cb;
  }

  // -------- ファイル読み込み --------

  async loadFile(file: File): Promise<void> {
    const ctx = this.ensureContext();
    this.fileName = file.name;

    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // 波形データを抽出（左チャンネル）
    this._waveformData = this.extractWaveform(this.audioBuffer, 2000);

    // ビート検出
    this._beats = this.detectBeats(this.audioBuffer);
    this._bpm = this.estimateBPM(this._beats);

    this.notifyStateImmediate();
  }

  // -------- 波形データ抽出 --------

  private extractWaveform(buffer: AudioBuffer, samples: number): Float32Array {
    const channelData = buffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / samples);
    const waveform = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      let max = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      waveform[i] = max;
    }
    return waveform;
  }

  // -------- ビート検出（エネルギー閾値法） --------

  private detectBeats(buffer: AudioBuffer): BeatInfo[] {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    // 約10msごとにエネルギーを計算
    const windowSize = Math.floor(sampleRate * 0.01);
    const beats: BeatInfo[] = [];

    // エネルギー配列
    const energies: number[] = [];
    for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += channelData[i + j] ** 2;
      }
      energies.push(energy / windowSize);
    }

    // 局所平均との比較でビート判定
    const localWindow = 43; // 約430ms の局所窓
    let lastBeatTime = -0.5; // 最低でも0.5秒間隔

    for (let i = localWindow; i < energies.length - localWindow; i++) {
      const localAvg =
        energies.slice(i - localWindow, i + localWindow).reduce((a, b) => a + b, 0) /
        (localWindow * 2);

      const threshold = localAvg * 1.4; // 閾値係数
      const currentTime = (i * windowSize) / sampleRate;

      if (
        energies[i] > threshold &&
        currentTime - lastBeatTime > 0.25 && // 最小間隔0.25s
        this.isLocalPeak(energies, i, 3)
      ) {
        beats.push({
          time: currentTime,
          intensity: Math.min(energies[i] / (localAvg * 3), 1),
          frequency: this.estimateDominantFreq(channelData, i * windowSize, sampleRate),
        });
        lastBeatTime = currentTime;
      }
    }

    return beats;
  }

  private isLocalPeak(arr: number[], idx: number, range: number): boolean {
    for (let i = Math.max(0, idx - range); i <= Math.min(arr.length - 1, idx + range); i++) {
      if (i !== idx && arr[i] >= arr[idx]) return false;
    }
    return true;
  }

  private estimateDominantFreq(
    data: Float32Array,
    offset: number,
    sampleRate: number
  ): number {
    // 簡易ゼロ交差法
    const window = 512;
    let crossings = 0;
    for (let i = offset; i < offset + window - 1 && i < data.length - 1; i++) {
      if ((data[i] >= 0) !== (data[i + 1] >= 0)) crossings++;
    }
    return (crossings * sampleRate) / (window * 2);
  }

  // -------- BPM推定 --------

  private estimateBPM(beats: BeatInfo[]): number {
    if (beats.length < 4) return 120;

    const intervals: number[] = [];
    for (let i = 1; i < Math.min(beats.length, 50); i++) {
      intervals.push(beats[i].time - beats[i - 1].time);
    }

    // 最頻インターバルを探す
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    const bpm = Math.round(60 / median);

    // 合理的な範囲にクランプ
    return Math.max(60, Math.min(220, bpm));
  }

  // -------- 再生制御 --------

  play(): void {
    if (!this.audioBuffer || !this.audioCtx) return;
    if (this.isPlaying) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.source = this.audioCtx.createBufferSource();
    this.source.buffer = this.audioBuffer;

    // アナライザー接続
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

    this.source.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    this.source.start(0, this.pausedAt);
    this.startTime = this.audioCtx.currentTime - this.pausedAt;
    this.isPlaying = true;

    this.source.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.pausedAt = 0;
        this.notifyStateImmediate();
      }
    };

    this.startRealtimeAnalysis();
    this.notifyStateImmediate();
  }

  pause(): void {
    if (!this.isPlaying || !this.audioCtx) return;
    this.pausedAt = this.audioCtx.currentTime - this.startTime;
    this.source?.stop();
    this.isPlaying = false;
    cancelAnimationFrame(this.animFrameId);
    this.notifyStateImmediate();
  }

  stop(): void {
    if (this.audioCtx) {
      this.source?.stop();
    }
    this.isPlaying = false;
    this.pausedAt = 0;
    this.lastSyncTime = 0;  // 次の seekTo を即座に受け付ける
    cancelAnimationFrame(this.animFrameId);
    this.notifyStateImmediate();
  }

  seekTo(time: number): void {
    if (!this.audioCtx) return;
    // 連続シークによる音飛びを防ぐため 0.5s に1回まで
    const now = this.audioCtx.currentTime;
    if (now - this.lastSyncTime < 0.5) return;
    this.lastSyncTime = now;

    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.source?.stop();
      this.isPlaying = false;
    }
    this.pausedAt = Math.max(0, Math.min(time, this.audioBuffer?.duration ?? 0));
    if (wasPlaying) this.play();
    else this.notifyStateImmediate();
  }

  getCurrentTime(): number {
    if (!this.audioCtx) return 0;
    if (this.isPlaying) {
      return this.audioCtx.currentTime - this.startTime;
    }
    return this.pausedAt;
  }

  // -------- リアルタイム周波数解析 --------

  private startRealtimeAnalysis(): void {
    const tick = () => {
      if (!this.isPlaying) return;
      this.animFrameId = requestAnimationFrame(tick);

      if (!this.analyser || !this.freqData) return;
      this.analyser.getByteFrequencyData(this.freqData);

      // バスドラム周波数帯（60-250Hz）のエネルギー
      const bassEnergy = this.getBandEnergy(60, 250);
      if (bassEnergy > 0.7 && this.onBeat) {
        this.onBeat({
          time: this.getCurrentTime(),
          intensity: bassEnergy,
          frequency: 100,
        });
      }

      // throttle: 100ms に1回だけ React に通知
      this.notifyState();
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  getFrequencyData(): Uint8Array<ArrayBuffer> | null {
    if (!this.analyser || !this.freqData) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  private getBandEnergy(lowHz: number, highHz: number): number {
    if (!this.analyser || !this.freqData || !this.audioCtx) return 0;
    const nyquist = this.audioCtx.sampleRate / 2;
    const binCount = this.analyser.frequencyBinCount;
    const lowBin = Math.floor((lowHz / nyquist) * binCount);
    const highBin = Math.floor((highHz / nyquist) * binCount);

    let sum = 0;
    for (let i = lowBin; i < highBin; i++) {
      sum += (this.freqData[i] || 0) / 255;
    }
    return sum / (highBin - lowBin);
  }

  // -------- ゲッター --------

  get waveformData(): Float32Array | null { return this._waveformData; }
  get beats(): BeatInfo[] { return this._beats; }
  get bpm(): number { return this._bpm; }
  get duration(): number { return this.audioBuffer?.duration ?? 0; }

  getState(): AudioState {
    return {
      isLoaded: !!this.audioBuffer,
      isPlaying: this.isPlaying,
      duration: this.duration,
      currentTime: this.getCurrentTime(),
      bpm: this._bpm,
      beats: this._beats,
      waveformData: this._waveformData,
      fileName: this.fileName,
    };
  }

  // rAF ループから呼ばれる: 100ms に1回だけ React に通知
  private notifyState(): void {
    const now = performance.now();
    if (now - this.lastNotifyTime < 100) return;
    this.lastNotifyTime = now;
    this.onStateChange?.(this.getState());
  }

  // 状態変化（ロード・再生開始・停止など）は即時通知
  private notifyStateImmediate(): void {
    this.lastNotifyTime = performance.now();
    this.onStateChange?.(this.getState());
  }

  // -------- クリーンアップ --------

  dispose(): void {
    this.stop();
    this.audioCtx?.close();
    this.audioCtx = null;
  }
}
