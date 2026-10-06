// ============================================================
// Kiro Dash Studio - 共通型定義
// ============================================================

// ----- オブジェクト種別 -----
export type ObjectType =
  | 'block'       // 通常ブロック
  | 'spike'       // トゲ
  | 'jump_pad'    // ジャンプ台
  | 'jump_ring'   // ジャンプリング
  | 'portal_gravity' // 重力反転ポータル
  | 'portal_fly'  // フライモードポータル
  | 'portal_normal' // 通常モードポータル
  | 'saw'         // 回転ノコギリ
  | 'platform';   // 通り抜けプラットフォーム

// ----- ゲームモード -----
export type GameMode = 'cube' | 'fly' | 'ball' | 'ufo';

// ----- エディターモード -----
export type EditorMode = 'select' | 'place' | 'erase' | 'pan' | 'move';

// ----- ステージオブジェクト -----
export interface StageObject {
  id: string;
  type: ObjectType;
  x: number;          // グリッド単位 (px)
  y: number;          // グリッド単位 (px)
  width: number;
  height: number;
  rotation: number;   // 度 (0-360)
  color: string;
  // カスタムプロパティ
  properties: ObjectProperties;
  // スクリプト
  script: string;
}

export interface ObjectProperties {
  // 共通
  visible: boolean;
  opacity: number;
  // 動的
  moveX?: number;       // X方向移動速度 (px/s)
  moveY?: number;       // Y方向移動速度 (px/s)
  moveRange?: number;   // 移動範囲 (px)
  // トリガー系
  triggerOnTouch?: boolean;
  // ポータル
  targetMode?: GameMode;
  // ジャンプ台
  jumpForce?: number;
  // ビート同期
  beatSync?: boolean;       // ビートに合わせて出現
  beatOffset?: number;      // ビートオフセット（秒）
}

// ----- プレイヤー状態 -----
export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  isOnGround: boolean;
  isDead: boolean;
  rotation: number;
  gameMode: GameMode;
  gravityFlipped: boolean;
}

// ----- ステージデータ -----
export interface StageData {
  id: string;
  name: string;
  author: string;
  bgColor: string;
  groundColor: string;
  objects: StageObject[];
  bgmFile?: string;
  bpm?: number;
  scrollSpeed: number;       // px/s
  groundY: number;           // 地面Y座標 (px)
  stageLength: number;       // ステージ長さ (px)
  createdAt: string;
  updatedAt: string;
}

// ----- ビート情報 -----
export interface BeatInfo {
  time: number;     // 秒
  intensity: number; // 0-1
  frequency: number; // Hz
}

// ----- 音声解析状態 -----
export interface AudioState {
  isLoaded: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  bpm: number;
  beats: BeatInfo[];
  waveformData: Float32Array | null;
  fileName: string;
}

// ----- エディター状態 -----
export interface EditorState {
  mode: EditorMode;
  selectedObjectId: string | null;
  selectedObjectType: ObjectType;
  gridSize: number;
  zoom: number;
  scrollX: number;
  snapToGrid: boolean;
  showGrid: boolean;
}

// ----- テストプレイ状態 -----
export interface PlayState {
  isPlaying: boolean;
  isPaused: boolean;
  attempts: number;
  deaths: number;
  progress: number;   // 0-100%
  startTime: number;
}

// ----- ツールパレットアイテム -----
export interface ToolItem {
  type: ObjectType;
  label: string;
  icon: string;       // emoji or icon name
  color: string;
  defaultWidth: number;
  defaultHeight: number;
}

// ----- キー入力状態 -----
export interface KeyState {
  space: boolean;
  up: boolean;
  click: boolean;
}

// ----- 衝突矩形 -----
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ----- Canvas描画コンテキスト拡張 -----
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scrollX: number;
  zoom: number;
  groundY: number;
}
