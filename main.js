// =======================
// ウエノゲーム main.js（差し替え版）
// Round1: 3箱 / Round2以降: 9箱（3×3）
// Round2: moves=30
// Round3: feint無し
// 以降: speed倍速化（数値は小さいほど速い）
// シャッフル間隔(gap)も調整
// =======================

const lane = document.getElementById("lane");
const msg = document.getElementById("msg");
const startBtn = document.getElementById("start");
const nextBtn = document.getElementById("next");
const resetBtn = document.getElementById("reset");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalOk = document.getElementById("modalOk");
const modalCancel = document.getElementById("modalCancel");

const levelEl = document.getElementById("level"); // 表示はROUND扱い
const winEl = document.getElementById("win");
const loseEl = document.getElementById("lose");

// フェイント設定（係数）
const FEINT_PAUSE_RATIO = 0.45;

// 基準（Round1）
const BASE_SPEED = 700;

function getDifficulty(r){
  // ===== FINAL（ROUND100） =====
  if (r === 100){
    return {
      boxCount: 2,
      moves: 300,      // 30回の10倍（=300回）
      speed: 35,       // 350msの10倍速（数値が小さいほど速い）
      feintChance: 0,  // フェイント無し
      gap: 1           // シャッフル間隔も極小
    };
  }

    
    // ===== Round1 =====
  if (r === 1){
    return {
      boxCount: 3,
      moves: 5,
      speed: 700,
      feintChance: 0.2,
      gap: 80
    };
  }

  // ===== Round2〜5：3箱のまま徐々に強化 =====
  if (r >= 2 && r <= 5){
    return {
      boxCount: 3,
      moves: 5 + (r - 1) * 4,          // 回数じわ増え
      speed: 700 - (r - 1) * 120,      // 徐々に速く
      feintChance: 0.25 + (r - 2) * 0.05,
      gap: 70 - (r - 2) * 12
    };
  }

  // ===== Round99（旧Round2の地獄設定） =====
  return {
    boxCount: 9,
    moves: 30,
    speed: 350,
    feintChance: 0.35,
    gap: 10
  };
}

let round = 1;
let win = 0;
let lose = 0;

let startTime = 0;   // ゲーム開始時刻
let endTime = 0;     // クリア時刻

let phase = "idle"; // idle/show/hide/shuffle/guess/result

let boxCount = 3;
let boxes = [];
let ballEl = null;

// slotOfBoxId[boxId] = slotIndex（0..boxCount-1）
let slotOfBoxId = [];

// ボールが入ってる箱ID（0..boxCount-1）
let ballBoxId = 0;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function updateRoundLabel(){
  levelEl.textContent = (round === 100) ? "FINAL ROUND" : String(round);
}

// --------- 爆発エフェクト ----------
function explodeAtClientXY(x, y){
  document.body.classList.add("screen-shake");
  setTimeout(() => document.body.classList.remove("screen-shake"), 240);

  const N = 18;
  for (let i = 0; i < N; i++){
    const p = document.createElement("div");
    p.className = "particle";

    p.style.left = x + "px";
    p.style.top  = y + "px";

    const angle = (Math.PI * 2) * (i / N) + (Math.random() * 0.4);
    const dist  = 40 + Math.random() * 50;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    p.style.setProperty("--dx", `${dx}px`);
    p.style.setProperty("--dy", `${dy}px`);

    const hue = 20 + Math.random() * 50;
    p.style.background = `hsl(${hue}, 90%, 60%)`;

    document.body.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
    setTimeout(() => p.remove(), 700);
  }
}

// --------- UI補助 ----------
function setTransition(ms){
  for (const el of boxes){
    el.style.transitionDuration = `${ms}ms`;
  }
}

function clearMarks(){
  for (const b of boxes){
    b.classList.remove("correct", "wrong");
  }
}

function showBall(isVisible){
  if (!ballEl) return;
  ballEl.classList.toggle("hidden", !isVisible);
}

function setClickable(on){
  for (const b of boxes){
    b.classList.toggle("disabled", !on);
  }
}

// --------- レイアウト ----------
function calcLayout(){
  const rect = lane.getBoundingClientRect();

  let PAD = 18;
  if (rect.width < 360) PAD = 12;
  if (rect.width < 320) PAD = 8;

  const cols = (boxCount <= 2) ? 2 : 3;
  const rows = Math.ceil(boxCount / cols);

  const availableW = rect.width - PAD * 2;

  let gap = Math.floor(availableW * 0.03);
  gap = Math.max(6, Math.min(14, gap));

  let boxW = Math.floor((availableW - gap * (cols - 1)) / cols);
  boxW = Math.max(44, Math.min(160, boxW));

  const boxH = Math.round(boxW * 1.05);

  const xs = [];
  for (let c = 0; c < cols; c++){
    xs.push(PAD + c * (boxW + gap));
  }

  const vgap = Math.max(10, Math.min(18, Math.floor(boxH * 0.18)));
  const ys = [];
  for (let r = 0; r < rows; r++){
    ys.push(30 + r * (boxH + vgap));
  }

  return { xs, ys, boxW, boxH, cols };
}

function applyPositions(){
  if (boxes.length !== boxCount) return;
  const { xs, ys, boxW, boxH, cols } = calcLayout();

  for (let id = 0; id < boxCount; id++){
    const slot = slotOfBoxId[id];
    const r = Math.floor(slot / cols);
    const c = slot % cols;

    boxes[id].style.width  = `${boxW}px`;
    boxes[id].style.height = `${boxH}px`;
    boxes[id].style.left   = `${xs[c]}px`;
    boxes[id].style.top    = `${ys[r]}px`;
  }

  if (ballEl && ballBoxId >= 0 && ballBoxId < boxCount){
    boxes[ballBoxId].appendChild(ballEl);
    ballEl.style.left = "50%";
    ballEl.style.bottom = "18px";
    ballEl.style.transform = "translateX(-50%)";
  }
}

// --------- シャッフル ----------
function randomSwapPair(){
  const a = Math.floor(Math.random() * boxCount);
  let b = Math.floor(Math.random() * boxCount);
  while (b === a) b = Math.floor(Math.random() * boxCount);
  return [a, b];
}

function swapSlots(sa, sb){
  const boxAtSlot = new Array(boxCount).fill(0);
  for (let id = 0; id < boxCount; id++){
    boxAtSlot[slotOfBoxId[id]] = id;
  }

  const boxA = boxAtSlot[sa];
  const boxB = boxAtSlot[sb];

  slotOfBoxId[boxA] = sb;
  slotOfBoxId[boxB] = sa;
}

// --------- 描画 ----------
function render(){
  lane.innerHTML = "";
  boxes = [];

  for (let id = 0; id < boxCount; id++){
    const b = document.createElement("div");
    b.className = "box";
    b.dataset.id = String(id);
    b.innerHTML = `<div class="lid"></div>`;
    b.addEventListener("click", () => onPick(id));
    lane.appendChild(b);
    boxes.push(b);
  }

  ballEl = document.createElement("div");
  ballEl.className = "ball";
  lane.appendChild(ballEl);

  clearMarks();
  setClickable(false);
  showBall(true);

  setTransition(BASE_SPEED);
  applyPositions();
}

// --------- ゲーム進行 ----------
function setRoundBoxes(){
  const d = getDifficulty(round);

  boxCount = d.boxCount;
  slotOfBoxId = Array.from({ length: boxCount }, (_, i) => i);
  ballBoxId = Math.floor(Math.random() * boxCount);

  return d;
}

async function startRound(){

  // ★最初だけ案内（1回だけ）
  if (round === 1 && startTime === 0){
    msg.textContent = "全部で7ROUNDあるよ";
    await sleep(1200); // 表示時間
  }

  // ROUND1開始の瞬間だけタイマー開始
  if (round === 1 && startTime === 0){
    startTime = Date.now();
  }

  const d = setRoundBoxes();
  render();
  document.body.classList.toggle("round99", round === 99);

  phase = "show";
  nextBtn.disabled = true;
  startBtn.disabled = true;
  clearMarks();

  setTransition(d.speed);
  showBall(true);
  setClickable(false);
  applyPositions();

  msg.textContent = "見て。ボールの位置を覚えろ。";
  await sleep(900);

  phase = "hide";
  msg.textContent = "隠すよ。";
  showBall(false);
  await sleep(450);

  phase = "shuffle";
  msg.textContent = "";

  for (let i = 0; i < d.moves; i++){
    if (Math.random() < d.feintChance){
      await sleep(Math.floor(d.speed * FEINT_PAUSE_RATIO));
    }

    const [sa, sb] = randomSwapPair();
    swapSlots(sa, sb);
    applyPositions();
    await sleep(d.gap);

    if (Math.random() < d.feintChance * 0.6){
      await sleep(Math.floor(d.speed * 0.18));
      const [sa2, sb2] = randomSwapPair();
      swapSlots(sa2, sb2);
      applyPositions();
      await sleep(d.speed * 0.65);
    }
  }

  phase = "guess";
  msg.textContent = "箱をタップして。";
  setClickable(true);
}

function onPick(boxId){
  if (phase === "idle"){
    const rect = boxes[boxId].getBoundingClientRect();
    explodeAtClientXY(rect.left + rect.width / 2, rect.top + rect.height / 2);
    msg.textContent = "START押せ";
    return;
  }

  if (phase !== "guess") return;

  phase = "result";
  setClickable(false);

  const correct = (boxId === ballBoxId);

  showBall(true);
  applyPositions();
  clearMarks();

  if (correct){
  boxes[boxId].classList.add("correct");
  win++;

  // ★ROUND100は「当てたらゲームクリア」で終わり（ここが最優先）
  if (round === 100){
    endTime = Date.now();
    const seconds = Math.floor((endTime - startTime) / 1000);

    msg.textContent = `${seconds}秒無駄にしました。ゲームクリア。`;

    // 終了状態に固定
    phase = "idle";
    setClickable(false);
    nextBtn.disabled = true;
    startBtn.disabled = true;

    // ROUND99演出も切る
    document.body.classList.remove("round99");
    return;
  }

  // 正解したので次へ
  round++;

  // ★Round5クリア後（roundが6になった瞬間）に99へワープ
  if (round === 6) round = 99;

  msg.textContent = (round === 99) ? "センスあるから本番開始" : "当たり！";
} else {
  boxes[boxId].classList.add("wrong");
  boxes[ballBoxId].classList.add("correct");
  lose++;
  msg.textContent = "ハズレ。論外。";
}


  updateRoundLabel();
  winEl.textContent = String(win);
  loseEl.textContent = String(lose);

nextBtn.disabled = false; // ★当たりでもハズレでもNEXTで再挑戦OK
startBtn.disabled = true;
}

function resetAll(){
startTime = 0;
endTime = 0;

  round = 1;
  win = 0;
  lose = 0;

  levelEl.textContent = "1";
  winEl.textContent = "0";
  loseEl.textContent = "0";

  phase = "idle";
  startBtn.disabled = false;
  nextBtn.disabled = true;

  boxCount = 3;
  slotOfBoxId = Array.from({ length: boxCount }, (_, i) => i);
  ballBoxId = Math.floor(Math.random() * boxCount);

  render();
  setTransition(BASE_SPEED);
  setClickable(false);
  clearMarks();
  showBall(true);
  applyPositions();

  document.body.classList.remove("round99");

  msg.textContent = "STARTを押して";
}

// --------- RESETモーダル ----------
function openResetModal(){ modalBackdrop.classList.remove("hidden"); }
function closeResetModal(){ modalBackdrop.classList.add("hidden"); }

resetBtn.addEventListener("click", openResetModal);
modalCancel.addEventListener("click", closeResetModal);
modalOk.addEventListener("click", () => { closeResetModal(); resetAll(); });
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeResetModal(); });

// --------- その他 ----------
window.addEventListener("resize", () => applyPositions());
lane.addEventListener("contextmenu", (e) => e.preventDefault());
lane.addEventListener("selectstart", (e) => e.preventDefault());

startBtn.addEventListener("click", startRound);
nextBtn.addEventListener("click", startRound);

// 初期化
resetAll();







