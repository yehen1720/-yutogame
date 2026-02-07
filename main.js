const lane = document.getElementById("lane");
const msg = document.getElementById("msg");
const startBtn = document.getElementById("start");
const nextBtn = document.getElementById("next");
const resetBtn = document.getElementById("reset");

const movesInput = document.getElementById("moves");
const movesVal = document.getElementById("movesVal");
const speedInput = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");

const levelEl = document.getElementById("level");
const winEl = document.getElementById("win");
const loseEl = document.getElementById("lose");

const W = 860; // 目安。実際はlane幅で計算する
const SLOT_COUNT = 3;

let level = 1, win = 0, lose = 0;

let boxes = [];
let ballEl = null;

let ballSlot = 0;          // ボールが入っている「スロット」(0,1,2)
let slotOfBoxId = [0,1,2];  // boxId(0..2) が今どのスロットにいるか
let phase = "idle";         // idle/show/hide/shuffle/guess/result

const FEINT_CHANCE = 0.55;      // フェイントを入れる確率（0〜1）
const FEINT_PAUSE_RATIO = 0.45; // 停止の長さ（speedに対する割合）

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function layoutSlots(){
  const rect = lane.getBoundingClientRect();
  const gap = (rect.width - 3*180) / 2;
  // 左の余白をgapとして 0, 180+gap, 2*(180+gap)
  return [
    0,
    180 + gap,
    2*(180 + gap),
  ];
}

function setTransition(ms){
  for (const el of boxes) el.style.transitionDuration = `${ms}ms`;
}

function render(){
  lane.innerHTML = "";
  boxes = [];

  for (let id = 0; id < 3; id++){
    const b = document.createElement("div");
    b.className = "box";
    b.dataset.id = String(id);
b.innerHTML = `
  <div class="lid"></div>
  <div class="hole"></div>
`;
    b.addEventListener("click", () => onPick(id));
    lane.appendChild(b);
    boxes.push(b);
  }

  // ボール（見えるのは「ボールのスロット」の位置）
  ballEl = document.createElement("div");
  ballEl.className = "ball";
  lane.appendChild(ballEl);

  applyPositions();
  showBall(true);
  setClickable(false);
  clearMarks();
}

function applyPositions(){
  const xs = layoutSlots();
  for (let id = 0; id < 3; id++){
    const slot = slotOfBoxId[id];
    boxes[id].style.left = `${xs[slot]}px`;
  }
  // ボールは「スロット」に紐づく（箱が動けば一緒に動くように見える）
  ballEl.style.left = `${xs[ballSlot] + 90}px`; // 箱の中心（180/2=90）
}

function showBall(isVisible){
  if (isVisible) ballEl.classList.remove("hidden");
  else ballEl.classList.add("hidden");
}

function setClickable(on){
  for (const b of boxes){
    b.classList.toggle("disabled", !on);
  }
}

function clearMarks(){
  for (const b of boxes){
    b.classList.remove("correct", "wrong");
  }
}

function pickRandomBallSlot(){
  ballSlot = Math.floor(Math.random() * 3);
}

function randomSwapPair(){
  const a = Math.floor(Math.random() * 3);
  let b = Math.floor(Math.random() * 3);
  while (b === a) b = Math.floor(Math.random() * 3);
  return [a,b];
}

// boxIdではなく「スロット同士」を入れ替える
function swapSlots(sa, sb){
  // いま各boxIdがどのslotにいるかを持っているので、
  // slot->boxId を逆引きして、入れ替える
  const boxAtSlot = [0,0,0];
  for (let id=0; id<3; id++){
    boxAtSlot[slotOfBoxId[id]] = id;
  }
  const boxA = boxAtSlot[sa];
  const boxB = boxAtSlot[sb];

  // 入れ替え
  slotOfBoxId[boxA] = sb;
  slotOfBoxId[boxB] = sa;

  // ボールは「スロット」に入っている想定なので、スロット自体が動くわけじゃない
  // でも“箱がシャッフルされる”表現では、ボールは箱と一緒に移動して見える。
  // つまり「ボールのスロット」は入れ替えに合わせて更新する必要がある。
  if (ballSlot === sa) ballSlot = sb;
  else if (ballSlot === sb) ballSlot = sa;
}

async function startRound(){
  phase = "show";
  nextBtn.disabled = true;
  startBtn.disabled = true;
  clearMarks();

  // 初期配置
  slotOfBoxId = [0,1,2];
  pickRandomBallSlot();
  setTransition(Number(speedInput.value));
  applyPositions();

  showBall(true);
  setClickable(false);

  msg.textContent = "ボールの位置あてるだけのやつ。";
  await sleep(900);

  // 隠す
  phase = "hide";
  msg.textContent = "隠れて！。";
  showBall(false);
  await sleep(450);

  // シャッフル
  phase = "shuffle";
  const moves = Number(movesInput.value);
  msg.textContent = `シャッフル中…（${moves}回）`;
for (let i = 0; i < moves; i++) {
  const speed = Number(speedInput.value);

  // たまに「間」を入れて追跡を崩す
  if (Math.random() < FEINT_CHANCE) {
    msg.textContent = "シャッフル中…（フェイント）";
    await sleep(Math.floor(speed * FEINT_PAUSE_RATIO));
  } else {
    msg.textContent = `シャッフル中…（${moves}回）`;
  }

  // 通常の入れ替え
  const [sa, sb] = randomSwapPair();
  swapSlots(sa, sb);
  applyPositions();
  await sleep(speed + 60);

  // さらにたまに「ちょい戻し」フェイント（入れ替え→即別の入れ替え）
  if (Math.random() < FEINT_CHANCE * 0.6) {
    await sleep(Math.floor(speed * 0.18));
    const [sa2, sb2] = randomSwapPair();
    swapSlots(sa2, sb2);
    applyPositions();
    await sleep(speed * 0.65);
  }
}

  // 当てる
  phase = "guess";
  msg.textContent = "どれに入ってるか箱を押すだけ。";
  setClickable(true);
}

function onPick(boxId){
  if (phase !== "guess") return;

  phase = "result";
  setClickable(false);

  // 選んだ箱が今いるスロット
  const chosenSlot = slotOfBoxId[boxId];

  // 正解は ballSlot
  const correct = chosenSlot === ballSlot;

  // ボールを見せる（正解スロット位置に）
  showBall(true);
  applyPositions();

  clearMarks();
  if (correct) {
    boxes[boxId].classList.add("correct");
    win++;
    msg.textContent = "はずれ！。";
    // 勝ったらレベル上げ（おまけ）
    level++;
  } else {
    boxes[boxId].classList.add("wrong");

    // 正解の箱にも印を付ける
    const correctBoxId = slotOfBoxId.indexOf(ballSlot);
    if (correctBoxId >= 0) boxes[correctBoxId].classList.add("correct");

    lose++;
    msg.textContent = "普通にハズレ。";
    // 負けたらレベル下げ（最低1）
    level = Math.max(1, level - 1);
  }

  levelEl.textContent = String(level);
  winEl.textContent = String(win);
  loseEl.textContent = String(lose);

  nextBtn.disabled = false;
  startBtn.disabled = true;
}

function resetAll(){
  level = 1; win = 0; lose = 0;
  levelEl.textContent = "1";
  winEl.textContent = "0";
  loseEl.textContent = "0";

  phase = "idle";
  startBtn.disabled = false;
  nextBtn.disabled = true;

  slotOfBoxId = [0,1,2];
  ballSlot = 0;
  setTransition(Number(speedInput.value));
  applyPositions();
  showBall(true);
  setClickable(false);
  clearMarks();

  msg.textContent = "STARTを押して。最初はボールが見える。";
}

startBtn.addEventListener("click", startRound);
nextBtn.addEventListener("click", startRound);
resetBtn.addEventListener("click", resetAll);

movesInput.addEventListener("input", () => {
  movesVal.textContent = String(movesInput.value);
});
speedInput.addEventListener("input", () => {
  speedVal.textContent = `${speedInput.value}ms`;
  setTransition(Number(speedInput.value));
});

window.addEventListener("resize", () => {
  // 画面幅が変わったら位置を再計算
  applyPositions();
});

// 初期
movesVal.textContent = String(movesInput.value);
speedVal.textContent = `${speedInput.value}ms`;
render();
resetAll();
