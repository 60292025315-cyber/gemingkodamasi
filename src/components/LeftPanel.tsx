// ============================================================
// 左パネル：ツール＆アセットパネル
// ============================================================

import React, { useState } from 'react';
import type { ObjectType, EditorMode, ToolItem } from '../types';
import { DIFFICULTY_PARAMS, type Difficulty } from '../engine/stageGenerator';

const TOOL_ITEMS: ToolItem[] = [
  { type: 'block',          label: 'ブロック',      icon: '⬜', color: '#4a90d9', defaultWidth: 40, defaultHeight: 40 },
  { type: 'spike',          label: 'トゲ',          icon: '🔺', color: '#f64f59', defaultWidth: 40, defaultHeight: 40 },
  { type: 'jump_pad',       label: 'ジャンプ台',    icon: '🟡', color: '#f9d423', defaultWidth: 60, defaultHeight: 20 },
  { type: 'jump_ring',      label: 'ジャンプリング', icon: '🟢', color: '#43e97b', defaultWidth: 40, defaultHeight: 40 },
  { type: 'portal_gravity', label: '重力ポータル',  icon: '🟣', color: '#6c63ff', defaultWidth: 30, defaultHeight: 80 },
  { type: 'portal_fly',     label: 'フライポータル', icon: '🔵', color: '#43e97b', defaultWidth: 30, defaultHeight: 80 },
  { type: 'portal_normal',  label: 'キューブポータル', icon: '🟤', color: '#f9d423', defaultWidth: 30, defaultHeight: 80 },
  { type: 'saw',            label: 'ノコギリ',      icon: '⚙️', color: '#888',    defaultWidth: 40, defaultHeight: 40 },
  { type: 'platform',       label: 'プラットフォーム', icon: '▬', color: '#5a9',  defaultWidth: 120, defaultHeight: 16 },
];

const EDITOR_MODES: { mode: EditorMode; icon: string; label: string }[] = [
  { mode: 'select', icon: '↖', label: '選択' },
  { mode: 'place',  icon: '✏️', label: '配置' },
  { mode: 'erase',  icon: '🗑', label: '消去' },
  { mode: 'pan',    icon: '✋', label: '移動' },
];

interface LeftPanelProps {
  editorMode: EditorMode;
  selectedObjectType: ObjectType;
  gridSize: number;
  snapToGrid: boolean;
  showGrid: boolean;
  zoom: number;
  onModeChange: (mode: EditorMode) => void;
  onObjectTypeChange: (type: ObjectType, item: ToolItem) => void;
  onGridSizeChange: (size: number) => void;
  onSnapToggle: () => void;
  onGridToggle: () => void;
  onZoomChange: (zoom: number) => void;
  onGenerateStage: (difficulty: Difficulty) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  editorMode,
  selectedObjectType,
  gridSize,
  snapToGrid,
  showGrid,
  zoom,
  onModeChange,
  onObjectTypeChange,
  onGridSizeChange,
  onSnapToggle,
  onGridToggle,
  onZoomChange,
  onGenerateStage,
}) => {
  const [activeTab, setActiveTab] = useState<'objects' | 'generate' | 'settings'>('objects');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('normal');
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <div className="flex flex-col h-full bg-gd-panel border-r border-gd-border select-none">
      {/* ヘッダー */}
      <div className="px-3 py-2 border-b border-gd-border">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">ツール</h2>
      </div>

      {/* エディターモード */}
      <div className="px-2 py-2 border-b border-gd-border">
        <div className="grid grid-cols-4 gap-1">
          {EDITOR_MODES.map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => onModeChange(mode)}
              title={label}
              className={`
                flex flex-col items-center justify-center py-2 px-1 rounded text-xs transition-all
                ${editorMode === mode
                  ? 'bg-gd-accent text-white shadow-lg shadow-gd-accent/30'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'}
              `}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="mt-1 text-[10px]">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* タブ切り替え */}
      <div className="flex border-b border-gd-border">
        <button
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'objects' ? 'text-white border-b-2 border-gd-accent' : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('objects')}
        >
          オブジェクト
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'generate' ? 'text-white border-b-2 border-gd-accent' : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('generate')}
        >
          AI生成
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'settings' ? 'text-white border-b-2 border-gd-accent' : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('settings')}
        >
          設定
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'objects' && (
          <div className="p-2">
            <p className="text-[10px] text-gray-500 mb-2 px-1">クリックして選択 → キャンバスに配置</p>
            <div className="space-y-1">
              {TOOL_ITEMS.map((item) => (
                <button
                  key={item.type}
                  onClick={() => {
                    onObjectTypeChange(item.type, item);
                    onModeChange('place');
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
                    ${selectedObjectType === item.type && editorMode === 'place'
                      ? 'bg-white/15 text-white ring-1 ring-white/30'
                      : 'text-gray-400 hover:bg-white/8 hover:text-white'}
                  `}
                >
                  {/* カラーバー */}
                  <span
                    className="w-1 h-6 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-base">{item.icon}</span>
                  <span className="text-xs font-medium">{item.label}</span>
                  {selectedObjectType === item.type && editorMode === 'place' && (
                    <span className="ml-auto text-[10px] text-gd-accent">選択中</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'generate' && (
          <div className="p-3 space-y-4">
            {/* 説明 */}
            <div className="bg-gd-accent/10 border border-gd-accent/30 rounded-lg p-3">
              <p className="text-xs text-gd-accent font-semibold mb-1">✨ AI ステージ自動生成</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                難易度を選んでボタンを押すだけで、障害物の配置やスクロール速度を自動で設定したステージが生成されます。
              </p>
            </div>

            {/* 難易度選択 */}
            <div>
              <p className="text-xs text-gray-400 mb-2 font-semibold">難易度を選ぶ</p>
              <div className="space-y-2">
                {(Object.keys(DIFFICULTY_PARAMS) as Difficulty[]).map((diff) => {
                  const p = DIFFICULTY_PARAMS[diff];
                  const isSelected = selectedDifficulty === diff;
                  return (
                    <button
                      key={diff}
                      onClick={() => setSelectedDifficulty(diff)}
                      className={`
                        w-full text-left p-3 rounded-lg border transition-all
                        ${isSelected
                          ? 'border-2 bg-black/40'
                          : 'border-gd-border bg-black/20 hover:bg-black/30'}
                      `}
                      style={isSelected ? { borderColor: p.color } : {}}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{p.emoji}</span>
                          <span
                            className="text-sm font-bold"
                            style={{ color: isSelected ? p.color : '#9ca3af' }}
                          >
                            {p.label}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: p.color + '33', color: p.color }}>
                            選択中
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                        <StatRow label="速度" value={`${p.scrollSpeed}px/s`} color={p.color} />
                        <StatRow label="長さ" value={`${p.stageLength / 100}m`} color={p.color} />
                        <StatRow label="障害物" value={diffLabel(p.weights.singleSpike + p.weights.doubleSpike)} color={p.color} />
                        <StatRow label="ポータル" value={p.weights.portal > 3 ? 'あり' : 'すくない'} color={p.color} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 生成ボタン */}
            <button
              onClick={() => {
                setIsGenerating(true);
                // 少し待ってから生成（UIフィードバックのため）
                setTimeout(() => {
                  onGenerateStage(selectedDifficulty);
                  setIsGenerating(false);
                }, 300);
              }}
              disabled={isGenerating}
              className="w-full py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: DIFFICULTY_PARAMS[selectedDifficulty].color + '22',
                border: `2px solid ${DIFFICULTY_PARAMS[selectedDifficulty].color}66`,
                color: DIFFICULTY_PARAMS[selectedDifficulty].color,
              }}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⟳</span> 生成中...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>🎲</span>
                  {DIFFICULTY_PARAMS[selectedDifficulty].label}で生成する
                </span>
              )}
            </button>

            <p className="text-[10px] text-gray-600 text-center">
              ※ 現在のステージは上書きされます
            </p>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-3 space-y-4">
            {/* グリッドサイズ */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                グリッドサイズ: <span className="text-white font-mono">{gridSize}px</span>
              </label>
              <input
                type="range"
                min={20}
                max={80}
                step={20}
                value={gridSize}
                onChange={(e) => onGridSizeChange(Number(e.target.value))}
                className="w-full accent-gd-accent"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>20</span><span>40</span><span>60</span><span>80</span>
              </div>
            </div>

            {/* ズーム */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                ズーム: <span className="text-white font-mono">{Math.round(zoom * 100)}%</span>
              </label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={zoom}
                onChange={(e) => onZoomChange(Number(e.target.value))}
                className="w-full accent-gd-accent"
              />
            </div>

            {/* トグル設定 */}
            <div className="space-y-2">
              <ToggleRow
                label="グリッドにスナップ"
                value={snapToGrid}
                onToggle={onSnapToggle}
              />
              <ToggleRow
                label="グリッド表示"
                value={showGrid}
                onToggle={onGridToggle}
              />
            </div>

            {/* ショートカット一覧 */}
            <div className="border-t border-gd-border pt-3">
              <p className="text-[11px] text-gray-500 font-semibold mb-2">ショートカット</p>
              <div className="space-y-1 text-[10px] text-gray-600">
                {[
                  ['Space/クリック', 'ジャンプ'],
                  ['Delete', '選択削除'],
                  ['Esc', '選択解除'],
                  ['Ctrl+Z', '元に戻す'],
                  ['Ctrl+S', 'セーブ'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between">
                    <kbd className="bg-black/40 px-1 rounded text-gray-400">{key}</kbd>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ToggleRow: React.FC<{ label: string; value: boolean; onToggle: () => void }> = ({
  label, value, onToggle,
}) => (
  <div
    className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
    onClick={onToggle}
  >
    <span className="text-xs text-gray-400">{label}</span>
    <div className={`w-8 h-4 rounded-full relative transition-colors ${value ? 'bg-gd-accent' : 'bg-gray-700'}`}>
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
  </div>
);

const StatRow: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center gap-1">
    <span className="text-[10px] text-gray-600">{label}:</span>
    <span className="text-[10px]" style={{ color }}>{value}</span>
  </div>
);

function diffLabel(spikeWeight: number): string {
  if (spikeWeight < 20) return 'すくない'
  if (spikeWeight < 35) return 'ふつう'
  if (spikeWeight < 50) return 'おおい'
  return 'とても多い'
}

export { TOOL_ITEMS };
