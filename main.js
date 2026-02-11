// =======================
// ウエノゲーム main.js（差し替え版）
// Round1: 3箱 / Round2以降: 9箱（3×3）
// シャッフル: 5回固定 / スピード: 700ms固定
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

// フェイント設定
const FEINT_CHANCE = 0.35;
const FEINT_PAUSE_RATIO = 0.45;

// 固定難易度
const SHUFFLE_MOVES = 5;
const BASE_SPEED = 700;

function getDifficulty(r){
  const isHard = (r >= 2);

  const boxCount = isHard ? 9 : 3;

  // Round2から30回固定
  const moves = isHard ? 30 : 5;

  // ===== スピード =====
  // Round1 → 700
  // Round2 → 350
  // Round3 → 350（フェイント無し）
  // Round4以降 → どんどん倍速
  let speed;
  if (r === 1) speed = 700;
  else if (r === 2) speed = 350;
  else if (r === 3) speed = 350;
  else speed = Math.max(350 / Math.pow(2, r - 3), 60); // 下限60ms

  // ===== フェイント =====
  // Round1 → 少しあり
  // Round2 → あり
  // Round3 → なし
  // Round4以降 → なし（純粋な速度勝負）
  let feintChance;
  if (r === 3) feintChance = 0;
  else feintChance = isHard ? 0.35 : 0.35;

  // ===== シャッフル間隔 =====
  const gap = isHard ? 10 : 60;

  return { boxCount, moves, speed, feintChance, gap };
}

let round = 1;
let win = 0;
let lose = 0;

let phase = "idle"; // idle/show/hide/shuffle/guess/result

let boxCount = 3;
let boxes = [];
let ballEl = null;

// slotOfBoxId[boxId] = slotIndex（0..boxCount-1）
let slotOfBoxId = [];

// ボールが入ってる“箱ID”（0..boxCount-1）
let ballBoxId = 0;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// --------- 爆発エフェクト（CSSがあれば派手、なくても動作に影響なし） ----------
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
    // CSSが無くても、念のため消す
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

// --------- レイアウト（3列グリッド：9箱は3×3、3箱は1行3列） ----------
function calcLayout(){
  const rect = lane.getBoundingClientRect();

  let PAD = 18;
  if (rect.width < 360) PAD = 12;
  if (rect.width < 320) PAD = 8;

  const cols = 3;
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

  // ボールは入ってる箱の中に常に入れる（ズレ根絶）
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

  // ballBoxIdは動かさない：箱と一緒に移動する（appendChildで追従）
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

  return d; // startRoundで moves/speed/feint を使う
}

async function startRound(){
  const d = setRoundBoxes();
  render();

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
  // スタート前に押したら爆発
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
    msg.textContent = "当たり！";
  } else {
    boxes[boxId].classList.add("wrong");
    boxes[ballBoxId].classList.add("correct");
    lose++;
    msg.textContent = "ハズレ。論外。";
  }

  // 次ラウンドへ
  round++;
  levelEl.textContent = String(round);
  winEl.textContent = String(win);
  loseEl.textContent = String(lose);

  nextBtn.disabled = false;
  startBtn.disabled = true;
}

function resetAll(){
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

  msg.textContent = "STARTを押して";
}

// --------- RESETモーダル（重複登録しない） ----------
function openResetModal(){
  modalBackdrop.classList.remove("hidden");
}
function closeResetModal(){
  modalBackdrop.classList.add("hidden");
}

resetBtn.addEventListener("click", openResetModal);

modalCancel.addEventListener("click", closeResetModal);

modalOk.addEventListener("click", () => {
  closeResetModal();
  resetAll();
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeResetModal();
});

// --------- その他 ----------
window.addEventListener("resize", () => applyPositions());

// ゲームエリアで選択・長押しメニューを抑止（完全に防げないが体験は改善）
lane.addEventListener("contextmenu", (e) => e.preventDefault());
lane.addEventListener("selectstart", (e) => e.preventDefault());

// ボタン
startBtn.addEventListener("click", startRound);
nextBtn.addEventListener("click", startRound);

// 初期化
resetAll();





