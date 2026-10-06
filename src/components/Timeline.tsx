// ============================================================
// タイムライン・波形表示コンポーネント
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { AudioState, BeatInfo } from '../types';

interface TimelineProps {
  audioState: AudioState;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onFileUpload: (file: File) => void;
  onBeatAutoPlace: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  audioState,
  isPlaying,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onFileUpload,
  onBeatAutoPlace,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 波形を描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (!audioState.isLoaded) {
      // 未ロード時のプレースホルダー
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BGMをアップロードすると波形が表示されます', width / 2, height / 2);
      return;
    }

    // 背景
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // 波形描画
    if (audioState.waveformData) {
      const data = audioState.waveformData;
      const step = data.length / width;

      // 影の波形（ミラー）
      ctx.fillStyle = 'rgba(108,99,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      for (let x = 0; x < width; x++) {
        const idx = Math.floor(x * step);
        const val = data[idx] ?? 0;
        ctx.lineTo(x, height / 2 + val * (height / 2) * 0.9);
      }
      ctx.lineTo(width, height / 2);
      ctx.closePath();
      ctx.fill();

      // メイン波形
      ctx.strokeStyle = 'rgba(108,99,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      for (let x = 0; x < width; x++) {
        const idx = Math.floor(x * step);
        const val = data[idx] ?? 0;
        ctx.lineTo(x, height / 2 - val * (height / 2) * 0.9);
      }
      ctx.stroke();

      // 下半分（ミラー）
      ctx.strokeStyle = 'rgba(108,99,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      for (let x = 0; x < width; x++) {
        const idx = Math.floor(x * step);
        const val = data[idx] ?? 0;
        ctx.lineTo(x, height / 2 + val * (height / 2) * 0.9);
      }
      ctx.stroke();
    }

    // ビートマーカー描画
    if (audioState.beats.length > 0) {
      for (const beat of audioState.beats) {
        const x = (beat.time / audioState.duration) * width;
        const alpha = 0.3 + beat.intensity * 0.5;
        ctx.strokeStyle = `rgba(249,212,35,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // ビートドット
        if (beat.intensity > 0.5) {
          ctx.fillStyle = `rgba(249,212,35,${alpha})`;
          ctx.beginPath();
          ctx.arc(x, height / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 再生位置インジケーター
    if (audioState.duration > 0) {
      const playX = (audioState.currentTime / audioState.duration) * width;

      // 再生済み領域をオーバーレイ
      ctx.fillStyle = 'rgba(108,99,255,0.12)';
      ctx.fillRect(0, 0, playX, height);

      // 再生位置ライン
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();

      // 再生ヘッド三角
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(playX - 5, 0);
      ctx.lineTo(playX + 5, 0);
      ctx.lineTo(playX, 8);
      ctx.closePath();
      ctx.fill();
    }

    // 中央ライン
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

  }, [audioState]);

  // シーク操作
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioState.isLoaded || !audioState.duration) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    onSeek(ratio * audioState.duration);
  }, [audioState, onSeek]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !audioState.isLoaded || !audioState.duration) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    onSeek(ratio * audioState.duration);
  }, [isDragging, audioState, onSeek]);

  // ファイルドロップ
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i))) {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-gd-panel border-t border-gd-border"
      style={{ height: '160px' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* コントロールバー */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gd-border flex-shrink-0">
        {/* BGMアップロード */}
        <label className="cursor-pointer">
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])}
          />
          <span className="flex items-center gap-1 text-xs px-2 py-1 bg-white/10 hover:bg-white/15 rounded text-gray-300 transition-colors">
            <span>🎵</span>
            <span>{audioState.isLoaded ? audioState.fileName.slice(0, 20) : 'BGMアップロード'}</span>
          </span>
        </label>

        {/* 再生コントロール */}
        <div className="flex items-center gap-1">
          <CtrlBtn onClick={onStop} title="停止" disabled={!audioState.isLoaded}>⏹</CtrlBtn>
          <CtrlBtn
            onClick={isPlaying ? onPause : onPlay}
            title={isPlaying ? '一時停止' : '再生'}
            disabled={!audioState.isLoaded}
            active={isPlaying}
          >
            {isPlaying ? '⏸' : '▶'}
          </CtrlBtn>
        </div>

        {/* 時間表示 */}
        <span className="font-mono text-xs text-gray-400">
          {formatTime(audioState.currentTime)} / {formatTime(audioState.duration)}
        </span>

        {/* BPM表示 */}
        {audioState.isLoaded && (
          <span className="text-xs px-2 py-0.5 bg-gd-accent/20 text-gd-accent rounded font-mono">
            {audioState.bpm} BPM
          </span>
        )}

        {/* ビート数 */}
        {audioState.beats.length > 0 && (
          <span className="text-xs text-gray-500">
            ビート: {audioState.beats.length}個
          </span>
        )}

        {/* 自動配置ボタン */}
        {audioState.beats.length > 0 && (
          <button
            onClick={onBeatAutoPlace}
            className="ml-auto text-xs px-3 py-1 bg-gd-yellow/20 hover:bg-gd-yellow/30 text-gd-yellow rounded transition-colors font-medium"
            title="検出したビートに合わせてオブジェクトを自動配置"
          >
            🎯 ビート自動配置
          </button>
        )}
      </div>

      {/* 波形キャンバス */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          width={1200}
          height={100}
          className="w-full h-full cursor-crosshair"
          onClick={handleCanvasClick}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onMouseMove={handleMouseMove}
        />
        {/* ビートリスト（ホバー時ツールチップ的に表示） */}
        {!audioState.isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <label className="pointer-events-auto cursor-pointer text-center">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])}
              />
              <div className="px-4 py-2 border border-dashed border-gray-600 rounded-lg hover:border-gd-accent transition-colors">
                <p className="text-xs text-gray-500">ここにドロップ または クリックしてBGMを選択</p>
                <p className="text-[10px] text-gray-600 mt-0.5">MP3 / WAV / OGG 対応</p>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

const CtrlBtn: React.FC<{
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, disabled, active, children }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`
      w-7 h-7 flex items-center justify-center rounded text-sm transition-all
      ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/15 cursor-pointer'}
      ${active ? 'bg-gd-accent/30 text-gd-accent' : 'text-gray-400'}
    `}
  >
    {children}
  </button>
);
