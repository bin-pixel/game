const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const uiHp = document.getElementById('boss-hp-bar');
const uiHpText = document.getElementById('boss-hp-text'); // [ADD] HP Text
const scoreBox = document.getElementById('score-box');
const hpBox = document.getElementById('hp-box');
const msgBox = document.getElementById('msg-box');
const adminMsg = document.getElementById('admin-msg');
const distMsg = document.getElementById('dist-msg'); // [ADD]
const gameScreen = document.getElementById('game-screen');

// 디버그용 패널
const debugPanel = document.getElementById('debug-panel');
const dFps = document.getElementById('d-fps');
const dHp = document.getElementById('d-hp');
const dPhase = document.getElementById('d-phase');
const dPatterns = document.getElementById('d-patterns');

let frame = 0;
let score = 0;
let state = 'play'; 
let godMode = false;
let timeScale = 1.0; 
let isRewinding = false;
let loopCount = 0;
let lastTime = Date.now();
let showDistLines = false; // [ADD] 거리 표시 토글

let gameStateHistory = [];
const MAX_HISTORY = 300; 

const player = { 
    x: 300, y: 700, r: 3, speed: 5, 
    hp: 5, maxHp: 5, 
    invul: 0, slowTimer: 0,
    hitboxSize: 2, regenTimer: 0 
};

// [BALANCE] HP 10000
const boss = { 
    x: 300, y: 150, r: 25, 
    hp: 10000, maxHp: 10000, 
    phase: 1, angle: 0,
    transitioning: false,
    freeze: false,
    moveTimer: 0
};

const bullets = [];
const particles = [];
const texts = []; // Floating Text
const explosions = [];
const afterimages = [];
let shieldObj = null;
let gravityObj = null;

// 스킬 설정
const skills = {
    1: { name: '무적', cd: 600, cur: 0, active: false, dur: 120, color:'#ffff00' },
    2: { name: '산데', cd: 900, cur: 0, active: false, dur: 300, color:'#00ff00' }, // 시간감속
    3: { name: '반사', cd: 480, cur: 0, active: false, dur: 60, color:'#0088ff' },
    4: { name: '방패', cd: 720, cur: 0, active: false, dur: 300, color:'#aaaaaa' },
    5: { name: '레일건', cd: 120, cur: 0, active: false, dur: 10, color:'#ff00ff' }, // [MOD] CD단축
    6: { name: '샷건', cd: 60, cur: 0, active: false, dur: 0, color:'#ff8800' },
    7: { name: '동결', cd: 900, cur: 0, active: false, dur: 180, color:'#00ffff' },
    8: { name: '흡혈', cd: 1200, cur: 0, active: false, dur: 300, color:'#ff0000' },
    9: { name: '유폭', cd: 600, cur: 0, active: false, dur: 0, color:'#ffcc00' },
    10: { name: '중력장', cd: 1500, cur: 0, active: false, dur: 240, color:'#440088' },
    11: { name: '리콜', cd: 1800, cur: 0, active: false, dur: 0, color:'#ffffff' }
};

const keys = {};

// 패턴 로직
let currentPattern = null;
let patternTimer = 0;

// [OPTIMIZATION] Bullet Lifetime added
function spawnBullet(x, y, angle, speed, type, props={}) {
    bullets.push({
        x: x, y: y, 
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        r: props.r || 4, 
        color: props.color || '#fff',
        type: type, // 'normal', 'laser', 'homing'
        timer: 0,
        life: 1800, // [OPT] 30초 수명 (60FPS * 30)
        ...props
    });
}

// 점수/텍스트 이펙트 [NEW SCORING]
function spawnText(x, y, text, color='#fff') {
    texts.push({ x, y, text, color, life: 60, vy: -1 });
}

function update() {
    let now = Date.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    
    // FPS Calc
    dFps.innerText = Math.round(1/dt);
    dHp.innerText = Math.ceil(boss.hp);
    dPhase.innerText = boss.phase;
    dPatterns.innerText = bullets.length;

    if (state === 'pause' || state === 'gameover') return;
    if (isRewinding) { rewindGame(); return; }

    // Save History for Recall
    if (frame % 2 === 0) saveGameState();

    // Time Scale
    let ts = timeScale;
    if (skills[2].active) ts *= 0.3; // 산데비스탄
    if (boss.freeze) ts = ts; // 보스 정지는 별도 로직

    // Player Move
    let spd = player.speed * (keys['ShiftLeft'] ? 0.5 : 1.0);
    if (keys['ArrowUp']) player.y -= spd;
    if (keys['ArrowDown']) player.y += spd;
    if (keys['ArrowLeft']) player.x -= spd;
    if (keys['ArrowRight']) player.x += spd;
    
    // Clamp Player
    player.x = Math.max(10, Math.min(590, player.x));
    player.y = Math.max(10, Math.min(790, player.y));

    // Player Logic
    if (player.invul > 0) player.invul--;
    if (player.regenTimer++ > 600 && player.hp < player.maxHp) {
        player.hp++; player.regenTimer=0; spawnText(player.x, player.y, "HEAL", "#0f0");
    }

    // Skills Update
    updateSkills();

    // Boss Logic
    if (!boss.freeze) {
        boss.moveTimer++;
        // P1, P2: Move Left/Right
        if (boss.phase <= 2) {
            boss.x = 300 + Math.sin(boss.moveTimer * 0.02) * 150;
            boss.y = 150 + Math.cos(boss.moveTimer * 0.03) * 30;
        } else if (boss.phase === 3) {
            // P3: Erratic
            boss.x += (Math.random()-0.5)*10;
            boss.y += (Math.random()-0.5)*10;
            boss.x = Math.max(100, Math.min(500, boss.x));
            boss.y = Math.max(50, Math.min(300, boss.y));
        } else {
            // P4: Center fix often
            if (boss.moveTimer % 200 < 50) {
                boss.x += (300 - boss.x)*0.1;
                boss.y += (150 - boss.y)*0.1;
            } else {
                boss.x += Math.sin(frame*0.1)*5;
            }
        }
    }

    // Boss Patterns
    if (!boss.transitioning) {
        patternTimer++;
        if (!currentPattern || patternTimer > currentPattern.duration) {
            pickPattern();
        } else {
            currentPattern.func(patternTimer);
        }
    }

    // Bullets Update
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        
        // [OPT] Lifetime Check
        b.life--;
        if (b.life <= 0) {
            bullets.splice(i, 1);
            continue;
        }

        if (b.freezeTime > 0) { b.freezeTime--; continue; }
        
        let bSpeed = Math.hypot(b.vx, b.vy); // 현재 속력

        // Logic by Type
        if (b.type === 'homing') {
            let angle = Math.atan2(player.y - b.y, player.x - b.x);
            b.vx += Math.cos(angle) * 0.2;
            b.vy += Math.sin(angle) * 0.2;
            // Limit speed
            b.vx *= 0.95; b.vy *= 0.95;
        } else if (b.type === 'accel') {
            b.vx *= 1.02; b.vy *= 1.02;
        }

        // Apply TimeScale
        b.x += b.vx * ts;
        b.y += b.vy * ts;

        // Gravity Field Skill
        if (skills[10].active && gravityObj) {
            let dx = gravityObj.x - b.x;
            let dy = gravityObj.y - b.y;
            let d = Math.hypot(dx, dy);
            if (d < 150 && !b.isPlayerShot) {
                b.x += dx * 0.1; b.y += dy * 0.1;
                if (d < 10) { 
                    bullets.splice(i, 1); 
                    gravityObj.absorbed++;
                    continue; 
                }
            }
        }

        // Screen Bounds (Wide)
        if (b.x < -100 || b.x > 700 || b.y < -100 || b.y > 900) {
            bullets.splice(i, 1);
            continue;
        }

        // Collision: Bullet vs Player
        if (!b.isPlayerShot && player.invul <= 0 && !godMode) {
            let dist = Math.hypot(player.x - b.x, player.y - b.y);
            // Hitbox check
            let hitR = b.type === 'laser' ? b.w/2 : b.r; // Laser width logic
            if (dist < hitR + player.hitboxSize) {
                // Shield Check
                if (skills[4].active && shieldObj) {
                    // Frontal shield logic simplified
                    if (b.y < player.y) { // Block front
                         spawnParticles(b.x, b.y, 5, '#aaa');
                         bullets.splice(i, 1);
                         continue;
                    }
                }
                playerHit();
                bullets.splice(i, 1);
            }
        }

        // Collision: Player Bullet vs Boss
        if (b.isPlayerShot) {
            let dist = Math.hypot(boss.x - b.x, boss.y - b.y);
            // [MOD] Railgun Hitbox Reduction
            let collisionR = boss.r + (b.type === 'rail' ? b.r * 0.5 : b.r);

            if (dist < collisionR) {
                bossHit(b.dmg || 1);
                if (b.type !== 'rail' && b.type !== 'blast') bullets.splice(i, 1);
            }
        }
    }

    // Effect Update
    updateEffects();
}

function draw() {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // [ADD] Distance Lines (V-Key)
    if (showDistLines) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI*2); ctx.stroke(); // 5점 구간
        ctx.beginPath(); ctx.arc(0, 0, 350, 0, Math.PI*2); ctx.stroke(); // 3점 구간
        
        ctx.fillStyle = '#0f0'; ctx.font = '10px monospace';
        ctx.fillText("5pts", 10, 140);
        ctx.fillText("3pts", 10, 340);
        ctx.fillText("1pt", 10, 500);
        ctx.restore();
    }

    // Player
    ctx.shadowBlur = 10; ctx.shadowColor = '#0ff';
    ctx.fillStyle = player.invul > 0 && Math.floor(frame/4)%2===0 ? 'rgba(0,0,0,0)' : '#0ff';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Player Hitbox
    if (keys['ShiftLeft']) {
        ctx.fillStyle = 'red';
        ctx.beginPath(); ctx.arc(player.x, player.y, player.hitboxSize, 0, Math.PI*2); ctx.fill();
    }

    // Boss
    ctx.shadowBlur = 20; 
    ctx.shadowColor = boss.phase===1?'#00ccff':boss.phase===2?'#ff3333':boss.phase===3?'#aa00ff':'#fff';
    ctx.fillStyle = boss.phase===1?'#00ccff':boss.phase===2?'#ff3333':boss.phase===3?'#aa00ff':'#fff';
    
    // Boss Visual
    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (boss.phase === 4) ctx.rotate(Math.random()*0.5); // Glitch shake
    ctx.beginPath(); 
    if (boss.phase === 2) ctx.rect(-30, -30, 60, 60); // Gigantic
    else ctx.arc(0, 0, boss.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;

    // Bullets
    bullets.forEach(b => {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.fillStyle = b.color;
        
        if (b.type === 'laser') {
            let angle = Math.atan2(b.vy, b.vx);
            ctx.rotate(angle);
            // [MOD] Laser Width P3+
            let w = b.w || 4; 
            if (boss.phase >= 3 && !b.isPlayerShot) w *= 2; 
            ctx.fillRect(0, -w/2, 1000, w); // Long laser
        } else {
            ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    });

    // Effects
    particles.forEach(p => {
        ctx.globalAlpha = p.life / 30;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    });

    texts.forEach(t => {
        ctx.fillStyle = t.color;
        ctx.font = "bold 14px Arial";
        ctx.fillText(t.text, t.x, t.y);
    });

    if (shieldObj && skills[4].active) {
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(player.x, player.y, 40, Math.PI, 0); ctx.stroke();
    }
    if (gravityObj && skills[10].active) {
        ctx.fillStyle = 'rgba(100, 0, 200, 0.2)';
        ctx.beginPath(); ctx.arc(gravityObj.x, gravityObj.y, 150, 0, Math.PI*2); ctx.fill();
    }
}

// ----------------------------------------------------------------
// LOGIC FUNCTIONS
// ----------------------------------------------------------------

function playerHit() {
    player.hp--;
    player.invul = 120; // 2sec
    spawnParticles(player.x, player.y, 20, '#0ff');
    gameScreen.classList.add('shake');
    setTimeout(()=>gameScreen.classList.remove('shake'), 500);
    updateUI();
    if (player.hp <= 0) gameOver();
}

function bossHit(dmg) {
    if (boss.transitioning) return;
    
    // [MOD] Scoring System: Distance Based
    let dist = Math.hypot(player.x - boss.x, player.y - boss.y);
    let pts = 1;
    if (dist < 150) pts = 5;
    else if (dist < 350) pts = 3;

    // Apply Damage
    boss.hp -= dmg;
    score += pts;
    
    // Spawn Score Text instead of Damage
    if (frame % 5 === 0) spawnText(boss.x + (Math.random()-0.5)*40, boss.y - 40, "+" + pts, "#ffff00");

    updateUI();
    checkPhase();
}

function checkPhase() {
    if (boss.hp <= 0) { gameClear(); return; }
    let ratio = boss.hp / boss.maxHp;
    let nextPhase = 1;
    if (ratio <= 0.25) nextPhase = 4;
    else if (ratio <= 0.50) nextPhase = 3;
    else if (ratio <= 0.75) nextPhase = 2;

    if (nextPhase > boss.phase) {
        changePhase(nextPhase);
    }
}

function changePhase(p) {
    boss.transitioning = true;
    boss.phase = p;
    bullets.length = 0; // Clear bullets
    gameScreen.style.animation = 'screen-red 0.5s';
    spawnText(300, 400, "PHASE " + p, "#fff");
    
    // [ADD] Phase Bonus
    let bonus = 800 + (p * 200); // 1000, 1200, 1400...
    score += bonus;
    spawnText(300, 350, "BONUS +" + bonus, "#00ff00");

    setTimeout(() => {
        boss.transitioning = false;
        gameScreen.style.animation = '';
    }, 2000);
    updateUI();
}

function pickPattern() {
    // 패턴 풀 정의
    let pool = [];
    if (boss.phase === 1) pool = ['spiral', 'circle', 'spread'];
    if (boss.phase === 2) pool = ['spiral', 'gigantic', 'rain', 'cross'];
    if (boss.phase === 3) pool = ['aimed', 'laserGrid', 'machinegun', 'reflect'];
    if (boss.phase === 4) pool = ['spiral', 'cross', 'laserGrid', 'chaos', 'explode'];

    let key = pool[Math.floor(Math.random() * pool.length)];
    patternTimer = 0;
    
    // 패턴 매핑
    if (key === 'spiral') currentPattern = { func: pSpiral, duration: 180 };
    if (key === 'circle') currentPattern = { func: pCircle, duration: 120 };
    if (key === 'spread') currentPattern = { func: pSpread, duration: 120 };
    if (key === 'gigantic') currentPattern = { func: pGigantic, duration: 200 };
    if (key === 'rain') currentPattern = { func: pRain, duration: 240 };
    if (key === 'cross') currentPattern = { func: pCross, duration: 300 }; // [MOD]
    if (key === 'aimed') currentPattern = { func: pAimed, duration: 180 };
    if (key === 'laserGrid') currentPattern = { func: pLaserGrid, duration: 240 }; // [MOD]
    if (key === 'machinegun') currentPattern = { func: pMachine, duration: 180 };
    if (key === 'chaos') currentPattern = { func: pChaos, duration: 300 };
    
    // Init actions for some patterns
    if (key === 'cross') { boss.freeze = true; boss.angle = 0; }
    else boss.freeze = false;
}

// ---------------- Patterns ----------------
function pSpiral(t) {
    if (t % 5 === 0) {
        let a = t * 0.2;
        spawnBullet(boss.x, boss.y, a, 4, 'normal', { color: '#f0f' });
        spawnBullet(boss.x, boss.y, a + Math.PI, 4, 'normal', { color: '#f0f' });
    }
}
function pCircle(t) {
    if (t % 60 === 0) {
        for(let i=0; i<20; i++) {
            spawnBullet(boss.x, boss.y, (Math.PI*2/20)*i, 3, 'normal');
        }
    }
}
function pSpread(t) {
    if (t % 20 === 0) {
        let base = Math.atan2(player.y - boss.y, player.x - boss.x);
        for(let i=-2; i<=2; i++) spawnBullet(boss.x, boss.y, base + i*0.2, 5, 'normal');
    }
}
function pGigantic(t) {
    if (t % 40 === 0) {
        spawnBullet(boss.x, boss.y, Math.atan2(player.y-boss.y, player.x-boss.x), 3, 'normal', { r: 30, color:'#f00' });
    }
}
function pRain(t) {
    if (t % 5 === 0) {
        spawnBullet(Math.random()*600, -20, Math.PI/2, 4 + Math.random()*2, 'normal', { color:'#0ff' });
    }
}
// [MOD] Pattern 16: Cross (Rotating Laser)
function pCross(t) {
    // Boss Fixed Center
    if (t === 1) boss.freeze = true;
    
    // Rotate CCW (Reverse)
    boss.angle -= 0.02; // 역방향 회전
    
    if (t % 4 === 0) {
        let speed = 6;
        for(let k=0; k<4; k++) {
            let a = boss.angle + (Math.PI/2)*k;
            // From Boss Body
            spawnBullet(boss.x, boss.y, a, speed, 'laser', { w: 10, color: '#fff', life: 100 });
        }
    }
    if (t >= 290) boss.freeze = false;
}
function pAimed(t) {
    if (t % 10 === 0) {
        spawnBullet(boss.x, boss.y, Math.atan2(player.y-boss.y, player.x-boss.x), 8, 'homing', { color:'#f00' });
    }
}
// [MOD] Laser Grid (Multi-angle)
function pLaserGrid(t) {
    if (t % 40 === 0) {
        // Random Angle or Diagonal
        let isDiag = Math.random() > 0.5;
        let count = 6;
        for(let i=0; i<count; i++) {
            let x, y, a;
            if (isDiag) {
                // Diagonal spawning
                if (Math.random()>0.5) { x = i*(600/count); y = 0; a = Math.PI/4; }
                else { x = 600; y = i*(800/count); a = Math.PI*0.75; }
            } else {
                // Classic
                if (i%2===0) { x = Math.random()*600; y = 0; a = Math.PI/2; }
                else { x = 0; y = Math.random()*800; a = 0; }
            }
            spawnBullet(x, y, a, 0, 'laser', { w: 10, speed: 0, life: 60, color:'rgba(255,0,0,0.5)' }); // Warning
            setTimeout(() => {
                 spawnBullet(x, y, a, 15, 'laser', { w: 20, color:'#fff' }); // Fire
            }, 500);
        }
    }
}
function pMachine(t) {
    if (t % 3 === 0) {
        spawnBullet(boss.x + (Math.random()-0.5)*50, boss.y, Math.PI/2 + (Math.random()-0.5)*0.5, 7, 'normal');
    }
}
function pChaos(t) {
    if (t % 2 === 0) {
        spawnBullet(boss.x, boss.y, t*0.3, 5, 'accel', { color: '#f0f' });
    }
}

// ---------------- Skills ----------------
function useSkill(id) {
    let s = skills[id];
    if (!s || s.cur > 0) return;
    s.cur = s.cd;
    s.active = true;
    spawnText(player.x, player.y - 20, s.name + "!", s.color);

    if (id === 1) player.invul = s.dur;
    if (id === 5) fireRailgun();
    if (id === 6) fireShotgun();
    if (id === 9) { // 유폭
        bullets.forEach(b => { if(!b.isPlayerShot) { b.life=0; spawnParticles(b.x, b.y, 5, '#f00'); } });
        score += 100;
    }
    if (id === 10) gravityObj = { x: player.x, y: player.y - 100, absorbed: 0 };
    if (id === 11) isRewinding = true;
    
    updateUI();
}

function fireRailgun() {
    // [MOD] Hitbox adjusted in collision logic
    spawnBullet(player.x, player.y, -Math.PI/2, 20, 'rail', { 
        r: 100, isPlayerShot: true, dmg: 50, color: 'rgba(255, 0, 255, 0.8)' 
    });
}
function fireShotgun() {
    for(let i=-2; i<=2; i++) {
        spawnBullet(player.x, player.y, -Math.PI/2 + i*0.1, 10, 'normal', { isPlayerShot: true, dmg: 2 });
    }
}
function updateSkills() {
    for(let k in skills) {
        let s = skills[k];
        if (s.cur > 0) s.cur--;
        if (s.active) {
            s.dur--;
            if (s.dur <= 0) {
                s.active = false;
                if (k==='10' && gravityObj) { // 중력장 폭발
                    spawnText(gravityObj.x, gravityObj.y, "BOOM!", "#f0f");
                    bossHit(gravityObj.absorbed * 2);
                    gravityObj = null;
                }
            }
        }
    }
}

// ---------------- Core & UI ----------------
function updateUI() {
    uiHp.style.width = (boss.hp / boss.maxHp * 100) + '%';
    uiHpText.innerText = Math.ceil(boss.hp) + " / " + boss.maxHp;
    scoreBox.innerText = "SCORE: " + score;
    let hpsStr = "";
    for(let i=0; i<player.hp; i++) hpsStr += "♥";
    hpBox.innerText = hpsStr;

    // Skills UI
    for(let i=1; i<=11; i++) {
        let el = document.getElementById('skill-'+i);
        if(!el) continue;
        let s = skills[i];
        if (s.active) el.classList.add('active'); else el.classList.remove('active');
        let bar = el.querySelector('.cooldown');
        bar.style.width = (s.cur / s.cd * 100) + '%';
    }
}

function spawnParticles(x, y, count, color) {
    for(let i=0; i<count; i++) {
        particles.push({ 
            x, y, 
            vx: (Math.random()-0.5)*5, vy: (Math.random()-0.5)*5, 
            life: 30, r: Math.random()*3, color 
        });
    }
}
function updateEffects() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
        let t = texts[i];
        t.y += t.vy; t.life--;
        if (t.life <= 0) texts.splice(i, 1);
    }
}

// History & Rewind
function saveGameState() {
    if (gameStateHistory.length > MAX_HISTORY) gameStateHistory.shift();
    gameStateHistory.push({
        player: {...player},
        boss: {...boss},
        bullets: JSON.parse(JSON.stringify(bullets)), // Deep copy needed
        score: score,
        frame: frame
    });
}
function rewindGame() {
    if (gameStateHistory.length > 0) {
        let state = gameStateHistory.pop();
        player.x = state.player.x; player.y = state.player.y; player.hp = state.player.hp;
        boss.x = state.boss.x; boss.y = state.boss.y; boss.hp = state.boss.hp; boss.phase = state.boss.phase;
        bullets.length = 0; 
        state.bullets.forEach(b => bullets.push(b));
        score = state.score;
        gameScreen.style.animation = 'rewind-noise 0.1s infinite';
    } else {
        isRewinding = false;
        skills[11].active = false;
        gameScreen.style.animation = '';
    }
}

// Input & Loop
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyV') { // [ADD] V-Key
        showDistLines = !showDistLines;
        distMsg.style.display = showDistLines ? 'block' : 'none';
    }
    if (e.code === 'KeyR' && state !== 'play') resetGame();
    if (e.code === 'KeyT') { 
        godMode = !godMode; 
        adminMsg.style.display = godMode ? 'block' : 'none'; 
        debugPanel.style.display = godMode ? 'flex' : 'none';
    }
    if (e.code === 'Digit1') useSkill(1); if (e.code === 'Digit2') useSkill(2);
    if (e.code === 'Digit3') useSkill(3); if (e.code === 'Digit4') useSkill(4);
    if (e.code === 'Digit5') useSkill(5); if (e.code === 'Digit6') useSkill(6);
    if (e.code === 'Digit7') useSkill(7); if (e.code === 'Digit8') useSkill(8);
    if (e.code === 'Digit9') useSkill(9); if (e.code === 'Digit0') useSkill(10);
    if (e.key === '-') useSkill(11);
    
    // Auto fire basic
    if (e.code === 'Space') {
        spawnBullet(player.x, player.y, -Math.PI/2, 10, 'normal', { isPlayerShot: true, dmg: 1, color:'#ffff00' });
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

function gameLoop() {
    if (state === 'play') {
        frame++;
        update();
        draw();
    }
    requestAnimationFrame(gameLoop);
}

function resetGame() {
    boss.hp = boss.maxHp; boss.phase = 1; boss.x = 300; boss.y = 150;
    player.hp = 5; player.x = 300; player.y = 700;
    score = 0; loopCount = 0; // [FIX] Loop bug reset
    bullets.length=0; state='play'; patternTimer=0; boss.freeze=false;
    msgBox.style.display = 'none';
    gameScreen.className = '';
}

function gameOver() {
    state = 'gameover';
    msgBox.innerHTML = "GAME OVER<br><span style='font-size:20px'>Press R</span>";
    msgBox.style.display = 'block';
}
function gameClear() {
    state = 'gameover';
    msgBox.innerHTML = "CLEAR!<br><span style='font-size:20px'>Score: "+score+"</span>";
    msgBox.style.display = 'block';
}
function setPhase(p) { changePhase(p); }

// Start
resetGame();
gameLoop();
