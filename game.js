// ============================================================
// VOID SIEGE — Game Engine
// Top-down shooter with wave-based enemy spawning
// ============================================================
(() => {
  'use strict';

  // --- Configuration ---
  const CFG = {
    player:   { speed: 300, size: 18, maxHP: 100, fireRate: 150, invuln: 1000, bulletSpeed: 600, bulletSize: 4 },
    enemy:    { baseSpeed: 80, baseSize: 15, damage: 10, speedScale: 0.12, knockback: 150 },
    brute:    { baseSpeed: 50, baseSize: 26, damage: 20, speedScale: 0.10, knockback: 100 },
    wave:     { interval: 60, baseCount: 5, increment: 3 },
    particle: { killCount: 12, hitCount: 6, muzzleCount: 3 },
    stars:    200,
    gridSize: 60,
  };

  // --- State ---
  let canvas, ctx;
  let gameState = 'menu';
  let player, bullets, enemies, particles, floatingTexts;
  let waveNumber, waveTimer, score, highScore;
  let lastTime, lastFireTime;
  let shakeAmount = 0, flashAlpha = 0;
  let stars = [];
  let keys = {}, mouse = { x: 0, y: 0, down: false };

  // --- Utilities ---
  const dist   = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand   = (lo, hi) => lo + Math.random() * (hi - lo);
  const randEl = (a) => a[Math.floor(Math.random() * a.length)];

  // ============================================================
  // INITIALIZATION
  // ============================================================
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    // Input
    window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
    canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    highScore = parseInt(localStorage.getItem('voidSiege_highScore')) || 0;
    document.getElementById('menuHighScore').textContent = highScore;

    document.getElementById('playBtn').addEventListener('click', startGame);
    document.getElementById('playAgainBtn').addEventListener('click', startGame);

    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    genStars();
  }

  function genStars() {
    stars = [];
    for (let i = 0; i < CFG.stars; i++) {
      stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        s: rand(0.5, 2.2), b: rand(0.15, 0.6), t: rand(1, 3) });
    }
  }

  // ============================================================
  // GAME STATE MANAGEMENT
  // ============================================================
  function startGame() {
    gameState = 'playing';
    player = { x: canvas.width / 2, y: canvas.height / 2, hp: CFG.player.maxHP, angle: 0, invulnTimer: 0, kills: 0 };
    bullets = []; enemies = []; particles = []; floatingTexts = [];
    score = 0; waveNumber = 0; waveTimer = 0;
    lastFireTime = 0; shakeAmount = 0; flashAlpha = 0;

    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.body.style.cursor = 'none';
    updateHUD();
    spawnWave();
  }

  function endGame() {
    gameState = 'game_over';
    document.getElementById('hud').classList.add('hidden');
    document.body.style.cursor = 'default';
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('voidSiege_highScore', highScore);
      document.getElementById('newHighScore').classList.remove('hidden');
    } else {
      document.getElementById('newHighScore').classList.add('hidden');
    }
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalHighScore').textContent = highScore;
    document.getElementById('finalWave').textContent = waveNumber;
    document.getElementById('gameOverScreen').classList.remove('hidden');
  }

  // ============================================================
  // SPAWNING
  // ============================================================
  function spawnWave() {
    waveNumber++;
    const count = CFG.wave.baseCount + CFG.wave.increment * (waveNumber - 1);
    const speedMult = 1 + CFG.enemy.speedScale * (waveNumber - 1);
    for (let i = 0; i < count; i++) spawnEnemy('basic', speedMult);
    // Spawn brutes starting from wave 2 (1 per wave, +1 every 2 waves)
    if (waveNumber >= 2) {
      const bruteCount = 1 + Math.floor((waveNumber - 2) / 2);
      const bruteSM = 1 + CFG.brute.speedScale * (waveNumber - 1);
      for (let i = 0; i < bruteCount; i++) spawnEnemy('brute', bruteSM);
    }
    waveTimer = CFG.wave.interval;
  }

  function spawnEnemy(type, sm) {
    let x, y;
    const m = 60;
    switch (Math.floor(Math.random() * 4)) {
      case 0: x = rand(0, canvas.width); y = -m; break;
      case 1: x = canvas.width + m; y = rand(0, canvas.height); break;
      case 2: x = rand(0, canvas.width); y = canvas.height + m; break;
      default: x = -m; y = rand(0, canvas.height);
    }

    if (type === 'brute') {
      const bruteColors = ['#9933ff','#7722cc','#aa44ff','#6611bb','#bb55ff'];
      enemies.push({ x, y, type: 'brute',
        size: CFG.brute.baseSize + rand(0, 6),
        speed: (CFG.brute.baseSpeed + rand(0, 15)) * (sm || 1),
        damage: CFG.brute.damage,
        color: randEl(bruteColors), wobble: rand(0, Math.PI * 2), pulse: rand(0, Math.PI * 2) });
    } else {
      const colors = ['#ff3355','#ff5533','#ff2244','#cc2233','#ee4455'];
      enemies.push({ x, y, type: 'basic',
        size: CFG.enemy.baseSize + rand(0, 8),
        speed: (CFG.enemy.baseSpeed + rand(0, 30)) * (sm || 1),
        damage: CFG.enemy.damage,
        color: randEl(colors), wobble: rand(0, Math.PI * 2), pulse: rand(0, Math.PI * 2) });
    }
  }

  function fireBullet() {
    const a = player.angle, d = CFG.player.size + 5;
    bullets.push({ x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
      vx: Math.cos(a) * CFG.player.bulletSpeed, vy: Math.sin(a) * CFG.player.bulletSpeed,
      size: CFG.player.bulletSize, life: 2 });
    // muzzle particles
    for (let i = 0; i < CFG.particle.muzzleCount; i++) {
      const sp = rand(-0.3, 0.3);
      particles.push({ x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
        vx: Math.cos(a + sp) * rand(200, 300), vy: Math.sin(a + sp) * rand(200, 300),
        size: rand(1, 3.5), color: '#ffdd44', life: 0.2, maxLife: 0.2 });
    }
  }

  function explode(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rand(-0.3, 0.3);
      const spd = rand(100, 250); const lf = rand(0.5, 1);
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        size: rand(2, 5), color, life: lf, maxLife: lf });
    }
  }

  function addFloatingText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    if (gameState !== 'playing') return;

    // --- Player ---
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup'])    dy -= 1;
    if (keys['s'] || keys['arrowdown'])  dy += 1;
    if (keys['a'] || keys['arrowleft'])  dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (dx && dy) { const l = Math.SQRT2; dx /= l; dy /= l; }
    player.x = clamp(player.x + dx * CFG.player.speed * dt, CFG.player.size, canvas.width  - CFG.player.size);
    player.y = clamp(player.y + dy * CFG.player.speed * dt, CFG.player.size, canvas.height - CFG.player.size);
    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    if (player.invulnTimer > 0) player.invulnTimer -= dt * 1000;

    // --- Shooting ---
    const now = performance.now();
    if (mouse.down && now - lastFireTime >= CFG.player.fireRate) { fireBullet(); lastFireTime = now; }

    // --- Bullets ---
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -60 || b.x > canvas.width + 60 || b.y < -60 || b.y > canvas.height + 60)
        bullets.splice(i, 1);
    }

    // --- Enemies ---
    for (const e of enemies) {
      const ex = player.x - e.x, ey = player.y - e.y;
      const d = Math.hypot(ex, ey);
      if (d > 0) {
        const w = Math.sin(now * 0.003 + e.wobble) * 0.3;
        const a = Math.atan2(ey, ex) + w;
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
      }
    }

    // --- Particles ---
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // --- Floating Texts ---
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y -= 40 * dt; ft.life -= dt;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }

    // --- Collisions ---
    // Bullet-Enemy
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi]; let hit = false;
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        if (dist(b, e) < b.size + e.size) {
          explode(e.x, e.y, e.color, CFG.particle.killCount);
          addFloatingText(e.x, e.y, '+1', '#ffdd44');
          enemies.splice(ei, 1);
          hit = true; score++; player.kills++;
          break;
        }
      }
      if (hit) bullets.splice(bi, 1);
    }

    // Enemy-Player
    if (player.invulnTimer <= 0) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (dist(player, e) < CFG.player.size + e.size) {
          const dmg = e.damage || CFG.enemy.damage;
          const kb = e.type === 'brute' ? CFG.brute.knockback : CFG.enemy.knockback;
          player.hp -= dmg;
          player.invulnTimer = CFG.player.invuln;
          shakeAmount = e.type === 'brute' ? 14 : 8;
          flashAlpha = e.type === 'brute' ? 0.5 : 0.35;
          addFloatingText(player.x, player.y - 30, `-${dmg}`, e.type === 'brute' ? '#bb55ff' : '#ff3355');
          // Knockback enemy
          const a = Math.atan2(e.y - player.y, e.x - player.x);
          e.x += Math.cos(a) * kb;
          e.y += Math.sin(a) * kb;
          explode(player.x, player.y, e.type === 'brute' ? '#aa44ff' : '#ff5566', CFG.particle.hitCount);
          if (player.hp <= 0) { player.hp = 0; endGame(); return; }
        }
      }
    }

    // --- Wave Timer / Auto-advance ---
    waveTimer -= dt;
    if (enemies.length === 0 || waveTimer <= 0) spawnWave();

    // --- Effects decay ---
    shakeAmount *= 0.88;
    flashAlpha  *= 0.92;
    if (shakeAmount < 0.2) shakeAmount = 0;

    updateHUD();
  }

  function updateHUD() {
    const pct = (player.hp / CFG.player.maxHP) * 100;
    const fill = document.getElementById('healthBarFill');
    fill.style.width = pct + '%';
    fill.className = pct > 50 ? '' : pct > 25 ? 'mid' : 'low';
    document.getElementById('healthText').textContent = Math.ceil(player.hp);
    document.getElementById('waveNumber').textContent = waveNumber;
    document.getElementById('timerValue').textContent = Math.max(0, Math.ceil(waveTimer));
    document.getElementById('killValue').textContent = score;
  }

  // ============================================================
  // RENDER
  // ============================================================
  function render() {
    ctx.save();

    // Screen shake offset
    if (shakeAmount > 0) {
      ctx.translate(rand(-shakeAmount, shakeAmount), rand(-shakeAmount, shakeAmount));
    }

    // --- Background ---
    ctx.fillStyle = '#060611';
    ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

    // Grid
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += CFG.gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += CFG.gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Stars
    const t = performance.now() * 0.001;
    for (const st of stars) {
      const brightness = st.b + Math.sin(t * st.t) * 0.15;
      ctx.fillStyle = `rgba(180, 200, 255, ${clamp(brightness, 0, 1)})`;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, Math.PI * 2); ctx.fill();
    }

    if (gameState === 'playing' || gameState === 'game_over') {
      // --- Particles (behind everything) ---
      for (const p of particles) {
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;

      // --- Bullets ---
      for (const b of bullets) {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(a);
        // Glow
        ctx.shadowColor = '#ffdd44'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffee88';
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size * 2.5, b.size, 0, 0, Math.PI * 2);
        ctx.fill();
        // Core
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size * 1.2, b.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // --- Enemies ---
      for (const e of enemies) {
        const pulseSz = 1 + Math.sin(t * 3 + e.pulse) * 0.08;
        const sz = e.size * pulseSz;
        const isBrute = e.type === 'brute';

        // Outer aura for brutes
        if (isBrute) {
          ctx.globalAlpha = 0.12 + Math.sin(t * 4 + e.pulse) * 0.06;
          ctx.fillStyle = e.color;
          ctx.beginPath(); ctx.arc(e.x, e.y, sz * 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Glow
        ctx.shadowColor = e.color; ctx.shadowBlur = isBrute ? 28 : 18;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, sz, 0, Math.PI * 2); ctx.fill();
        // Inner highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(e.x - sz * 0.2, e.y - sz * 0.2, sz * 0.5, 0, Math.PI * 2); ctx.fill();

        // Spikes for brutes
        if (isBrute) {
          ctx.fillStyle = e.color;
          const spikeCount = 6;
          for (let i = 0; i < spikeCount; i++) {
            const sa = (Math.PI * 2 * i) / spikeCount + t * 0.5;
            const sx = e.x + Math.cos(sa) * sz * 1.15;
            const sy = e.y + Math.sin(sa) * sz * 1.15;
            ctx.beginPath(); ctx.arc(sx, sy, sz * 0.2, 0, Math.PI * 2); ctx.fill();
          }
        }

        // Eyes
        const ea = Math.atan2(player.y - e.y, player.x - e.x);
        const eyeOff = sz * 0.3;
        ctx.fillStyle = isBrute ? '#110022' : '#1a0011';
        const eyeSize = isBrute ? sz * 0.22 : sz * 0.18;
        for (const side of [-1, 1]) {
          const ex = e.x + Math.cos(ea - side * 0.5) * eyeOff;
          const ey = e.y + Math.sin(ea - side * 0.5) * eyeOff;
          ctx.beginPath(); ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2); ctx.fill();
        }
      }

      // --- Player ---
      if (gameState === 'playing') {
        const show = player.invulnTimer <= 0 || Math.sin(performance.now() * 0.02) > 0;
        if (show) {
          ctx.save();
          ctx.translate(player.x, player.y); ctx.rotate(player.angle);
          // Thruster glow
          ctx.fillStyle = 'rgba(0, 200, 255, 0.12)';
          ctx.beginPath(); ctx.arc(-CFG.player.size * 0.5, 0, CFG.player.size * 0.8, 0, Math.PI * 2); ctx.fill();
          // Ship body
          ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 20;
          ctx.fillStyle = '#00dde8';
          ctx.beginPath();
          ctx.moveTo(CFG.player.size * 1.2, 0);
          ctx.lineTo(-CFG.player.size * 0.8, -CFG.player.size * 0.7);
          ctx.lineTo(-CFG.player.size * 0.4, 0);
          ctx.lineTo(-CFG.player.size * 0.8,  CFG.player.size * 0.7);
          ctx.closePath(); ctx.fill();
          // Cockpit highlight
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.moveTo(CFG.player.size * 0.6, 0);
          ctx.lineTo(-CFG.player.size * 0.1, -CFG.player.size * 0.25);
          ctx.lineTo(-CFG.player.size * 0.1,  CFG.player.size * 0.25);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }

      // --- Floating Texts ---
      for (const ft of floatingTexts) {
        const alpha = clamp(ft.life / ft.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.font = `bold 16px 'Orbitron', sans-serif`;
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color; ctx.shadowBlur = 6;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;

      // --- Damage flash overlay ---
      if (flashAlpha > 0.01) {
        ctx.fillStyle = `rgba(255, 30, 50, ${flashAlpha})`;
        ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);
      }
    }

    // --- Crosshair (always when not on menu) ---
    if (gameState === 'playing') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      const cs = 12, cg = 5;
      ctx.beginPath();
      ctx.moveTo(mouse.x - cs, mouse.y); ctx.lineTo(mouse.x - cg, mouse.y);
      ctx.moveTo(mouse.x + cg, mouse.y); ctx.lineTo(mouse.x + cs, mouse.y);
      ctx.moveTo(mouse.x, mouse.y - cs); ctx.lineTo(mouse.x, mouse.y - cg);
      ctx.moveTo(mouse.x, mouse.y + cg); ctx.lineTo(mouse.x, mouse.y + cs);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  // ============================================================
  // GAME LOOP
  // ============================================================
  function loop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap dt
    lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // --- Boot ---
  window.addEventListener('DOMContentLoaded', init);
})();
