// =====================================================================
//  TURBO LANE – Arcade Highway Racer
//  Single-file canvas engine: menu, garage, levels, power-ups, audio.
// =====================================================================
(() => {
  "use strict";

  /* ============================ CONFIG ============================ */
  const W = 420, H = 700;
  const ROAD_X = 60, ROAD_W = 300, LANES = 4, LANE_W = ROAD_W / LANES;
  const LEVEL_DIST = 16000;          // px per level
  const KM_PER_PX = 1 / 10000;       // display distance
  const KMH_PER_SPEED = 22;          // display speed
  const COMBO_TIME = 180;            // frames

  const laneCenter = (i) => ROAD_X + LANE_W * i + LANE_W / 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const weighted = (list) => {
    const total = list.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [v, w] of list) { if ((r -= w) <= 0) return v; }
    return list[0][0];
  };

  const CARS = [
    { id: "striker", name: "Striker", color: "#ef4444", price: 0, speed: 1.0, handling: 1.0, nitro: 1.0, desc: "Balanced starter coupe" },
    { id: "viper", name: "Viper GT", color: "#22c55e", price: 400, speed: 1.08, handling: 1.2, nitro: 1.0, desc: "Razor-sharp handling" },
    { id: "phantom", name: "Phantom", color: "#a855f7", price: 1000, speed: 1.15, handling: 1.05, nitro: 1.45, desc: "Massive nitro tank" },
    { id: "frost", name: "Frost RS", color: "#38bdf8", price: 1600, speed: 1.2, handling: 1.15, nitro: 1.2, desc: "Track-tuned all-rounder" },
    { id: "thunder", name: "Thunderbolt", color: "#facc15", price: 2500, speed: 1.3, handling: 1.25, nitro: 1.3, desc: "Top-tier hypercar" },
  ];

  const DIFFS = {
    easy: { label: "Easy", lives: 5, traffic: 0.75, speed: 0.9, score: 0.8 },
    normal: { label: "Normal", lives: 3, traffic: 1.0, speed: 1.0, score: 1.0 },
    hard: { label: "Hard", lives: 2, traffic: 1.35, speed: 1.12, score: 1.5 },
  };

  const THEMES = [
    { name: "Downtown Day", grass: "#3f7d3a", grass2: "#386f33", shoulder: "#7c7f87", road: "#3a3d45", night: 0, deco: "tree", tint: null },
    { name: "Sunset Coast", grass: "#d2b07a", grass2: "#c6a46d", shoulder: "#8a7a68", road: "#3d3742", night: 0.18, deco: "palm", tint: "rgba(255,110,50,0.13)" },
    { name: "Neon Night", grass: "#141a2e", grass2: "#10152a", shoulder: "#2b2f40", road: "#23262f", night: 0.74, deco: "lamp", tint: "rgba(120,60,255,0.06)" },
    { name: "Storm Highway", grass: "#233428", grass2: "#1e2d23", shoulder: "#3d4249", road: "#2a2d33", night: 0.55, deco: "tree", rain: true, tint: "rgba(60,90,140,0.12)" },
    { name: "Desert Run", grass: "#d9b878", grass2: "#cdab6b", shoulder: "#9b8670", road: "#47403a", night: 0, deco: "cactus", tint: "rgba(255,190,90,0.07)" },
    { name: "Midnight Express", grass: "#0d1220", grass2: "#0a0f1b", shoulder: "#252a38", road: "#1e2129", night: 0.82, deco: "lamp", tint: null },
  ];

  const TRAFFIC_COLORS = ["#3b82f6", "#e5e7eb", "#64748b", "#14b8a6", "#f97316", "#ec4899", "#84cc16", "#0f172a", "#b91c1c"];

  /* ============================ STORAGE ============================ */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("tl_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("tl_" + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const DEFAULT_SETTINGS = { sound: true, engine: true, shake: true, particles: true, vibrate: true, cockpit: true };
  const save = {
    wallet: store.get("wallet", 0),
    owned: store.get("owned", ["striker"]),
    car: store.get("car", "striker"),
    diff: store.get("diff", "normal"),
    scores: store.get("scores", []),
    settings: Object.assign({}, DEFAULT_SETTINGS, store.get("settings", {})),
    totals: Object.assign({ runs: 0, distance: 0, coins: 0, nearMisses: 0 }, store.get("totals", {})),
  };
  const persist = () => { for (const k of Object.keys(save)) store.set(k, save[k]); };
  // migrate best score from the original version
  try {
    const old = Number(localStorage.getItem("turboLaneBest") || 0);
    if (old && !save.scores.length) { save.scores.push({ score: old, km: 0, car: "Striker", diff: "Normal", date: Date.now() }); persist(); }
  } catch { /* ignore */ }
  const bestScore = () => (save.scores.length ? save.scores[0].score : 0);

  /* ============================ AUDIO ============================ */
  const Sound = {
    ctx: null, master: null, eng: null,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    },
    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    get on() { return this.ctx && save.settings.sound; },
    tone(freq, dur, type = "square", vol = 0.15, slide = 0, delay = 0) {
      if (!this.on) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, vol = 0.3, freq = 800, type = "lowpass") {
      if (!this.on) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    },
    click() { this.tone(520, 0.05, "square", 0.06); },
    coin() { this.tone(988, 0.07, "square", 0.08); this.tone(1319, 0.14, "square", 0.08, 0, 0.06); },
    crash() { this.noise(0.7, 0.55, 700); this.tone(140, 0.45, "sawtooth", 0.22, -100); },
    bigCrash() { this.noise(1.3, 0.7, 500); this.tone(90, 0.9, "sawtooth", 0.25, -50); },
    power() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.14, 0, i * 0.06)); },
    shieldBreak() { this.noise(0.4, 0.3, 3000, "highpass"); this.tone(800, 0.3, "sine", 0.15, -500); },
    nearMiss(combo) { this.tone(500 + combo * 60, 0.16, "sine", 0.12, 400); },
    nitro() { this.noise(0.5, 0.18, 1800, "bandpass"); },
    cone() { this.tone(300, 0.1, "square", 0.12, -150); this.noise(0.2, 0.2, 1200); },
    skid() { this.noise(0.6, 0.15, 2500, "bandpass"); },
    scrape() { this.noise(0.12, 0.08, 4000, "highpass"); },
    beep(go) { this.tone(go ? 880 : 440, go ? 0.5 : 0.22, "square", 0.12); },
    levelUp() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "square", 0.08, 0, i * 0.08)); },
    engineStart() {
      if (!this.ctx || this.eng) return;
      const c = this.ctx;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o1.type = "sawtooth"; o2.type = "square"; o2.detune.value = 7;
      o1.frequency.value = 50; o2.frequency.value = 25;
      f.type = "lowpass"; f.frequency.value = 500; f.Q.value = 4;
      g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.eng = { o1, o2, f, g };
    },
    engineUpdate(ratio, active) {
      if (!this.eng) return;
      const t = this.ctx.currentTime;
      const on = active && save.settings.sound && save.settings.engine;
      this.eng.o1.frequency.setTargetAtTime(45 + ratio * 150, t, 0.08);
      this.eng.o2.frequency.setTargetAtTime(22 + ratio * 75, t, 0.08);
      this.eng.f.frequency.setTargetAtTime(350 + ratio * 1300, t, 0.08);
      this.eng.g.gain.setTargetAtTime(on ? 0.045 + ratio * 0.03 : 0, t, 0.1);
    },
  };
  const vibrate = (ms) => { if (save.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* ignore */ } } };

  /* ============================ CANVAS ============================ */
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const lightC = document.createElement("canvas");
  const lctx = lightC.getContext("2d");
  let DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const [cv, c] of [[canvas, ctx], [lightC, lctx]]) {
      cv.width = W * DPR; cv.height = H * DPR;
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
  }
  resize();
  window.addEventListener("resize", resize);

  /* ============================ INPUT ============================ */
  const keys = {};
  const touch = { left: false, right: false, gas: false, brake: false, nitro: false };
  const input = {
    left: () => keys.arrowleft || keys.a || touch.left,
    right: () => keys.arrowright || keys.d || touch.right,
    up: () => keys.arrowup || keys.w || touch.gas,
    down: () => keys.arrowdown || keys.s || touch.brake,
    nitro: () => keys[" "] || keys.shift || touch.nitro,
  };

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (k === "p" || k === "escape") togglePause();
    if (k === "c") toggleCamera();
    if (k === "enter" && (state === "menu" || state === "over") && activeScreen !== "garage") startGame();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; if (state === "playing") togglePause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && state === "playing") togglePause(); });

  document.querySelectorAll("#touch-controls button").forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault(); touch[k] = true; btn.classList.add("on"); try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
    const off = (e) => { e.preventDefault(); touch[k] = false; btn.classList.remove("on"); };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("lostpointercapture", off);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  /* ============================ GAME STATE ============================ */
  let state = "menu"; // menu | countdown | playing | paused | over
  let G = null;
  let countdownT = 0, lastCount = 0;

  function newRun(demo = false) {
    const car = CARS.find((c) => c.id === save.car) || CARS[0];
    const diff = DIFFS[save.diff] || DIFFS.normal;
    G = {
      demo, car, diff,
      player: { x: W / 2 - 20, y: H - 190, w: 40, h: 76, vx: 0, tilt: 0 },
      enemies: [], coins: [], items: [], hazards: [], particles: [], texts: [], deco: [], rain: [],
      speed: demo ? 6.5 : 0, distance: 0, score: 0, coinsRun: 0,
      lives: diff.lives, maxLives: diff.lives + 2,
      nitroMax: 100 * car.nitro, nitro: 100 * car.nitro, nitroOn: false, braking: false,
      combo: 1, comboTimer: 0, nearMisses: 0, bestCombo: 1,
      level: 1, themeIdx: 0, night: THEMES[0].night,
      nE: 200, nC: 400, nI: 1800, nH: 1600,
      invincible: 0, shield: 0, magnet: 0, slowmo: 0, skid: 0, dead: 0,
      shake: 0, flash: 0, hurt: 0, roadOff: 0, time: 0, themeClock: 0,
    };
    for (let i = 0; i < 14; i++) G.deco.push(makeDeco(i % 2 === 0 ? "L" : "R", rand(-60, H + 60)));
    for (let i = 0; i < 90; i++) G.rain.push({ x: rand(0, W), y: rand(0, H), l: rand(10, 22), v: rand(9, 14) });
  }

  function makeDeco(side, y) {
    const x = side === "L" ? rand(10, ROAD_X - 26) : rand(ROAD_X + ROAD_W + 26, W - 10);
    return { side, x, y, s: rand(0.8, 1.25), v: randi(0, 2) };
  }

  /* ============================ FLOW ============================ */
  function startGame() {
    Sound.init(); Sound.resume(); Sound.engineStart();
    newRun(false);
    hideScreens();
    $("hud").classList.remove("hidden");
    wrapper.classList.add("is-playing");
    state = "countdown";
    countdownT = 3; lastCount = 4;
    for (const k in touch) touch[k] = false;
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      showScreen("pause");
      Sound.engineUpdate(0, false);
      wrapper.classList.remove("is-playing");
    } else if (state === "paused") {
      hideScreens();
      state = "playing";
      wrapper.classList.add("is-playing");
    }
  }

  function toMenu() {
    state = "menu";
    Sound.engineUpdate(0, false);
    $("hud").classList.add("hidden");
    wrapper.classList.remove("is-playing");
    newRun(true);
    showScreen("menu");
  }

  function gameOver() {
    const g = G;
    state = "over";
    Sound.engineUpdate(0, false);
    wrapper.classList.remove("is-playing");
    $("hud").classList.add("hidden");

    const final = Math.floor(g.score);
    const km = +(g.distance * KM_PER_PX).toFixed(2);
    const prevBest = bestScore();
    save.wallet += g.coinsRun;
    save.totals.runs++;
    save.totals.distance += km;
    save.totals.coins += g.coinsRun;
    save.totals.nearMisses += g.nearMisses;
    save.scores.push({ score: final, km, car: g.car.name, diff: g.diff.label, date: Date.now() });
    save.scores.sort((a, b) => b.score - a.score);
    save.scores = save.scores.slice(0, 10);
    persist();

    $("final-score").textContent = final.toLocaleString();
    $("st-dist").textContent = km.toFixed(2) + " km";
    $("st-level").textContent = g.level;
    $("st-near").textContent = g.nearMisses;
    $("st-combo").textContent = "x" + g.bestCombo;
    $("st-coins").textContent = g.coinsRun;
    $("new-best").classList.toggle("hidden", !(final > prevBest && final > 0));
    showScreen("over");
  }

  function levelUp() {
    const g = G;
    g.level++;
    g.themeIdx = (g.level - 1) % THEMES.length;
    g.flash = 0.9;
    const bonus = Math.round(500 * g.diff.score);
    g.score += bonus;
    toast(`LEVEL ${g.level}`, THEMES[g.themeIdx].name + `  ·  +${bonus}`);
    Sound.levelUp();
  }

  /* ============================ SPAWNING ============================ */
  const ENEMY_DIMS = { car: [40, 74], truck: [48, 134], bike: [22, 46], police: [40, 76] };

  function laneBlocked(lane, yMin, yMax, except) {
    return G.enemies.some((e) => e !== except && e.lane === lane && e.y < yMax && e.y + e.h > yMin);
  }

  function spawnEnemy() {
    const g = G, lvl = g.level;
    const type = weighted([["car", 60], ["truck", lvl >= 2 ? 16 : 6], ["bike", 12], ["police", lvl >= 2 ? 12 : 3]]);
    const [w, h] = ENEMY_DIMS[type];
    const nearTop = new Set(g.enemies.filter((e) => e.y < 200).map((e) => e.lane));
    if (nearTop.size >= LANES - 1) return;
    const free = [0, 1, 2, 3].filter((l) => !nearTop.has(l) && !laneBlocked(l, -h - 80, h + 60));
    if (!free.length) return;
    const lane = pick(free);
    g.enemies.push({
      type, lane, w, h,
      x: laneCenter(lane) - w / 2, y: -h - 10,
      v: type === "truck" ? rand(0.8, 1.6) : type === "bike" ? rand(2.0, 3.0) : rand(1.2, 2.6),
      color: type === "police" ? "#f8fafc" : pick(TRAFFIC_COLORS),
      passed: false, changeT: rand(60, 160), blink: 0, signal: 0,
    });
  }

  function spawnCoins() {
    const g = G, n = randi(4, 7), pattern = randi(0, 2);
    let lane = randi(0, 3);
    for (let i = 0; i < n; i++) {
      let x;
      if (pattern === 2) x = ROAD_X + ROAD_W / 2 + Math.sin(i * 0.8) * LANE_W * 1.4;
      else {
        if (pattern === 1 && i > 0 && i % 2 === 0) lane = clamp(lane + pick([-1, 1]), 0, LANES - 1);
        x = laneCenter(lane);
      }
      g.coins.push({ x, y: -30 - i * 44, r: 10, spin: rand(0, 6) });
    }
  }

  function spawnItem() {
    const g = G;
    const opts = [["shield", 3], ["magnet", 3], ["nitro", 3], ["slowmo", 2]];
    if (g.lives < g.maxLives) opts.push(["heart", 1.3]);
    g.items.push({ type: weighted(opts), x: laneCenter(randi(0, 3)), y: -40, r: 15, t: rand(0, 6) });
  }

  function spawnHazard() {
    const g = G, lane = randi(0, 3);
    if (Math.random() < 0.5) g.hazards.push({ type: "oil", x: laneCenter(lane), y: -40, w: 50, h: 30, used: false, rot: rand(0, 3) });
    else g.hazards.push({ type: "cones", x: laneCenter(lane), y: -30, w: LANE_W - 12, h: 18, hit: false, fly: 0 });
  }

  function spawn(wdt) {
    const g = G, adv = Math.max(g.speed, 3) * wdt;
    g.nE -= adv;
    if (g.nE <= 0) {
      spawnEnemy();
      g.nE = rand(170, 300) / (g.diff.traffic * (1 + 0.13 * (g.level - 1)));
    }
    if (g.demo) return;
    g.nC -= adv; if (g.nC <= 0) { spawnCoins(); g.nC = rand(500, 900); }
    g.nI -= adv; if (g.nI <= 0) { spawnItem(); g.nI = rand(2200, 3200); }
    if (g.level >= 2) {
      g.nH -= adv;
      if (g.nH <= 0) { spawnHazard(); g.nH = rand(1400, 2400) / (1 + 0.1 * (g.level - 2)); }
    }
  }

  /* ============================ EFFECTS ============================ */
  function burst(x, y, color, n = 24, power = 7, size = 4) {
    if (!save.settings.particles) n = Math.ceil(n / 4);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * power;
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(30, 60), max: 60, color, size: rand(size * 0.5, size * 1.3), kind: "spark" });
    }
  }
  function smoke(x, y, n = 2, color = "rgba(200,200,210,") {
    if (!save.settings.particles) return;
    for (let i = 0; i < n; i++) G.particles.push({ x: x + rand(-4, 4), y, vx: rand(-0.5, 0.5), vy: rand(0.5, 2), life: rand(25, 45), max: 45, color, size: rand(4, 8), kind: "smoke" });
  }
  function flame(x, y) {
    if (!save.settings.particles) return;
    G.particles.push({ x: x + rand(-2, 2), y, vx: rand(-0.4, 0.4), vy: rand(3, 6), life: rand(10, 18), max: 18, color: pick(["#facc15", "#f97316", "#38bdf8", "#fff"]), size: rand(3, 6), kind: "flame" });
  }
  function floatText(x, y, text, color = "#fff", size = 18) {
    G.texts.push({ x, y, text, color, size, life: 60 });
  }

  let toastTimer = null;
  function toast(title, sub = "") {
    const el = $("toast");
    el.querySelector(".toast-title").textContent = title;
    el.querySelector(".toast-sub").textContent = sub;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1700);
  }

  /* ============================ UPDATE ============================ */
  function scrollWorld(wdt) {
    const g = G, dy = g.speed * wdt;
    g.roadOff = (g.roadOff + dy) % 1000000;
    for (const d of g.deco) {
      d.y += dy;
      if (d.y > H + 80) Object.assign(d, makeDeco(d.side, -rand(60, 200)));
    }
    for (const c of g.coins) { c.y += dy; c.spin += 0.12 * wdt; }
    for (const it of g.items) { it.y += dy; it.t += 0.08 * wdt; }
    for (const hz of g.hazards) {
      hz.y += dy;
      if (hz.fly) { hz.y -= hz.fly * wdt; hz.fly *= 0.92; }
    }
    g.coins = g.coins.filter((c) => c.y < H + 40 && !c.taken);
    g.items = g.items.filter((it) => it.y < H + 40 && !it.taken);
    g.hazards = g.hazards.filter((hz) => hz.y < H + 60);

    if (THEMES[g.themeIdx].rain) {
      for (const r of g.rain) {
        r.y += (r.v + g.speed * 0.6) * wdt; r.x -= 1.5 * wdt;
        if (r.y > H) { r.y = -r.l; r.x = rand(0, W + 60); }
      }
    }
  }

  function updateEnemies(wdt) {
    const g = G;
    // keep traffic from rear-ending each other
    for (const a of g.enemies) {
      for (const b of g.enemies) {
        if (a === b || a.lane !== b.lane) continue;
        if (b.y > a.y && b.y - (a.y + a.h) < 30) b.v = Math.min(b.v, a.v); // b behind a
      }
    }
    for (const e of g.enemies) {
      e.y += (g.speed - e.v) * wdt;
      e.blink += wdt;
      if (e.type === "police") {
        e.changeT -= wdt;
        if (e.changeT <= 0 && e.y > -40 && e.y < H * 0.55) {
          const dir = pick([-1, 1]);
          const nl = e.lane + dir;
          if (nl >= 0 && nl < LANES && !laneBlocked(nl, e.y - 120, e.y + e.h + 120, e)) {
            e.lane = nl; e.signal = dir;
          }
          e.changeT = rand(120, 220);
        }
      }
      const tx = laneCenter(e.lane) - e.w / 2;
      const dx = tx - e.x;
      e.x += clamp(dx, -1.3 * wdt, 1.3 * wdt);
      if (Math.abs(dx) < 0.5 && e.signal && e.changeT < 100) e.signal = 0;
    }
    g.enemies = g.enemies.filter((e) => e.y < H + 160 && e.y > -500 && !e.dead);
  }

  function updateParticles(dt) {
    const g = G;
    for (const p of g.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "spark") { p.vx *= 0.95; p.vy *= 0.95; }
      if (p.kind === "smoke") p.size += 0.25 * dt;
      p.life -= dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    if (g.particles.length > 600) g.particles.splice(0, g.particles.length - 600);
    for (const t of g.texts) { t.y -= 1.1 * dt; t.life -= dt; }
    g.texts = g.texts.filter((t) => t.life > 0);
  }

  function updateDemo(dt) {
    const g = G;
    g.time += dt;
    g.themeClock += dt;
    if (g.themeClock > 540) { g.themeClock = 0; g.themeIdx = (g.themeIdx + 1) % THEMES.length; }
    g.night = lerp(g.night, THEMES[g.themeIdx].night, 0.02 * dt);
    scrollWorld(dt); spawn(dt); updateEnemies(dt); updateParticles(dt);
  }

  function updateCountdown(dt) {
    const g = G;
    countdownT -= dt / 60;
    const n = Math.ceil(countdownT);
    if (n !== lastCount) {
      lastCount = n;
      const el = $("countdown");
      el.classList.remove("hidden", "tick", "go");
      void el.offsetWidth; // restart animation
      if (n > 0) { el.textContent = n; el.classList.add("tick"); Sound.beep(false); }
      else {
        el.textContent = "GO!"; el.classList.add("tick", "go"); Sound.beep(true);
        state = "playing";
        setTimeout(() => el.classList.add("hidden"), 800);
      }
    }
    Sound.engineUpdate(0.05 + Math.random() * 0.05, true);
    updateParticles(dt);
    if (Math.random() < 0.3) smoke(g.player.x + 10, g.player.y + g.player.h, 1);
  }

  function update(dt) {
    const g = G, p = g.player, car = g.car;
    g.time += dt;
    const wdt = dt * (g.slowmo > 0 ? 0.55 : 1);

    // ---- death sequence ----
    if (g.dead > 0) {
      g.dead -= dt;
      g.speed = Math.max(0, g.speed - 0.12 * dt);
      scrollWorld(wdt); updateEnemies(wdt); updateParticles(dt);
      if (Math.random() < 0.6) smoke(p.x + p.w / 2, p.y + p.h / 2, 1, "rgba(60,60,70,");
      g.shake = Math.max(0, g.shake - 0.4 * dt);
      g.hurt = Math.max(0, g.hurt - 0.01 * dt);
      Sound.engineUpdate(0, false);
      if (g.dead <= 0) gameOver();
      return;
    }

    // ---- speed / nitro ----
    const lvl = g.level;
    const cruise = (4.6 + lvl * 0.45) * g.diff.speed;
    const max = (8.6 + lvl * 0.55) * car.speed * g.diff.speed;
    const wantNitro = input.nitro() && g.nitro > 1;
    if (wantNitro && !g.nitroOn) Sound.nitro();
    g.nitroOn = wantNitro;
    g.braking = input.down() && !g.nitroOn;
    let target;
    if (g.nitroOn) { target = max * 1.45; g.nitro = Math.max(0, g.nitro - 0.55 * dt); }
    else {
      g.nitro = Math.min(g.nitroMax, g.nitro + 0.05 * dt);
      target = input.up() ? max : g.braking ? 2.2 : cruise;
    }
    const rate = g.nitroOn ? 0.06 : g.braking ? 0.08 : 0.025;
    g.speed += (target - g.speed) * rate * dt;

    // ---- steering ----
    const dir = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
    const hand = car.handling;
    p.vx += dir * 1.1 * hand * dt;
    if (g.skid > 0) {
      g.skid -= dt;
      p.vx += Math.sin(g.time * 0.22) * 0.55 * dt;
      if (Math.random() < 0.6) { smoke(p.x + 4, p.y + p.h - 6, 1); smoke(p.x + p.w - 4, p.y + p.h - 6, 1); }
    }
    p.vx *= Math.pow(g.skid > 0 ? 0.96 : 0.8, dt);
    const maxV = 6.5 * hand;
    p.vx = clamp(p.vx, -maxV, maxV);
    p.x += p.vx * dt;
    const minX = ROAD_X + 4, maxX = ROAD_X + ROAD_W - p.w - 4;
    if (p.x < minX || p.x > maxX) {
      const side = p.x < minX ? minX : maxX;
      p.x = side; p.vx *= -0.3;
      if (Math.random() < 0.5) { burst(side === minX ? p.x : p.x + p.w, p.y + rand(10, p.h - 10), "#fde68a", 3, 4, 2); Sound.scrape(); }
      g.speed *= Math.pow(0.995, dt);
    }
    p.tilt = lerp(p.tilt, p.vx * 0.035, 0.3);

    // ---- score / distance ----
    const mult = (g.nitroOn ? 2 : 1) * g.diff.score;
    g.distance += g.speed * wdt;
    g.score += g.speed * 0.08 * wdt * mult;
    if (g.distance >= g.level * LEVEL_DIST) levelUp();

    // ---- timers ----
    for (const k of ["shield", "magnet", "slowmo", "invincible"]) g[k] = Math.max(0, g[k] - dt);
    if (g.combo > 1) { g.comboTimer -= dt; if (g.comboTimer <= 0) g.combo = 1; }
    g.shake = Math.max(0, g.shake - 0.6 * dt);
    g.flash = Math.max(0, g.flash - 0.03 * dt);
    g.hurt = Math.max(0, g.hurt - 0.02 * dt);
    g.night = lerp(g.night, THEMES[g.themeIdx].night, 0.01 * dt);

    if (g.nitroOn) { flame(p.x + p.w * 0.3, p.y + p.h); flame(p.x + p.w * 0.7, p.y + p.h); }

    scrollWorld(wdt);
    spawn(wdt);
    updateEnemies(wdt);
    updateCollectibles(dt);
    collisions();
    updateParticles(dt);

    Sound.engineUpdate(clamp(g.speed / (max * 1.45), 0, 1), true);
  }

  function updateCollectibles(dt) {
    const g = G, p = g.player;
    const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
    if (g.magnet > 0) {
      for (const c of g.coins) {
        const dx = pcx - c.x, dy = pcy - c.y, d = Math.hypot(dx, dy);
        if (d < 190) { c.x += dx * 0.14 * dt; c.y += dy * 0.14 * dt; }
      }
    }
  }

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const circleRect = (cx, cy, r, b) => {
    const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  };

  function collisions() {
    const g = G, p = g.player;
    const pr = { x: p.x + 4, y: p.y + 5, w: p.w - 8, h: p.h - 10 };

    for (const e of g.enemies) {
      const er = { x: e.x + 3, y: e.y + 4, w: e.w - 6, h: e.h - 8 };
      if (overlap(pr, er)) { hitEnemy(e); if (g.dead > 0) return; continue; }
      // near miss: enemy fully passed below the player
      if (!e.passed && e.y > p.y + p.h) {
        e.passed = true;
        const gap = Math.max(e.x - (p.x + p.w), p.x - (e.x + e.w));
        if (gap >= 0 && gap < 20 && g.invincible <= 0) nearMiss(e);
      }
    }

    for (const c of g.coins) {
      if (!c.taken && circleRect(c.x, c.y, c.r + 2, pr)) {
        c.taken = true;
        g.coinsRun++;
        g.score += 50 * g.diff.score;
        burst(c.x, c.y, "#facc15", 8, 3, 3);
        Sound.coin();
      }
    }

    for (const it of g.items) {
      if (!it.taken && circleRect(it.x, it.y, it.r, pr)) { it.taken = true; collectItem(it); }
    }

    for (const hz of g.hazards) {
      const hr = { x: hz.x - hz.w / 2, y: hz.y - hz.h / 2, w: hz.w, h: hz.h };
      if (!overlap(pr, hr)) continue;
      if (hz.type === "oil" && !hz.used) {
        hz.used = true;
        if (g.shield > 0) continue;
        g.skid = 75;
        floatText(p.x + p.w / 2, p.y - 10, "SLIPPERY!", "#38bdf8", 18);
        Sound.skid();
      } else if (hz.type === "cones" && !hz.hit) {
        hz.hit = true; hz.fly = 8;
        burst(hz.x, hz.y, "#f97316", 14, 5, 4);
        Sound.cone();
        if (g.shield > 0) continue;
        g.speed *= 0.6;
        g.combo = 1;
        g.shake = Math.max(g.shake, 6);
        floatText(p.x + p.w / 2, p.y - 10, "SPEED LOSS", "#f97316", 16);
        vibrate(40);
      }
    }
  }

  function nearMiss(e) {
    const g = G, p = g.player;
    g.combo = Math.min(g.combo + 1, 10);
    g.comboTimer = COMBO_TIME;
    g.nearMisses++;
    g.bestCombo = Math.max(g.bestCombo, g.combo);
    const pts = Math.round(100 * g.combo * g.diff.score);
    g.score += pts;
    g.nitro = Math.min(g.nitroMax, g.nitro + 6);
    floatText(p.x + p.w / 2, p.y - 6, `NEAR MISS +${pts}`, "#facc15", 16);
    burst((e.x + e.w / 2 + p.x + p.w / 2) / 2, p.y + p.h / 2, "#fde68a", 6, 3, 2);
    Sound.nearMiss(g.combo);
  }

  function hitEnemy(e) {
    const g = G, p = g.player;
    if (g.invincible > 0) return;
    e.dead = true;
    burst(e.x + e.w / 2, e.y + e.h / 2, e.color, 30, 8, 5);
    burst(e.x + e.w / 2, e.y + e.h / 2, "#fbbf24", 16, 6, 3);
    smoke(e.x + e.w / 2, e.y + e.h / 2, 8, "rgba(70,70,80,");
    if (g.shield > 0) {
      g.shield = 0; g.invincible = 45; g.shake = 8;
      floatText(p.x + p.w / 2, p.y - 10, "SHIELD SAVED YOU!", "#22d3ee", 16);
      Sound.shieldBreak(); vibrate(60);
      return;
    }
    g.lives--;
    g.combo = 1; g.comboTimer = 0;
    g.invincible = 130; g.shake = 16; g.hurt = 1;
    g.speed *= 0.45;
    Sound.crash(); vibrate([80, 40, 80]);
    if (g.lives <= 0) {
      g.dead = 100; g.shake = 24;
      burst(p.x + p.w / 2, p.y + p.h / 2, g.car.color, 50, 10, 6);
      burst(p.x + p.w / 2, p.y + p.h / 2, "#f97316", 40, 9, 5);
      Sound.bigCrash();
      toast("WRECKED", "");
    } else {
      floatText(p.x + p.w / 2, p.y - 10, "CRASH! -1 ♥", "#f43f5e", 18);
    }
  }

  function collectItem(it) {
    const g = G, p = g.player;
    const labels = { shield: ["SHIELD", "#22d3ee"], magnet: ["MAGNET", "#f43f5e"], nitro: ["NITRO REFILL", "#f97316"], slowmo: ["SLOW-MO", "#a855f7"], heart: ["+1 LIFE", "#ec4899"] };
    const [label, color] = labels[it.type];
    if (it.type === "shield") g.shield = 600;
    if (it.type === "magnet") g.magnet = 540;
    if (it.type === "slowmo") g.slowmo = 330;
    if (it.type === "nitro") g.nitro = g.nitroMax;
    if (it.type === "heart") g.lives = Math.min(g.maxLives, g.lives + 1);
    g.score += 100 * g.diff.score;
    floatText(p.x + p.w / 2, p.y - 10, label, color, 18);
    burst(it.x, it.y, color, 18, 5, 4);
    Sound.power();
  }

  /* ============================ DRAWING ============================ */
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  const shadeCache = new Map();
  function shade(hex, amt) {
    const key = hex + amt;
    if (shadeCache.has(key)) return shadeCache.get(key);
    let s = hex.replace("#", "");
    if (s.length === 3) s = s.split("").map((ch) => ch + ch).join("");
    const n = parseInt(s, 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    const out = `rgb(${r},${g},${b})`;
    shadeCache.set(key, out);
    return out;
  }

  function drawWheels(c, x, y, w, h, rows) {
    c.fillStyle = "#0b0b10";
    const ww = 6, wh = Math.min(16, h * 0.18);
    for (const ry of rows) {
      roundRect(c, x - 3, y + h * ry, ww, wh, 2); c.fill();
      roundRect(c, x + w - 3, y + h * ry, ww, wh, 2); c.fill();
    }
  }

  function drawCar(c, x, y, w, h, color, opt = {}) {
    // shadow
    c.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(c, x + 4, y + 7, w, h, w * 0.3); c.fill();
    drawWheels(c, x, y, w, h, [0.13, 0.68]);
    // body
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(color, -0.4));
    g.addColorStop(0.5, shade(color, 0.18));
    g.addColorStop(1, shade(color, -0.4));
    c.fillStyle = g;
    roundRect(c, x, y, w, h, w * 0.32); c.fill();
    // hood crease
    c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + w * 0.3, y + 6); c.lineTo(x + w * 0.25, y + h * 0.27); c.moveTo(x + w * 0.7, y + 6); c.lineTo(x + w * 0.75, y + h * 0.27); c.stroke();
    // windshield
    c.fillStyle = "#0b1222";
    roundRect(c, x + w * 0.13, y + h * 0.27, w * 0.74, h * 0.17, 5); c.fill();
    // roof
    c.fillStyle = shade(color, -0.12);
    roundRect(c, x + w * 0.17, y + h * 0.44, w * 0.66, h * 0.23, 4); c.fill();
    // rear window
    c.fillStyle = "#0b1222";
    roundRect(c, x + w * 0.16, y + h * 0.67, w * 0.68, h * 0.11, 3); c.fill();
    // glare
    c.fillStyle = "rgba(255,255,255,0.2)";
    c.beginPath();
    c.moveTo(x + w * 0.2, y + h * 0.42); c.lineTo(x + w * 0.36, y + h * 0.285);
    c.lineTo(x + w * 0.48, y + h * 0.285); c.lineTo(x + w * 0.32, y + h * 0.42); c.fill();
    // stripes
    if (opt.stripe) {
      c.fillStyle = "rgba(255,255,255,0.88)";
      c.fillRect(x + w / 2 - 5, y + 3, 3, h * 0.24); c.fillRect(x + w / 2 + 2, y + 3, 3, h * 0.24);
      c.fillRect(x + w / 2 - 5, y + h * 0.44, 3, h * 0.23); c.fillRect(x + w / 2 + 2, y + h * 0.44, 3, h * 0.23);
      c.fillRect(x + w / 2 - 5, y + h * 0.79, 3, h * 0.19); c.fillRect(x + w / 2 + 2, y + h * 0.79, 3, h * 0.19);
    }
    if (opt.police) {
      c.fillStyle = "#111827";
      c.fillRect(x + 2, y + h * 0.3, w - 4, h * 0.4);
      c.fillStyle = "#0b1222";
      roundRect(c, x + w * 0.13, y + h * 0.27, w * 0.74, h * 0.17, 5); c.fill();
      c.fillStyle = "#f8fafc";
      roundRect(c, x + w * 0.17, y + h * 0.44, w * 0.66, h * 0.23, 4); c.fill();
      const on = Math.floor(opt.blink / 8) % 2 === 0;
      c.fillStyle = on ? "#3b82f6" : "#ef4444"; c.fillRect(x + w * 0.2, y + h * 0.5, w * 0.29, 6);
      c.fillStyle = on ? "#ef4444" : "#3b82f6"; c.fillRect(x + w * 0.51, y + h * 0.5, w * 0.29, 6);
    }
    // headlights
    c.fillStyle = "#fef9c3";
    roundRect(c, x + w * 0.1, y + 2, w * 0.22, 4, 2); c.fill();
    roundRect(c, x + w * 0.68, y + 2, w * 0.22, 4, 2); c.fill();
    // taillights
    c.fillStyle = opt.brake ? "#ff3b3b" : "#a51c1c";
    roundRect(c, x + w * 0.08, y + h - 5, w * 0.25, 3.5, 1.5); c.fill();
    roundRect(c, x + w * 0.67, y + h - 5, w * 0.25, 3.5, 1.5); c.fill();
    if (opt.spoiler) {
      c.fillStyle = shade(color, -0.55);
      roundRect(c, x - 1, y + h - 11, w + 2, 5, 2); c.fill();
    }
    if (opt.signal && Math.floor(opt.blink / 10) % 2 === 0) {
      c.fillStyle = "#fbbf24";
      const sx = opt.signal < 0 ? x - 2 : x + w - 4;
      c.fillRect(sx, y + 4, 6, 6); c.fillRect(sx, y + h - 10, 6, 6);
    }
  }

  function drawTruck(c, x, y, w, h, color) {
    c.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(c, x + 5, y + 8, w, h, 6); c.fill();
    drawWheels(c, x, y, w, h, [0.1, 0.62, 0.8]);
    // cab
    const cabH = h * 0.24;
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(color, -0.4)); g.addColorStop(0.5, shade(color, 0.15)); g.addColorStop(1, shade(color, -0.4));
    c.fillStyle = g; roundRect(c, x + 2, y, w - 4, cabH, 8); c.fill();
    c.fillStyle = "#0b1222"; roundRect(c, x + 6, y + cabH * 0.32, w - 12, cabH * 0.3, 3); c.fill();
    c.fillStyle = "#fef9c3"; c.fillRect(x + 6, y + 2, 8, 4); c.fillRect(x + w - 14, y + 2, 8, 4);
    // trailer
    const tg = c.createLinearGradient(x, 0, x + w, 0);
    tg.addColorStop(0, "#9ca3af"); tg.addColorStop(0.5, "#f3f4f6"); tg.addColorStop(1, "#9ca3af");
    c.fillStyle = tg; roundRect(c, x, y + cabH + 4, w, h - cabH - 4, 3); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.12)"; c.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const ly = y + cabH + 4 + ((h - cabH - 4) / 6) * i; c.beginPath(); c.moveTo(x + 3, ly); c.lineTo(x + w - 3, ly); c.stroke(); }
    c.fillStyle = color; c.fillRect(x + 4, y + cabH + 10, w - 8, 4);
    c.fillStyle = "#a51c1c"; c.fillRect(x + 3, y + h - 5, 9, 4); c.fillRect(x + w - 12, y + h - 5, 9, 4);
  }

  function drawBike(c, x, y, w, h, color) {
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath(); c.ellipse(x + w / 2 + 4, y + h / 2 + 6, w / 2, h / 2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#0b0b10";
    roundRect(c, x + w / 2 - 3, y, 6, 13, 3); c.fill();
    roundRect(c, x + w / 2 - 3.5, y + h - 14, 7, 14, 3); c.fill();
    c.fillStyle = color; roundRect(c, x + w / 2 - 6, y + 9, 12, h - 20, 5); c.fill();
    c.fillStyle = "#1f2937"; c.fillRect(x, y + 12, w, 3); // handlebar
    c.fillStyle = "#334155"; roundRect(c, x + 2, y + 16, w - 4, 14, 6); c.fill(); // rider body
    c.fillStyle = shade(color, 0.3); c.beginPath(); c.arc(x + w / 2, y + 20, 6, 0, Math.PI * 2); c.fill(); // helmet
    c.fillStyle = "#fef9c3"; c.fillRect(x + w / 2 - 2, y, 4, 3);
    c.fillStyle = "#a51c1c"; c.fillRect(x + w / 2 - 2, y + h - 3, 4, 3);
  }

  function drawEnemy(c, e) {
    if (e.type === "truck") drawTruck(c, e.x, e.y, e.w, e.h, e.color);
    else if (e.type === "bike") drawBike(c, e.x, e.y, e.w, e.h, e.color);
    else drawCar(c, e.x, e.y, e.w, e.h, e.color, { police: e.type === "police", blink: e.blink, signal: e.signal, brake: false });
  }

  function drawPlayer(c) {
    const g = G, p = g.player;
    if (g.dead > 0) return;
    if (g.invincible > 0 && g.shield <= 0 && Math.floor(g.invincible / 5) % 2 === 0) return;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    c.save();
    c.translate(cx, cy);
    c.rotate(p.tilt);
    drawCar(c, -p.w / 2, -p.h / 2, p.w, p.h, g.car.color, { stripe: true, spoiler: true, brake: g.braking });
    c.restore();
    if (g.nitroOn) {
      for (const ox of [0.3, 0.7]) {
        const fx = p.x + p.w * ox, fy = p.y + p.h;
        const fl = rand(14, 24);
        const grad = c.createLinearGradient(0, fy, 0, fy + fl);
        grad.addColorStop(0, "rgba(255,255,255,0.95)"); grad.addColorStop(0.3, "rgba(56,189,248,0.9)"); grad.addColorStop(1, "rgba(249,115,22,0)");
        c.fillStyle = grad;
        c.beginPath(); c.moveTo(fx - 4, fy); c.lineTo(fx + 4, fy); c.lineTo(fx, fy + fl); c.closePath(); c.fill();
      }
    }
    if (g.shield > 0) {
      const a = g.shield < 120 && Math.floor(g.shield / 8) % 2 === 0 ? 0.25 : 0.6;
      c.save();
      c.strokeStyle = `rgba(34,211,238,${a})`; c.lineWidth = 3;
      c.shadowColor = "#22d3ee"; c.shadowBlur = 16;
      c.beginPath(); c.ellipse(cx, cy, p.w * 0.95, p.h * 0.68, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = `rgba(34,211,238,${a * 0.15})`; c.fill();
      c.restore();
    }
    if (g.magnet > 0) {
      const r = 40 + ((g.time * 2) % 40);
      c.strokeStyle = `rgba(244,63,94,${0.5 - (r - 40) / 80})`; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    }
  }

  function drawGround(c, th, g) {
    c.fillStyle = th.grass; c.fillRect(0, 0, W, H);
    c.fillStyle = th.grass2;
    const off = g.roadOff % 120;
    for (let y = -120 + off; y < H; y += 120) { c.fillRect(0, y, ROAD_X, 60); c.fillRect(ROAD_X + ROAD_W, y, W - ROAD_X - ROAD_W, 60); }
    // shoulders
    c.fillStyle = th.shoulder;
    c.fillRect(ROAD_X - 12, 0, 12, H); c.fillRect(ROAD_X + ROAD_W, 0, 12, H);
  }

  function drawRoad(c, th, g) {
    const rg = c.createLinearGradient(ROAD_X, 0, ROAD_X + ROAD_W, 0);
    rg.addColorStop(0, shade(th.road, -0.15)); rg.addColorStop(0.5, shade(th.road, 0.05)); rg.addColorStop(1, shade(th.road, -0.15));
    c.fillStyle = rg; c.fillRect(ROAD_X, 0, ROAD_W, H);
    // tire wear lines
    c.fillStyle = "rgba(0,0,0,0.08)";
    for (let l = 0; l < LANES; l++) { const cx = laneCenter(l); c.fillRect(cx - 15, 0, 6, H); c.fillRect(cx + 9, 0, 6, H); }
    // rumble strips
    const roff = g.roadOff % 40;
    for (let y = -40 + roff; y < H; y += 40) {
      c.fillStyle = "#dc2626"; c.fillRect(ROAD_X - 8, y, 8, 20); c.fillRect(ROAD_X + ROAD_W, y, 8, 20);
      c.fillStyle = "#f1f5f9"; c.fillRect(ROAD_X - 8, y + 20, 8, 20); c.fillRect(ROAD_X + ROAD_W, y + 20, 8, 20);
    }
    // edge lines
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fillRect(ROAD_X + 4, 0, 3, H); c.fillRect(ROAD_X + ROAD_W - 7, 0, 3, H);
    // lane dashes
    const doff = g.roadOff % 70;
    c.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 1; i < LANES; i++) {
      const lx = ROAD_X + LANE_W * i - 2;
      for (let y = -70 + doff; y < H; y += 70) c.fillRect(lx, y, 4, 36);
    }
  }

  function drawDeco(c, th, g) {
    for (const d of g.deco) {
      const { x, y, s } = d;
      c.save(); c.translate(x, y); c.scale(s, s);
      if (th.deco === "tree") {
        c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.arc(6, 8, 17, 0, Math.PI * 2); c.fill();
        c.fillStyle = d.v === 0 ? "#166534" : d.v === 1 ? "#15803d" : "#14532d";
        c.beginPath(); c.arc(0, 0, 16, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,255,255,0.12)"; c.beginPath(); c.arc(-5, -5, 7, 0, Math.PI * 2); c.fill();
      } else if (th.deco === "palm") {
        c.fillStyle = "rgba(0,0,0,0.22)"; c.beginPath(); c.arc(8, 10, 16, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "#15803d"; c.lineWidth = 5; c.lineCap = "round";
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + d.v; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(a) * 10, Math.sin(a) * 10 - 4, Math.cos(a) * 19, Math.sin(a) * 19); c.stroke(); }
        c.fillStyle = "#713f12"; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
      } else if (th.deco === "lamp") {
        const toRoad = d.side === "L" ? 1 : -1;
        const armX = d.side === "L" ? ROAD_X - x + 4 : ROAD_X + ROAD_W - x - 4;
        c.restore(); c.save(); c.translate(x, y);
        c.fillStyle = "#475569"; c.fillRect(-3, -3, 6, 6);
        c.fillStyle = "#64748b"; c.fillRect(Math.min(0, armX), -1.5, Math.abs(armX), 3);
        c.fillStyle = "#fef3c7"; c.beginPath(); c.arc(armX, 0, 4, 0, Math.PI * 2); c.fill();
        d.lx = x + armX; d.ly = y; d.dir = toRoad;
        if (d.v === 0) { c.fillStyle = "#1e293b"; c.fillRect(-14, 20, 22, 30); c.fillStyle = d.s > 1 ? "#f472b6" : "#22d3ee"; c.fillRect(-12, 24, 18, 3); }
      } else if (th.deco === "cactus") {
        c.fillStyle = "rgba(0,0,0,0.2)"; c.beginPath(); c.ellipse(6, 8, 10, 14, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#3f6212"; roundRect(c, -4, -14, 8, 28, 4); c.fill();
        roundRect(c, -12, -6, 6, 12, 3); c.fill(); roundRect(c, 6, -10, 6, 12, 3); c.fill();
        if (d.v === 1) { c.fillStyle = "#a8a29e"; c.beginPath(); c.ellipse(14, 18, 7, 5, 0, 0, Math.PI * 2); c.fill(); }
      }
      c.restore();
    }
  }

  function drawCoin(c, co) {
    const sx = Math.max(Math.abs(Math.cos(co.spin)), 0.18);
    c.save(); c.translate(co.x, co.y);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(3, 5, co.r * sx, co.r * 0.5, 0, 0, Math.PI * 2); c.fill();
    c.scale(sx, 1);
    const g = c.createRadialGradient(-3, -3, 1, 0, 0, co.r);
    g.addColorStop(0, "#fff7ae"); g.addColorStop(0.5, "#facc15"); g.addColorStop(1, "#b45309");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, co.r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#a16207"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#92400e"; c.font = "bold 12px Orbitron, Arial"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("$", 0, 1);
    c.restore();
  }

  const ITEM_COLORS = { shield: "#22d3ee", magnet: "#f43f5e", nitro: "#f97316", slowmo: "#a855f7", heart: "#ec4899" };
  function drawItem(c, it) {
    const col = ITEM_COLORS[it.type];
    const bob = Math.sin(it.t) * 3;
    c.save(); c.translate(it.x, it.y + bob);
    c.shadowColor = col; c.shadowBlur = 18;
    c.fillStyle = "rgba(10,15,30,0.85)"; c.strokeStyle = col; c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; c.lineTo(Math.cos(a) * it.r, Math.sin(a) * it.r); }
    c.closePath(); c.fill(); c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 2.5;
    if (it.type === "shield") {
      c.beginPath(); c.moveTo(0, -8); c.lineTo(7, -5); c.lineTo(6, 3); c.lineTo(0, 8); c.lineTo(-6, 3); c.lineTo(-7, -5); c.closePath(); c.fill();
    } else if (it.type === "magnet") {
      c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 6, Math.PI, 0, true); c.stroke();
      c.fillRect(-8, -6, 4, 4); c.fillRect(4, -6, 4, 4);
      c.fillStyle = "#e5e7eb"; c.fillRect(-8, -9, 4, 3); c.fillRect(4, -9, 4, 3);
    } else if (it.type === "nitro") {
      c.font = "bold 9px Orbitron, Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("N₂O", 0, 1);
    } else if (it.type === "slowmo") {
      c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -5); c.moveTo(0, 0); c.lineTo(4, 2); c.stroke();
    } else if (it.type === "heart") {
      c.beginPath(); c.moveTo(0, 7);
      c.bezierCurveTo(-10, 0, -6, -9, 0, -3); c.bezierCurveTo(6, -9, 10, 0, 0, 7); c.fill();
    }
    c.restore();
  }

  function drawHazard(c, hz) {
    if (hz.type === "oil") {
      c.save(); c.translate(hz.x, hz.y); c.rotate(hz.rot);
      c.fillStyle = "rgba(5,5,10,0.85)";
      c.beginPath(); c.ellipse(0, 0, hz.w / 2, hz.h / 2, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(14, 8, 10, 7, 0, 0, Math.PI * 2); c.fill();
      const g = c.createLinearGradient(-20, -10, 20, 10);
      g.addColorStop(0, "rgba(168,85,247,0.35)"); g.addColorStop(0.5, "rgba(34,211,238,0.3)"); g.addColorStop(1, "rgba(250,204,21,0.25)");
      c.fillStyle = g; c.beginPath(); c.ellipse(-4, -3, 12, 5, 0.3, 0, Math.PI * 2); c.fill();
      c.restore();
    } else {
      const n = 3, gap = hz.w / n;
      for (let i = 0; i < n; i++) {
        const cx = hz.x - hz.w / 2 + gap * (i + 0.5), cy = hz.y + (hz.hit ? Math.sin(i * 2 + hz.y * 0.1) * 6 : 0);
        c.save(); c.translate(cx, cy); if (hz.hit) c.rotate(i - 1);
        c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(-7, -5, 16, 14);
        c.fillStyle = "#ea580c"; c.fillRect(-8, -8, 16, 16);
        c.fillStyle = "#f97316"; c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(0, 0, 3.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#f97316"; c.beginPath(); c.arc(0, 0, 1.8, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    }
  }

  function drawParticles(c, g) {
    for (const p of g.particles) {
      const a = Math.max(p.life / p.max, 0);
      if (p.kind === "smoke") {
        c.fillStyle = p.color + (a * 0.35).toFixed(3) + ")";
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
      } else {
        c.globalAlpha = a;
        c.fillStyle = p.color;
        c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    c.globalAlpha = 1;
  }

  function drawLighting(c, g, th) {
    const L = lctx;
    L.globalCompositeOperation = "source-over";
    L.clearRect(0, 0, W, H);
    L.fillStyle = `rgba(3,5,16,${g.night})`;
    L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = "destination-out";

    const radial = (x, y, r, a = 1) => {
      const gr = L.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      L.fillStyle = gr; L.beginPath(); L.arc(x, y, r, 0, Math.PI * 2); L.fill();
    };
    const cone = (x, y, len, spread, a = 1) => {
      const gr = L.createRadialGradient(x, y, 0, x, y, len);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      L.fillStyle = gr;
      L.beginPath(); L.moveTo(x - 3, y); L.lineTo(x - spread, y - len); L.lineTo(x + spread, y - len); L.lineTo(x + 3, y); L.closePath(); L.fill();
    };

    const p = g.player;
    if (!g.demo && g.dead <= 0) {
      radial(p.x + p.w / 2, p.y + p.h / 2, 60, 0.8);
      cone(p.x + p.w * 0.25, p.y, 260, 60);
      cone(p.x + p.w * 0.75, p.y, 260, 60);
    }
    for (const e of g.enemies) {
      cone(e.x + e.w / 2, e.y, 140, 40, 0.6);
      radial(e.x + e.w / 2, e.y + e.h / 2, 34, 0.5);
    }
    if (th.deco === "lamp") for (const d of g.deco) if (d.lx != null) radial(d.lx, d.ly, 85, 0.75);
    for (const co of g.coins) radial(co.x, co.y, 22, 0.8);
    for (const it of g.items) radial(it.x, it.y, 34, 0.9);
    c.drawImage(lightC, 0, 0, W, H);

    // additive glows
    c.save();
    c.globalCompositeOperation = "lighter";
    const glow = (x, y, r, col) => {
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    };
    const k = g.night;
    for (const e of g.enemies) {
      glow(e.x + e.w * 0.2, e.y + e.h - 3, 14, `rgba(255,40,40,${0.6 * k})`);
      glow(e.x + e.w * 0.8, e.y + e.h - 3, 14, `rgba(255,40,40,${0.6 * k})`);
      if (e.type === "police") {
        const on = Math.floor(e.blink / 8) % 2 === 0;
        glow(e.x + e.w / 2, e.y + e.h / 2, 46, on ? `rgba(59,130,246,${0.7 * k + 0.15})` : `rgba(239,68,68,${0.7 * k + 0.15})`);
      }
    }
    if (!g.demo && g.dead <= 0) {
      glow(p.x + p.w * 0.25, p.y - 4, 22, `rgba(254,249,195,${0.5 * k})`);
      glow(p.x + p.w * 0.75, p.y - 4, 22, `rgba(254,249,195,${0.5 * k})`);
      if (g.braking) {
        glow(p.x + p.w * 0.2, p.y + p.h, 18, `rgba(255,30,30,${0.8 * k + 0.2})`);
        glow(p.x + p.w * 0.8, p.y + p.h, 18, `rgba(255,30,30,${0.8 * k + 0.2})`);
      }
    }
    if (th.deco === "lamp") for (const d of g.deco) if (d.lx != null) glow(d.lx, d.ly, 30, `rgba(254,243,199,${0.35 * k})`);
    c.restore();
  }

  function render() {
    if (!G) return;
    const g = G, c = ctx, th = THEMES[g.themeIdx];
    c.save();
    if (g.shake > 0 && save.settings.shake) c.translate(rand(-1, 1) * g.shake, rand(-1, 1) * g.shake);

    if (isCockpit()) drawCockpitWorld(c, g, th);
    else {
    drawGround(c, th, g);
    drawRoad(c, th, g);
    drawDeco(c, th, g);
    for (const hz of g.hazards) drawHazard(c, hz);
    for (const co of g.coins) drawCoin(c, co);
    for (const it of g.items) drawItem(c, it);
    for (const e of g.enemies) drawEnemy(c, e);
    if (!g.demo) drawPlayer(c);
    drawParticles(c, g);

    if (g.night > 0.02) drawLighting(c, g, th);

    if (th.rain) {
      c.strokeStyle = "rgba(174,194,224,0.45)"; c.lineWidth = 1.2;
      c.beginPath();
      for (const r of g.rain) { c.moveTo(r.x, r.y); c.lineTo(r.x - 3, r.y + r.l); }
      c.stroke();
    }

    // speed lines
    if (!g.demo && (g.nitroOn || g.speed > 12) && save.settings.particles) {
      c.strokeStyle = g.nitroOn ? "rgba(186,230,253,0.35)" : "rgba(255,255,255,0.18)"; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < (g.nitroOn ? 12 : 6); i++) {
        const x = rand(0, W), y = rand(0, H);
        c.moveTo(x, y); c.lineTo(x, y + 30 + g.speed * 3);
      }
      c.stroke();
    }

    // floating texts
    c.textAlign = "center"; c.textBaseline = "middle";
    for (const t of g.texts) {
      c.globalAlpha = Math.min(1, t.life / 30);
      c.font = `900 ${t.size}px Orbitron, Arial`;
      c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,0.7)"; c.strokeText(t.text, t.x, t.y);
      c.fillStyle = t.color; c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
    }
    c.restore();
    if (isCockpit()) drawCockpitInterior(c, g);

    // screen overlays
    if (th.tint) { c.fillStyle = th.tint; c.fillRect(0, 0, W, H); }
    if (g.slowmo > 0) {
      c.fillStyle = "rgba(124,58,237,0.12)"; c.fillRect(0, 0, W, H);
    }
    if (g.hurt > 0) {
      const v = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
      v.addColorStop(0, "rgba(244,63,94,0)"); v.addColorStop(1, `rgba(244,63,94,${0.55 * g.hurt})`);
      c.fillStyle = v; c.fillRect(0, 0, W, H);
    }
    if (g.nitroOn) {
      const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      v.addColorStop(0, "rgba(34,211,238,0)"); v.addColorStop(1, "rgba(34,211,238,0.22)");
      c.fillStyle = v; c.fillRect(0, 0, W, H);
    }
    if (g.flash > 0) { c.fillStyle = `rgba(255,255,255,${g.flash * 0.6})`; c.fillRect(0, 0, W, H); }
    // vignette
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
  }

  /* ===================== COCKPIT CAMERA (first-person) ===================== */
  // Projects the same game world from the driver's seat. Game logic is untouched:
  // distance ahead = (camera y - object y) * CK.k, lateral offset = object x - camera x.
  const CK = { hy: 285, f: 360, camH: 60, k: 3, zMin: 28, zMax: 3300 };
  const isCockpit = () => !!save.settings.cockpit;
  const SKY = [
    { top: "#3d7fd1", bot: "#d6eaff", sun: true, far: "#8aa3bd", near: "#557a62", kind: "city", clouds: "rgba(255,255,255,0.55)" },
    { top: "#2a1a4d", bot: "#ff9a5a", sun: true, far: "#9c4f6a", near: "#5a2f45", kind: "sea" },
    { top: "#04050d", bot: "#2b1658", moon: true, far: "#171238", near: "#0b0e1e", kind: "city", neon: true },
    { top: "#18202b", bot: "#4d5a6a", far: "#2e3a46", near: "#1c2822", kind: "hills", clouds: "rgba(90,100,115,0.6)" },
    { top: "#3f8fd8", bot: "#ffe0ad", sun: true, far: "#c98d5c", near: "#a8693d", kind: "mesa" },
    { top: "#010208", bot: "#121836", moon: true, far: "#0e1330", near: "#060912", kind: "city", neon: true },
  ];
  let seed = 11;
  const srand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const STARS = Array.from({ length: 80 }, () => ({ x: srand() * (W + 200) - 100, y: srand() * (CK.hy - 30), r: srand() * 1.4 + 0.4 }));
  const BUILDINGS = Array.from({ length: 36 }, () => ({ w: 16 + srand() * 34, h: 28 + srand() * 95, n: Math.floor(srand() * 1000) }));
  const PEAKS = Array.from({ length: 40 }, (_, i) => 30 + Math.sin(i * 0.9) * 16 + srand() * 34);
  const CLOUDS = Array.from({ length: 7 }, () => ({ x: srand() * (W + 200) - 100, y: 25 + srand() * 150, w: 60 + srand() * 100 }));
  const DROPS = Array.from({ length: 40 }, () => ({ x: srand() * W, y: srand() * 480, r: 1 + srand() * 2.5, v: 0.2 + srand() * 0.6 }));
  const CRACKS = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2 + srand() * 0.4; const pts = []; let r = 0;
    while (r < 260) { r += 18 + srand() * 30; pts.push([Math.cos(a + (srand() - 0.5) * 0.35) * r, Math.sin(a + (srand() - 0.5) * 0.35) * r]); }
    return pts;
  });
  const mod = (a, m) => ((a % m) + m) % m;

  function camFor(g) { const p = g.player; return { x: p.x + p.w / 2, y: p.y + p.h * 0.45 }; }

  function drawSky(c, g, sk, cam) {
    const hy = CK.hy, par = -(cam.x - W / 2) * 0.25;
    const gr = c.createLinearGradient(0, -100, 0, hy);
    gr.addColorStop(0, sk.top); gr.addColorStop(1, sk.bot);
    c.fillStyle = gr; c.fillRect(-100, -100, W + 200, hy + 102);

    if (sk.moon) {
      c.fillStyle = "rgba(255,255,255,0.85)";
      for (const s of STARS) c.fillRect(s.x + par * 0.1, s.y, s.r, s.r);
    }
    if (sk.sun || sk.moon) {
      const bx = W * 0.72 + par * 0.1, by = sk.kind === "sea" ? hy - 45 : hy - 160;
      const halo = c.createRadialGradient(bx, by, 0, bx, by, sk.sun ? 130 : 80);
      halo.addColorStop(0, sk.sun ? "rgba(255,240,200,0.6)" : "rgba(200,215,255,0.3)");
      halo.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = halo; c.beginPath(); c.arc(bx, by, 130, 0, Math.PI * 2); c.fill();
      c.fillStyle = sk.sun ? "#fff7da" : "#e5e9f5";
      c.beginPath(); c.arc(bx, by, sk.sun ? 24 : 16, 0, Math.PI * 2); c.fill();
    }
    if (sk.clouds) {
      c.fillStyle = sk.clouds;
      for (const cl of CLOUDS) {
        const x = mod(cl.x + par * 0.15 + g.time * 0.05, W + 300) - 150;
        c.beginPath();
        c.ellipse(x, cl.y, cl.w * 0.5, cl.w * 0.13, 0, 0, Math.PI * 2);
        c.ellipse(x + cl.w * 0.18, cl.y - cl.w * 0.07, cl.w * 0.25, cl.w * 0.12, 0, 0, Math.PI * 2);
        c.fill();
      }
    }

    // far scenery layer
    c.fillStyle = sk.far;
    if (sk.kind === "city") {
      let x = -160 + mod(par * 0.6, 60), i = 0;
      while (x < W + 160) {
        const b = BUILDINGS[i % BUILDINGS.length];
        c.fillStyle = sk.far; c.fillRect(x, hy - b.h, b.w, b.h);
        if (g.night > 0.3) {
          for (let wy = hy - b.h + 6; wy < hy - 6; wy += 8) {
            for (let wx = x + 4; wx < x + b.w - 4; wx += 6) {
              if ((b.n + Math.round(wx - x) * 7 + Math.round(wy) * 13) % 5 === 0) { c.fillStyle = (b.n + Math.round(wy)) % 3 ? "rgba(255,214,120,0.75)" : "rgba(160,220,255,0.6)"; c.fillRect(wx, wy, 2.5, 3); }
            }
          }
          if (sk.neon && b.n % 4 === 0) { c.fillStyle = b.n % 8 === 0 ? "#f472b6" : "#22d3ee"; c.fillRect(x, hy - b.h, b.w, 2); }
        }
        x += b.w + 2; i++;
      }
    } else if (sk.kind === "sea") {
      const sea = c.createLinearGradient(0, hy - 22, 0, hy);
      sea.addColorStop(0, "#5a3a6e"); sea.addColorStop(1, "#c86a5a");
      c.fillStyle = sea; c.fillRect(-100, hy - 22, W + 200, 22);
      c.fillStyle = "rgba(255,220,150,0.55)";
      const bx = W * 0.72 + par * 0.1;
      for (let i = 0; i < 6; i++) c.fillRect(bx - 30 + i * 4, hy - 20 + i * 3.5, 60 - i * 8, 1.5);
    } else if (sk.kind === "hills" || sk.kind === "mesa") {
      c.beginPath(); c.moveTo(-100, hy);
      const step = (W + 200) / (PEAKS.length - 1);
      for (let i = 0; i < PEAKS.length; i++) {
        const x = -100 + i * step + mod(par * 0.4, step);
        const h = sk.kind === "mesa" ? (PEAKS[i] > 45 ? PEAKS[i] : 12) : PEAKS[i];
        c.lineTo(x, hy - h);
        if (sk.kind === "mesa") c.lineTo(x + step * 0.7, hy - h);
      }
      c.lineTo(W + 100, hy); c.closePath(); c.fill();
    }
    // near tree-line / dunes
    c.fillStyle = sk.near;
    c.beginPath(); c.moveTo(-100, hy + 1);
    for (let x = -100; x <= W + 100; x += 14) c.lineTo(x, hy - 6 - Math.abs(Math.sin((x - par) * 0.09)) * 9);
    c.lineTo(W + 100, hy + 1); c.closePath(); c.fill();
  }

  function drawGround3D(c, g, th, cam) {
    const { hy, f, camH, k } = CK;
    c.fillStyle = th.grass; c.fillRect(-100, hy, W + 200, H - hy + 100);
    const o120 = g.roadOff % 120, o40 = g.roadOff % 40, o70 = g.roadOff % 70;
    const tracks = [];
    for (let l = 0; l < LANES; l++) { const cx = laneCenter(l); tracks.push(cx - 15, cx + 9); }
    for (let y = hy + 1; y < H + 30; y += 2) {
      const Z = (camH * f) / (y - hy), s = f / Z, gy = cam.y - Z / k;
      const sx = (X) => W / 2 + (X - cam.x) * s;
      if (mod(gy - o120, 120) < 60) { c.fillStyle = th.grass2; c.fillRect(-100, y, W + 200, 2); }
      c.fillStyle = th.shoulder; c.fillRect(sx(ROAD_X - 14), y, (ROAD_W + 28) * s, 2);
      c.fillStyle = mod(gy - o40, 40) < 20 ? "#dc2626" : "#f1f5f9";
      c.fillRect(sx(ROAD_X - 8), y, 8 * s, 2); c.fillRect(sx(ROAD_X + ROAD_W), y, 8 * s, 2);
      c.fillStyle = th.road; c.fillRect(sx(ROAD_X), y, ROAD_W * s, 2);
      c.fillStyle = "rgba(0,0,0,0.1)";
      for (const t of tracks) c.fillRect(sx(t), y, 6 * s, 2);
      c.fillStyle = "rgba(255,255,255,0.88)";
      c.fillRect(sx(ROAD_X + 4), y, 3 * s, 2); c.fillRect(sx(ROAD_X + ROAD_W - 7), y, 3 * s, 2);
      if (mod(gy - o70, 70) < 36) for (let i = 1; i < LANES; i++) c.fillRect(sx(ROAD_X + LANE_W * i - 2), y, 4 * s, 2);
    }
    // guard rails (straight lines converge at the vanishing point)
    for (const X of [ROAD_X - 20, ROAD_X + ROAD_W + 20]) {
      const sN = f / 30, xN = W / 2 + (X - cam.x) * sN;
      const yTop = hy + (camH - 13) * sN, yBot = hy + (camH - 7) * sN;
      c.fillStyle = "#9aa3ad";
      c.beginPath(); c.moveTo(xN, yTop); c.lineTo(xN, yBot); c.lineTo(W / 2, hy); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.beginPath(); c.moveTo(xN, yTop); c.lineTo(xN, yTop + (yBot - yTop) * 0.3); c.lineTo(W / 2, hy); c.closePath(); c.fill();
      c.fillStyle = "#6b7280";
      const gyNear = cam.y - CK.zMin / k;
      for (let gy = gyNear - mod(gyNear - o40, 40); cam.y - gy < CK.zMax / k; gy -= 40) {
        const Z = (cam.y - gy) * k, s = f / Z;
        const px = W / 2 + (X - cam.x) * s;
        c.fillRect(px - 1.2 * s, hy + (camH - 13) * s, 2.4 * s, 13 * s);
      }
    }
  }

  function tailGlow(list, x, y, r, rgb = "255,40,40", a = 0.55) { list.push({ x, y, r, rgb, a }); }

  function drawRear(c, e, cx, by, s, glows) {
    const w = e.w * s;
    const blinkOn = Math.floor(e.blink / 10) % 2 === 0;
    c.fillStyle = "rgba(0,0,0,0.38)";
    c.beginPath(); c.ellipse(cx, by, w * 0.62, Math.max(1, w * 0.09), 0, 0, Math.PI * 2); c.fill();
    if (w < 4) { c.fillStyle = e.color; c.fillRect(cx - w / 2, by - w * 0.8, w, w * 0.8); return; }

    if (e.type === "truck") {
      const h = 90 * s, x = cx - w / 2, top = by - h;
      c.fillStyle = "#0a0a0d";
      c.fillRect(x + w * 0.04, by - h * 0.13, w * 0.24, h * 0.13); c.fillRect(x + w * 0.72, by - h * 0.13, w * 0.24, h * 0.13);
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#8b939e"); g.addColorStop(0.5, "#f3f4f6"); g.addColorStop(1, "#8b939e");
      c.fillStyle = g; c.fillRect(x, top, w, h * 0.86);
      c.strokeStyle = "rgba(0,0,0,0.28)"; c.lineWidth = Math.max(1, s * 1.2);
      c.strokeRect(x + w * 0.04, top + h * 0.03, w * 0.92, h * 0.78);
      c.beginPath(); c.moveTo(cx, top + h * 0.03); c.lineTo(cx, top + h * 0.81); c.stroke();
      c.fillStyle = "#6b7280";
      c.fillRect(cx - w * 0.09, top + h * 0.42, w * 0.03, h * 0.14); c.fillRect(cx + w * 0.06, top + h * 0.42, w * 0.03, h * 0.14);
      c.fillStyle = e.color; c.fillRect(x, top + h * 0.66, w, h * 0.05);
      c.fillStyle = "#1f2937"; c.fillRect(x + w * 0.02, by - h * 0.17, w * 0.96, h * 0.05);
      c.fillStyle = "#ff2b2b";
      c.fillRect(x + w * 0.05, by - h * 0.22, w * 0.12, h * 0.04); c.fillRect(x + w * 0.83, by - h * 0.22, w * 0.12, h * 0.04);
      tailGlow(glows, x + w * 0.11, by - h * 0.2, 6 + w * 0.22); tailGlow(glows, x + w * 0.89, by - h * 0.2, 6 + w * 0.22);
      return;
    }

    if (e.type === "bike") {
      const h = 50 * s;
      c.fillStyle = "#0a0a0d"; roundRect(c, cx - w * 0.18, by - h * 0.34, w * 0.36, h * 0.34, w * 0.12); c.fill();
      c.fillStyle = e.color; roundRect(c, cx - w * 0.38, by - h * 0.56, w * 0.76, h * 0.26, w * 0.2); c.fill();
      c.fillStyle = "#334155";
      c.beginPath(); c.moveTo(cx - w * 0.48, by - h * 0.52); c.lineTo(cx - w * 0.32, by - h * 0.86); c.lineTo(cx + w * 0.32, by - h * 0.86); c.lineTo(cx + w * 0.48, by - h * 0.52); c.closePath(); c.fill();
      c.fillStyle = shade(e.color, 0.3); c.beginPath(); c.arc(cx, by - h * 0.93, w * 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#ff2b2b"; c.fillRect(cx - w * 0.14, by - h * 0.5, w * 0.28, h * 0.05);
      tailGlow(glows, cx, by - h * 0.48, 5 + w * 0.5);
      return;
    }

    // car / police
    const h = 34 * s, x = cx - w / 2, bodyTop = by - h * 0.62;
    c.fillStyle = "#0a0a0d";
    c.fillRect(x + w * 0.03, by - h * 0.3, w * 0.17, h * 0.3); c.fillRect(x + w * 0.8, by - h * 0.3, w * 0.17, h * 0.3);
    const bg = c.createLinearGradient(0, bodyTop, 0, by);
    bg.addColorStop(0, shade(e.color, 0.18)); bg.addColorStop(1, shade(e.color, -0.45));
    c.fillStyle = bg; roundRect(c, x, bodyTop, w, h * 0.55, w * 0.08); c.fill();
    if (e.type === "police") { c.fillStyle = "#111827"; c.fillRect(x, bodyTop + h * 0.3, w, h * 0.18); }
    c.fillStyle = shade(e.color, -0.12);
    c.beginPath(); c.moveTo(x + w * 0.05, bodyTop + 1); c.lineTo(x + w * 0.2, by - h); c.lineTo(x + w * 0.8, by - h); c.lineTo(x + w * 0.95, bodyTop + 1); c.closePath(); c.fill();
    const wg = c.createLinearGradient(0, by - h, 0, bodyTop);
    wg.addColorStop(0, "#2a3446"); wg.addColorStop(1, "#0b1222");
    c.fillStyle = wg;
    c.beginPath(); c.moveTo(x + w * 0.12, bodyTop - h * 0.02); c.lineTo(x + w * 0.24, by - h * 0.94); c.lineTo(x + w * 0.76, by - h * 0.94); c.lineTo(x + w * 0.88, bodyTop - h * 0.02); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,0.1)";
    c.beginPath(); c.moveTo(x + w * 0.3, bodyTop - h * 0.03); c.lineTo(x + w * 0.4, by - h * 0.93); c.lineTo(x + w * 0.48, by - h * 0.93); c.lineTo(x + w * 0.38, bodyTop - h * 0.03); c.closePath(); c.fill();
    const tlY = bodyTop + h * 0.08, tlH = h * 0.12;
    c.fillStyle = "#ff2424";
    roundRect(c, x + w * 0.04, tlY, w * 0.25, tlH, tlH * 0.3); c.fill();
    roundRect(c, x + w * 0.71, tlY, w * 0.25, tlH, tlH * 0.3); c.fill();
    c.fillStyle = "rgba(255,210,210,0.7)";
    c.fillRect(x + w * 0.07, tlY + tlH * 0.3, w * 0.08, tlH * 0.35); c.fillRect(x + w * 0.85, tlY + tlH * 0.3, w * 0.08, tlH * 0.35);
    tailGlow(glows, x + w * 0.16, tlY + tlH / 2, 5 + w * 0.28); tailGlow(glows, x + w * 0.84, tlY + tlH / 2, 5 + w * 0.28);
    c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(x + w * 0.3, tlY + tlH * 0.45, w * 0.4, Math.max(1, h * 0.025));
    c.fillStyle = "#f1f5f9"; c.fillRect(cx - w * 0.13, by - h * 0.32, w * 0.26, h * 0.1);
    if (w > 30) { c.fillStyle = "#334155"; c.fillRect(cx - w * 0.1, by - h * 0.285, w * 0.2, h * 0.025); }
    c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(x + w * 0.01, by - h * 0.16, w * 0.98, h * 0.08);
    if (e.type === "police") {
      const on = Math.floor(e.blink / 8) % 2 === 0;
      c.fillStyle = on ? "#60a5fa" : "#1e3a8a"; c.fillRect(x + w * 0.23, by - h * 1.08, w * 0.27, h * 0.09);
      c.fillStyle = on ? "#7f1d1d" : "#f87171"; c.fillRect(x + w * 0.5, by - h * 1.08, w * 0.27, h * 0.09);
      tailGlow(glows, on ? x + w * 0.36 : x + w * 0.64, by - h * 1.04, 14 + w * 0.7, on ? "60,130,255" : "255,50,50", 0.7);
    }
    if (e.signal && blinkOn) {
      c.fillStyle = "#fbbf24";
      const sx = e.signal < 0 ? x : x + w * 0.88;
      c.fillRect(sx, tlY + tlH, w * 0.12, tlH * 0.7);
      tailGlow(glows, sx + w * 0.06, tlY + tlH * 1.3, 5 + w * 0.25, "255,180,40", 0.6);
    }
  }

  function drawDeco3D(c, d, th, cam, Z, glows) {
    const s = CK.f / Z, k = s * d.s;
    const x = W / 2 + (d.x - cam.x) * s, by = CK.hy + CK.camH * s;
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath(); c.ellipse(x, by, 20 * k, 4 * k, 0, 0, Math.PI * 2); c.fill();
    if (th.deco === "tree") {
      c.fillStyle = "#4a2f17"; c.fillRect(x - 3 * k, by - 32 * k, 6 * k, 32 * k);
      c.fillStyle = ["#166534", "#15803d", "#14532d"][d.v];
      c.beginPath(); c.arc(x, by - 56 * k, 24 * k, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x - 15 * k, by - 40 * k, 16 * k, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 15 * k, by - 42 * k, 17 * k, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255,255,255,0.1)"; c.beginPath(); c.arc(x - 7 * k, by - 64 * k, 10 * k, 0, Math.PI * 2); c.fill();
    } else if (th.deco === "palm") {
      c.strokeStyle = "#7c5a35"; c.lineWidth = 5 * k; c.lineCap = "round";
      c.beginPath(); c.moveTo(x, by); c.quadraticCurveTo(x + 10 * k, by - 50 * k, x + 5 * k, by - 92 * k); c.stroke();
      c.strokeStyle = "#15803d"; c.lineWidth = 4 * k;
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        c.beginPath(); c.moveTo(x + 5 * k, by - 92 * k);
        c.quadraticCurveTo(x + 5 * k + Math.cos(a) * 18 * k, by - 100 * k + Math.sin(a) * 14 * k, x + 5 * k + Math.cos(a) * 34 * k, by - 84 * k + Math.sin(a) * 8 * k);
        c.stroke();
      }
    } else if (th.deco === "lamp") {
      const armX = d.side === "L" ? ROAD_X + 8 : ROAD_X + ROAD_W - 8;
      const ax = W / 2 + (armX - cam.x) * s, top = CK.hy + (CK.camH - 100) * s;
      c.strokeStyle = "#4b5563"; c.lineWidth = Math.max(1, 3 * s); c.lineCap = "round";
      c.beginPath(); c.moveTo(x, by); c.lineTo(x, top); c.lineTo(ax, top); c.stroke();
      c.fillStyle = "#fff7d6"; c.fillRect(ax - 6 * s, top, 12 * s, 3 * s);
      glows.push({ x: ax, y: top + 2 * s, r: 10 + 40 * s, rgb: "255,236,180", a: 0.5, pool: { x: ax, y: by, r: 70 * s } });
    } else if (th.deco === "cactus") {
      c.fillStyle = "#3f6212";
      roundRect(c, x - 5 * k, by - 50 * k, 10 * k, 50 * k, 5 * k); c.fill();
      roundRect(c, x - 16 * k, by - 36 * k, 7 * k, 18 * k, 3.5 * k); c.fill();
      roundRect(c, x + 9 * k, by - 42 * k, 7 * k, 18 * k, 3.5 * k); c.fill();
      c.fillRect(x - 12 * k, by - 22 * k, 8 * k, 5 * k); c.fillRect(x + 4 * k, by - 28 * k, 8 * k, 5 * k);
    }
  }

  function drawCone3D(c, x, by, s, hit, i) {
    const h = 24 * s, bw = 15 * s;
    c.save(); c.translate(x, by); if (hit) c.rotate((i - 1) * 0.9);
    c.fillStyle = "#1f2937"; c.fillRect(-bw * 0.7, -2 * s, bw * 1.4, 3 * s);
    c.fillStyle = "#f97316";
    c.beginPath(); c.moveTo(-bw / 2, -2 * s); c.lineTo(-bw * 0.12, -h); c.lineTo(bw * 0.12, -h); c.lineTo(bw / 2, -2 * s); c.closePath(); c.fill();
    c.fillStyle = "#fff";
    c.fillRect(-bw * 0.36, -h * 0.42, bw * 0.72, h * 0.12); c.fillRect(-bw * 0.24, -h * 0.72, bw * 0.48, h * 0.1);
    c.restore();
  }

  function drawCockpitLighting(c, g, glows) {
    const L = lctx, hy = CK.hy, n = g.night;
    L.globalCompositeOperation = "source-over";
    L.clearRect(0, 0, W, H);
    const dg = L.createLinearGradient(0, 0, 0, H);
    dg.addColorStop(0, `rgba(3,5,16,${n * 0.35})`); dg.addColorStop(hy / H, `rgba(3,5,16,${n})`); dg.addColorStop(1, `rgba(3,5,16,${n})`);
    L.fillStyle = dg; L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = "destination-out";
    const pool = (x, y, rx, ry, a) => {
      if (rx < 1 || ry < 1) return;
      L.save(); L.translate(x, y); L.scale(rx / 100, ry / 100);
      const gr = L.createRadialGradient(0, 0, 0, 0, 0, 100);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      L.fillStyle = gr; L.beginPath(); L.arc(0, 0, 100, 0, Math.PI * 2); L.fill(); L.restore();
    };
    // own headlights on the road
    pool(W / 2, hy + 170, 260, 120, 1);
    pool(W / 2, hy + 70, 170, 45, 0.85);
    pool(W / 2, hy + 22, 90, 14, 0.5);
    for (const l of glows) {
      pool(l.x, l.y, l.r * 1.4, l.r * 1.4, 0.8);
      if (l.pool) pool(l.pool.x, l.pool.y, l.pool.r * 1.6, l.pool.r * 0.45, 0.8);
    }
    c.drawImage(lightC, 0, 0, W, H);
  }

  function drawGlows(c, g, glows) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const boost = 0.25 + g.night * 0.75;
    for (const l of glows) {
      const gr = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      gr.addColorStop(0, `rgba(${l.rgb},${l.a * boost})`); gr.addColorStop(1, `rgba(${l.rgb},0)`);
      c.fillStyle = gr; c.beginPath(); c.arc(l.x, l.y, l.r, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function drawCockpitWorld(c, g, th) {
    const cam = camFor(g), sk = SKY[g.themeIdx] || SKY[0];
    const { hy, f, camH, k, zMin, zMax } = CK;
    drawSky(c, g, sk, cam);
    drawGround3D(c, g, th, cam);

    // horizon haze
    const fog = c.createLinearGradient(0, hy - 4, 0, hy + 75);
    fog.addColorStop(0, sk.bot); fog.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = fog; c.fillRect(-100, hy - 4, W + 200, 80);

    // collect world objects with depth, draw far -> near
    const glows = [], objs = [];
    const depth = (gy) => (cam.y - gy) * k;
    const fade = (Z) => clamp((zMax - Z) / 500, 0, 1);
    for (const d of g.deco) { const Z = depth(d.y); if (Z > zMin && Z < zMax) objs.push([Z, () => drawDeco3D(c, d, th, cam, Z, glows)]); }
    for (const hz of g.hazards) {
      const Z = depth(hz.y + hz.h / 2); if (Z <= zMin || Z > zMax) continue;
      objs.push([Z, () => {
        const s = f / Z, cx = W / 2 + (hz.x - cam.x) * s, by = hy + camH * s;
        if (hz.type === "oil") {
          const Zf = Math.max(zMin, depth(hz.y - hz.h / 2)), yf = hy + camH * (f / Zf);
          const ry = Math.max(1, Math.abs(by - yf) / 2), cy = (by + yf) / 2;
          c.fillStyle = "rgba(5,5,10,0.85)"; c.beginPath(); c.ellipse(cx, cy, (hz.w / 2) * s, ry, 0, 0, Math.PI * 2); c.fill();
          const sh = c.createLinearGradient(cx - 20 * s, 0, cx + 20 * s, 0);
          sh.addColorStop(0, "rgba(168,85,247,0.4)"); sh.addColorStop(0.5, "rgba(34,211,238,0.35)"); sh.addColorStop(1, "rgba(250,204,21,0.3)");
          c.fillStyle = sh; c.beginPath(); c.ellipse(cx - 5 * s, cy, 12 * s, ry * 0.4, 0, 0, Math.PI * 2); c.fill();
        } else {
          const gap = hz.w / 3;
          for (let i = 0; i < 3; i++) drawCone3D(c, W / 2 + (hz.x - hz.w / 2 + gap * (i + 0.5) - cam.x) * s, by, s, hz.hit, i);
        }
      }]);
    }
    for (const co of g.coins) {
      const Z = depth(co.y); if (Z <= zMin || Z > zMax) continue;
      objs.push([Z, () => {
        const s = f / Z, sx = W / 2 + (co.x - cam.x) * s, sy = hy + (camH - 14) * s;
        c.save(); c.globalAlpha = fade(Z);
        c.translate(sx, sy); c.scale(s, s); c.translate(-co.x, -co.y);
        drawCoin(c, co); c.restore();
        glows.push({ x: sx, y: sy, r: 4 + 16 * s, rgb: "255,210,60", a: 0.35 });
      }]);
    }
    for (const it of g.items) {
      const Z = depth(it.y); if (Z <= zMin || Z > zMax) continue;
      objs.push([Z, () => {
        const s = f / Z; c.save(); c.globalAlpha = fade(Z);
        c.translate(W / 2 + (it.x - cam.x) * s, hy + (camH - 22) * s); c.scale(s * 1.1, s * 1.1); c.translate(-it.x, -it.y);
        drawItem(c, it); c.restore();
      }]);
    }
    for (const e of g.enemies) {
      const Z = depth(e.y + e.h); if (Z <= zMin || Z > zMax) continue;
      objs.push([Z, () => {
        const s = f / Z; c.save(); c.globalAlpha = fade(Z);
        drawRear(c, e, W / 2 + (e.x + e.w / 2 - cam.x) * s, hy + camH * s, s, glows);
        c.restore();
      }]);
    }
    objs.sort((a, b) => b[0] - a[0]);
    for (const o of objs) o[1]();

    // particles (sparks / smoke) in 3D
    for (const p of g.particles) {
      const Z = depth(p.y); if (Z <= 75) continue;
      const s = f / Z, a = Math.max(p.life / p.max, 0);
      const x = W / 2 + (p.x - cam.x) * s, y = hy + (camH - 12 - (p.max - p.life) * 0.4) * s;
      const sz = Math.min(p.kind === "smoke" ? 26 : 9, p.size * s * 0.6);
      if (p.kind === "smoke") { c.fillStyle = p.color + (a * 0.35).toFixed(3) + ")"; c.beginPath(); c.arc(x, y, sz, 0, Math.PI * 2); c.fill(); }
      else { c.globalAlpha = a; c.fillStyle = p.color; c.fillRect(x - sz / 2, y - sz / 2, sz, sz); c.globalAlpha = 1; }
    }

    if (g.night > 0.02) drawCockpitLighting(c, g, glows);
    drawGlows(c, g, glows);

    if (th.rain) {
      c.strokeStyle = "rgba(174,194,224,0.4)"; c.lineWidth = 1.2; c.beginPath();
      for (const r of g.rain) { c.moveTo(r.x, r.y); c.lineTo(r.x - 2, r.y + r.l * 1.4); }
      c.stroke();
    }
    // speed streaks from the vanishing point
    if (!g.demo && (g.nitroOn || g.speed > 12) && save.settings.particles) {
      c.strokeStyle = g.nitroOn ? "rgba(186,230,253,0.45)" : "rgba(255,255,255,0.2)"; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < (g.nitroOn ? 18 : 8); i++) {
        const a = rand(0, Math.PI * 2), r1 = rand(170, 260), r2 = r1 + rand(60, 180);
        c.moveTo(W / 2 + Math.cos(a) * r1, hy + Math.sin(a) * r1 * 0.8); c.lineTo(W / 2 + Math.cos(a) * r2, hy + Math.sin(a) * r2 * 0.8);
      }
      c.stroke();
    }
  }

  function drawCockpitInterior(c, g) {
    const p = g.player, col = g.car.color, sk = SKY[g.themeIdx] || SKY[0];
    const steer = g.demo ? Math.sin(g.time * 0.02) * 0.08 : clamp(p.vx * 0.13, -0.95, 0.95);
    const nightDim = 1 - g.night * 0.55;

    // windshield rain drops
    if (THEMES[g.themeIdx].rain) {
      for (const d of DROPS) {
        const y = mod(d.y + g.time * d.v, 470);
        c.fillStyle = "rgba(220,235,255,0.22)"; c.beginPath(); c.arc(d.x, y, d.r, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,255,255,0.45)"; c.fillRect(d.x - d.r * 0.4, y - d.r * 0.5, d.r * 0.5, d.r * 0.4);
      }
    }

    // hood
    c.save();
    c.beginPath(); c.moveTo(-10, H); c.lineTo(-10, 570); c.quadraticCurveTo(W / 2, 468, W + 10, 570); c.lineTo(W + 10, H); c.closePath();
    const hg = c.createLinearGradient(0, 480, 0, 600);
    hg.addColorStop(0, shade(col, 0.1)); hg.addColorStop(1, shade(col, -0.55));
    c.fillStyle = hg; c.fill();
    c.clip();
    c.fillStyle = `rgba(255,255,255,${0.16 * nightDim})`;
    c.beginPath(); c.ellipse(W / 2, 520, 190, 16, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255,255,255,0.85)";
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(W / 2 + sx * 6, 516); c.lineTo(W / 2 + sx * 14, 516); c.lineTo(W / 2 + sx * 46, 600); c.lineTo(W / 2 + sx * 24, 600); c.closePath(); c.fill();
    }
    c.restore();
    c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-10, 570); c.quadraticCurveTo(W / 2, 468, W + 10, 570); c.stroke();

    // dashboard
    c.beginPath(); c.moveTo(-10, H + 10); c.lineTo(-10, 590); c.quadraticCurveTo(W / 2, 560, W + 10, 590); c.lineTo(W + 10, H + 10); c.closePath();
    const dg = c.createLinearGradient(0, 570, 0, H);
    dg.addColorStop(0, "#22262f"); dg.addColorStop(0.15, "#14171d"); dg.addColorStop(1, "#050608");
    c.fillStyle = dg; c.fill();
    c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-10, 590); c.quadraticCurveTo(W / 2, 560, W + 10, 590); c.stroke();
    c.setLineDash([4, 4]); c.strokeStyle = "rgba(255,255,255,0.08)";
    c.beginPath(); c.moveTo(-10, 600); c.quadraticCurveTo(W / 2, 571, W + 10, 600); c.stroke();
    c.setLineDash([]);
    c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 2;
    c.beginPath(); c.moveTo(40, 604); c.quadraticCurveTo(W / 2, 578, W - 40, 604); c.stroke();
    c.globalAlpha = 1;

    // steering wheel (turns with your steering)
    c.save();
    c.translate(W / 2, 748); c.rotate(steer);
    c.lineCap = "round";
    c.strokeStyle = "#0b0c10"; c.lineWidth = 24; c.beginPath(); c.arc(0, 0, 140, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "#1f232b"; c.lineWidth = 14; c.beginPath(); c.arc(0, 0, 140, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 146, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.fillStyle = col; c.fillRect(-5, -153, 10, 22);
    c.strokeStyle = "#15181e"; c.lineWidth = 22;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-128, -18); c.moveTo(0, 0); c.lineTo(128, -18); c.moveTo(0, 0); c.lineTo(0, 130); c.stroke();
    const hub = c.createRadialGradient(0, -10, 5, 0, 0, 52);
    hub.addColorStop(0, "#2d323c"); hub.addColorStop(1, "#0b0c10");
    c.fillStyle = hub; c.beginPath(); c.arc(0, 0, 50, 0, Math.PI * 2); c.fill();
    c.fillStyle = col; c.font = "900 16px Orbitron, Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("TL", 0, -28);
    c.restore();

    // roof + A-pillars
    c.fillStyle = "#08090c";
    c.beginPath(); c.moveTo(-10, -10); c.lineTo(W + 10, -10); c.lineTo(W + 10, 20); c.quadraticCurveTo(W / 2, 36, -10, 20); c.closePath(); c.fill();
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -10 : W + 10;
      c.beginPath();
      c.moveTo(x0, -10); c.lineTo(W / 2 + side * (W / 2 - 46), 12); c.lineTo(W / 2 + side * (W / 2 - 12), 585); c.lineTo(x0, 600); c.closePath();
      const pg = c.createLinearGradient(side < 0 ? 0 : W, 0, side < 0 ? 46 : W - 46, 0);
      pg.addColorStop(0, "#050608"); pg.addColorStop(1, "#16191f");
      c.fillStyle = pg; c.fill();
      c.strokeStyle = "rgba(255,255,255,0.08)"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(W / 2 + side * (W / 2 - 46), 12); c.lineTo(W / 2 + side * (W / 2 - 12), 585); c.stroke();
    }

    // rear-view mirror
    c.fillStyle = "#08090c"; c.fillRect(W / 2 - 4, 20, 8, 16);
    roundRect(c, W / 2 - 66, 32, 132, 38, 12); c.fillStyle = "#0b0c10"; c.fill();
    c.save();
    roundRect(c, W / 2 - 61, 36, 122, 30, 9); c.clip();
    const mg = c.createLinearGradient(0, 36, 0, 66);
    mg.addColorStop(0, sk.top); mg.addColorStop(0.55, sk.bot); mg.addColorStop(0.56, THEMES[g.themeIdx].road); mg.addColorStop(1, "#111");
    c.fillStyle = mg; c.fillRect(W / 2 - 61, 36, 122, 30);
    c.fillStyle = "rgba(255,255,255,0.7)"; c.fillRect(W / 2 - 1, 54, 2, 12);
    c.fillStyle = `rgba(0,0,0,${g.night * 0.6})`; c.fillRect(W / 2 - 61, 36, 122, 30);
    c.fillStyle = "rgba(255,255,255,0.12)"; c.beginPath(); c.moveTo(W / 2 - 40, 36); c.lineTo(W / 2 - 20, 36); c.lineTo(W / 2 - 45, 66); c.lineTo(W / 2 - 60, 66); c.fill();
    c.restore();

    // windshield glare
    const gl = c.createLinearGradient(0, 30, W, 400);
    gl.addColorStop(0, "rgba(255,255,255,0)"); gl.addColorStop(0.45, `rgba(255,255,255,${0.05 * nightDim})`); gl.addColorStop(0.55, "rgba(255,255,255,0)");
    c.fillStyle = gl; c.fillRect(0, 0, W, 560);

    if (g.shield > 0) {
      const a = g.shield < 120 && Math.floor(g.shield / 8) % 2 === 0 ? 0.25 : 0.65;
      c.save(); c.strokeStyle = `rgba(34,211,238,${a})`; c.lineWidth = 5; c.shadowColor = "#22d3ee"; c.shadowBlur = 22;
      c.strokeRect(4, 4, W - 8, H - 8); c.restore();
    }
    // cracked glass after the final crash
    if (!g.demo && g.lives <= 0) {
      c.save(); c.translate(W * 0.56, 250);
      c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 1.4;
      for (const crack of CRACKS) { c.beginPath(); c.moveTo(0, 0); for (const [x, y] of crack) c.lineTo(x, y); c.stroke(); }
      c.strokeStyle = "rgba(255,255,255,0.35)";
      for (const r of [22, 48, 85]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
      c.restore();
    }

    // floating texts in screen space
    c.textAlign = "center"; c.textBaseline = "middle";
    g.texts.forEach((t, i) => {
      c.globalAlpha = Math.min(1, t.life / 30);
      c.font = `900 ${t.size + 2}px Orbitron, Arial`;
      const y = 190 + i * 26 - (60 - t.life) * 0.5;
      c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,0.7)"; c.strokeText(t.text, W / 2, y);
      c.fillStyle = t.color; c.fillText(t.text, W / 2, y);
    });
    c.globalAlpha = 1;
  }

  function toggleCamera() {
    save.settings.cockpit = !save.settings.cockpit; persist();
    const cb = $("set-cockpit"); if (cb) cb.checked = save.settings.cockpit;
    if (state === "playing" || state === "countdown") toast(save.settings.cockpit ? "COCKPIT VIEW" : "TOP VIEW", "Press C to switch");
  }

  /* ============================ HUD ============================ */
  const hudEls = {
    score: $("score"), distance: $("distance"), level: $("level"), speed: $("speed"),
    coins: $("coins"), lives: $("lives"), arc: $("speedo-arc"), nitro: $("nitro-fill"),
    combo: $("combo"), comboVal: $("combo-val"), comboFill: $("combo-fill"),
  };
  const puEls = [...document.querySelectorAll(".pu-chip")];
  const PU_MAX = { shield: 600, magnet: 540, slowmo: 330 };
  const setText = (el, v) => { v = String(v); if (el._v !== v) { el._v = v; el.textContent = v; } };

  function updateHUD() {
    const g = G;
    setText(hudEls.score, Math.floor(g.score).toLocaleString());
    setText(hudEls.distance, (g.distance * KM_PER_PX).toFixed(2));
    setText(hudEls.level, g.level);
    const kmh = Math.round(g.speed * KMH_PER_SPEED);
    setText(hudEls.speed, kmh);
    hudEls.arc.style.strokeDashoffset = 100 - clamp(kmh / 420, 0, 1) * 100;
    setText(hudEls.coins, g.coinsRun);
    const livesKey = g.lives + "/" + g.maxLives;
    if (hudEls.lives._v !== livesKey) {
      hudEls.lives._v = livesKey;
      let html = "";
      for (let i = 0; i < Math.max(g.diff.lives, g.lives); i++) html += i < g.lives ? "♥" : '<span class="off">♥</span>';
      hudEls.lives.innerHTML = html;
    }
    const np = (g.nitro / g.nitroMax) * 100;
    hudEls.nitro.style.width = np.toFixed(1) + "%";
    hudEls.nitro.classList.toggle("active", g.nitroOn);
    hudEls.nitro.classList.toggle("low", !g.nitroOn && np < 15);

    const showCombo = g.combo > 1;
    if (showCombo) {
      if (hudEls.comboVal._v !== String(g.combo)) {
        hudEls.combo.classList.remove("hidden");
        hudEls.combo.style.animation = "none"; void hudEls.combo.offsetWidth; hudEls.combo.style.animation = "";
      }
      setText(hudEls.comboVal, g.combo);
      hudEls.comboFill.style.width = (g.comboTimer / COMBO_TIME) * 100 + "%";
    } else if (!hudEls.combo.classList.contains("hidden")) {
      hudEls.combo.classList.add("hidden");
      hudEls.comboVal._v = "";
    }

    for (const el of puEls) {
      const k = el.dataset.pu, v = g[k];
      el.classList.toggle("hidden", !(v > 0));
      if (v > 0) el.querySelector("i").style.width = (v / PU_MAX[k]) * 100 + "%";
    }
  }

  /* ============================ SCREENS ============================ */
  const wrapper = $("game-wrapper");
  const screens = [...document.querySelectorAll(".screen")];
  let activeScreen = "menu";
  let settingsReturn = "menu";

  function showScreen(name) {
    activeScreen = name;
    screens.forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
    if (name === "garage") renderGarage();
    if (name === "leaderboard") renderBoard();
    if (name === "settings") syncSettings();
    if (name === "menu") refreshMenu();
    refreshWallet();
  }
  function hideScreens() { activeScreen = null; screens.forEach((s) => s.classList.remove("active")); }

  function refreshWallet() { document.querySelectorAll(".wallet-amt").forEach((el) => (el.textContent = save.wallet.toLocaleString())); }
  function refreshMenu() {
    $("menu-best").textContent = bestScore().toLocaleString();
    document.querySelectorAll("[data-diff]").forEach((b) => b.classList.toggle("active", b.dataset.diff === save.diff));
  }

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (!go) return;
    Sound.init(); Sound.click();
    let target = go.dataset.go;
    if (target === "settings") settingsReturn = state === "paused" ? "pause" : activeScreen === "over" ? "over" : "menu";
    if (target === "back") target = settingsReturn;
    if (target === "garage" && state === "over") { state = "menu"; newRun(true); }
    showScreen(target);
  });

  document.querySelectorAll("[data-diff]").forEach((b) => b.addEventListener("click", () => {
    Sound.init(); Sound.click();
    save.diff = b.dataset.diff; persist(); refreshMenu();
  }));

  $("play-btn").onclick = startGame;
  $("retry-btn").onclick = startGame;
  $("restart-btn").onclick = startGame;
  $("resume-btn").onclick = togglePause;
  $("pause-btn").onclick = togglePause;
  $("cam-btn").onclick = () => { Sound.init(); Sound.click(); toggleCamera(); };
  $("quit-btn").onclick = toMenu;
  $("over-menu-btn").onclick = toMenu;

  function statRow(label, v, min, max) {
    const pct = 25 + ((v - min) / (max - min)) * 75;
    return `<div class="stat"><span>${label}</span><div class="stat-bar"><i style="width:${pct}%"></i></div></div>`;
  }

  function renderGarage() {
    const list = $("garage-list");
    list.innerHTML = "";
    for (const car of CARS) {
      const owned = save.owned.includes(car.id), sel = save.car === car.id;
      const card = document.createElement("div");
      card.className = "car-card" + (sel ? " selected" : "") + (owned ? "" : " locked");
      const btnLabel = sel ? "✓ SELECTED" : owned ? "SELECT" : `<i class="coin-ico"></i> ${car.price.toLocaleString()}`;
      const btnClass = sel ? "current" : owned ? "owned" : "";
      card.innerHTML = `
        <canvas width="160" height="220"></canvas>
        <div class="car-info">
          <h3>${car.name}</h3>
          <p>${car.desc}</p>
          ${statRow("Top speed", car.speed, 1, 1.3)}
          ${statRow("Handling", car.handling, 1, 1.25)}
          ${statRow("Nitro", car.nitro, 1, 1.45)}
          <button class="btn btn-primary btn-sm ${btnClass}">${btnLabel}</button>
        </div>`;
      const pc = card.querySelector("canvas").getContext("2d");
      pc.setTransform(1.6, 0, 0, 1.6, 0, 0);
      drawCar(pc, 30, 21, 40, 76, car.color, { stripe: true, spoiler: true });
      const btn = card.querySelector("button");
      btn.onclick = () => {
        Sound.init();
        if (sel) return;
        if (owned) { save.car = car.id; persist(); Sound.click(); renderGarage(); return; }
        if (save.wallet >= car.price) {
          save.wallet -= car.price; save.owned.push(car.id); save.car = car.id; persist();
          Sound.power(); refreshWallet(); renderGarage();
        } else {
          Sound.tone(160, 0.2, "square", 0.1);
          btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake");
          btn.innerHTML = `Need ${(car.price - save.wallet).toLocaleString()} more`;
          setTimeout(() => { if (btn.isConnected) btn.innerHTML = btnLabel; }, 1300);
        }
      };
      list.appendChild(card);
    }
  }

  function renderBoard() {
    const t = save.totals;
    $("career").innerHTML = `
      <div><small>RUNS</small><b>${t.runs}</b></div>
      <div><small>TOTAL KM</small><b>${t.distance.toFixed(1)}</b></div>
      <div><small>COINS</small><b>${t.coins}</b></div>
      <div><small>NEAR MISS</small><b>${t.nearMisses}</b></div>`;
    const body = $("board-body");
    if (!save.scores.length) { body.innerHTML = `<tr><td colspan="5" class="empty">No races yet — hit the road!</td></tr>`; return; }
    body.innerHTML = save.scores.map((s, i) =>
      `<tr><td>${i === 0 ? "🏆" : i + 1}</td><td>${s.score.toLocaleString()}</td><td>${Number(s.km).toFixed(2)}</td><td>${s.car}</td><td>${s.diff}</td></tr>`).join("");
  }

  const SETTING_IDS = ["sound", "engine", "shake", "particles", "vibrate", "cockpit"];
  function syncSettings() { for (const k of SETTING_IDS) $("set-" + k).checked = !!save.settings[k]; }
  for (const k of SETTING_IDS) {
    $("set-" + k).addEventListener("change", (e) => {
      save.settings[k] = e.target.checked; persist();
      Sound.init(); Sound.click();
    });
  }
  $("reset-btn").onclick = () => {
    if (!confirm("Reset all coins, cars and records?")) return;
    Object.assign(save, { wallet: 0, owned: ["striker"], car: "striker", scores: [], totals: { runs: 0, distance: 0, coins: 0, nearMisses: 0 } });
    persist(); refreshWallet(); toast("RESET", "Progress cleared");
  };

  /* ============================ MAIN LOOP ============================ */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 16.667, 3);
    last = now;
    if (state === "menu" || (state === "over" && G.demo)) updateDemo(dt);
    else if (state === "countdown") updateCountdown(dt);
    else if (state === "playing") update(dt);
    else if (state === "over") updateParticles(dt);
    render();
    if (state === "playing" || state === "countdown") updateHUD();
    requestAnimationFrame(loop);
  }

  newRun(true);
  showScreen("menu");
  requestAnimationFrame(loop);
})();
