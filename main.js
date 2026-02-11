const lane = document.getElementById("lane");
const msg = document.getElementById("msg");
const startBtn = document.getElementById("start");
const nextBtn = document.getElementById("next");
const resetBtn = document.getElementById("reset");

let boxCount = 3;

const modalBackdrop = document.getElementById("modalBackdrop");
const modalOk = document.getElementById("modalOk");
const modalCancel = document.getElementById("modalCancel");

const levelEl = document.getElementById("level");
const winEl = document.getElementById("win");
const loseEl = document.getElementById("lose");

// フェイント設定
const FEINT_CHANCE = 0.35;
const FEINT_PAUSE_RATIO = 0.45;

let round = 1, win = 0, lose = 0;

let boxes = [];
let ballEl = null;

let ballSlot = 0;           // ボールが入っているスロット(0..2)
let slotOfBoxId = [0,1,2];  // boxId(0..2) が今どのスロットにいるか
let phase = "idle";         // idle/show/hide/shuffle/guess/result

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function explodeAtClientXY(x, y){
  // 画面揺れ（任意）
  document.body.classList.add("screen-shake");
  setTimeout(() => document.body.classList.remove("screen-shake"), 240);

  const N = 18; // 粒の数（増やすほど派手）
  for (let i = 0; i < N; i++){
    const p = document.createElement("div");
    p.className = "particle";

    // 出発点
    p.style.left = x + "px";
    p.style.top  = y + "px";

    // 飛び散り方向
    const angle = (Math.PI * 2) * (i / N) + (Math.random() * 0.4);
    const dist  = 40 + Math.random() * 50;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    p.style.setProperty("--dx", `${dx}px`);
    p.style.setProperty("--dy", `${dy}px`);

    // 色（ランダムにそれっぽい爆発色）
    const hue = 20 + Math.random() * 50; // オレンジ〜黄色
    p.style.background = `hsl(${hue}, 90%, 60%)`;

    document.body.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
  }
}

function setTransition(ms){
  for (const el of boxes) el.style.transitionDuration = `${ms}ms`;
}

function clearMarks(){
  for (const b of boxes){
    b.classList.remove("correct", "wrong");
  }
}

function showBall(isVisible){
  ballEl.classList.toggle("hidden", !isVisible);
}

function setClickable(on){
  for (const b of boxes){
    b.classList.toggle("disabled", !on);
  }
}

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
    ys.push(30 + r * (boxH + vgap)); // 上余白30
  }

  return { xs, ys, boxW, boxH, cols };
}

function applyPositions(){
  const { xs, ys, boxW, boxH, cols } = calcLayout();

  for (let id = 0; id < boxCount; id++){
    const slot = slotOfBoxId[id];      // 0..8
    const r = Math.floor(slot / cols); // 行
    const c = slot % cols;             // 列

    boxes[id].style.width  = `${boxW}px`;
    boxes[id].style.height = `${boxH}px`;
    boxes[id].style.left   = `${xs[c]}px`;
    boxes[id].style.top    = `${ys[r]}px`;   // ★これが3×3の本体
  }

  // ボールはballBoxIdの箱に入れる
  if (ballBoxId >= 0 && ballBoxId < boxCount){
    boxes[ballBoxId].appendChild(ballEl);
    ballEl.style.left = "50%";
    ballEl.style.bottom = "18px";
    ballEl.style.transform = "translateX(-50%)";
  }
}

function pickRandomBallSlot(){
  ballSlot = Math.floor(Math.random() * 3);
}

function randomSwapPair(){
  const a = Math.floor(Math.random() * boxCount);
  let b = Math.floor(Math.random() * boxCount);
  while (b === a) b = Math.floor(Math.random() * boxCount);
  return [a,b];
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

  // ballBoxIdは動かさない（箱が動くので追従する）
}

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

  setClickable(false);
  clearMarks();
  showBall(true);
  applyPositions();
}

async function startRound(){
  
  // Round1:3箱、Round2以降:9箱
boxCount = (round >= 2) ? 9 : 3;

// 箱数が変わるのでスロット初期化して作り直す
slotOfBoxId = Array.from({length: boxCount}, (_, i) => i);
ballBoxId = Math.floor(Math.random() * boxCount);

render();
  
  phase = "show";
  nextBtn.disabled = true;
  startBtn.disabled = true;
  clearMarks();

  slotOfBoxId = [0,1,2];
  pickRandomBallSlot();
  setTransition(700);
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
  const moves = 5; // ←固定
  
  for (let i = 0; i < moves; i++){
    const speed = 700; // ←固定

    if (Math.random() < FEINT_CHANCE){
      await sleep(Math.floor(speed * FEINT_PAUSE_RATIO));
    } else {
          }

    const [sa, sb] = randomSwapPair();
    swapSlots(sa, sb);
    applyPositions();
    await sleep(speed + 60);

    if (Math.random() < FEINT_CHANCE * 0.6){
      await sleep(Math.floor(speed * 0.18));
      const [sa2, sb2] = randomSwapPair();
      swapSlots(sa2, sb2);
      applyPositions();
      await sleep(speed * 0.65);
    }
  }

  phase = "guess";
  msg.textContent = "どれに入ってるかわかると思うけど、箱をタップして。";
  setClickable(true);
}

function onPick(boxId){
  // ★スタート前（idle）で押したら爆発
  if (phase === "idle"){
    const rect = boxes[boxId].getBoundingClientRect();
    explodeAtClientXY(rect.left + rect.width/2, rect.top + rect.height/2);
    msg.textContent = "START押せ";
    return;
  }

  if (phase !== "guess") return;

  // ↓ここから下は今のまま

  if (phase !== "guess") return;

  phase = "result";
  setClickable(false);

const correct = boxId === ballBoxId;

  showBall(true);
  applyPositions();

  clearMarks();
  if (correct){
    boxes[boxId].classList.add("correct");
    win++;
    round++;
    msg.textContent = "当たり！";
  } else {
    boxes[boxId].classList.add("wrong");
    boxes[ballBoxId].classList.add("correct");
    lose++;
round++;
    msg.textContent = "ハズレ。論外。";
  }

  levelEl.textContent = String(round);
  winEl.textContent = String(win);
  loseEl.textContent = String(lose);

  nextBtn.disabled = false;
  startBtn.disabled = true;
}

function resetAll(){
  round = 1; win = 0; lose = 0;
  levelEl.textContent = "1";
  winEl.textContent = "0";
  loseEl.textContent = "0";

  phase = "idle";
  startBtn.disabled = false;
  nextBtn.disabled = true;

  slotOfBoxId = [0,1,2];
  ballSlot = 0;

  setTransition(700);
  setClickable(false);
  clearMarks();
  showBall(true);
  applyPositions();

  msg.textContent = "STARTを押す。最初はボールが見える。";
}

startBtn.addEventListener("click", startRound);
nextBtn.addEventListener("click", startRound);
function openResetModal(){
  modalBackdrop.classList.remove("hidden");
}
function closeResetModal(){
  modalBackdrop.classList.add("hidden");
}

resetBtn.addEventListener("click", openResetModal);

if (modalBackdrop && modalOk && modalCancel){
  resetBtn.addEventListener("click", () => {
    modalBackdrop.classList.remove("hidden");
  });

  modalCancel.addEventListener("click", () => {
    modalBackdrop.classList.add("hidden");
  });

  modalOk.addEventListener("click", () => {
    modalBackdrop.classList.add("hidden");
    resetAll();
  });
}

modalOk.addEventListener("click", () => {
  closeResetModal();
  resetAll();
});

// 背景クリックで閉じる（任意）
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeResetModal();
});

window.addEventListener("resize", () => {
  applyPositions();
});


// ゲームエリアではコンテキストメニュー（長押し）を無効化
lane.addEventListener("contextmenu", (e) => e.preventDefault());
lane.addEventListener("selectstart", (e) => e.preventDefault());

render();
resetAll();


















