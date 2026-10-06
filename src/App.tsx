// ============================================================
// Kiro Dash Studio - メインアプリ
// ============================================================

import React, {
  useRef, useEffect, useCallback, useState
} from 'react'
import { LeftPanel, TOOL_ITEMS } from './components/LeftPanel'
import { RightPanel } from './components/RightPanel'
import { Timeline } from './components/Timeline'
import { AudioAnalyzer } from './engine/audioAnalyzer'
import { generateStage, type Difficulty, validateAndFix, DIFFICULTY_PARAMS } from './engine/stageGenerator'
import {
  createPlayer, physicsStep, renderGame, renderEditor,
  createDeathParticles, updateParticles, renderParticles,
  createClearFireworks,
  type Particle,
} from './engine/gameEngine'
import type {
  StageData, StageObject, EditorState, PlayState,
  AudioState, ObjectType, ToolItem, KeyState,
} from './types'

// ============================================================
// デフォルトステージ
// ============================================================
const DEFAULT_STAGE: StageData = {
  id: 'stage-1',
  name: 'New Level',
  author: 'Player',
  bgColor: '#0d0d1a',
  groundColor: '#1a1a2e',
  objects: [
    // チュートリアル的な初期オブジェクト
    { id: 'b1', type: 'block', x: 400, y: 320, width: 40, height: 40, rotation: 0, color: '#4a90d9', properties: { visible: true, opacity: 1 }, script: '' },
    { id: 'b2', type: 'block', x: 440, y: 320, width: 40, height: 40, rotation: 0, color: '#4a90d9', properties: { visible: true, opacity: 1 }, script: '' },
    { id: 'b3', type: 'block', x: 480, y: 320, width: 40, height: 40, rotation: 0, color: '#4a90d9', properties: { visible: true, opacity: 1 }, script: '' },
    { id: 's1', type: 'spike', x: 600, y: 320, width: 40, height: 40, rotation: 0, color: '#f64f59', properties: { visible: true, opacity: 1 }, script: '' },
    { id: 'j1', type: 'jump_pad', x: 750, y: 340, width: 60, height: 20, rotation: 0, color: '#f9d423', properties: { visible: true, opacity: 1, jumpForce: 950 }, script: '' },
    { id: 'b4', type: 'block', x: 900, y: 280, width: 40, height: 80, rotation: 0, color: '#4a90d9', properties: { visible: true, opacity: 1 }, script: '' },
    { id: 'r1', type: 'jump_ring', x: 1100, y: 280, width: 40, height: 40, rotation: 0, color: '#43e97b', properties: { visible: true, opacity: 1 }, script: '' },
    { id: 'p1', type: 'portal_gravity', x: 1350, y: 200, width: 30, height: 160, rotation: 0, color: '#6c63ff', properties: { visible: true, opacity: 1 }, script: '' },
  ],
  bgmFile: undefined,
  bpm: 120,
  scrollSpeed: 280,
  groundY: 360,
  stageLength: 8000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const DEFAULT_EDITOR: EditorState = {
  mode: 'select',
  selectedObjectId: null,
  selectedObjectType: 'block',
  gridSize: 40,
  zoom: 1,
  scrollX: 0,
  snapToGrid: true,
  showGrid: true,
}

const DEFAULT_PLAY: PlayState = {
  isPlaying: false,
  isPaused: false,
  attempts: 0,
  deaths: 0,
  progress: 0,
  startTime: 0,
}

const DEFAULT_AUDIO: AudioState = {
  isLoaded: false,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  bpm: 120,
  beats: [],
  waveformData: null,
  fileName: '',
}

// ============================================================
// ユニークID生成
// ============================================================
let _idCounter = 100
function genId(): string {
  return `obj-${Date.now()}-${_idCounter++}`
}

// ============================================================
// Undo履歴
// ============================================================
type UndoAction = { objects: StageObject[] }

// ============================================================
// メインコンポーネント
// ============================================================
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  // アプリのモード（menu = タイトル, editor = 製作者, play = プレイヤー）
  const [appMode, setAppMode] = useState<'menu' | 'editor' | 'play'>('menu')
  // ステージ
  const [stage, setStage] = useState<StageData>(DEFAULT_STAGE)
  // エディター状態
  const [editor, setEditor] = useState<EditorState>(DEFAULT_EDITOR)
  // プレイ状態
  const [play, setPlay] = useState<PlayState>(DEFAULT_PLAY)
  // 音声状態
  const [audioState, setAudioState] = useState<AudioState>(DEFAULT_AUDIO)
  // 選択中ツールアイテム
  const [selectedToolItem, setSelectedToolItem] = useState<ToolItem>(TOOL_ITEMS[0])
  // クリア状態
  const [cleared, setCleared] = useState(false)
  const [clearStats, setClearStats] = useState({ deaths: 0, attempts: 0, timeMs: 0 })
  const fireworksRef = useRef<Particle[]>([])
  const fireworksTimerRef = useRef<number>(0)
  const clearedRef = useRef(false)
  // 死亡エフェクトを一度だけ発火させるフラグ
  const deathHandledRef = useRef(false)

  // ゲームプレイ用ref（レンダリングループで使うため）
  const playerRef = useRef(createPlayer(DEFAULT_STAGE.groundY))
  const scrollXRef = useRef(0)
  const keysRef = useRef<KeyState>({ space: false, up: false, click: false })
  const particlesRef = useRef<Particle[]>([])
  const stageRef = useRef<StageData>(stage)
  const playRef = useRef<PlayState>(play)
  const editorRef = useRef<EditorState>(editor)

  // Undo履歴
  const undoHistoryRef = useRef<UndoAction[]>([])

  // マウス状態
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const hoveredIdRef = useRef<string | null>(null)
  const ghostPosRef = useRef<{ x: number; y: number } | null>(null)

  // オブジェクト移動状態
  // movingObjectIdRef: ダブルクリックで「掴んだ」オブジェクトのID
  // moveOffsetRef: 掴んだときのマウス座標とオブジェクト左上の差分（ズレ補正）
  const movingObjectIdRef = useRef<string | null>(null)
  const moveOffsetRef = useRef({ x: 0, y: 0 })
  // パンモードの元モード（ダブルクリックパン解除時に戻す）
  const prePanModeRef = useRef<'select' | 'place' | 'erase'>('select')

  // AudioAnalyzer
  const analyzerRef = useRef(new AudioAnalyzer())

  // refを常に最新に同期
  useEffect(() => { stageRef.current = stage }, [stage])
  useEffect(() => { playRef.current = play }, [play])
  useEffect(() => { editorRef.current = editor }, [editor])

  // ============================================================
  // キーボード入力
  // ============================================================
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault()
        keysRef.current.space = true
      }
      // エディターショートカット
      if (!playRef.current.isPlaying) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const sel = editorRef.current.selectedObjectId
          if (sel) deleteObject(sel)
        }
        if (e.key === 'Escape') {
          // move モード中は移動をキャンセルして元の位置に戻す
          if (editorRef.current.mode === 'move' && movingObjectIdRef.current) {
            movingObjectIdRef.current = null
            // undoで元に戻す
            handleUndo()
          }
          setEditor(ed => ({ ...ed, mode: 'select', selectedObjectId: null }))
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault()
          handleUndo()
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault()
          handleExport()
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp') {
        keysRef.current.space = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ============================================================
  // Audio Analyzer セットアップ
  // ============================================================
  useEffect(() => {
    const az = analyzerRef.current
    az.setOnStateChange((state) => setAudioState({ ...state }))
    return () => az.dispose()
  }, [])

  // ============================================================
  // メインレンダリングループ
  // ============================================================
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const loop = (time: number) => {
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = time

      const w = canvas.width
      const h = canvas.height
      const st = stageRef.current
      const ed = editorRef.current
      const pl = playRef.current

      if (pl.isPlaying && !pl.isPaused) {
        // ゲームプレイモード
        const result = physicsStep(
          playerRef.current,
          st,
          keysRef.current,
          dt,
          scrollXRef.current
        )
        playerRef.current = result.player
        scrollXRef.current = result.scrollX
        // キー状態のリセットは keyup / mouseup イベントに任せる
        // （ここで即リセットすると1フレームで入力が消えジャンプ遅延の原因になる）

        // ---- 音楽とゲーム進行の同期 ----
        // scrollX(px) / scrollSpeed(px/s) = ゲーム時刻(秒)
        // 音楽の現在再生位置との差が 0.15s 以上あればシークして合わせる
        if (!result.player.isDead && analyzerRef.current.duration > 0) {
          const gameTimeSec = result.scrollX / st.scrollSpeed
          const audioTimeSec = analyzerRef.current.getCurrentTime()
          const drift = Math.abs(gameTimeSec - audioTimeSec)
          if (drift > 0.15) {
            analyzerRef.current.seekTo(gameTimeSec)
          }
        }

        // 死亡処理（フラグで1回だけ発火）
        if (result.player.isDead && !deathHandledRef.current) {
          deathHandledRef.current = true
          particlesRef.current = createDeathParticles(result.player)
          // 音楽をすぐ止める
          analyzerRef.current.stop()
          setTimeout(() => {
            playerRef.current = createPlayer(stageRef.current.groundY)
            scrollXRef.current = 0
            deathHandledRef.current = false
            // 音楽を先頭から再スタート
            analyzerRef.current.stop()
            analyzerRef.current.play()
            setPlay(p => ({ ...p, deaths: p.deaths + 1 }))
          }, 800)
        }

        // パーティクル更新
        particlesRef.current = updateParticles(particlesRef.current, dt)

        // 進行度更新（16フレームに1回だけ React state を更新して再レンダリングを抑制）
        const progress = Math.min((scrollXRef.current / st.stageLength) * 100, 100)
        if (Math.floor(progress * 4) !== Math.floor((playRef.current.progress) * 4)) {
          setPlay(p => ({ ...p, progress }))
        }

        // クリア判定
        if (progress >= 100 && !clearedRef.current) {
          clearedRef.current = true
          const elapsed = Date.now() - playRef.current.startTime
          fireworksRef.current = createClearFireworks(w, h)
          // 追加花火を時間差で打ち上げ
          fireworksTimerRef.current = window.setInterval(() => {
            fireworksRef.current = [
              ...fireworksRef.current,
              ...createClearFireworks(w, h),
            ]
          }, 800)
          analyzerRef.current.stop()
          setCleared(true)
          setClearStats({
            deaths: playRef.current.deaths,
            attempts: playRef.current.attempts,
            timeMs: elapsed,
          })
        }

        // ゲーム描画
        renderGame(
          { ctx, width: w, height: h, scrollX: scrollXRef.current, zoom: 1, groundY: st.groundY },
          playerRef.current,
          st,
          scrollXRef.current
        )
        renderParticles(ctx, particlesRef.current)

        // 花火パーティクル（クリア時）
        if (fireworksRef.current.length > 0) {
          fireworksRef.current = updateParticles(fireworksRef.current, dt)
          renderParticles(ctx, fireworksRef.current)
        }

        // HUD
        drawHUD(ctx, w, h, progress, playRef.current.deaths, playRef.current.attempts)

      } else {
        // エディターモード
        renderEditor(
          { ctx, width: w, height: h, scrollX: ed.scrollX, zoom: ed.zoom, groundY: st.groundY },
          st,
          ed.selectedObjectId,
          hoveredIdRef.current,
          ghostPosRef.current
            ? {
                obj: {
                  id: 'ghost',
                  type: ed.selectedObjectType,
                  x: ghostPosRef.current.x,
                  y: ghostPosRef.current.y,
                  width: selectedToolItem.defaultWidth,
                  height: selectedToolItem.defaultHeight,
                  rotation: 0,
                  color: selectedToolItem.color,
                  properties: { visible: true, opacity: 0.6 },
                  script: '',
                },
                sx: ghostPosRef.current.x,
                sy: ghostPosRef.current.y,
              }
            : null
        )
      }

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [selectedToolItem, appMode])

  // ============================================================
  // HUD描画
  // ============================================================
  function drawHUD(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    progress: number,
    deaths: number,
    attempts: number
  ) {
    // 進行度バー
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(20, 14, w - 40, 6)
    const grad = ctx.createLinearGradient(20, 0, w - 40, 0)
    grad.addColorStop(0, '#6c63ff')
    grad.addColorStop(1, '#43e97b')
    ctx.fillStyle = grad
    ctx.fillRect(20, 14, (w - 40) * (progress / 100), 6)

    // 進行度テキスト
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round(progress)}%`, w / 2, 12)

    // 死亡数
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '12px sans-serif'
    ctx.fillText(`Deaths: ${deaths}`, w - 20, 40)

    // 操作ヒント
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '11px sans-serif'
    ctx.fillText('SPACE / Click = Jump', 20, h - 20)
  }

  // ============================================================
  // キャンバスサイズ設定
  // ============================================================
  // キャンバスサイズ設定（appMode変化時も再実行）
  // ============================================================
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      // parentElement ではなく window サイズから直接計算
      // プレイモードは全画面、エディターモードは親要素基準
      if (appMode === 'play') {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
      } else {
        const rect = canvas.parentElement?.getBoundingClientRect()
        if (rect) {
          canvas.width = rect.width
          canvas.height = rect.height
        }
      }
    }

    // DOM が確定してからサイズ設定するため rAF で1フレーム待つ
    const id = requestAnimationFrame(resize)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', resize)
    }
  }, [appMode])

  // ホイールイベントをpassive:falseで登録（preventDefault対応）
  // ============================================================
  // キャンバスマウスイベント（エディターモード）
  // ============================================================
  // ============================================================
  const canvasToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const ed = editorRef.current
    const x = (clientX - rect.left) / ed.zoom + ed.scrollX
    const y = (clientY - rect.top) / ed.zoom
    return { x, y }
  }, [])

  const snapToGrid = useCallback((x: number, y: number, grid: number) => {
    return {
      x: Math.round(x / grid) * grid,
      y: Math.round(y / grid) * grid,
    }
  }, [])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (playRef.current.isPlaying) return
    const ed = editorRef.current
    const { x, y } = canvasToWorld(e.clientX, e.clientY)

    // ---- move モード: オブジェクトをマウスに追従させる ----
    if (ed.mode === 'move' && movingObjectIdRef.current) {
      const rawX = x - moveOffsetRef.current.x
      const rawY = y - moveOffsetRef.current.y
      const snapped = ed.snapToGrid ? snapToGrid(rawX, rawY, ed.gridSize) : { x: rawX, y: rawY }
      setStage(prev => ({
        ...prev,
        objects: prev.objects.map(o =>
          o.id === movingObjectIdRef.current
            ? { ...o, x: snapped.x, y: snapped.y }
            : o
        ),
      }))
      return
    }

    if (ed.mode === 'place') {
      const snapped = ed.snapToGrid ? snapToGrid(x, y, ed.gridSize) : { x, y }
      ghostPosRef.current = snapped
    } else {
      ghostPosRef.current = null
    }

    if (ed.mode === 'pan' && isDraggingRef.current) {
      const dx = (e.clientX - dragStartRef.current.x) / ed.zoom
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      setEditor(prev => ({ ...prev, scrollX: Math.max(0, prev.scrollX - dx) }))
      return
    }

    // ホバー検出
    if (ed.mode === 'select' || ed.mode === 'erase' || ed.mode === 'move') {
      const st = stageRef.current
      let hovered: string | null = null
      for (let i = st.objects.length - 1; i >= 0; i--) {
        const obj = st.objects[i]
        if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
          hovered = obj.id
          break
        }
      }
      hoveredIdRef.current = hovered
    }
  }, [canvasToWorld, snapToGrid])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (playRef.current.isPlaying) {
      keysRef.current.click = true
      return
    }
    const ed = editorRef.current
    const st = stageRef.current
    const { x, y } = canvasToWorld(e.clientX, e.clientY)

    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }

    // ---- move モード: シングルクリックで確定（放す） ----
    if (ed.mode === 'move') {
      pushUndo()
      movingObjectIdRef.current = null
      setEditor(prev => ({ ...prev, mode: 'select' }))
      return
    }

    if (ed.mode === 'place') {
      const snapped = ed.snapToGrid ? snapToGrid(x, y, ed.gridSize) : { x, y }
      placeObject(snapped.x, snapped.y)
    } else if (ed.mode === 'select') {
      let found: string | null = null
      for (let i = st.objects.length - 1; i >= 0; i--) {
        const obj = st.objects[i]
        if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
          found = obj.id
          break
        }
      }
      setEditor(prev => ({ ...prev, selectedObjectId: found }))
    } else if (ed.mode === 'erase') {
      for (let i = st.objects.length - 1; i >= 0; i--) {
        const obj = st.objects[i]
        if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
          deleteObject(obj.id)
          break
        }
      }
    }
  }, [canvasToWorld, snapToGrid])

  const handleCanvasMouseUp = useCallback(() => {
    isDraggingRef.current = false
    keysRef.current.click = false
  }, [])

  // ============================================================
  // ダブルクリック処理
  //   オブジェクト上  → そのオブジェクトを「掴む」（moveモード）
  //   空白エリア      → パンモードのトグル（ステージ横スクロール）
  // ============================================================
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (playRef.current.isPlaying) return
    const ed = editorRef.current
    const st = stageRef.current
    const { x, y } = canvasToWorld(e.clientX, e.clientY)

    // オブジェクトヒットテスト
    let hitObj: typeof st.objects[0] | null = null
    for (let i = st.objects.length - 1; i >= 0; i--) {
      const obj = st.objects[i]
      if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
        hitObj = obj
        break
      }
    }

    if (hitObj) {
      // オブジェクトを掴む → move モードへ
      movingObjectIdRef.current = hitObj.id
      moveOffsetRef.current = { x: x - hitObj.x, y: y - hitObj.y }
      setEditor(prev => ({ ...prev, mode: 'move', selectedObjectId: hitObj!.id }))
    } else {
      // 空白 → パンモードをトグル
      if (ed.mode === 'pan') {
        // パン解除 → 元のモードに戻す
        setEditor(prev => ({ ...prev, mode: prePanModeRef.current }))
      } else {
        // パンモードへ（現在のモードを覚えておく）
        prePanModeRef.current = (ed.mode === 'move' ? 'select' : ed.mode) as 'select' | 'place' | 'erase'
        setEditor(prev => ({ ...prev, mode: 'pan' }))
      }
    }
  }, [canvasToWorld])

  const handleCanvasWheel = useCallback((e: WheelEvent) => {
    if (playRef.current.isPlaying) return
    e.preventDefault()
    if (e.ctrlKey) {
      // ズーム
      setEditor(prev => ({
        ...prev,
        zoom: Math.max(0.5, Math.min(2, prev.zoom - e.deltaY * 0.001))
      }))
    } else {
      // スクロール
      setEditor(prev => ({
        ...prev,
        scrollX: Math.max(0, prev.scrollX + e.deltaY * 0.5)
      }))
    }
  }, [])

  // ホイールイベントをpassive:falseで登録（preventDefault対応）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleCanvasWheel)
  }, [handleCanvasWheel])

  // ============================================================
  // オブジェクト操作
  // ============================================================
  const placeObject = useCallback((x: number, y: number) => {
    const ed = editorRef.current
    const item = selectedToolItem
    const newObj: StageObject = {
      id: genId(),
      type: ed.selectedObjectType,
      x,
      y: y - item.defaultHeight, // マウス位置の底がオブジェクト底辺
      width: item.defaultWidth,
      height: item.defaultHeight,
      rotation: 0,
      color: item.color,
      properties: { visible: true, opacity: 1 },
      script: '',
    }
    pushUndo()
    setStage(prev => ({ ...prev, objects: [...prev.objects, newObj] }))
  }, [selectedToolItem])

  const deleteObject = useCallback((id: string) => {
    pushUndo()
    setStage(prev => ({ ...prev, objects: prev.objects.filter(o => o.id !== id) }))
    setEditor(prev => ({ ...prev, selectedObjectId: prev.selectedObjectId === id ? null : prev.selectedObjectId }))
  }, [])

  const updateObject = useCallback((obj: StageObject) => {
    setStage(prev => ({
      ...prev,
      objects: prev.objects.map(o => o.id === obj.id ? obj : o)
    }))
  }, [])

  // ============================================================
  // Undo
  // ============================================================
  const pushUndo = () => {
    undoHistoryRef.current.push({ objects: [...stageRef.current.objects] })
    if (undoHistoryRef.current.length > 50) undoHistoryRef.current.shift()
  }

  const handleUndo = () => {
    const last = undoHistoryRef.current.pop()
    if (last) {
      setStage(prev => ({ ...prev, objects: last.objects }))
    }
  }

  // ============================================================
  // テストプレイ（エディターから）
  // ============================================================
  const startPlay = useCallback(() => {
    playerRef.current = createPlayer(stageRef.current.groundY)
    scrollXRef.current = 0
    particlesRef.current = []
    fireworksRef.current = []
    clearedRef.current = false
    deathHandledRef.current = false
    clearInterval(fireworksTimerRef.current)
    setCleared(false)
    setPlay({ isPlaying: true, isPaused: false, attempts: play.attempts + 1, deaths: 0, progress: 0, startTime: Date.now() })
    setEditor(prev => ({ ...prev, selectedObjectId: null }))
    analyzerRef.current.play()
  }, [play.attempts])

  const stopPlay = useCallback(() => {
    setPlay(prev => ({ ...prev, isPlaying: false, isPaused: false }))
    setCleared(false)
    clearedRef.current = false
    fireworksRef.current = []
    clearInterval(fireworksTimerRef.current)
    analyzerRef.current.stop()
  }, [])

  // ============================================================
  // プレイモード（全画面プレイヤー）
  // ============================================================
  const enterPlayMode = useCallback(() => {
    setAppMode('play')
    // setAppMode後にDOMが更新されるのを待ってからリサイズ
    requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
      }
    })
    playerRef.current = createPlayer(stageRef.current.groundY)
    scrollXRef.current = 0
    particlesRef.current = []
    fireworksRef.current = []
    clearedRef.current = false
    deathHandledRef.current = false
    clearInterval(fireworksTimerRef.current)
    setCleared(false)
    setPlay({ isPlaying: true, isPaused: false, attempts: 1, deaths: 0, progress: 0, startTime: Date.now() })
    analyzerRef.current.play()
  }, [])

  const exitPlayMode = useCallback(() => {
    setAppMode('editor')
    setPlay(prev => ({ ...prev, isPlaying: false, isPaused: false }))
    setCleared(false)
    clearedRef.current = false
    deathHandledRef.current = false
    fireworksRef.current = []
    clearInterval(fireworksTimerRef.current)
    analyzerRef.current.stop()
  }, [])

  const retryPlayMode = useCallback(() => {
    playerRef.current = createPlayer(stageRef.current.groundY)
    scrollXRef.current = 0
    particlesRef.current = []
    fireworksRef.current = []
    clearedRef.current = false
    deathHandledRef.current = false
    clearInterval(fireworksTimerRef.current)
    setCleared(false)
    setPlay(prev => ({ isPlaying: true, isPaused: false, attempts: prev.attempts + 1, deaths: 0, progress: 0, startTime: Date.now() }))
    analyzerRef.current.stop()
    analyzerRef.current.play()
  }, [])

  // ============================================================
  // Export / Import
  // ============================================================
  const handleExport = useCallback(() => {
    const data = JSON.stringify(stageRef.current, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stageRef.current.name.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as StageData
        setStage(data)
      } catch {
        alert('JSONの読み込みに失敗しました')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  // ============================================================
  // ステージ自動生成
  // ============================================================
  const handleGenerateStage = useCallback((difficulty: Difficulty) => {
    const newStage = generateStage(difficulty, stage.author)
    pushUndo()
    setStage(newStage)
    setEditor(prev => ({ ...prev, scrollX: 0, selectedObjectId: null }))
  }, [stage.author])

  // ============================================================
  // ビート自動配置
  // ============================================================
  const handleBeatAutoPlace = useCallback(() => {
    const beats = analyzerRef.current.beats
    if (beats.length === 0) return
    pushUndo()
    const scrollSpeed = stageRef.current.scrollSpeed
    const groundY = stageRef.current.groundY

    // ---- 物理定数（gameEngine.ts と合わせること） ----
    const GRAVITY_VAL = 2200
    const JUMP_FORCE_ABS = 700
    const airTime = (2 * JUMP_FORCE_ABS) / GRAVITY_VAL
    const jumpDist = scrollSpeed * airTime  // ≈ 180px @ 280px/s

    // ---- 最低間隔 ----
    // 0.6倍に緩めることでビートの密度を上げる（validateAndFix が最終安全チェックをする）
    const MIN_CLEAR = Math.ceil(jumpDist * 0.6)

    // ---- 冒頭スキップ時間 ----
    // 音楽が始まった瞬間（イントロ無音→有音の切り替わり）で誤検知が出るため
    // 最初の INTRO_SKIP 秒以内のビートは無視する
    const INTRO_SKIP = 2.0  // 秒

    // ---- 既存の beatSync オブジェクトを除去（2回実行しても重複しない） ----
    const existingObjects = stageRef.current.objects.filter(
      o => !o.properties.beatSync
    )

    // ---- ビートオブジェクトを生成 ----
    const placed: StageObject[] = []

    for (const beat of beats) {
      // 冒頭スキップ
      if (beat.time < INTRO_SKIP) continue

      const worldX = Math.round((beat.time * scrollSpeed) / 40) * 40  // 40px グリッドにスナップ

      // intensity の強弱で4種類に振り分け
      // 0.80以上 → spike（最も危険、強いビート）
      // 0.55〜0.80 → saw（中程度の危険、回転ノコギリ）
      // 0.35〜0.55 → jump_ring（リズムに乗ってタップするやつ）
      // 0.35未満  → jump_pad（弱いビート、自動ジャンプ台）
      let type: ObjectType
      if (beat.intensity >= 0.80) {
        type = 'spike'
      } else if (beat.intensity >= 0.55) {
        type = 'saw'
      } else if (beat.intensity >= 0.35) {
        type = 'jump_ring'
      } else {
        type = 'jump_pad'
      }

      const item = TOOL_ITEMS.find(t => t.type === type)!
      const objWidth = item.defaultWidth

      // 既存オブジェクト（beatSync 以外）との間隔チェック
      const tooCloseToExisting = existingObjects.some(o => {
        const gap = worldX - (o.x + o.width)
        const gapLeft = o.x - (worldX + objWidth)
        return gap < MIN_CLEAR && gapLeft < MIN_CLEAR
      })
      if (tooCloseToExisting) continue

      // 今回バッチ内での間隔チェック
      const tooCloseToPlaced = placed.some(o => {
        const gap = worldX - (o.x + o.width)
        const gapLeft = o.x - (worldX + objWidth)
        return gap < MIN_CLEAR && gapLeft < MIN_CLEAR
      })
      if (tooCloseToPlaced) continue

      // jump_pad の連続配置を禁止（連続すると制御不能になる）
      if (type === 'jump_pad') {
        const prevObj = placed[placed.length - 1]
        if (prevObj && prevObj.type === 'jump_pad') continue
      }

      placed.push({
        id: genId(),
        type,
        x: worldX,
        y: groundY - item.defaultHeight,
        width: objWidth,
        height: item.defaultHeight,
        rotation: 0,
        color: item.color,
        properties: { visible: true, opacity: 1, beatSync: true, beatOffset: beat.time },
        script: '',
      })
    }

    // ---- validateAndFix を通して不可能配置を修正（スパイク連続・高さ上限など） ----
    const merged = validateAndFix([...existingObjects, ...placed], scrollSpeed)

    setStage(prev => ({ ...prev, objects: merged }))
    alert(`${placed.length}個のオブジェクトをビートに合わせて配置しました！`)
  }, [])

  // ============================================================
  // 選択中オブジェクトを取得
  // ============================================================
  const selectedObject = editor.selectedObjectId
    ? stage.objects.find(o => o.id === editor.selectedObjectId) ?? null
    : null

  // ============================================================
  // レンダリング
  // ============================================================

  // ===== メニュー画面 =====
  if (appMode === 'menu') {
    return (
      <MenuScreen
        onPlay={enterPlayMode}
        onGenerateAndPlay={(difficulty) => {
          handleGenerateStage(difficulty)
          enterPlayMode()
        }}
        onEditor={() => setAppMode('editor')}
      />
    )
  }

  // ===== プレイモード（全画面） =====
  if (appMode === 'play') {
    return (
      <div className="w-screen h-screen bg-black overflow-hidden relative">
        {/* キャンバス（全画面） */}
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            position: 'absolute',
            top: 0, left: 0,
            width: '100vw',
            height: '100vh',
            cursor: 'default',
          }}
          onMouseDown={() => { keysRef.current.click = true }}
          onMouseUp={() => { keysRef.current.click = false }}
          onMouseLeave={() => { keysRef.current.click = false }}
        />

        {/* 左上ボタン群 */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <button
            onClick={() => { exitPlayMode(); setAppMode('menu') }}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white/70 hover:text-white text-xs rounded-lg border border-white/10 hover:border-white/30 transition-all backdrop-blur-sm"
          >
            ← メニュー
          </button>
          <button
            onClick={exitPlayMode}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white/70 hover:text-white text-xs rounded-lg border border-white/10 hover:border-white/30 transition-all backdrop-blur-sm"
          >
            🛠 ステージ制作
          </button>
        </div>

        {/* プレイ中オーバーレイ（右上） */}
        <div className="absolute top-3 right-3 pointer-events-none">
          <div className="text-xs text-white/40 font-mono text-right">
            <div>Attempt #{play.attempts}</div>
            <div className="text-[10px] mt-0.5">SPACE / Click = Jump</div>
          </div>
        </div>

        {/* クリア画面 */}
        {cleared && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative z-10 text-center px-12 py-10 rounded-2xl border-2 border-white/20"
              style={{
                background: 'linear-gradient(135deg, rgba(108,99,255,0.3) 0%, rgba(67,233,123,0.2) 100%)',
                boxShadow: '0 0 60px rgba(108,99,255,0.5), 0 0 120px rgba(67,233,123,0.2)',
              }}
            >
              <div
                className="text-5xl font-black mb-1 tracking-widest"
                style={{
                  background: 'linear-gradient(90deg, #6c63ff, #43e97b, #f9d423)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 20px rgba(108,99,255,0.8))',
                }}
              >
                LEVEL COMPLETE
              </div>
              <div className="text-white/60 text-sm mb-8 tracking-widest">ステージクリア！</div>
              <div className="grid grid-cols-3 gap-4 mb-8">
                <StatCard label="クリアタイム" value={formatTime(clearStats.timeMs)} color="#43e97b" icon="⏱" />
                <StatCard label="ミス回数" value={`${clearStats.deaths}回`} color={clearStats.deaths === 0 ? '#f9d423' : '#ff6584'} icon={clearStats.deaths === 0 ? '✨' : '💀'} />
                <StatCard label="試行回数" value={`${clearStats.attempts}回`} color="#6c63ff" icon="🎮" />
              </div>
              <div className="mb-8"><RankBadge deaths={clearStats.deaths} /></div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={retryPlayMode}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={{ background: 'linear-gradient(135deg, #6c63ff, #43e97b)', boxShadow: '0 4px 20px rgba(108,99,255,0.4)' }}
                >
                  もう一度プレイ
                </button>
                <button
                  onClick={() => { exitPlayMode(); setAppMode('menu') }}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/20 text-white transition-all border border-white/20"
                >
                  ← メニュー
                </button>
                <button
                  onClick={exitPlayMode}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/20 text-white transition-all border border-white/20"
                >
                  🛠 ステージ制作
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===== エディターモード =====
  return (
    <div className="flex flex-col w-screen h-screen bg-gd-dark overflow-hidden">

      {/* ===== トップバー ===== */}
      <header className="flex items-center h-10 px-4 bg-gd-panel border-b border-gd-border flex-shrink-0 gap-3">
        {/* ロゴ */}
        <div className="flex items-center gap-2 mr-4">
          <svg width="22" height="22" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="6" fill="#6c63ff"/>
            <rect x="7" y="11" width="11" height="11" rx="2" fill="white"/>
            <polygon points="22,7 29,16 22,25" fill="#f9d423"/>
          </svg>
          <span className="text-sm font-bold text-white">Kiro Dash Studio</span>
        </div>

        {/* メニューへ戻るボタン */}
        <button
          onClick={() => setAppMode('menu')}
          className="flex items-center gap-1 px-2.5 py-1 text-white/40 hover:text-white/80 text-xs rounded-md border border-white/10 hover:border-white/25 transition-all"
        >
          ← メニュー
        </button>

        {/* ステージ名 */}
        <span className="text-xs text-gray-500 font-mono">{stage.name}</span>

        {/* スペーサー */}
        <div className="flex-1" />

        {/* プレイモードに戻るボタン */}
        <button
          onClick={enterPlayMode}
          className="flex items-center gap-2 px-4 py-1.5 bg-gd-accent/20 hover:bg-gd-accent/30 text-gd-accent text-sm font-bold rounded-lg transition-all border border-gd-accent/40 hover:border-gd-accent/70"
          title="プレイモードに戻る"
        >
          <span>🎮</span> プレイへ戻る
        </button>

        {/* テストプレイボタン */}
        {!play.isPlaying ? (
          <button
            onClick={startPlay}
            className="flex items-center gap-2 px-4 py-1.5 bg-gd-green/20 hover:bg-gd-green/30 text-gd-green text-sm font-bold rounded-lg transition-all border border-gd-green/40 hover:border-gd-green/70"
          >
            <span>▶</span> テストプレイ
          </button>
        ) : (
          <button
            onClick={stopPlay}
            className="flex items-center gap-2 px-4 py-1.5 bg-gd-red/20 hover:bg-gd-red/30 text-gd-red text-sm font-bold rounded-lg transition-all border border-gd-red/40 hover:border-gd-red/70"
          >
            <span>⏹</span> 停止 ({Math.round(play.progress)}%)
          </button>
        )}

        {/* Export */}
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
        >
          ↓ Export
        </button>

        {/* Import */}
        <label className="cursor-pointer">
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          <span className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors block">
            ↑ Import
          </span>
        </label>
      </header>

      {/* ===== メインエリア ===== */}
      <div className="flex flex-1 overflow-hidden">

        {/* 左パネル */}
        <div className="w-52 flex-shrink-0 overflow-hidden">
          <LeftPanel
            editorMode={editor.mode}
            selectedObjectType={editor.selectedObjectType}
            gridSize={editor.gridSize}
            snapToGrid={editor.snapToGrid}
            showGrid={editor.showGrid}
            zoom={editor.zoom}
            onModeChange={(mode) => setEditor(prev => ({ ...prev, mode }))}
            onObjectTypeChange={(type, item) => {
              setEditor(prev => ({ ...prev, selectedObjectType: type }))
              setSelectedToolItem(item)
            }}
            onGridSizeChange={(size) => setEditor(prev => ({ ...prev, gridSize: size }))}
            onSnapToggle={() => setEditor(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }))}
            onGridToggle={() => setEditor(prev => ({ ...prev, showGrid: !prev.showGrid }))}
            onZoomChange={(zoom) => setEditor(prev => ({ ...prev, zoom }))}
            onGenerateStage={handleGenerateStage}
          />
        </div>

        {/* 中央キャンバス + タイムライン */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* キャンバス */}
          <div className="flex-1 relative overflow-hidden bg-black">
            <canvas
              ref={canvasRef}
              className="block w-full h-full"
              style={{ cursor: getCursor(editor.mode, play.isPlaying) }}
              onMouseMove={handleCanvasMouseMove}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onDoubleClick={handleCanvasDoubleClick}
            />

            {/* プレイモードオーバーレイ情報 */}
            {play.isPlaying && (
              <div className="absolute top-8 right-4 text-right pointer-events-none">
                <div className="text-xs text-white/40 font-mono">
                  Attempt #{play.attempts}
                </div>
              </div>
            )}

            {/* ===== クリア画面 ===== */}
            {cleared && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* 背景ブラー */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                {/* クリアカード */}
                <div
                  className="relative z-10 pointer-events-auto text-center px-12 py-10 rounded-2xl border-2 border-white/20"
                  style={{
                    background: 'linear-gradient(135deg, rgba(108,99,255,0.3) 0%, rgba(67,233,123,0.2) 100%)',
                    boxShadow: '0 0 60px rgba(108,99,255,0.5), 0 0 120px rgba(67,233,123,0.2)',
                  }}
                >
                  {/* LEVEL COMPLETE テキスト */}
                  <div
                    className="text-5xl font-black mb-1 tracking-widest"
                    style={{
                      background: 'linear-gradient(90deg, #6c63ff, #43e97b, #f9d423)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      textShadow: 'none',
                      filter: 'drop-shadow(0 0 20px rgba(108,99,255,0.8))',
                    }}
                  >
                    LEVEL COMPLETE
                  </div>
                  <div className="text-white/60 text-sm mb-8 tracking-widest">
                    ステージクリア！
                  </div>

                  {/* スコアカード */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <StatCard
                      label="クリアタイム"
                      value={formatTime(clearStats.timeMs)}
                      color="#43e97b"
                      icon="⏱"
                    />
                    <StatCard
                      label="ミス回数"
                      value={`${clearStats.deaths}回`}
                      color={clearStats.deaths === 0 ? '#f9d423' : '#ff6584'}
                      icon={clearStats.deaths === 0 ? '✨' : '💀'}
                    />
                    <StatCard
                      label="試行回数"
                      value={`${clearStats.attempts}回`}
                      color="#6c63ff"
                      icon="🎮"
                    />
                  </div>

                  {/* ランク表示 */}
                  <div className="mb-8">
                    <RankBadge deaths={clearStats.deaths} />
                  </div>

                  {/* ボタン */}
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={startPlay}
                      className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                      style={{
                        background: 'linear-gradient(135deg, #6c63ff, #43e97b)',
                        boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
                      }}
                    >
                      もう一度プレイ
                    </button>
                    <button
                      onClick={stopPlay}
                      className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/20 text-white transition-all border border-white/20"
                    >
                      テストプレイを終了
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* エディターモードのヒント */}
            {!play.isPlaying && (
              <div className="absolute bottom-3 right-3 pointer-events-none">
                <div className="text-[10px] text-white/25 text-right leading-relaxed">
                  <div>Ctrl+ホイール: ズーム</div>
                  <div>ホイール: スクロール</div>
                  {editor.mode === 'place' && <div className="text-gd-accent/60">クリックで配置</div>}
                </div>
              </div>
            )}
          </div>

          {/* タイムライン */}
          <Timeline
            audioState={audioState}
            isPlaying={audioState.isPlaying}
            onPlay={() => analyzerRef.current.play()}
            onPause={() => analyzerRef.current.pause()}
            onStop={() => analyzerRef.current.stop()}
            onSeek={(t) => analyzerRef.current.seekTo(t)}
            onFileUpload={async (file) => {
              await analyzerRef.current.loadFile(file)
              setAudioState({ ...analyzerRef.current.getState() })
              setStage(prev => ({ ...prev, bpm: analyzerRef.current.bpm }))
            }}
            onBeatAutoPlace={handleBeatAutoPlace}
          />
        </div>

        {/* 右パネル */}
        <div className="w-60 flex-shrink-0 overflow-hidden">
          <RightPanel
            selectedObject={selectedObject}
            stage={stage}
            onObjectUpdate={updateObject}
            onStageUpdate={(partial) => setStage(prev => ({ ...prev, ...partial }))}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ヘルパー
// ============================================================
function getCursor(mode: string, isPlaying: boolean): string {
  if (isPlaying) return 'default'
  switch (mode) {
    case 'select': return 'default'
    case 'place':  return 'crosshair'
    case 'erase':  return 'cell'
    case 'pan':    return 'grab'
    case 'move':   return 'move'
    default:       return 'default'
  }
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const cent = Math.floor((ms % 1000) / 10)
  return min > 0
    ? `${min}:${sec.toString().padStart(2, '0')}.${cent.toString().padStart(2, '0')}`
    : `${sec}.${cent.toString().padStart(2, '0')}s`
}

function StatCard({
  label, value, color, icon,
}: { label: string; value: string; color: string; icon: string }) {
  return (
    <div
      className="flex flex-col items-center px-4 py-3 rounded-xl"
      style={{ backgroundColor: color + '18', border: `1px solid ${color}40` }}
    >
      <span className="text-xl mb-1">{icon}</span>
      <span className="text-lg font-black" style={{ color }}>{value}</span>
      <span className="text-[10px] text-white/50 mt-0.5">{label}</span>
    </div>
  )
}

function RankBadge({ deaths }: { deaths: number }) {
  const ranks = [
    { max: 0,   label: 'S',  sub: 'ノーミス！',       color: '#f9d423', glow: '#f9d42380' },
    { max: 2,   label: 'A',  sub: 'すばらしい',       color: '#43e97b', glow: '#43e97b60' },
    { max: 5,   label: 'B',  sub: 'なかなかいい',     color: '#6c63ff', glow: '#6c63ff60' },
    { max: 15,  label: 'C',  sub: 'もう少し！',       color: '#48dbfb', glow: '#48dbfb60' },
    { max: 999, label: 'D',  sub: '練習あるのみ',     color: '#ff6584', glow: '#ff658460' },
  ]
  const rank = ranks.find(r => deaths <= r.max) ?? ranks[ranks.length - 1]
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="text-6xl font-black w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          color: rank.color,
          border: `3px solid ${rank.color}`,
          boxShadow: `0 0 30px ${rank.glow}`,
          textShadow: `0 0 20px ${rank.glow}`,
        }}
      >
        {rank.label}
      </div>
      <span className="text-xs text-white/60">{rank.sub}</span>
    </div>
  )
}

// ============================================================
// メニュー画面コンポーネント
// ============================================================
function MenuScreen({
  onPlay,
  onGenerateAndPlay,
  onEditor,
}: {
  onPlay: () => void
  onGenerateAndPlay: (difficulty: Difficulty) => void
  onEditor: () => void
}) {
  const [showGenerate, setShowGenerate] = React.useState(false)

  return (
    <div
      className="w-screen h-screen flex flex-col items-center justify-center overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #0a0010 0%, #0d0d1a 50%, #000a05 100%)' }}
    >
      {/* 背景グリッド */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(108,99,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(108,99,255,0.06) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      {/* グロー */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%)' }} />

      {/* ロゴ */}
      <div className="relative z-10 flex flex-col items-center mb-10">
        <div className="flex items-center gap-4 mb-3">
          <svg width="52" height="52" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#6c63ff"/>
            <rect x="7" y="11" width="11" height="11" rx="2" fill="white"/>
            <polygon points="22,7 29,16 22,25" fill="#f9d423"/>
          </svg>
          <div>
            <div
              className="text-5xl font-black tracking-tight leading-none"
              style={{
                background: 'linear-gradient(90deg, #6c63ff, #43e97b)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 24px rgba(108,99,255,0.7))',
              }}
            >
              KIRO DASH
            </div>
            <div className="text-sm text-white/30 tracking-widest font-mono mt-0.5 ml-1">STUDIO</div>
          </div>
        </div>
        <p className="text-white/40 text-sm tracking-wide">リズムに乗って駆け抜けろ</p>
      </div>

      {/* メインボタン群 */}
      <div className="relative z-10 flex flex-col gap-3 w-80">

        {/* ゲームをプレイ（現在のステージ） */}
        <button
          onClick={onPlay}
          className="flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-lg transition-all duration-200 border-2"
          style={{
            background: 'linear-gradient(135deg, rgba(108,99,255,0.25), rgba(67,233,123,0.15))',
            borderColor: 'rgba(108,99,255,0.6)',
            boxShadow: '0 0 24px rgba(108,99,255,0.3)',
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 40px rgba(108,99,255,0.6)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 24px rgba(108,99,255,0.3)')}
        >
          <span className="text-2xl">▶</span>
          <span style={{
            background: 'linear-gradient(90deg, #6c63ff, #43e97b)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            ゲームをプレイ
          </span>
        </button>

        {/* AI生成してプレイ */}
        <button
          onClick={() => setShowGenerate(v => !v)}
          className="flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-lg transition-all duration-200 border-2"
          style={{
            background: showGenerate ? 'rgba(249,212,35,0.12)' : 'rgba(249,212,35,0.06)',
            borderColor: showGenerate ? 'rgba(249,212,35,0.6)' : 'rgba(249,212,35,0.25)',
          }}
          onMouseEnter={e => { if (!showGenerate) e.currentTarget.style.borderColor = 'rgba(249,212,35,0.45)' }}
          onMouseLeave={e => { if (!showGenerate) e.currentTarget.style.borderColor = 'rgba(249,212,35,0.25)' }}
        >
          <span className="text-2xl">🎲</span>
          <span className="text-[#f9d423]">AI でステージ生成</span>
          <span className="ml-auto text-white/30 text-base">{showGenerate ? '▲' : '▼'}</span>
        </button>

        {/* 難易度選択パネル（展開） */}
        {showGenerate && (
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              background: 'rgba(249,212,35,0.04)',
              borderColor: 'rgba(249,212,35,0.2)',
            }}
          >
            <p className="text-xs text-white/40 text-center py-2 border-b border-white/5">
              難易度を選んですぐプレイ！
            </p>
            <div className="grid grid-cols-2 gap-0">
              {(Object.keys(DIFFICULTY_PARAMS) as Difficulty[]).map((diff, i) => {
                const p = DIFFICULTY_PARAMS[diff]
                const isLast = i === Object.keys(DIFFICULTY_PARAMS).length - 1
                return (
                  <button
                    key={diff}
                    onClick={() => onGenerateAndPlay(diff)}
                    className={`flex flex-col items-center gap-1 py-4 transition-all hover:bg-white/5 active:scale-95 ${
                      isLast && Object.keys(DIFFICULTY_PARAMS).length % 2 !== 0 ? 'col-span-2' : ''
                    }`}
                    style={{ borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                             borderBottom: i < Object.keys(DIFFICULTY_PARAMS).length - 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
                  >
                    <span className="text-xl">{p.emoji}</span>
                    <span className="font-bold text-sm" style={{ color: p.color }}>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ステージ制作 */}
        <button
          onClick={onEditor}
          className="flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-lg transition-all duration-200 border-2 text-white/70 hover:text-white"
          style={{
            background: 'rgba(255,255,255,0.04)',
            borderColor: 'rgba(255,255,255,0.10)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
        >
          <span className="text-2xl">🛠</span>
          <span>ステージ制作</span>
        </button>
      </div>

      {/* 操作説明 */}
      <div className="relative z-10 mt-10 text-white/20 text-xs text-center font-mono space-y-1">
        <div>SPACE / CLICK — ジャンプ</div>
      </div>
    </div>
  )
}
