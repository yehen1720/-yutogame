const lane = document.getElementById("lane");
const msg = document.getElementById("msg");
const startBtn = document.getElementById("start");
const nextBtn = document.getElementById("next");
const resetBtn = document.getElementById("reset");

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

// 画面幅に応じて「箱幅・間隔・左位置」を安全に計算する（重なり防止の本命）
function calcLayout(){
  const rect = lane.getBoundingClientRect();

  // laneのpaddingはCSSと合わせる（.lane { padding: 18px; }）
  let PAD = 18;

  const maxW = 180;
  const maxGap = 14;

  // 画面が狭い時はPADも少し削って“入る余地”を増やす
  if (rect.width < 360) PAD = 12;
  if (rect.width < 320) PAD = 8;

  const available = rect.width - PAD * 2;

  // gapは狭い時ほど小さく（0にもなる）
  let gap = Math.min(maxGap, Math.floor(available * 0.04));
  gap = Math.max(0, gap);

  // まずgap込みで箱幅を計算
  let boxW = Math.floor((available - gap * 2) / 3);
  boxW = Math.min(maxW, boxW);

  // 最小幅は「画面に合わせて可変」にする（ここがポイント）
  // 目標minは60pxだけど、入らないなら available/3 まで下げる
  const targetMin = 60;
  const dynamicMin = Math.max(40, Math.floor(available / 3)); // どうしても狭い時の保険
  const minW = Math.min(targetMin, dynamicMin);
  boxW = Math.max(minW, boxW);

  // 箱幅が確定したら gap を再計算（足りなければ0）
  gap = Math.floor((available - boxW * 3) / 2);
  gap = Math.max(0, gap);

  const xs = [PAD, PAD + boxW + gap, PAD + 2 * (boxW + gap)];
  const boxH = Math.round(boxW * 1.15);

  return { xs, boxW, boxH };
}

function applyPositions(){
  const { xs, boxW, boxH } = calcLayout();

  // 箱の位置＆サイズ
  for (let id = 0; id < 3; id++){
    const slot = slotOfBoxId[id];
    boxes[id].style.width = `${boxW}px`;
    boxes[id].style.height = `${boxH}px`;
    boxes[id].style.left = `${xs[slot]}px`;
  }

  // ボールは「入ってる箱」の中に移動（ズレ根絶）
  const boxIdAtBall = slotOfBoxId.indexOf(ballSlot);
  if (boxIdAtBall >= 0){
    boxes[boxIdAtBall].appendChild(ballEl);
    ballEl.style.left = "50%";
    ballEl.style.bottom = "18px";
    ballEl.style.transform = "translateX(-50%)";
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

function swapSlots(sa, sb){
  const boxAtSlot = [0,0,0];
  for (let id=0; id<3; id++){
    boxAtSlot[slotOfBoxId[id]] = id;
  }
  const boxA = boxAtSlot[sa];
  const boxB = boxAtSlot[sb];

  slotOfBoxId[boxA] = sb;
  slotOfBoxId[boxB] = sa;

  // ボールは箱と一緒に移動して見えるべきなので、スロット入れ替えに追従
  if (ballSlot === sa) ballSlot = sb;
  else if (ballSlot === sb) ballSlot = sa;
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

  ballEl = document.createElement("div");
  ballEl.className = "ball";
  lane.appendChild(ballEl);

  setClickable(false);
  clearMarks();
  showBall(true);
  applyPositions();
}

async function startRound(){
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

  const chosenSlot = slotOfBoxId[boxId];
  const correct = chosenSlot === ballSlot;

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
    const correctBoxId = slotOfBoxId.indexOf(ballSlot);
    if (correctBoxId >= 0) boxes[correctBoxId].classList.add("correct");
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














