// ============================================================
// 右パネル：プロパティ & スクリプトエディター
// ============================================================

import React, { useState, useCallback } from 'react';
import type { StageObject, StageData, ObjectProperties } from '../types';

interface RightPanelProps {
  selectedObject: StageObject | null;
  stage: StageData;
  onObjectUpdate: (obj: StageObject) => void;
  onStageUpdate: (stage: Partial<StageData>) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  selectedObject,
  stage,
  onObjectUpdate,
  onStageUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'props' | 'script' | 'stage'>('props');

  const updateProp = useCallback(
    (key: keyof StageObject, value: unknown) => {
      if (!selectedObject) return;
      onObjectUpdate({ ...selectedObject, [key]: value });
    },
    [selectedObject, onObjectUpdate]
  );

  const updateObjProp = useCallback(
    (key: keyof ObjectProperties, value: unknown) => {
      if (!selectedObject) return;
      onObjectUpdate({
        ...selectedObject,
        properties: { ...selectedObject.properties, [key]: value },
      });
    },
    [selectedObject, onObjectUpdate]
  );

  return (
    <div className="flex flex-col h-full bg-gd-panel border-l border-gd-border select-none">
      {/* ヘッダー */}
      <div className="px-3 py-2 border-b border-gd-border">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">プロパティ</h2>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gd-border">
        {(['props', 'script', 'stage'] as const).map((tab) => (
          <button
            key={tab}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab ? 'text-white border-b-2 border-gd-accent' : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'props' ? 'オブジェクト' : tab === 'script' ? 'スクリプト' : 'ステージ'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* オブジェクトプロパティ */}
        {activeTab === 'props' && (
          <div className="p-3 space-y-3">
            {!selectedObject ? (
              <div className="text-center py-8">
                <p className="text-4xl mb-3">↖</p>
                <p className="text-xs text-gray-500">オブジェクトを選択してください</p>
              </div>
            ) : (
              <>
                {/* 種別バッジ */}
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-mono"
                    style={{ backgroundColor: getTypeColor(selectedObject.type) + '33', color: getTypeColor(selectedObject.type) }}
                  >
                    {selectedObject.type}
                  </span>
                  <span className="text-[10px] text-gray-600 font-mono">{selectedObject.id.slice(0, 8)}</span>
                </div>

                {/* 位置・サイズ */}
                <Section label="変形">
                  <div className="grid grid-cols-2 gap-2">
                    <NumInput label="X" value={Math.round(selectedObject.x)} onChange={(v) => updateProp('x', v)} />
                    <NumInput label="Y" value={Math.round(selectedObject.y)} onChange={(v) => updateProp('y', v)} />
                    <NumInput label="幅" value={selectedObject.width} onChange={(v) => updateProp('width', v)} min={8} />
                    <NumInput label="高" value={selectedObject.height} onChange={(v) => updateProp('height', v)} min={8} />
                    <NumInput label="回転" value={selectedObject.rotation} onChange={(v) => updateProp('rotation', v)} min={-360} max={360} />
                  </div>
                </Section>

                {/* 外観 */}
                <Section label="外観">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-400">カラー</label>
                    <input
                      type="color"
                      value={selectedObject.color}
                      onChange={(e) => updateProp('color', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                    />
                    <span className="font-mono text-xs text-gray-500">{selectedObject.color}</span>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-gray-400">
                      不透明度: <span className="text-white">{Math.round(selectedObject.properties.opacity * 100)}%</span>
                    </label>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={selectedObject.properties.opacity}
                      onChange={(e) => updateObjProp('opacity', Number(e.target.value))}
                      className="w-full mt-1 accent-gd-accent"
                    />
                  </div>
                </Section>

                {/* 動き */}
                <Section label="動き（ループ移動）">
                  <div className="grid grid-cols-2 gap-2">
                    <NumInput label="X速度" value={selectedObject.properties.moveX ?? 0} onChange={(v) => updateObjProp('moveX', v)} />
                    <NumInput label="Y速度" value={selectedObject.properties.moveY ?? 0} onChange={(v) => updateObjProp('moveY', v)} />
                    <NumInput label="移動範囲" value={selectedObject.properties.moveRange ?? 0} onChange={(v) => updateObjProp('moveRange', v)} min={0} />
                  </div>
                </Section>

                {/* ジャンプ台専用 */}
                {selectedObject.type === 'jump_pad' && (
                  <Section label="ジャンプ台">
                    <NumInput
                      label="ジャンプ力"
                      value={selectedObject.properties.jumpForce ?? 950}
                      onChange={(v) => updateObjProp('jumpForce', v)}
                      min={100} max={2000}
                    />
                  </Section>
                )}

                {/* ビート同期 */}
                <Section label="ビート同期">
                  <ToggleRow
                    label="ビートに同期"
                    value={selectedObject.properties.beatSync ?? false}
                    onToggle={() => updateObjProp('beatSync', !(selectedObject.properties.beatSync ?? false))}
                  />
                  {selectedObject.properties.beatSync && (
                    <NumInput
                      label="オフセット(秒)"
                      value={selectedObject.properties.beatOffset ?? 0}
                      onChange={(v) => updateObjProp('beatOffset', v)}
                    />
                  )}
                </Section>

                {/* 表示設定 */}
                <Section label="表示">
                  <ToggleRow
                    label="表示する"
                    value={selectedObject.properties.visible}
                    onToggle={() => updateObjProp('visible', !selectedObject.properties.visible)}
                  />
                </Section>
              </>
            )}
          </div>
        )}

        {/* スクリプトエディター */}
        {activeTab === 'script' && (
          <div className="p-3 flex flex-col h-full">
            {!selectedObject ? (
              <div className="text-center py-8">
                <p className="text-xs text-gray-500">オブジェクトを選択してください</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-mono">{selectedObject.type}.js</span>
                  <button
                    className="text-[10px] px-2 py-0.5 bg-gd-accent/20 text-gd-accent rounded hover:bg-gd-accent/30 transition-colors"
                    onClick={() => {
                      const template = getScriptTemplate(selectedObject.type);
                      updateProp('script', template);
                    }}
                  >
                    テンプレート挿入
                  </button>
                </div>
                <div className="text-[10px] text-gray-600 mb-2">
                  利用可能: <code className="text-gd-accent">object</code>,{' '}
                  <code className="text-gd-accent">player</code>,{' '}
                  <code className="text-gd-accent">time</code>,{' '}
                  <code className="text-gd-accent">beat</code>
                </div>
                <textarea
                  value={selectedObject.script}
                  onChange={(e) => updateProp('script', e.target.value)}
                  className="flex-1 w-full bg-black/50 text-green-400 font-mono text-xs p-3 rounded-lg border border-gd-border resize-none focus:outline-none focus:border-gd-accent leading-relaxed"
                  placeholder={`// カスタムスクリプト\n// 例: 触れたら重力反転\n// if(player.touching) {\n//   player.gravityFlipped = !player.gravityFlipped;\n// }`}
                  spellCheck={false}
                />
              </>
            )}
          </div>
        )}

        {/* ステージ設定 */}
        {activeTab === 'stage' && (
          <div className="p-3 space-y-3">
            <Section label="基本情報">
              <LabeledInput
                label="ステージ名"
                value={stage.name}
                onChange={(v) => onStageUpdate({ name: v })}
              />
              <LabeledInput
                label="作者"
                value={stage.author}
                onChange={(v) => onStageUpdate({ author: v })}
              />
            </Section>

            <Section label="物理設定">
              <NumInput
                label="スクロール速度 (px/s)"
                value={stage.scrollSpeed}
                onChange={(v) => onStageUpdate({ scrollSpeed: v })}
                min={50} max={1000}
              />
              <NumInput
                label="地面Y座標"
                value={stage.groundY}
                onChange={(v) => onStageUpdate({ groundY: v })}
              />
              <NumInput
                label="ステージ長さ (px)"
                value={stage.stageLength}
                onChange={(v) => onStageUpdate({ stageLength: v })}
                min={1000}
              />
            </Section>

            <Section label="外観">
              <div className="flex items-center gap-3 mb-2">
                <label className="text-xs text-gray-400 w-20">背景色</label>
                <input
                  type="color" value={stage.bgColor}
                  onChange={(e) => onStageUpdate({ bgColor: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-400 w-20">地面色</label>
                <input
                  type="color" value={stage.groundColor}
                  onChange={(e) => onStageUpdate({ groundColor: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- ヘルパーコンポーネント ----

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="border border-gd-border rounded-lg overflow-hidden">
    <div className="px-3 py-1.5 bg-black/30 border-b border-gd-border">
      <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">{label}</span>
    </div>
    <div className="p-2 space-y-2">{children}</div>
  </div>
);

const NumInput: React.FC<{
  label: string; value: number;
  onChange: (v: number) => void;
  min?: number; max?: number;
}> = ({ label, value, onChange, min, max }) => (
  <div className="flex items-center gap-2">
    <label className="text-[10px] text-gray-500 w-14 flex-shrink-0">{label}</label>
    <input
      type="number"
      value={value}
      min={min} max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 bg-black/50 text-white text-xs font-mono px-2 py-1 rounded border border-gd-border focus:outline-none focus:border-gd-accent w-0"
    />
  </div>
);

const LabeledInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label, value, onChange,
}) => (
  <div className="flex items-center gap-2">
    <label className="text-[10px] text-gray-500 w-14 flex-shrink-0">{label}</label>
    <input
      type="text" value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-black/50 text-white text-xs px-2 py-1 rounded border border-gd-border focus:outline-none focus:border-gd-accent w-0"
    />
  </div>
);

const ToggleRow: React.FC<{ label: string; value: boolean; onToggle: () => void }> = ({
  label, value, onToggle,
}) => (
  <div
    className="flex items-center justify-between px-1 py-1 rounded hover:bg-white/5 cursor-pointer"
    onClick={onToggle}
  >
    <span className="text-xs text-gray-400">{label}</span>
    <div className={`w-8 h-4 rounded-full relative transition-colors ${value ? 'bg-gd-accent' : 'bg-gray-700'}`}>
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
  </div>
);

// ---- ヘルパー関数 ----

function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    block: '#4a90d9', spike: '#f64f59', jump_pad: '#f9d423',
    jump_ring: '#43e97b', portal_gravity: '#6c63ff', portal_fly: '#43e97b',
    portal_normal: '#f9d423', saw: '#aaa', platform: '#55aa99',
  };
  return map[type] ?? '#888';
}

function getScriptTemplate(type: string): string {
  const templates: Record<string, string> = {
    spike: `// トゲ: 特定時間だけ出現\nif (time > 5 && time < 10) {\n  object.properties.visible = true;\n} else {\n  object.properties.visible = false;\n}`,
    jump_pad: `// ジャンプ台: ビートに合わせて光る\nif (beat.intensity > 0.7) {\n  object.color = '#fff';\n} else {\n  object.color = '#f9d423';\n}`,
    block: `// ブロック: 上下移動\nconst amplitude = 80;\nconst speed = 2;\nobject.y = object.baseY + Math.sin(time * speed) * amplitude;`,
    portal_gravity: `// 重力ポータル: 接触時に重力反転\n// 自動で処理されます`,
  };
  return templates[type] ?? `// ${type} カスタムスクリプト\n// object: このオブジェクト\n// player: プレイヤー情報\n// time: 経過時間(秒)\n// beat: {intensity, time, frequency}`;
}
