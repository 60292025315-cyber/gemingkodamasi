// ============================================================
// Kiro Dash Studio - ステージ自動生成エンジン（クリア保証版）
// ============================================================
//
// 設計思想:
//   「パターン」単位で生成する。各パターンは単体で必ずクリア可能。
//   パターン間に最低限の安全マージンを挟む。
//   プレイヤーのジャンプ物理から逆算して高さ・間隔を制限する。
//
// ============================================================

import type { StageData, StageObject } from '../types'

export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme'

// -------- 物理定数（physicsStep と合わせること） --------
const SCROLL_SPEED_DEFAULT = 280   // px/s
const GRAVITY = 2200               // px/s²
const JUMP_FORCE = 700             // px/s（絶対値）
const GROUND_Y = 360               // px
const PLAYER_SIZE = 40             // px

// ジャンプの最大高さ = v²/(2g)
const MAX_JUMP_HEIGHT = (JUMP_FORCE * JUMP_FORCE) / (2 * GRAVITY)  // ≈ 111px

// スクロール速度に応じた「ジャンプ中の水平距離」
function jumpHorizDistance(scrollSpeed: number): number {
  // 滞空時間 = 2*v/g、水平距離 = scrollSpeed * 滞空時間
  const airTime = (2 * JUMP_FORCE) / GRAVITY
  return scrollSpeed * airTime  // ≈ 180px @ 280px/s
}

// -------- 難易度パラメータ --------
const DIFFICULTY_PARAMS: Record<Difficulty, {
  label: string
  emoji: string
  color: string
  scrollSpeed: number
  stageLength: number
  bgColor: string
  groundColor: string
  blockColor: string
  // パターン選択重み（合計100）
  weights: {
    gap: number           // 何もない休憩スペース
    singleSpike: number   // トゲ1個
    doubleSpike: number   // トゲ2個連続（間隔あり）
    blockStep: number     // 踏み台ブロック（低め）
    blockWall: number     // 壁ブロック（横から来る）
    jumpPad: number       // ジャンプ台
    jumpRing: number      // ジャンプリング
    saw: number           // ノコギリ
    platform: number      // 宙に浮くプラットフォーム
    portal: number        // ポータル
  }
}> = {
  easy: {
    label: 'かんたん',
    emoji: '😊',
    color: '#43e97b',
    scrollSpeed: 220,
    stageLength: 4000,       // 5000 → 4000
    bgColor: '#0d1a0d',
    groundColor: '#0a2a0a',
    blockColor: '#3a8a5a',
    weights: {
      gap: 45,               // 30 → 45（休憩多め）
      singleSpike: 25,       // 30 → 25
      doubleSpike: 0,
      blockStep: 15,
      blockWall: 0,
      jumpPad: 12,
      jumpRing: 3,
      saw: 0,
      platform: 0,
      portal: 0,
    },
  },
  normal: {
    label: 'ふつう',
    emoji: '😐',
    color: '#f9d423',
    scrollSpeed: 220,
    stageLength: 5500,       // 7000 → 5500
    bgColor: '#0d0d1a',
    groundColor: '#1a1a2e',
    blockColor: '#4a90d9',
    weights: {
      gap: 30,               // 15 → 30
      singleSpike: 30,
      doubleSpike: 5,        // 10 → 5
      blockStep: 15,
      blockWall: 0,          // 5 → 0
      jumpPad: 12,
      jumpRing: 5,
      saw: 0,                // 5 → 0
      platform: 3,
      portal: 0,             // 2 → 0
    },
  },
  hard: {
    label: 'むずかしい',
    emoji: '😤',
    color: '#ff6584',
    scrollSpeed: 220,
    stageLength: 7000,       // 9000 → 7000
    bgColor: '#1a0a0a',
    groundColor: '#2a0a0a',
    blockColor: '#c0392b',
    weights: {
      gap: 18,               // 8 → 18
      singleSpike: 28,       // 20 → 28
      doubleSpike: 15,
      blockStep: 12,
      blockWall: 5,
      jumpPad: 8,
      jumpRing: 5,
      saw: 5,
      platform: 4,
      portal: 0,
    },
  },
  extreme: {
    label: 'エクストリーム',
    emoji: '💀',
    color: '#6c63ff',
    scrollSpeed: 220,
    stageLength: 9000,       // 11000 → 9000
    bgColor: '#0a0010',
    groundColor: '#12001a',
    blockColor: '#6c63ff',
    weights: {
      gap: 10,               // 4 → 10
      singleSpike: 20,
      doubleSpike: 22,       // 28 → 22
      blockStep: 10,
      blockWall: 8,          // 10 → 8
      jumpPad: 6,
      jumpRing: 6,
      saw: 10,
      platform: 5,
      portal: 3,             // 6 → 3
    },
  },
}

// -------- ユーティリティ --------

function rand(min: number, max: number) { return min + Math.random() * (max - min) }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)) }
function chance(p: number) { return Math.random() < p }

// 重み付きランダム選択
function weightedPick<T extends string>(weights: Record<T, number>): T {
  const total = Object.values(weights).reduce((a, b) => (a as number) + (b as number), 0) as number
  let r = Math.random() * total
  for (const [key, w] of Object.entries(weights)) {
    r -= w as number
    if (r <= 0) return key as T
  }
  return Object.keys(weights)[0] as T
}

let _id = 1
function newId() { return `gen-${_id++}` }

function makeSpike(x: number, color = '#f64f59'): StageObject {
  return {
    id: newId(), type: 'spike',
    x, y: GROUND_Y - 40,
    width: 40, height: 40,
    rotation: 0, color,
    properties: { visible: true, opacity: 1 },
    script: '',
  }
}

function makeBlock(x: number, y: number, w: number, h: number, color: string): StageObject {
  return {
    id: newId(), type: 'block',
    x, y, width: w, height: h,
    rotation: 0, color,
    properties: { visible: true, opacity: 1 },
    script: '',
  }
}

// ============================================================
// パターン生成関数
// 各関数は { objects, width } を返す
// width = このパターンが占める横幅（次のパターンのX起点に加算）
// ============================================================

type Pattern = { objects: StageObject[]; width: number }

// --- 休憩スペース ---
function patternGap(scrollSpeed: number): Pattern {
  // ジャンプ距離より少し短め（走るだけ）
  const w = randInt(120, Math.floor(jumpHorizDistance(scrollSpeed) * 0.7))
  return { objects: [], width: w }
}

// --- トゲ1個 ---
function patternSingleSpike(x: number): Pattern {
  return {
    objects: [makeSpike(x)],
    width: 40,
  }
}

// --- トゲ2個（必ず間隔あき・ジャンプで超えられる幅） ---
function patternDoubleSpike(x: number, scrollSpeed: number): Pattern {
  // 2個目は1個目を「超えたあと」に着地できる位置に置く
  // gap = 1個目の右端から2個目の左端までの距離
  // ジャンプ1回で2個ともクリアできるよう、合計幅をジャンプ距離内に収める
  // 合計 = 40(1個目) + gap + 40(2個目) <= jumpDist * 0.95
  const jumpDist = jumpHorizDistance(scrollSpeed)
  const maxTotalWidth = Math.floor(jumpDist * 0.9)
  // gap の最小は着地余裕のため 40px 以上
  const minGap = 40
  const maxGap = Math.max(minGap, maxTotalWidth - 80)
  const gap = randInt(minGap, maxGap)
  return {
    objects: [
      makeSpike(x),
      makeSpike(x + 40 + gap),  // 1個目の右端(x+40)からgap空けて2個目
    ],
    width: 40 + gap + 40,
  }
}

// --- 踏み台ブロック（ジャンプで乗れる高さ限定） ---
function patternBlockStep(x: number, blockColor: string, _scrollSpeed: number): Pattern {
  // ジャンプ最大高さの75%以下に制限
  const maxH = Math.floor(MAX_JUMP_HEIGHT * 0.75)
  const stepH = randInt(40, Math.min(80, maxH)) // 40〜80px（1〜2ブロック分）
  const stepH_snapped = Math.round(stepH / 40) * 40  // 40px単位
  // ブロック数は1〜2個のみ（3個だと側面衝突リスクが高くなる）
  const blockCount = randInt(1, 2)

  const objects: StageObject[] = []
  for (let i = 0; i < blockCount; i++) {
    objects.push(makeBlock(
      x + i * 40,
      GROUND_Y - stepH_snapped,
      40, stepH_snapped,
      blockColor
    ))
  }

  // ブロック上にトゲは乗せない（側面衝突→即死になるケースが発生するため）
  const totalWidth = blockCount * 40
  return { objects, width: totalWidth }
}

// --- 壁ブロック（横から迫ってくる、上を飛び越える） ---
function patternBlockWall(x: number, blockColor: string): Pattern {
  // ジャンプで飛び越えられる高さ（最大高さの55%以下）
  // 55% = 約61px → 40px単位で切り捨て = 40px のみ許可
  const maxPassH = Math.floor(MAX_JUMP_HEIGHT * 0.55)
  const wallH_snapped = Math.floor(Math.min(80, maxPassH) / 40) * 40  // 40px単位
  const finalH = Math.max(40, wallH_snapped)  // 最低40px

  const objects: StageObject[] = [
    makeBlock(x, GROUND_Y - finalH, 40, finalH, blockColor),
  ]
  // 壁の後ろに十分な余白（次の判定に備える）をwidthに含める
  return { objects, width: 80 }
}

// --- ジャンプ台 ---
function patternJumpPad(x: number): Pattern {
  return {
    objects: [{
      id: newId(), type: 'jump_pad',
      x, y: GROUND_Y - 20,
      width: 60, height: 20,
      rotation: 0, color: '#f9d423',
      properties: { visible: true, opacity: 1, jumpForce: 950 },
      script: '',
    }],
    width: 60,
  }
}

// --- ジャンプリング（宙に浮かせる、必ず届く高さ） ---
function patternJumpRing(x: number): Pattern {
  // プレイヤーが届く高さ内に配置
  const ringY = GROUND_Y - PLAYER_SIZE - randInt(20, Math.floor(MAX_JUMP_HEIGHT * 0.6))
  return {
    objects: [{
      id: newId(), type: 'jump_ring',
      x, y: ringY,
      width: 40, height: 40,
      rotation: 0, color: '#43e97b',
      properties: { visible: true, opacity: 1 },
      script: '',
    }],
    width: 40,
  }
}

// --- ノコギリ（必ず上を通れるスペースあり） ---
function patternSaw(x: number): Pattern {
  // 地面近くに固定（上を飛び越える）
  const sawY = GROUND_Y - 40
  return {
    objects: [{
      id: newId(), type: 'saw',
      x, y: sawY,
      width: 40, height: 40,
      rotation: 0, color: '#888',
      properties: { visible: true, opacity: 1 },
      script: '',
    }],
    width: 40,
  }
}

// --- 宙に浮くプラットフォーム（地面トゲとセット） ---
function patternPlatform(x: number, scrollSpeed: number): Pattern {
  const platW = randInt(2, 4) * 40
  // プレイヤーが乗れる高さ（最大高さの70%以下）
  const platH = GROUND_Y - PLAYER_SIZE - randInt(20, Math.floor(MAX_JUMP_HEIGHT * 0.65))

  const objects: StageObject[] = [
    {
      id: newId(), type: 'platform',
      x, y: platH,
      width: platW, height: 16,
      rotation: 0, color: '#55aa99',
      properties: { visible: true, opacity: 1 },
      script: '',
    },
  ]

  // 地面にトゲ（プラットフォームの真下）→ 踏まないと当たるが乗れば安全
  if (chance(0.6)) {
    objects.push(makeSpike(x + platW / 2 - 20))
  }

  return { objects, width: Math.max(platW, 80) }
}

// --- ポータル（直後に安全地帯あり） ---
function patternPortal(x: number, scrollSpeed: number): Pattern {
  // 重力反転のみ（フライは複雑になるため除外）
  const objects: StageObject[] = [
    {
      id: newId(), type: 'portal_gravity',
      x, y: GROUND_Y - 160,
      width: 30, height: 160,
      rotation: 0, color: '#6c63ff',
      properties: { visible: true, opacity: 1 },
      script: '',
    },
  ]
  // ポータル直後は必ず安全地帯（ジャンプ距離分）
  const safeWidth = Math.ceil(jumpHorizDistance(scrollSpeed) * 1.2)
  return { objects, width: 30 + safeWidth }
}

// ============================================================
// ステージ検証（連続不可能パターンの検出と修正）
// ============================================================

function validateAndFix(objects: StageObject[], scrollSpeed: number): StageObject[] {
  const jumpDist = jumpHorizDistance(scrollSpeed)

  // ---- 1. ジャンプで届かないブロック高さを修正 ----
  const maxSafeH = Math.floor(MAX_JUMP_HEIGHT * 0.75)
  let fixed = objects.map(o => {
    if (o.type === 'block') {
      const blockH = GROUND_Y - o.y
      if (blockH > maxSafeH) {
        return { ...o, y: GROUND_Y - maxSafeH, height: maxSafeH }
      }
    }
    return o
  })

  // ---- 2. スパイク連続チェック ----
  // X座標順ソート
  const spikes = fixed
    .filter(o => o.type === 'spike')
    .sort((a, b) => a.x - b.x)

  const toRemove = new Set<string>()

  // 1ジャンプで超えられる最大スパイク数を計算
  // 幅40のスパイクが密着(gap=0)で並ぶ場合: jumpDist / 40 個まで
  // ただし安全マージンとして0.8倍にする
  const maxSpikesPerJump = Math.floor((jumpDist * 0.8) / 40)

  // 連続スパイクのグループを検出
  const groups: StageObject[][] = []
  let currentGroup: StageObject[] = []

  for (let i = 0; i < spikes.length; i++) {
    if (currentGroup.length === 0) {
      currentGroup.push(spikes[i])
    } else {
      const prev = currentGroup[currentGroup.length - 1]
      const gapToPrev = spikes[i].x - (prev.x + prev.width)
      // 間隔が jumpDist の半分未満なら同一グループ（1ジャンプで処理しなければならない）
      if (gapToPrev < jumpDist * 0.5) {
        currentGroup.push(spikes[i])
      } else {
        groups.push([...currentGroup])
        currentGroup = [spikes[i]]
      }
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup)

  // グループ内のスパイク数が超過していたら末尾から削除
  for (const group of groups) {
    if (group.length > maxSpikesPerJump) {
      // 先頭からmaxSpikesPerJump個残して残りを削除
      for (let i = maxSpikesPerJump; i < group.length; i++) {
        toRemove.add(group[i].id)
      }
    }
  }

  fixed = fixed.filter(o => !toRemove.has(o.id))

  // ---- 3. ブロックとスパイクの近接チェック ----
  // ブロックの直後(40px以内)にスパイクがある場合、スパイクを削除
  // (ブロックを踏んで着地した直後にスパイクに当たるケース)
  const blocks = fixed.filter(o => o.type === 'block')
  const spikesFinal = fixed.filter(o => o.type === 'spike')
  const tooCloseToBlock = new Set<string>()
  for (const block of blocks) {
    const blockRight = block.x + block.width
    for (const spike of spikesFinal) {
      // ブロック右端の直後にスパイクがある場合
      if (spike.x >= blockRight && spike.x < blockRight + 60) {
        tooCloseToBlock.add(spike.id)
      }
    }
  }
  fixed = fixed.filter(o => !tooCloseToBlock.has(o.id))

  // ---- 4. jump_pad の連続・密集チェック ----
  // jump_pad が jumpDist 以内に2個以上あると制御不能になるため後の方を削除
  const jumpPads = fixed
    .filter(o => o.type === 'jump_pad')
    .sort((a, b) => a.x - b.x)
  const tooClosePads = new Set<string>()
  for (let i = 0; i < jumpPads.length - 1; i++) {
    if (tooClosePads.has(jumpPads[i].id)) continue
    const gap = jumpPads[i + 1].x - (jumpPads[i].x + jumpPads[i].width)
    if (gap < jumpDist * 0.9) {
      tooClosePads.add(jumpPads[i + 1].id)
    }
  }
  fixed = fixed.filter(o => !tooClosePads.has(o.id))

  // ---- 5. スパイク直前にjump_padがある危険パターンの除去 ----
  // jump_pad → スパイク の順で間隔が jumpDist 以内だと
  // 強制的に高く飛ばされてスパイクに激突する
  const spikesForPad = fixed.filter(o => o.type === 'spike').sort((a, b) => a.x - b.x)
  const jumpPadsAfterFix = fixed.filter(o => o.type === 'jump_pad')
  const dangerousPads = new Set<string>()
  for (const pad of jumpPadsAfterFix) {
    const padRight = pad.x + pad.width
    for (const spike of spikesForPad) {
      // pad の右端からスパイク左端までの距離
      const dist = spike.x - padRight
      if (dist >= 0 && dist < jumpDist * 1.1) {
        // jump_padで飛んだらスパイクに当たる → padを削除
        dangerousPads.add(pad.id)
        break
      }
    }
  }
  fixed = fixed.filter(o => !dangerousPads.has(o.id))

  return fixed
}

// ============================================================
// メイン生成関数
// ============================================================

export function generateStage(difficulty: Difficulty, authorName = 'AI'): StageData {
  _id = 1
  const params = DIFFICULTY_PARAMS[difficulty]
  const objects: StageObject[] = []
  const jumpDist = jumpHorizDistance(params.scrollSpeed)

  // パターン間の最小マージン（スクロール速度に応じて調整）
  // プレイヤーが着地して次のジャンプ準備をする時間
  const minMargin = Math.ceil(jumpDist * 0.4)
  const normalMargin = Math.ceil(jumpDist * 0.6)

  let x = 400  // 序盤の安全地帯（プレイヤーが動き出す猶予）

  // ---- シーケンス生成ループ ----
  // 危険パターンが連続しないように直前のパターンを記録する
  let lastPatternType = 'gap'
  // 連続してスパイク系パターンを選ばないようにするカテゴリ
  const spikePatterns = new Set(['singleSpike', 'doubleSpike', 'saw'])

  while (x < params.stageLength - 600) {
    let patternType = weightedPick(params.weights)

    // 直前もスパイク系だったら強制的に gap に変える（連続スパイク防止）
    if (spikePatterns.has(patternType) && spikePatterns.has(lastPatternType)) {
      patternType = 'gap'
    }

    let pattern: Pattern

    switch (patternType) {
      case 'gap':
        pattern = patternGap(params.scrollSpeed)
        break
      case 'singleSpike':
        pattern = patternSingleSpike(x)
        break
      case 'doubleSpike':
        pattern = patternDoubleSpike(x, params.scrollSpeed)
        break
      case 'blockStep':
        pattern = patternBlockStep(x, params.blockColor, params.scrollSpeed)
        break
      case 'blockWall':
        pattern = patternBlockWall(x, params.blockColor)
        break
      case 'jumpPad':
        pattern = patternJumpPad(x)
        break
      case 'jumpRing':
        pattern = patternJumpRing(x)
        break
      case 'saw':
        pattern = patternSaw(x)
        break
      case 'platform':
        pattern = patternPlatform(x, params.scrollSpeed)
        break
      case 'portal':
        pattern = patternPortal(x, params.scrollSpeed)
        break
      default:
        pattern = patternGap(params.scrollSpeed)
    }

    objects.push(...pattern.objects)

    // パターン幅 + マージンを進む
    // gapパターンはマージン不要（自身が間隔を持つ）
    const margin = patternType === 'gap' ? 0 : randInt(minMargin, normalMargin)
    x += pattern.width + margin
    lastPatternType = patternType
  }

  // ---- 終盤処理 ----
  // 最後の300pxは安全地帯（ゴールへの到達を保証）
  // ゴール直前にジャンプリング演出
  objects.push({
    id: newId(), type: 'jump_ring',
    x: params.stageLength - 300,
    y: GROUND_Y - PLAYER_SIZE - 60,
    width: 40, height: 40,
    rotation: 0, color: '#43e97b',
    properties: { visible: true, opacity: 1 },
    script: '',
  })

  // ---- 検証・修正 ----
  const validatedObjects = validateAndFix(objects, params.scrollSpeed)

  return {
    id: `generated-${Date.now()}`,
    name: `AI Generated (${params.label})`,
    author: authorName,
    bgColor: params.bgColor,
    groundColor: params.groundColor,
    objects: validatedObjects,
    bpm: 120,
    scrollSpeed: params.scrollSpeed,
    groundY: GROUND_Y,
    stageLength: params.stageLength,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export { DIFFICULTY_PARAMS, validateAndFix }
