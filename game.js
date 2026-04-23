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
    ranger:   { baseSpeed: 45, baseSize: 13, damage: 15, speedScale: 0.08, preferredDist: 210, shootInterval: 2.5 },
    wave:     { interval: 60, baseCount: 5, increment: 3 },
    particle: { killCount: 12, hitCount: 6, muzzleCount: 3 },
    stars:    200,
    gridSize: 60,
  };

  const DEFAULT_PLAYER_CFG = { ...CFG.player };

  // --- Upgrade pool ---
  const UPGRADE_POOL = [
    { id: 'fire_rate',    label: 'RAPID TRIGGER',    desc: 'Fire 20% faster',          color: '#ffdd44' },
    { id: 'move_speed',   label: 'AFTERBURNER',       desc: 'Move 15% faster',          color: '#00f0ff' },
    { id: 'bullet_size',  label: 'HEAVY ROUNDS',      desc: 'Bullets 50% larger',       color: '#ff8800' },
    { id: 'bullet_speed', label: 'HYPERVELOCITY',     desc: 'Bullets travel 20% faster',color: '#aaffee' },
    { id: 'restore_hp',   label: 'EMERGENCY REPAIR',  desc: 'Restore 30 HP',            color: '#44ff88' },
    { id: 'max_hp',       label: 'ARMOR PLATING',     desc: '+25 Max HP',               color: '#33dd77' },
    { id: 'triple_shot',  label: 'TRIPLE SHOT',        desc: 'Fire 3 bullets in spread', color: '#ff55ff' },
    { id: 'shield_up',    label: 'ENERGY SHIELD',     desc: 'Absorb the next hit',      color: '#44aaff' },
  ];

  const POWERUP_TYPES = ['health', 'rapidfire', 'shield'];
  const POWERUP_COLORS = { health: '#44ff88', rapidfire: '#ffdd00', shield: '#44aaff' };

  // --- State ---
  let canvas, ctx;
  let gameState = 'menu';
  let player, bullets, enemies, particles, floatingTexts, powerups, enemyBullets;
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
    Object.assign(CFG.player, DEFAULT_PLAYER_CFG);
    gameState = 'playing';
    player = {
      x: canvas.width / 2, y: canvas.height / 2,
      hp: CFG.player.maxHP, angle: 0, invulnTimer: 0, kills: 0,
      shield: false, rapidFireTimer: 0, tripleShot: false,
    };
    bullets = []; enemies = []; particles = []; floatingTexts = [];
    powerups = []; enemyBullets = [];
    score = 0; waveNumber = 0; waveTimer = 0;
    lastFireTime = 0; shakeAmount = 0; flashAlpha = 0;

    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('upgradeScreen').classList.add('hidden');
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

    if (waveNumber % 5 === 0) {
      spawnBoss();
      waveTimer = 9999;
      return;
    }

    const count = CFG.wave.baseCount + CFG.wave.increment * (waveNumber - 1);
    const speedMult = 1 + CFG.enemy.speedScale * (waveNumber - 1);
    for (let i = 0; i < count; i++) spawnEnemy('basic', speedMult);

    if (waveNumber >= 2) {
      const bruteCount = 1 + Math.floor((waveNumber - 2) / 2);
      const bruteSM = 1 + CFG.brute.speedScale * (waveNumber - 1);
      for (let i = 0; i < bruteCount; i++) spawnEnemy('brute', bruteSM);
    }

    if (waveNumber >= 3) {
      const rangerCount = Math.floor((waveNumber - 2) / 3) + 1;
      const rangerSM = 1 + CFG.ranger.speedScale * (waveNumber - 1);
      for (let i = 0; i < rangerCount; i++) spawnEnemy('ranger', rangerSM);
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
      const c = ['#9933ff','#7722cc','#aa44ff','#6611bb','#bb55ff'];
      enemies.push({ x, y, type: 'brute',
        size: CFG.brute.baseSize + rand(0, 6),
        speed: (CFG.brute.baseSpeed + rand(0, 15)) * (sm || 1),
        damage: CFG.brute.damage,
        color: randEl(c), wobble: rand(0, Math.PI * 2), pulse: rand(0, Math.PI * 2) });
    } else if (type === 'ranger') {
      const c = ['#ff8800','#ff6600','#ffaa00','#dd7700'];
      enemies.push({ x, y, type: 'ranger',
        size: CFG.ranger.baseSize + rand(0, 5),
        speed: (CFG.ranger.baseSpeed + rand(0, 20)) * (sm || 1),
        damage: CFG.ranger.damage,
        color: randEl(c), wobble: rand(0, Math.PI * 2), pulse: rand(0, Math.PI * 2),
        shootTimer: rand(1, CFG.ranger.shootInterval) });
    } else {
      const c = ['#ff3355','#ff5533','#ff2244','#cc2233','#ee4455'];
      enemies.push({ x, y, type: 'basic',
        size: CFG.enemy.baseSize + rand(0, 8),
        speed: (CFG.enemy.baseSpeed + rand(0, 30)) * (sm || 1),
        damage: CFG.enemy.damage,
        color: randEl(c), wobble: rand(0, Math.PI * 2), pulse: rand(0, Math.PI * 2) });
    }
  }

  function spawnBoss() {
    const m = 80;
    let x, y;
    switch (Math.floor(Math.random() * 4)) {
      case 0: x = rand(0, canvas.width); y = -m; break;
      case 1: x = canvas.width + m; y = rand(0, canvas.height); break;
      case 2: x = rand(0, canvas.width); y = canvas.height + m; break;
      default: x = -m; y = rand(0, canvas.height);
    }
    const maxHp = 15 + waveNumber * 2;
    enemies.push({
      x, y, type: 'boss',
      size: 55,
      speed: 55,
      hp: maxHp, maxHp,
      damage: 35,
      color: '#ff4400',
      pulse: rand(0, Math.PI * 2),
      wobble: rand(0, Math.PI * 2),
      shootTimer: 1.5,
      phase: 1,
    });
  }

  function fireBullet() {
    const angles = player.tripleShot
      ? [player.angle - 0.26, player.angle, player.angle + 0.26]
      : [player.angle];

    for (const a of angles) {
      const d = CFG.player.size + 5;
      bullets.push({
        x: player.x + Math.cos(a) * d,
        y: player.y + Math.sin(a) * d,
        vx: Math.cos(a) * CFG.player.bulletSpeed,
        vy: Math.sin(a) * CFG.player.bulletSpeed,
        size: CFG.player.bulletSize, life: 2,
      });
    }

    const a = player.angle, d = CFG.player.size + 5;
    for (let i = 0; i < CFG.particle.muzzleCount; i++) {
      const sp = rand(-0.3, 0.3);
      particles.push({ x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
        vx: Math.cos(a + sp) * rand(200, 300), vy: Math.sin(a + sp) * rand(200, 300),
        size: rand(1, 3.5), color: '#ffdd44', life: 0.2, maxLife: 0.2 });
    }
  }

  function fireEnemyBullet(x, y, angle, speed) {
    const spd = speed || 300;
    enemyBullets.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      size: 5, life: 4, damage: 15, color: '#ff8800',
    });
  }

  function fireBossRing(boss, count, aimed) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count;
      fireEnemyBullet(boss.x, boss.y, a, 220);
    }
    if (aimed) {
      const a = Math.atan2(player.y - boss.y, player.x - boss.x);
      fireEnemyBullet(boss.x, boss.y, a, 340);
    }
  }

  function dropPowerUp(x, y, type) {
    const t = type || randEl(POWERUP_TYPES);
    powerups.push({
      x, y, type: t,
      size: 14,
      life: 10, maxLife: 10,
      pulse: rand(0, Math.PI * 2),
      color: POWERUP_COLORS[t],
    });
  }

  function applyPowerup(type) {
    switch (type) {
      case 'health':
        player.hp = Math.min(CFG.player.maxHP, player.hp + 30);
        addFloatingText(player.x, player.y - 30, '+30 HP', '#44ff88');
        break;
      case 'rapidfire':
        player.rapidFireTimer = 8;
        addFloatingText(player.x, player.y - 30, 'RAPID FIRE!', '#ffdd00');
        break;
      case 'shield':
        player.shield = true;
        addFloatingText(player.x, player.y - 30, 'SHIELD!', '#44aaff');
        break;
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
  // UPGRADE SCREEN
  // ============================================================
  function showUpgradeScreen() {
    gameState = 'upgrade';
    enemies = []; enemyBullets = [];
    document.body.style.cursor = 'default';

    let pool = [...UPGRADE_POOL];
    if (player.hp >= CFG.player.maxHP) pool = pool.filter(u => u.id !== 'restore_hp');
    if (player.tripleShot) pool = pool.filter(u => u.id !== 'triple_shot');
    if (player.shield) pool = pool.filter(u => u.id !== 'shield_up');

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const choices = pool.slice(0, 3);

    const container = document.getElementById('upgradeCards');
    container.innerHTML = '';
    choices.forEach(u => {
      const card = document.createElement('button');
      card.className = 'upgrade-card';
      card.style.borderColor = u.color + '55';
      card.innerHTML = `<div class="upgrade-label" style="color:${u.color}">${u.label}</div><div class="upgrade-desc">${u.desc}</div>`;
      card.addEventListener('click', () => applyUpgrade(u.id));
      container.appendChild(card);
    });

    document.getElementById('upgradeScreen').classList.remove('hidden');
  }

  function applyUpgrade(id) {
    switch (id) {
      case 'fire_rate':    CFG.player.fireRate    = Math.max(50, CFG.player.fireRate * 0.8); break;
      case 'move_speed':   CFG.player.speed       *= 1.15; break;
      case 'bullet_size':  CFG.player.bulletSize  += 2; break;
      case 'bullet_speed': CFG.player.bulletSpeed *= 1.2; break;
      case 'restore_hp':   player.hp = Math.min(CFG.player.maxHP, player.hp + 30); break;
      case 'max_hp':       CFG.player.maxHP += 25; player.hp = Math.min(CFG.player.maxHP, player.hp + 25); break;
      case 'triple_shot':  player.tripleShot = true; break;
      case 'shield_up':    player.shield = true; break;
    }
    document.getElementById('upgradeScreen').classList.add('hidden');
    document.body.style.cursor = 'none';
    gameState = 'playing';
    spawnWave();
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    if (gameState !== 'playing') return;

    const now = performance.now();

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
    if (player.rapidFireTimer > 0) player.rapidFireTimer -= dt;

    // --- Shooting ---
    const effectiveFireRate = player.rapidFireTimer > 0 ? CFG.player.fireRate * 0.4 : CFG.player.fireRate;
    if (mouse.down && now - lastFireTime >= effectiveFireRate) { fireBullet(); lastFireTime = now; }

    // --- Player Bullets ---
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -60 || b.x > canvas.width + 60 || b.y < -60 || b.y > canvas.height + 60)
        bullets.splice(i, 1);
    }

    // --- Enemy Bullets ---
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const eb = enemyBullets[i];
      eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
      if (eb.life <= 0 || eb.x < -80 || eb.x > canvas.width + 80 || eb.y < -80 || eb.y > canvas.height + 80) {
        enemyBullets.splice(i, 1);
      }
    }

    // --- Enemies ---
    const hasBoss = enemies.some(e => e.type === 'boss');
    for (const e of enemies) {
      const ex = player.x - e.x, ey = player.y - e.y;
      const distToPlayer = Math.hypot(ex, ey);
      const angleToPlayer = Math.atan2(ey, ex);

      if (e.type === 'ranger') {
        const preferred = CFG.ranger.preferredDist;
        if (distToPlayer < preferred - 30) {
          e.x -= Math.cos(angleToPlayer) * e.speed * dt;
          e.y -= Math.sin(angleToPlayer) * e.speed * dt;
        } else if (distToPlayer > preferred + 30) {
          e.x += Math.cos(angleToPlayer) * e.speed * dt;
          e.y += Math.sin(angleToPlayer) * e.speed * dt;
        } else {
          e.x += Math.cos(angleToPlayer + Math.PI / 2) * e.speed * 0.5 * dt;
          e.y += Math.sin(angleToPlayer + Math.PI / 2) * e.speed * 0.5 * dt;
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          fireEnemyBullet(e.x, e.y, angleToPlayer);
          e.shootTimer = rand(2, CFG.ranger.shootInterval + 1);
        }
      } else if (e.type === 'boss') {
        if (distToPlayer > 0) {
          const w = Math.sin(now * 0.002 + e.wobble) * 0.2;
          e.x += Math.cos(angleToPlayer + w) * e.speed * dt;
          e.y += Math.sin(angleToPlayer + w) * e.speed * dt;
        }
        if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
          e.phase = 2;
          e.speed *= 1.4;
          addFloatingText(e.x, e.y - 70, 'PHASE 2!', '#ff4400');
          explode(e.x, e.y, '#ff4400', 20);
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          const count = e.phase === 2 ? 12 : 8;
          fireBossRing(e, count, e.phase === 2);
          e.shootTimer = e.phase === 2 ? 1.2 : 2.0;
        }
      } else {
        if (distToPlayer > 0) {
          const w = Math.sin(now * 0.003 + e.wobble) * 0.3;
          const a = angleToPlayer + w;
          e.x += Math.cos(a) * e.speed * dt;
          e.y += Math.sin(a) * e.speed * dt;
        }
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

    // --- Power-ups ---
    for (let i = powerups.length - 1; i >= 0; i--) {
      const pu = powerups[i];
      pu.life -= dt;
      if (pu.life <= 0) { powerups.splice(i, 1); continue; }
      if (dist(player, pu) < CFG.player.size + pu.size) {
        applyPowerup(pu.type);
        powerups.splice(i, 1);
      }
    }

    // --- Collisions: Bullet-Enemy ---
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi]; let hit = false;
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        if (dist(b, e) < b.size + e.size) {
          if (e.type === 'boss') {
            e.hp--;
            explode(b.x, b.y, '#ffaa00', 4);
            hit = true;
            if (e.hp <= 0) {
              explode(e.x, e.y, '#ff4400', 30);
              explode(e.x, e.y, '#ffaa00', 20);
              addFloatingText(e.x, e.y, 'BOSS DOWN!', '#ffdd44');
              score += 10; player.kills++;
              dropPowerUp(e.x + rand(-40, 40), e.y + rand(-40, 40));
              dropPowerUp(e.x + rand(-40, 40), e.y + rand(-40, 40));
              dropPowerUp(e.x + rand(-40, 40), e.y + rand(-40, 40));
              enemies.splice(ei, 1);
            }
          } else {
            explode(e.x, e.y, e.color, CFG.particle.killCount);
            addFloatingText(e.x, e.y, '+1', '#ffdd44');
            const dropChance = e.type === 'brute' ? 0.4 : 0.2;
            if (Math.random() < dropChance) dropPowerUp(e.x, e.y);
            enemies.splice(ei, 1);
            score++; player.kills++;
            hit = true;
          }
          break;
        }
      }
      if (hit) bullets.splice(bi, 1);
    }

    // --- Collisions: Enemy-Player ---
    if (player.invulnTimer <= 0) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (dist(player, e) < CFG.player.size + e.size) {
          if (player.shield) {
            player.shield = false;
            player.invulnTimer = CFG.player.invuln;
            shakeAmount = 5;
            addFloatingText(player.x, player.y - 30, 'BLOCKED!', '#44aaff');
            explode(player.x, player.y, '#44aaff', 10);
            const a = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(a) * CFG.enemy.knockback;
            e.y += Math.sin(a) * CFG.enemy.knockback;
          } else {
            const dmg = e.damage || CFG.enemy.damage;
            const kb = e.type === 'brute' ? CFG.brute.knockback : e.type === 'boss' ? 80 : CFG.enemy.knockback;
            player.hp -= dmg;
            player.invulnTimer = CFG.player.invuln;
            shakeAmount = e.type === 'boss' ? 20 : e.type === 'brute' ? 14 : 8;
            flashAlpha = e.type === 'boss' ? 0.6 : e.type === 'brute' ? 0.5 : 0.35;
            addFloatingText(player.x, player.y - 30, `-${dmg}`,
              e.type === 'brute' ? '#bb55ff' : e.type === 'boss' ? '#ff4400' : '#ff3355');
            const a = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(a) * kb; e.y += Math.sin(a) * kb;
            explode(player.x, player.y,
              e.type === 'brute' ? '#aa44ff' : e.type === 'boss' ? '#ff4400' : '#ff5566',
              CFG.particle.hitCount);
            if (player.hp <= 0) { player.hp = 0; endGame(); return; }
          }
        }
      }

      // Enemy bullets hit player
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const eb = enemyBullets[i];
        if (dist(player, eb) < CFG.player.size + eb.size) {
          if (player.shield) {
            player.shield = false;
            player.invulnTimer = CFG.player.invuln * 0.5;
            addFloatingText(player.x, player.y - 30, 'BLOCKED!', '#44aaff');
            explode(player.x, player.y, '#44aaff', 6);
          } else {
            player.hp -= eb.damage;
            player.invulnTimer = CFG.player.invuln * 0.6;
            shakeAmount = 6; flashAlpha = 0.3;
            addFloatingText(player.x, player.y - 30, `-${eb.damage}`, '#ff8800');
            explode(player.x, player.y, '#ff8800', CFG.particle.hitCount);
            if (player.hp <= 0) { player.hp = 0; endGame(); return; }
          }
          enemyBullets.splice(i, 1);
        }
      }
    }

    // --- Wave Timer / Advance ---
    if (!hasBoss) waveTimer -= dt;
    if (!hasBoss && (enemies.length === 0 || waveTimer <= 0)) showUpgradeScreen();

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
    document.getElementById('killValue').textContent = score;

    const boss = enemies ? enemies.find(e => e.type === 'boss') : null;
    if (boss) {
      document.getElementById('timerValue').textContent = `${boss.hp}/${boss.maxHp}`;
    } else {
      document.getElementById('timerValue').textContent = Math.max(0, Math.ceil(waveTimer));
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  function render() {
    ctx.save();

    if (shakeAmount > 0) {
      ctx.translate(rand(-shakeAmount, shakeAmount), rand(-shakeAmount, shakeAmount));
    }

    // --- Background ---
    ctx.fillStyle = '#060611';
    ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += CFG.gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += CFG.gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const t = performance.now() * 0.001;
    for (const st of stars) {
      const brightness = st.b + Math.sin(t * st.t) * 0.15;
      ctx.fillStyle = `rgba(180, 200, 255, ${clamp(brightness, 0, 1)})`;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, Math.PI * 2); ctx.fill();
    }

    if (gameState === 'playing' || gameState === 'upgrade' || gameState === 'game_over') {
      // --- Particles ---
      for (const p of particles) {
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;

      // --- Power-ups ---
      for (const pu of powerups) {
        const alpha = pu.life < 2 ? pu.life / 2 : 1;
        const pulse = 1 + Math.sin(t * 4 + pu.pulse) * 0.15;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = pu.color; ctx.shadowBlur = 16;
        ctx.fillStyle = pu.color;
        ctx.beginPath(); ctx.arc(pu.x, pu.y, pu.size * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(pu.x - pu.size * 0.3, pu.y - pu.size * 0.3, pu.size * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.font = `bold 9px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        const labels = { health: 'HP', rapidfire: 'RF', shield: 'SH' };
        ctx.fillText(labels[pu.type] || '', pu.x, pu.y + pu.size * 0.4);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }

      // --- Player Bullets ---
      for (const b of bullets) {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.shadowColor = '#ffdd44'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffee88';
        ctx.beginPath(); ctx.ellipse(0, 0, b.size * 2.5, b.size, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(0, 0, b.size * 1.2, b.size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // --- Enemy Bullets ---
      for (const eb of enemyBullets) {
        const a = Math.atan2(eb.vy, eb.vx);
        ctx.save();
        ctx.translate(eb.x, eb.y); ctx.rotate(a);
        ctx.shadowColor = eb.color; ctx.shadowBlur = 10;
        ctx.fillStyle = eb.color;
        ctx.beginPath(); ctx.ellipse(0, 0, eb.size * 2, eb.size, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff8ee';
        ctx.beginPath(); ctx.arc(0, 0, eb.size * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // --- Enemies ---
      for (const e of enemies) {
        const pulseSz = 1 + Math.sin(t * 3 + e.pulse) * 0.08;
        const sz = e.size * pulseSz;

        if (e.type === 'boss') {
          // Boss outer aura
          ctx.globalAlpha = 0.1 + Math.sin(t * 2 + e.pulse) * 0.05;
          ctx.fillStyle = e.color;
          ctx.beginPath(); ctx.arc(e.x, e.y, sz * 2.2, 0, Math.PI * 2); ctx.fill();
          if (e.phase === 2) {
            ctx.fillStyle = '#ffaa00';
            ctx.globalAlpha = 0.12 + Math.sin(t * 6) * 0.07;
            ctx.beginPath(); ctx.arc(e.x, e.y, sz * 1.7, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;

          // Boss body — octagon
          ctx.save();
          ctx.translate(e.x, e.y); ctx.rotate(t * 0.3 + e.pulse);
          ctx.shadowColor = e.phase === 2 ? '#ffaa00' : e.color;
          ctx.shadowBlur = 40;
          ctx.fillStyle = e.phase === 2 ? '#ff6600' : e.color;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8;
            i === 0 ? ctx.moveTo(Math.cos(a) * sz, Math.sin(a) * sz)
                    : ctx.lineTo(Math.cos(a) * sz, Math.sin(a) * sz);
          }
          ctx.closePath(); ctx.fill();

          // Rotating spikes
          ctx.fillStyle = e.phase === 2 ? '#ffcc00' : '#ff8844';
          ctx.shadowBlur = 12;
          for (let i = 0; i < 8; i++) {
            const sa = (Math.PI * 2 * i) / 8 + t * 0.9;
            ctx.beginPath();
            ctx.moveTo(Math.cos(sa) * sz * 1.05, Math.sin(sa) * sz * 1.05);
            ctx.lineTo(Math.cos(sa + 0.22) * sz * 1.6, Math.sin(sa + 0.22) * sz * 1.6);
            ctx.lineTo(Math.cos(sa - 0.22) * sz * 1.6, Math.sin(sa - 0.22) * sz * 1.6);
            ctx.closePath(); ctx.fill();
          }
          ctx.restore();

          // Inner highlight
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath(); ctx.arc(e.x - sz * 0.2, e.y - sz * 0.2, sz * 0.4, 0, Math.PI * 2); ctx.fill();

          // Boss canvas HP bar
          const barW = sz * 3;
          const barX = e.x - barW / 2;
          const barY = e.y - sz - 22;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(barX, barY, barW, 7);
          ctx.fillStyle = e.phase === 2 ? '#ffaa00' : '#ff4400';
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
          ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), 7);
          ctx.shadowBlur = 0;
          ctx.font = `bold 10px 'Orbitron', sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText(`${e.hp} / ${e.maxHp}`, e.x, barY - 4);

        } else if (e.type === 'ranger') {
          // Ranger — rotating diamond
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.rotate(t * 1.2 + e.pulse);
          ctx.shadowColor = e.color; ctx.shadowBlur = 15;
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.moveTo(0, -sz);
          ctx.lineTo(sz * 0.6, 0);
          ctx.lineTo(0, sz);
          ctx.lineTo(-sz * 0.6, 0);
          ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.beginPath(); ctx.arc(-sz * 0.1, -sz * 0.2, sz * 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();

          // Ranger aim line (faint)
          const aimA = Math.atan2(player.y - e.y, player.x - e.x);
          ctx.globalAlpha = 0.12;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(aimA) * sz, e.y + Math.sin(aimA) * sz);
          ctx.lineTo(e.x + Math.cos(aimA) * 80, e.y + Math.sin(aimA) * 80);
          ctx.stroke();
          ctx.globalAlpha = 1;

        } else {
          // Basic / Brute
          const isBrute = e.type === 'brute';

          if (isBrute) {
            ctx.globalAlpha = 0.12 + Math.sin(t * 4 + e.pulse) * 0.06;
            ctx.fillStyle = e.color;
            ctx.beginPath(); ctx.arc(e.x, e.y, sz * 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          }

          ctx.shadowColor = e.color; ctx.shadowBlur = isBrute ? 28 : 18;
          ctx.fillStyle = e.color;
          ctx.beginPath(); ctx.arc(e.x, e.y, sz, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.beginPath(); ctx.arc(e.x - sz * 0.2, e.y - sz * 0.2, sz * 0.5, 0, Math.PI * 2); ctx.fill();

          if (isBrute) {
            ctx.fillStyle = e.color;
            for (let i = 0; i < 6; i++) {
              const sa = (Math.PI * 2 * i) / 6 + t * 0.5;
              const sx = e.x + Math.cos(sa) * sz * 1.15;
              const sy = e.y + Math.sin(sa) * sz * 1.15;
              ctx.beginPath(); ctx.arc(sx, sy, sz * 0.2, 0, Math.PI * 2); ctx.fill();
            }
          }

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
      }

      // --- Player ---
      if (gameState === 'playing') {
        const show = player.invulnTimer <= 0 || Math.sin(performance.now() * 0.02) > 0;
        if (show) {
          ctx.save();
          ctx.translate(player.x, player.y); ctx.rotate(player.angle);
          ctx.fillStyle = 'rgba(0, 200, 255, 0.12)';
          ctx.beginPath(); ctx.arc(-CFG.player.size * 0.5, 0, CFG.player.size * 0.8, 0, Math.PI * 2); ctx.fill();

          // Rapid fire indicator (engine glow)
          if (player.rapidFireTimer > 0) {
            ctx.fillStyle = `rgba(255, 220, 0, ${0.15 + Math.sin(t * 12) * 0.1})`;
            ctx.beginPath(); ctx.arc(-CFG.player.size * 0.5, 0, CFG.player.size * 1.1, 0, Math.PI * 2); ctx.fill();
          }

          ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 20;
          ctx.fillStyle = '#00dde8';
          ctx.beginPath();
          ctx.moveTo(CFG.player.size * 1.2, 0);
          ctx.lineTo(-CFG.player.size * 0.8, -CFG.player.size * 0.7);
          ctx.lineTo(-CFG.player.size * 0.4, 0);
          ctx.lineTo(-CFG.player.size * 0.8,  CFG.player.size * 0.7);
          ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.moveTo(CFG.player.size * 0.6, 0);
          ctx.lineTo(-CFG.player.size * 0.1, -CFG.player.size * 0.25);
          ctx.lineTo(-CFG.player.size * 0.1,  CFG.player.size * 0.25);
          ctx.closePath(); ctx.fill();
          ctx.restore();

          // Shield ring (outside ship rotation context)
          if (player.shield) {
            ctx.save();
            ctx.strokeStyle = `rgba(68, 170, 255, ${0.55 + Math.sin(t * 7) * 0.3})`;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 14;
            ctx.beginPath(); ctx.arc(player.x, player.y, CFG.player.size * 1.85, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
          }
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

    // --- Crosshair ---
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
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // --- Boot ---
  window.addEventListener('DOMContentLoaded', init);
})();
