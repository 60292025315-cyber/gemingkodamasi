// ============================================================
// Kiro Dash Studio - ゲームエンジン（物理演算 + ネオンサイバーグラフィック）
// ============================================================

import type {
  PlayerState, StageObject, StageData, Rect, RenderContext, KeyState,
} from '../types';

// -------- 物理定数 --------
const GRAVITY = 2200;
const JUMP_FORCE = -700;
const JUMP_PAD_FORCE = -950;
const MAX_FALL_SPEED = 1200;
const PLAYER_SIZE = 40;

// -------- グローバルタイム（エフェクト用） --------
let _time = 0;

// -------- ジャンプ入力バッファ --------
// ジャンプボタンを押した瞬間から JUMP_BUFFER_TIME 秒以内に着地した場合も
// ジャンプを発動する（先押し許容）
const JUMP_BUFFER_TIME = 0.12; // 秒
let _jumpBufferTimer = 0;

// 着地直前の先行ジャンプ許容（コヨーテタイム）
// 地面から離れた直後 COYOTE_TIME 秒以内ならまだジャンプできる
const COYOTE_TIME = 0.08; // 秒
let _coyoteTimer = 0;

// jump_ring用: 前フレームのジャンプ入力状態（エッジ検出）
let _prevJumpPressed = false;

// -------- ユーティリティ --------

export function createPlayer(groundY: number): PlayerState {
  // リスタート時にバッファ系タイマーをリセット
  _jumpBufferTimer = 0;
  _coyoteTimer = 0;
  _prevJumpPressed = false;
  return {
    x: 120, y: groundY - PLAYER_SIZE,
    vx: 0, vy: 0,
    width: PLAYER_SIZE, height: PLAYER_SIZE,
    isOnGround: true, isDead: false,
    rotation: 0, gameMode: 'cube', gravityFlipped: false,
  };
}

function rectOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}
function getPlayerRect(p: PlayerState): Rect {
  const m = 4;
  return { x: p.x + m, y: p.y + m, width: p.width - m * 2, height: p.height - m * 2 };
}
function getObjectRect(obj: StageObject): Rect {
  return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
}

// -------- 物理ステップ --------

export function physicsStep(
  player: PlayerState, stage: StageData, keys: KeyState, dt: number, scrollX: number
): { player: PlayerState; scrollX: number } {
  _time += dt;
  if (player.isDead) return { player, scrollX };

  // 再スタート直後（isDead が false に戻った直後）はバッファをクリア
  let p = { ...player };
  const gravityDir = p.gravityFlipped ? -1 : 1;
  const newScrollX = scrollX + stage.scrollSpeed * dt;

  // ---- ジャンプバッファ更新 ----
  const jumpPressed = keys.space || keys.up || keys.click;
  // このフレームで新たに押された（立ち上がりエッジ）
  const jumpJustPressed = jumpPressed && !_prevJumpPressed;
  _prevJumpPressed = jumpPressed;

  if (jumpJustPressed) {
    _jumpBufferTimer = JUMP_BUFFER_TIME;
  } else {
    _jumpBufferTimer = Math.max(0, _jumpBufferTimer - dt);
  }

  // ---- コヨーテタイム更新 ----
  if (p.isOnGround) {
    _coyoteTimer = COYOTE_TIME;
  } else {
    _coyoteTimer = Math.max(0, _coyoteTimer - dt);
  }

  if (p.gameMode === 'cube') {
    // バッファ内の入力 OR コヨーテタイム内 でジャンプ発動
    if (_jumpBufferTimer > 0 && (_coyoteTimer > 0 || p.isOnGround)) {
      p.vy = JUMP_FORCE * gravityDir;
      p.isOnGround = false;
      _jumpBufferTimer = 0;
      _coyoteTimer = 0;
    }
  } else if (p.gameMode === 'fly') {
    if (jumpPressed) {
      p.vy = Math.max(p.vy - 1800 * dt, -500);
    } else {
      p.vy = Math.min(p.vy + GRAVITY * 0.5 * dt, 500);
    }
  }

  if (p.gameMode !== 'fly') {
    p.vy += GRAVITY * gravityDir * dt;
    p.vy = Math.min(Math.max(p.vy, -MAX_FALL_SPEED), MAX_FALL_SPEED);
  }

  p.y += p.vy * dt;

  const groundY = stage.groundY - p.height;
  if (!p.gravityFlipped) {
    if (p.y >= groundY) { p.y = groundY; p.vy = 0; p.isOnGround = true; }
    else { p.isOnGround = false; }
    if (p.y < 0) { p.y = 0; p.vy = 0; }
  } else {
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.isOnGround = true; }
    else { p.isOnGround = false; }
    if (p.y + p.height > stage.groundY) { p.y = stage.groundY - p.height; p.vy = 0; }
  }

  if (p.gameMode === 'cube') {
    if (!p.isOnGround) {
      p.rotation += 270 * dt * gravityDir;
    } else {
      // 着地時: 90度単位で最も 0度（地面と平行）に近い角度へ素早くスナップ
      const snap = 90;
      const nearest = Math.round(p.rotation / snap) * snap;
      const diff = nearest - p.rotation;
      const speed = Math.min(dt * 30, 1);
      p.rotation += diff * speed;
      if (Math.abs(diff) < 0.5) p.rotation = nearest;
    }
  }

  const pRect = getPlayerRect(p);
  for (const obj of stage.objects) {
    if (!obj.properties.visible) continue;
    const oRect = getObjectRect(obj);
    const pWorld: Rect = { ...pRect, x: pRect.x + newScrollX };
    if (!rectOverlap(pWorld, oRect)) continue;

    switch (obj.type) {
      case 'spike': case 'saw': p.isDead = true; break;
      case 'block': case 'platform': {
        if (!p.gravityFlipped && pWorld.y + pWorld.height > oRect.y && pWorld.y < oRect.y && p.vy >= 0) {
          p.y = oRect.y - p.height; p.vy = 0; p.isOnGround = true;
        } else if (p.gravityFlipped && pWorld.y < oRect.y + oRect.height && pWorld.y + pWorld.height > oRect.y + oRect.height && p.vy <= 0) {
          p.y = oRect.y + oRect.height; p.vy = 0; p.isOnGround = true;
        } else if (obj.type !== 'platform') { p.isDead = true; }
        break;
      }
      case 'jump_pad': p.vy = JUMP_PAD_FORCE * gravityDir; p.isOnGround = false; break;
      case 'jump_ring':
        if (jumpJustPressed || _jumpBufferTimer > 0) {
          p.vy = JUMP_FORCE * gravityDir;
          p.isOnGround = false;
          _jumpBufferTimer = 0;
        }
        break;
      case 'portal_gravity': p.gravityFlipped = !p.gravityFlipped; break;
      case 'portal_fly': p.gameMode = 'fly'; break;
      case 'portal_normal': p.gameMode = 'cube'; p.gravityFlipped = false; break;
    }
    if (p.isDead) break;
  }

  return { player: p, scrollX: newScrollX };
}

// ============================================================
// ネオンサイバー背景描画
// ============================================================

// 星フィールド（静的シード・少量）
const STARS = Array.from({ length: 60 }, () => ({
  x: Math.random(), y: Math.random(),
  size: 0.5 + Math.random() * 1.5,
  speed: 0.1 + Math.random() * 0.3,
  brightness: 0.3 + Math.random() * 0.5,
}));

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, scrollX: number, bgColor: string) {
  // グラデーション背景
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, bgColor);
  bg.addColorStop(0.6, blendColor(bgColor, '#000010', 0.4));
  bg.addColorStop(1, '#000005');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 星（sin パルスなし・シンプルな点）
  ctx.fillStyle = '#fff';
  for (const star of STARS) {
    const sx = ((star.x * w - scrollX * star.speed * 0.1) % w + w) % w;
    const sy = star.y * h * 0.85;
    ctx.globalAlpha = star.brightness;
    ctx.fillRect(sx - star.size / 2, sy - star.size / 2, star.size, star.size);
  }
  ctx.globalAlpha = 1;

  // 軽量グリッド（六角形→シンプルな直線グリッドに変更）
  drawSimpleGrid(ctx, w, h, scrollX);
}

function drawSimpleGrid(ctx: CanvasRenderingContext2D, w: number, h: number, scrollX: number) {
  const size = 80;
  const offsetX = (-(scrollX * 0.12) % size + size) % size;
  ctx.strokeStyle = 'rgba(108,99,255,0.07)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = offsetX - size; x < w + size; x += size) {
    ctx.moveTo(x, 0); ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += size) {
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();
}

// ============================================================
// 地面描画（ネオングリッドフロア）
// ============================================================

function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, groundY: number, scrollX: number, groundColor: string) {
  // 地面本体
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
  groundGrad.addColorStop(0, blendColor(groundColor, '#000', 0.3));
  groundGrad.addColorStop(1, '#000');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  // 地面グリッドライン（遠近感）
  const gridSpacing = 60;
  const perspective = 400;
  const horizon = groundY;

  ctx.save();
  // 縦線（放射状）
  for (let i = -8; i <= 8; i++) {
    const vanishX = w / 2 + i * 80;
    const startX = w / 2 + i * gridSpacing;
    const alpha = Math.max(0, 0.3 - Math.abs(i) * 0.03);
    ctx.strokeStyle = `rgba(108,99,255,${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vanishX, horizon);
    ctx.lineTo(startX - scrollX * 0.01, h);
    ctx.stroke();
  }
  // 横線（間隔が奥に向かって狭まる）
  for (let d = 0; d < 1; d += 0.06) {
    const y = horizon + (h - horizon) * d;
    const alpha = d * 0.25;
    ctx.strokeStyle = `rgba(108,99,255,${alpha})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // 地面の発光ライン
  ctx.shadowColor = '#6c63ff';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(108,99,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();

  // 二重ライン
  ctx.shadowBlur = 4;
  ctx.strokeStyle = 'rgba(160,150,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, groundY - 3); ctx.lineTo(w, groundY - 3); ctx.stroke();

  ctx.shadowBlur = 0;
}

// ============================================================
// オブジェクト描画（全種）
// ============================================================

function drawObject(ctx: CanvasRenderingContext2D, obj: StageObject, sx: number, sy: number): void {
  ctx.save();
  ctx.translate(sx + obj.width / 2, sy + obj.height / 2);
  ctx.rotate((obj.rotation * Math.PI) / 180);

  switch (obj.type) {

    // ----- クリスタルブロック -----
    case 'block': {
      const w = obj.width, h = obj.height;
      const hw = w / 2, hh = h / 2;

      // 外枠グロー
      ctx.shadowColor = obj.color;
      ctx.shadowBlur = 18;

      // メインボディ（ベベル形状）
      const bevel = 6;
      ctx.beginPath();
      ctx.moveTo(-hw + bevel, -hh);
      ctx.lineTo(hw - bevel, -hh);
      ctx.lineTo(hw, -hh + bevel);
      ctx.lineTo(hw, hh - bevel);
      ctx.lineTo(hw - bevel, hh);
      ctx.lineTo(-hw + bevel, hh);
      ctx.lineTo(-hw, hh - bevel);
      ctx.lineTo(-hw, -hh + bevel);
      ctx.closePath();

      const bodyGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
      bodyGrad.addColorStop(0, alphaColor(obj.color, 0.9));
      bodyGrad.addColorStop(0.4, alphaColor(lighten(obj.color, 40), 0.95));
      bodyGrad.addColorStop(1, alphaColor(darken(obj.color, 30), 0.85));
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // スキャンライン（横方向の輝き）
      ctx.shadowBlur = 0;
      const scanY = -hh + (((_time * 60) % h));
      const scanGrad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6);
      scanGrad.addColorStop(0, 'transparent');
      scanGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
      scanGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = scanGrad;
      ctx.beginPath();
      ctx.rect(-hw, Math.max(-hh, scanY - 6), w, 12);
      ctx.fill();

      // エッジハイライト（左上）
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-hw + bevel, -hh);
      ctx.lineTo(hw - bevel, -hh);
      ctx.lineTo(hw, -hh + bevel);
      ctx.stroke();

      // エッジシャドウ（右下）
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hw, hh - bevel);
      ctx.lineTo(hw - bevel, hh);
      ctx.lineTo(-hw + bevel, hh);
      ctx.stroke();

      // 内側のダイヤモンドパターン
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -hh + 4);
      ctx.lineTo(hw - 4, 0);
      ctx.lineTo(0, hh - 4);
      ctx.lineTo(-hw + 4, 0);
      ctx.closePath();
      ctx.stroke();

      break;
    }

    // ----- サイバートゲ -----
    case 'spike': {
      const hw = obj.width / 2, hh = obj.height / 2;
      const pulse = 0.7 + 0.3 * Math.sin(_time * 4);

      // 外側グロー
      ctx.shadowColor = obj.color;
      ctx.shadowBlur = 20 * pulse;

      // 二重トゲ（後ろ）
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = obj.color;
      ctx.beginPath();
      ctx.moveTo(0, -hh - 6);
      ctx.lineTo(hw + 4, hh + 2);
      ctx.lineTo(-hw - 4, hh + 2);
      ctx.closePath();
      ctx.fill();

      // メイントゲ
      ctx.globalAlpha = 1;
      const spikeGrad = ctx.createLinearGradient(0, -hh, 0, hh);
      spikeGrad.addColorStop(0, lighten(obj.color, 60));
      spikeGrad.addColorStop(0.5, obj.color);
      spikeGrad.addColorStop(1, darken(obj.color, 20));
      ctx.fillStyle = spikeGrad;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw * 0.9, hh);
      ctx.lineTo(0, hh - 6);
      ctx.lineTo(-hw * 0.9, hh);
      ctx.closePath();
      ctx.fill();

      // 中央の輝きライン
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -hh + 2);
      ctx.lineTo(0, hh - 8);
      ctx.stroke();

      break;
    }

    // ----- ホログラムジャンプ台 -----
    case 'jump_pad': {
      const w = obj.width, h = obj.height;
      const hw = w / 2, hh = h / 2;
      const pulse = 0.6 + 0.4 * Math.sin(_time * 5);

      ctx.shadowColor = '#f9d423';
      ctx.shadowBlur = 15 * pulse;

      // 台座
      const padGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
      padGrad.addColorStop(0, '#ffe066');
      padGrad.addColorStop(0.5, '#f9d423');
      padGrad.addColorStop(1, '#c8a800');
      ctx.fillStyle = padGrad;
      // 台形
      ctx.beginPath();
      ctx.moveTo(-hw + 4, -hh);
      ctx.lineTo(hw - 4, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
      ctx.fill();

      // 上面の発光ライン
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-hw + 4, -hh + 1);
      ctx.lineTo(hw - 4, -hh + 1);
      ctx.stroke();

      // 矢印（上向き・アニメーション）
      const arrowY = -hh - 6 - Math.sin(_time * 5) * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, arrowY - 7);
      ctx.lineTo(8, arrowY + 1);
      ctx.lineTo(3, arrowY + 1);
      ctx.lineTo(3, arrowY + 6);
      ctx.lineTo(-3, arrowY + 6);
      ctx.lineTo(-3, arrowY + 1);
      ctx.lineTo(-8, arrowY + 1);
      ctx.closePath();
      ctx.fill();

      break;
    }

    // ----- エネルギーリング -----
    case 'jump_ring': {
      const r = obj.width / 2;
      const pulse = 0.5 + 0.5 * Math.sin(_time * 3);

      // 外側リング（グロー）
      ctx.shadowColor = '#43e97b';
      ctx.shadowBlur = 20 + 10 * pulse;

      // 外リング
      ctx.strokeStyle = `rgba(67,233,123,${0.3 + 0.3 * pulse})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();

      // 内リング
      ctx.strokeStyle = '#43e97b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
      ctx.stroke();

      // 回転する内側クロス
      ctx.save();
      ctx.rotate(_time * 2);
      ctx.strokeStyle = `rgba(67,233,123,0.5)`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
        ctx.stroke();
      }
      ctx.restore();

      // 中心点
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#43e97b';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      break;
    }

    // ----- 重力ポータル（渦巻き） -----
    case 'portal_gravity': {
      const w = obj.width, h = obj.height;
      const hw = w / 2, hh = h / 2;
      const cx = 0, cy = 0;

      // ポータル枠
      ctx.shadowColor = '#6c63ff';
      ctx.shadowBlur = 25;
      ctx.strokeStyle = '#6c63ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(-hw, -hh, w, h);

      // 内部グラデーション
      const portalGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(hw, hh));
      portalGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
      portalGrad.addColorStop(0.4, 'rgba(108,99,255,0.4)');
      portalGrad.addColorStop(1, 'rgba(108,99,255,0.0)');
      ctx.fillStyle = portalGrad;
      ctx.fillRect(-hw, -hh, w, h);

      // 渦巻きライン
      ctx.save();
      ctx.rotate(_time * 1.5);
      for (let ring = 0; ring < 4; ring++) {
        const ringR = (ring + 1) * Math.min(hw, hh) * 0.22;
        const alpha = 0.6 - ring * 0.12;
        ctx.strokeStyle = `rgba(160,150,255,${alpha})`;
        ctx.lineWidth = 1.5 - ring * 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 1.6);
        ctx.stroke();
      }
      ctx.restore();

      // ↕ シンボル
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↕', 0, 0);

      break;
    }

    // ----- フライポータル -----
    case 'portal_fly': {
      const w = obj.width, h = obj.height;
      const hw = w / 2, hh = h / 2;

      ctx.shadowColor = '#43e97b';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#43e97b';
      ctx.lineWidth = 3;
      ctx.strokeRect(-hw, -hh, w, h);

      // スキャンライン（上から下へ流れる）
      const scanPos = ((_time * 80) % h) - hh;
      const scanG = ctx.createLinearGradient(0, scanPos - 10, 0, scanPos + 10);
      scanG.addColorStop(0, 'transparent');
      scanG.addColorStop(0.5, 'rgba(67,233,123,0.4)');
      scanG.addColorStop(1, 'transparent');
      ctx.fillStyle = scanG;
      ctx.fillRect(-hw, -hh, w, h);

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FLY', 0, 0);
      break;
    }

    // ----- キューブポータル -----
    case 'portal_normal': {
      const w = obj.width, h = obj.height;
      const hw = w / 2, hh = h / 2;

      ctx.shadowColor = '#f9d423';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#f9d423';
      ctx.lineWidth = 3;
      ctx.strokeRect(-hw, -hh, w, h);

      const scanPos = ((_time * 80) % h) - hh;
      const scanG = ctx.createLinearGradient(0, scanPos - 10, 0, scanPos + 10);
      scanG.addColorStop(0, 'transparent');
      scanG.addColorStop(0.5, 'rgba(249,212,35,0.4)');
      scanG.addColorStop(1, 'transparent');
      ctx.fillStyle = scanG;
      ctx.fillRect(-hw, -hh, w, h);

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CUBE', 0, 0);
      break;
    }

    // ----- サイバーソー -----
    case 'saw': {
      const r = obj.width / 2;
      const numTeeth = 10;

      ctx.save();
      ctx.rotate(_time * 3);

      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 16;

      // ノコギリ歯
      const sawGrad = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
      sawGrad.addColorStop(0, '#aaa');
      sawGrad.addColorStop(0.6, '#777');
      sawGrad.addColorStop(1, '#333');
      ctx.fillStyle = sawGrad;
      ctx.beginPath();
      for (let i = 0; i < numTeeth * 2; i++) {
        const angle = (i / (numTeeth * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.55;
        ctx.lineTo(Math.cos(angle) * rr, Math.sin(angle) * rr);
      }
      ctx.closePath();
      ctx.fill();

      // 中心ボルト
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 中心十字
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
        ctx.lineTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
        ctx.stroke();
      }

      ctx.restore();
      break;
    }

    // ----- プラットフォーム（エネルギー板） -----
    case 'platform': {
      const w = obj.width, h = obj.height;
      const hw = w / 2, hh = h / 2;
      const pulse = 0.5 + 0.5 * Math.sin(_time * 2);

      ctx.shadowColor = obj.color;
      ctx.shadowBlur = 10 + 6 * pulse;

      // 本体
      const platGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
      platGrad.addColorStop(0, alphaColor(lighten(obj.color, 30), 0.9));
      platGrad.addColorStop(1, alphaColor(obj.color, 0.7));
      ctx.fillStyle = platGrad;
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, w, h, 3);
      ctx.fill();

      // 上面グロー
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-hw + 2, -hh + 1);
      ctx.lineTo(hw - 2, -hh + 1);
      ctx.stroke();

      // 流れるドット
      ctx.shadowBlur = 0;
      const dotSpacing = 20;
      const dotOffset = (_time * 40) % dotSpacing;
      for (let dx = -hw + dotOffset; dx < hw; dx += dotSpacing) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(dx, 0, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      break;
    }
  }

  ctx.restore();
}

// ============================================================
// プレイヤー描画（ホログラムキューブ）
// ============================================================

// トレイル（残像）
export interface TrailPoint { x: number; y: number; rot: number; age: number }
const _trail: TrailPoint[] = [];

export function updateTrail(player: PlayerState, dt: number) {
  if (!player.isDead) {
    _trail.push({
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
      rot: player.rotation,
      age: 0,
    });
  }
  for (const t of _trail) t.age += dt;
  while (_trail.length > 12) _trail.shift();
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState): void {
  // トレイル描画（shadowなし・シンプルな残像）
  for (let i = 0; i < _trail.length; i++) {
    const t = _trail[i];
    const alpha = (1 - t.age / 0.25) * 0.3 * (i / _trail.length);
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(t.x, t.y);
    ctx.rotate((t.rot * Math.PI) / 180);
    const size = p.width * 0.85;
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
  ctx.rotate((p.rotation * Math.PI) / 180);

  const hw = p.width / 2;
  const hh = p.height / 2;

  if (p.gameMode === 'cube') {
    const pulse = 0.7 + 0.3 * Math.sin(_time * 6);

    // 外側グロー
    ctx.shadowColor = '#6c63ff';
    ctx.shadowBlur = 20 * pulse;

    // メインボディ
    const bodyGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    bodyGrad.addColorStop(0, '#a89cff');
    bodyGrad.addColorStop(0.4, '#7c73ff');
    bodyGrad.addColorStop(1, '#4a40cc');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, p.width, p.height, 4);
    ctx.fill();

    // ホログラム走査線
    ctx.shadowBlur = 0;
    for (let y = -hh; y < hh; y += 5) {
      const lineAlpha = 0.05 + 0.03 * Math.sin(y * 0.5 + _time * 8);
      ctx.strokeStyle = `rgba(180,170,255,${lineAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-hw, y);
      ctx.lineTo(hw, y);
      ctx.stroke();
    }

    // 内側フレーム
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 4;
    ctx.strokeRect(-hw + 4, -hh + 4, p.width - 8, p.height - 8);

    // フェイス（目）
    ctx.shadowBlur = 0;
    // 白目
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(4, -9, 9, 9, 2);
    ctx.fill();
    // 瞳
    ctx.fillStyle = '#6c63ff';
    ctx.beginPath();
    ctx.arc(9, -5, 3, 0, Math.PI * 2);
    ctx.fill();
    // ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(10.5, -6.5, 1, 0, Math.PI * 2);
    ctx.fill();

    // エッジハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(-hw + 4, -hh);
    ctx.lineTo(hw - 4, -hh);
    ctx.moveTo(-hw, -hh + 4);
    ctx.lineTo(-hw, hh - 4);
    ctx.stroke();

  } else if (p.gameMode === 'fly') {
    // 宇宙船型
    ctx.shadowColor = '#43e97b';
    ctx.shadowBlur = 20;

    // 船体
    const shipGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, hw);
    shipGrad.addColorStop(0, '#a0ffe0');
    shipGrad.addColorStop(0.5, '#43e97b');
    shipGrad.addColorStop(1, '#1a8a4a');
    ctx.fillStyle = shipGrad;
    ctx.beginPath();
    ctx.moveTo(hw, 0);
    ctx.quadraticCurveTo(hw * 0.2, -hh * 0.7, -hw * 0.6, -hh * 0.5);
    ctx.lineTo(-hw, 0);
    ctx.lineTo(-hw * 0.6, hh * 0.5);
    ctx.quadraticCurveTo(hw * 0.2, hh * 0.7, hw, 0);
    ctx.closePath();
    ctx.fill();

    // エンジン排気
    ctx.shadowBlur = 0;
    const exhaustGrad = ctx.createLinearGradient(-hw, 0, -hw - 20, 0);
    exhaustGrad.addColorStop(0, 'rgba(67,233,123,0.8)');
    exhaustGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = exhaustGrad;
    const exhaustH = 8 + 4 * Math.sin(_time * 10);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.6, -exhaustH / 2);
    ctx.lineTo(-hw - 18 - Math.sin(_time * 8) * 4, 0);
    ctx.lineTo(-hw * 0.6, exhaustH / 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// ゲームレンダリング（メイン）
// ============================================================

export function renderGame(
  rc: RenderContext, player: PlayerState, stage: StageData, scrollX: number
): void {
  const { ctx, width: w, height: h, groundY } = rc;

  // 背景
  drawBackground(ctx, w, h, scrollX, stage.bgColor);

  // オブジェクト
  for (const obj of stage.objects) {
    if (!obj.properties.visible) continue;
    const screenX = obj.x - scrollX;
    if (screenX + obj.width < -100 || screenX > w + 100) continue;
    drawObject(ctx, obj, screenX, obj.y);
  }

  // 地面
  drawGround(ctx, w, h, groundY, scrollX, stage.groundColor);

  // プレイヤートレイル更新＆描画
  updateTrail(player, 0.016);
  if (!player.isDead) drawPlayer(ctx, player);
}

// ============================================================
// エディター描画
// ============================================================

export function renderEditor(
  rc: RenderContext,
  stage: StageData,
  selectedId: string | null,
  hoveredId: string | null,
  ghostObj: { obj: StageObject; sx: number; sy: number } | null
): void {
  const { ctx, width: w, height: h, scrollX, zoom, groundY } = rc;

  // 背景
  ctx.fillStyle = stage.bgColor;
  ctx.fillRect(0, 0, w, h);

  // グリッド
  const gridSize = 40 * zoom;
  const offsetX = (-scrollX * zoom) % gridSize;
  ctx.strokeStyle = 'rgba(108,99,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = offsetX; x < w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // グリッド交点
  ctx.fillStyle = 'rgba(108,99,255,0.25)';
  for (let x = offsetX; x < w; x += gridSize) {
    for (let y = 0; y < h; y += gridSize) {
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // 地面
  const groundScreenY = groundY * zoom;
  const groundGrad = ctx.createLinearGradient(0, groundScreenY, 0, h);
  groundGrad.addColorStop(0, stage.groundColor);
  groundGrad.addColorStop(1, '#000');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundScreenY, w, h - groundScreenY);

  // 地面ライン（ネオン）
  ctx.shadowColor = '#6c63ff';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(108,99,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundScreenY); ctx.lineTo(w, groundScreenY); ctx.stroke();
  ctx.shadowBlur = 0;

  // オブジェクト
  for (const obj of stage.objects) {
    const sx = (obj.x - scrollX) * zoom;
    const sy = obj.y * zoom;
    if (sx + obj.width * zoom < -50 || sx > w + 50) continue;

    if (obj.id === selectedId) {
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx - 3, sy - 3, obj.width * zoom + 6, obj.height * zoom + 6);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    } else if (obj.id === hoveredId) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(sx - 2, sy - 2, obj.width * zoom + 4, obj.height * zoom + 4);
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.scale(zoom, zoom);
    drawObject(ctx, obj, obj.x - scrollX, obj.y);
    ctx.restore();
  }

  // ゴースト
  if (ghostObj) {
    ctx.globalAlpha = 0.5;
    ctx.save();
    ctx.scale(zoom, zoom);
    drawObject(ctx, ghostObj.obj, ghostObj.sx, ghostObj.sy);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// パーティクル
// ============================================================

export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
  shape?: 'square' | 'circle' | 'star';
}

export function createDeathParticles(player: PlayerState): Particle[] {
  const particles: Particle[] = [];
  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 120 + Math.random() * 280;
    const life = 0.6 + Math.random() * 0.5;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life, maxLife: life,
      color: ['#6c63ff', '#a89cff', '#ff6584', '#f9d423', '#fff'][Math.floor(Math.random() * 5)],
      size: 4 + Math.random() * 6,
      shape: ['square', 'circle', 'star'][Math.floor(Math.random() * 3)] as Particle['shape'],
    });
  }
  return particles;
}

export function createClearFireworks(w: number, h: number): Particle[] {
  const particles: Particle[] = [];
  const colors = ['#6c63ff', '#ff6584', '#f9d423', '#43e97b', '#fff', '#ff9f43', '#48dbfb', '#a89cff'];
  const launches = [
    { x: w * 0.15 + Math.random() * w * 0.7, y: h * 0.1 + Math.random() * h * 0.4 },
    { x: w * 0.15 + Math.random() * w * 0.7, y: h * 0.1 + Math.random() * h * 0.4 },
    { x: w * 0.15 + Math.random() * w * 0.7, y: h * 0.1 + Math.random() * h * 0.4 },
  ];
  for (const launch of launches) {
    const count = 50 + Math.floor(Math.random() * 30);
    const c1 = colors[Math.floor(Math.random() * colors.length)];
    const c2 = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 60 + Math.random() * 220;
      const life = 0.7 + Math.random() * 1.0;
      const shapes: Particle['shape'][] = ['square', 'circle', 'star'];
      particles.push({
        x: launch.x, y: launch.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life, maxLife: life,
        color: Math.random() > 0.5 ? c1 : c2,
        size: 3 + Math.random() * 7,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      });
    }
  }
  return particles;
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles.map(p => ({
    ...p,
    x: p.x + p.vx * dt,
    y: p.y + p.vy * dt,
    vy: p.vy + 380 * dt,
    vx: p.vx * 0.96,
    life: p.life - dt,
  })).filter(p => p.life > 0);
}

export function renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const alpha = Math.pow(p.life / p.maxLife, 0.7);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'star') {
      drawStar(ctx, p.x, p.y, p.size / 2, p.size / 4);
    } else {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 5);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const oa = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const ia = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + outerR * Math.cos(oa), cy + outerR * Math.sin(oa));
    else ctx.lineTo(cx + outerR * Math.cos(oa), cy + outerR * Math.sin(oa));
    ctx.lineTo(cx + innerR * Math.cos(ia), cy + innerR * Math.sin(ia));
  }
  ctx.closePath();
  ctx.fill();
}

// ============================================================
// カラーヘルパー
// ============================================================

function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}

function alphaColor(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

function blendColor(hex1: string, hex2: string, t: number): string {
  const n1 = parseInt(hex1.replace('#', ''), 16);
  const n2 = parseInt(hex2.replace('#', ''), 16);
  const r = Math.round(((n1 >> 16) & 0xff) * (1 - t) + ((n2 >> 16) & 0xff) * t);
  const g = Math.round(((n1 >> 8) & 0xff) * (1 - t) + ((n2 >> 8) & 0xff) * t);
  const b = Math.round((n1 & 0xff) * (1 - t) + (n2 & 0xff) * t);
  return `rgb(${r},${g},${b})`;
}
