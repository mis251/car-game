// ===== Turbo Lane – Car Racing Game =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const $ = (id) => document.getElementById(id);
const scoreEl = $("score"), speedEl = $("speed"), bestEl = $("best"), livesEl = $("lives");
const startScreen = $("start-screen"), pauseScreen = $("pause-screen"), overScreen = $("gameover-screen");

const ROAD_X = 40;
const ROAD_W = W - 80;
const LANES = 3;
const LANE_W = ROAD_W / LANES;
const laneCenter = (i) => ROAD_X + LANE_W * i + LANE_W / 2;

const ENEMY_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#14b8a6", "#f5f5f5"];

let best = Number(localStorage.getItem("turboLaneBest") || 0);
bestEl.textContent = best;

const keys = {};
let state = "menu";
let player, enemies, coins, particles, roadOffset, speed, score, lives;
let spawnTimer, coinTimer, invincible, lastTime;

function reset() {
  player = { x: laneCenter(1) - 22, y: H - 120, w: 44, h: 80, color: "#ef4444" };
  enemies = []; coins = []; particles = [];
  roadOffset = 0; speed = 5; score = 0; lives = 3;
  spawnTimer = 0; coinTimer = 0; invincible = 0;
  updateHUD();
}

// ===== Input =====
document.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key.toLowerCase() === "p") togglePause();
  if (e.key === "Enter" && state !== "playing" && state !== "paused") startGame();
});
document.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

function bindTouch(id, key) {
  const btn = $(id);
  const on = (e) => { e.preventDefault(); keys[key] = true; };
  const off = (e) => { e.preventDefault(); keys[key] = false; };
  btn.addEventListener("touchstart", on);
  btn.addEventListener("touchend", off);
  btn.addEventListener("mousedown", on);
  btn.addEventListener("mouseup", off);
  btn.addEventListener("mouseleave", off);
}
bindTouch("btn-left", "arrowleft");
bindTouch("btn-right", "arrowright");
bindTouch("btn-boost", "arrowup");

$("start-btn").onclick = startGame;
$("restart-btn").onclick = startGame;
$("resume-btn").onclick = togglePause;

function startGame() {
  reset();
  state = "playing";
  startScreen.classList.add("hidden");
  overScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function togglePause() {
  if (state === "playing") {
    state = "paused";
    pauseScreen.classList.remove("hidden");
  } else if (state === "paused") {
    state = "playing";
    pauseScreen.classList.add("hidden");
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
}

function gameOver() {
  state = "over";
  const final = Math.floor(score);
  $("final-score").textContent = final;
  const isBest = final > best;
  if (isBest) {
    best = final;
    localStorage.setItem("turboLaneBest", best);
    bestEl.textContent = best;
  }
  $("new-best").classList.toggle("hidden", !isBest);
  overScreen.classList.remove("hidden");
}

// ===== Spawning =====
function spawnEnemy() {
  const lane = Math.floor(Math.random() * LANES);
  const w = 44, h = 80;
  if (enemies.some((e) => e.lane === lane && e.y < 120)) return;
  enemies.push({
    lane, w, h,
    x: laneCenter(lane) - w / 2,
    y: -h,
    speed: 1 + Math.random() * 2,
    color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
  });
}

function spawnCoin() {
  const lane = Math.floor(Math.random() * LANES);
  coins.push({ x: laneCenter(lane), y: -20, r: 11, spin: 0 });
}

function explode(x, y, color) {
  for (let i = 0; i < 25; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 40 + Math.random() * 20,
      color,
    });
  }
}

// ===== Update =====
function update(dt) {
  const maxSpeed = 9 + score / 400;
  if (keys["arrowup"] || keys["w"]) speed = Math.min(speed + 0.08 * dt, maxSpeed + 4);
  else if (keys["arrowdown"] || keys["s"]) speed = Math.max(speed - 0.15 * dt, 3);
  else speed += ((5 + score / 500) - speed) * 0.02 * dt;

  const steer = 5 * dt;
  if (keys["arrowleft"] || keys["a"]) player.x -= steer;
  if (keys["arrowright"] || keys["d"]) player.x += steer;
  player.x = Math.max(ROAD_X + 4, Math.min(ROAD_X + ROAD_W - player.w - 4, player.x));

  roadOffset = (roadOffset + speed * dt) % 60;
  score += speed * 0.05 * dt;

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = Math.max(25, 70 - score / 60) + Math.random() * 30;
  }
  coinTimer -= dt;
  if (coinTimer <= 0) {
    spawnCoin();
    coinTimer = 90 + Math.random() * 90;
  }

  for (const e of enemies) e.y += (speed - e.speed) * dt;
  enemies = enemies.filter((e) => e.y < H + 100);

  for (const c of coins) { c.y += speed * dt; c.spin += 0.1 * dt; }

  if (invincible > 0) invincible -= dt;

  const hitbox = { x: player.x + 4, y: player.y + 4, w: player.w - 8, h: player.h - 8 };
  for (const e of enemies) {
    if (invincible <= 0 && rectHit(hitbox, e)) {
      lives--;
      explode(e.x + e.w / 2, e.y + e.h / 2, e.color);
      e.y = H + 200;
      invincible = 90;
      speed = Math.max(4, speed * 0.6);
      if (lives <= 0) {
        explode(player.x + player.w / 2, player.y + player.h / 2, player.color);
        updateHUD();
        draw();
        gameOver();
        return;
      }
    }
  }

  coins = coins.filter((c) => {
    const hit =
      c.x > player.x - c.r && c.x < player.x + player.w + c.r &&
      c.y > player.y - c.r && c.y < player.y + player.h + c.r;
    if (hit) { score += 50; explode(c.x, c.y, "#facc15"); }
    return !hit && c.y < H + 30;
  });

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);

  updateHUD();
}

function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function updateHUD() {
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.floor(speed * 20);
  livesEl.textContent = "❤".repeat(Math.max(lives, 0)) + "♡".repeat(3 - Math.max(lives, 0));
}

// ===== Draw =====
function drawRoad() {
  ctx.fillStyle = "#166534";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#15803d";
  for (let y = -60 + roadOffset; y < H; y += 60) {
    ctx.fillRect(0, y, ROAD_X, 30);
    ctx.fillRect(ROAD_X + ROAD_W, y, ROAD_X, 30);
  }
  ctx.fillStyle = "#374151";
  ctx.fillRect(ROAD_X, 0, ROAD_W, H);
  for (let y = -60 + roadOffset; y < H; y += 60) {
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(ROAD_X - 8, y, 8, 30);
    ctx.fillRect(ROAD_X + ROAD_W, y, 8, 30);
    ctx.fillStyle = "#fff";
    ctx.fillRect(ROAD_X - 8, y + 30, 8, 30);
    ctx.fillRect(ROAD_X + ROAD_W, y + 30, 8, 30);
  }
  ctx.fillStyle = "#e5e7eb";
  for (let i = 1; i < LANES; i++) {
    const x = ROAD_X + LANE_W * i - 2;
    for (let y = -60 + roadOffset; y < H; y += 60) ctx.fillRect(x, y, 4, 34);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCar(c, isPlayer) {
  const { x, y, w, h, color } = c;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(x + 4, y + 6, w, h, 10); ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 4, y + 10, 6, 18);
  ctx.fillRect(x + w - 2, y + 10, 6, 18);
  ctx.fillRect(x - 4, y + h - 28, 6, 18);
  ctx.fillRect(x + w - 2, y + h - 28, 6, 18);
  ctx.fillStyle = color;
  roundRect(x, y, w, h, 10); ctx.fill();
  ctx.fillStyle = "#1e293b";
  const front = isPlayer ? y + 16 : y + h - 30;
  const back = isPlayer ? y + h - 22 : y + 10;
  roundRect(x + 6, front, w - 12, 14, 4); ctx.fill();
  roundRect(x + 7, back, w - 14, 10, 3); ctx.fill();
  if (isPlayer) {
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(x + 5, y + 2, 9, 4);
    ctx.fillRect(x + w - 14, y + 2, 9, 4);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(x + w / 2 - 3, y + 32, 6, h - 56);
  } else {
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(x + 5, y + h - 6, 9, 4);
    ctx.fillRect(x + w - 14, y + h - 6, 9, 4);
  }
}

function drawCoin(c) {
  const scaleX = Math.abs(Math.cos(c.spin));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(Math.max(scaleX, 0.15), 1);
  ctx.fillStyle = "#facc15";
  ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#ca8a04"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#ca8a04";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", 0, 1);
  ctx.restore();
}

function draw() {
  drawRoad();
  coins.forEach(drawCoin);
  enemies.forEach((e) => drawCar(e, false));
  if (state !== "over" && (invincible <= 0 || Math.floor(invincible / 6) % 2 === 0)) {
    drawCar(player, true);
  }
  if (speed > 10) {
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const x = ROAD_X + Math.random() * ROAD_W;
      const y = Math.random() * H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 30 + speed * 2); ctx.stroke();
    }
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life / 60, 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

// ===== Loop =====
function loop(now) {
  if (state !== "playing") return;
  const dt = Math.min((now - lastTime) / 16.67, 3);
  lastTime = now;
  update(dt);
  if (state === "playing") { draw(); requestAnimationFrame(loop); }
}

reset();
draw();
