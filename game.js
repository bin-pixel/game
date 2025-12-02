const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const uiHp = document.getElementById('boss-hp-bar');
const scoreBox = document.getElementById('score-box');
const hpBox = document.getElementById('hp-box');
const msgBox = document.getElementById('msg-box');
const adminMsg = document.getElementById('admin-msg');
const gameScreen = document.getElementById('game-screen');

let frame = 0;
let score = 0;
let state = 'play'; 
let godMode = false;
let timeScale = 1.0; 
let isRewinding = false;
let loopCount = 0;

let gameStateHistory = [];
const MAX_HISTORY = 300; 

const player = { 
    x: 300, y: 700, r: 3, speed: 5, 
    hp: 5, maxHp: 5, 
    invul: 0, slowTimer: 0,
    hitboxSize: 2, regenTimer: 0 
};

const boss = { 
    x: 300, y: 150, r: 30, baseR: 30,
    hp: 12000, maxHp: 12000, 
    phase: 1, angle: 0,
    transitioning: false, freeze: false, moveTimer: 0,
    ultState: 'none', ultTimer: 0, patternCooldown: 0 
};

let bossClone = null;
let bullets = [];
let afterimages = []; 
let explosions = []; 
let particles = [];
let texts = [];
let shieldObj = null; 
let gravityObj = null;

const keys = {};
let stars = [];
for(let i=0; i<100; i++) stars.push({x:Math.random()*600, y:Math.random()*800, size:Math.random()*2, speed:Math.random()*3+1});

// 스킬
const skills = {
    1: { name: '무적', cd: 900, duration: 180, active: false, timer: 0 }, 
    2: { name: '산데', cd: 1200, duration: 300, active: false, timer: 0 }, 
    3: { name: '반사', cd: 600, duration: 6, active: false, timer: 0 }, 
    4: { name: '방패', cd: 900, duration: 600, active: false, timer: 0 }, 
    5: { name: '레일건', cd: 300, duration: 0, active: false, timer: 0 }, 
    6: { name: '오토', cd: 1200, duration: 300, active: false, timer: 0 },
    7: { name: '동결', cd: 1800, duration: 240, active: false, timer: 0 }, 
    8: { name: '흡혈', cd: 1200, duration: 300, active: false, timer: 0 }, 
    9: { name: '유폭', cd: 300, duration: 0, active: false, timer: 0 },    
    10: { name: '중력장', cd: 1200, duration: 300, active: false, timer: 0 }, 
    11: { name: '리콜', cd: 3600, duration: 0, active: false, timer: 0 }
};

// 보색 반환 함수 (가시성 확보)
function getBulletColor() {
    if (boss.phase === 1) return '#ff9999'; // Cyan Boss -> Pink
    if (boss.phase === 2) return '#66ff66'; // Red Boss -> Green
    if (boss.phase === 3) return '#ffff66'; // Purple Boss -> Yellow
    return '#ff0000'; // White Boss -> Red
}

function spawnParticles(x, y, color, count, speed) {
    for(let i=0; i<count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let spd = Math.random() * speed;
        particles.push({ x: x, y: y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, life: 30+Math.random()*20, color: color, size: Math.random()*3+1 });
    }
}
function spawnText(x, y, text, color, size) {
    texts.push({ x: x+(Math.random()-0.5)*20, y: y, text: text, color: color, size: size, life: 40, vy: -1.5 });
}

function shoot(p) {
    let width = p.w || 0;
    if (p.isLaser) width = 1600; 
    let color = p.c || getBulletColor();

    bullets.push({
        x: p.x, y: p.y, speed: p.s, angle: p.a,
        r: p.r || 4, color: color,
        accel: p.accel || 0, curve: p.curve || 0, homing: p.homing || 0,
        isLaser: p.isLaser || false, w: width, h: p.h || 20, 
        warnTime: p.warnTime || 0, activeTime: p.activeTime || 30, 
        lifeTime: p.homing ? 300 : 9999, timer: 0, 
        bounce: p.bounce || 0, delay: p.delay || 0, grazed: false, 
        isEnemy: p.isEnemy !== undefined ? p.isEnemy : true,
        isSuction: p.isSuction || false, damage: p.damage || 3
    });
}

function bossShoot(p) {
    if (p.x === undefined) shoot({ ...p, x: boss.x, y: boss.y });
    else shoot(p);
    if (bossClone && p.x === undefined && boss.ultState === 'none') {
        shoot({ ...p, x: bossClone.x, y: bossClone.y });
    }
}

// Patterns
const patterns = {
    // Phase 1
    1: () => { boss.freeze=false; for(let i=0; i<6; i++) bossShoot({a:boss.angle+i*1.0, s:2.0}); boss.angle+=0.1; },
    2: () => { boss.freeze=false; for(let i=0; i<16; i++) bossShoot({a:Math.PI*2/16*i, s:1.5}); },
    3: () => { boss.freeze=true;  let aim=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:aim+i*0.2, s:3.0}); }, 
    4: () => { boss.freeze=false; bossShoot({a:boss.angle, s:2.0, curve:0.01}); bossShoot({a:boss.angle+Math.PI, s:2.0, curve:0.01}); boss.angle+=0.15; },
    5: () => { boss.freeze=false; shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:2.0}); }, 
    6: () => { boss.freeze=true;  let a=angleToP(boss); bossShoot({a:a, s:1.5, accel:0.03}); }, 
    // Phase 2
    7: () => { boss.freeze=false; for(let i=0; i<6; i++) bossShoot({a:Math.PI*2/6*i+boss.angle, s:1.5, r:15, bounce:1}); boss.angle+=0.04; }, 
    8: () => { boss.freeze=true;  bossShoot({a:angleToP(boss), s:4, r:25, warnTime:60}); }, 
    9: () => { boss.freeze=false; for(let i=0; i<3; i++) bossShoot({a:boss.angle+Math.PI*i*0.6, s:2.0, r:12, curve:0.01}); boss.angle+=0.1; },
    10: () => { boss.freeze=false; shoot({x:Math.random()*600, y:Math.random()*300, a:Math.PI/2, s:0, accel:0.05, r:20, warnTime:50}); },
    11: () => { boss.freeze=true;  let a=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:a+i*0.4, s:3.0, r:15, bounce:1}); }, 
    // Phase 3
    12: () => { 
        boss.freeze=false; 
        for(let i=0; i<3; i++) setTimeout(() => shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:0, w:1600, h:15, isLaser:true, warnTime:40, activeTime:20}), i*100);
    }, 
    13: () => { boss.freeze=false; bossShoot({a:angleToP(boss), s:3.5, homing:0.04}); }, 
    14: () => { 
        boss.freeze=false; 
        shoot({x:0, y:player.y, a:0, s:0, w:1600, h:30, isLaser:true, warnTime:60, activeTime:30}); 
        shoot({x:player.x, y:0, a:Math.PI/2, s:0, w:1600, h:30, isLaser:true, warnTime:60, activeTime:30});
    }, 
    15: () => { boss.freeze=true;  let r=200; for(let i=0; i<8; i++) shoot({x:player.x+Math.cos(i)*r, y:player.y+Math.sin(i)*r, a:Math.atan2(-Math.sin(i), -Math.cos(i)), s:2.0, accel:0.05, homing:0.01, warnTime:40}); }, 
    16: () => { 
        boss.freeze=true; let laserW = bossClone ? 400 : 1600; let startAngle = boss.angle;
        for(let i=0; i<4; i++) shoot({x:boss.x, y:boss.y, a:startAngle+(Math.PI/2)*i, s:0, w:laserW, h:15, isLaser:true, warnTime:50, activeTime:60, curve:0.015});
        if(bossClone) for(let i=0; i<4; i++) shoot({x:bossClone.x, y:bossClone.y, a:startAngle+(Math.PI/2)*i, s:0, w:laserW, h:15, isLaser:true, warnTime:50, activeTime:60, curve:-0.015});
    }, 
    17: () => { boss.freeze=false; shoot({x:Math.random()*500+50, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:60, activeTime:30}); },
    18: () => { 
        if(!bossClone && boss.hp > 0 && boss.ultState === 'none') { 
            boss.freeze = true;
            bossClone = { x: 600 - boss.x, y: boss.y, r: boss.r, hp: 4000, moveTimer: 0 };
            msgBox.style.display='block'; msgBox.innerText="DOPPELGANGER!"; msgBox.style.color='#aaa';
            setTimeout(()=>msgBox.style.display='none', 1000);
            spawnParticles(bossClone.x, bossClone.y, '#fff', 30, 5);
        }
    },
    // Phase 4
    19: () => { boss.freeze=true; let count=24; for(let i=0; i<count; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/count*i, s:0, accel:0.15, c:'#fff', delay: 30}); setTimeout(() => boss.freeze=false, 500); },
    20: () => { boss.freeze=true; bossShoot({a:boss.angle, s:0, c:'#fff', w:1600, h:30, isLaser:true, warnTime:30, activeTime:60, curve:0.02}); bossShoot({a:boss.angle+Math.PI, s:0, c:'#fff', w:1600, h:30, isLaser:true, warnTime:30, activeTime:60, curve:0.02}); boss.angle += 0.2; }
};

let patternTimer = 0;
let activePatterns = []; 

function pickPatterns() {
    activePatterns = [];
    let p = boss.phase;
    let count = 1;
    if (p === 1 && Math.random() < 0.1) count = 1; 
    if (p === 2 && Math.random() < 0.7) count = 2; 
    if (p === 3) count = Math.random() < 0.8 ? 2 : 3;
    if (p === 4) count = 3;

    // 4페이즈는 서로 다른 패턴 3개
    if (p === 4) {
        let allPatterns = [1,2,3,4,5,6, 7,8,9,10,11, 12,13,14,15,16,17,18, 19,20];
        activePatterns = allPatterns.sort(() => 0.5 - Math.random()).slice(0, 3);
        return;
    }

    let pool = [];
    if (p === 1) pool = [1,2,3,4,5,6]; 
    if (p === 2) pool = [1,2,3,4,5,6, 7,8,9,10,11]; 
    if (p === 3) pool = [1,2,3,4,5,6, 7,8,9,10,11, 12,13,14,15,16,17,18]; 

    for(let i=0; i<count; i++) {
        let idx = Math.floor(Math.random() * pool.length);
        activePatterns.push(pool[idx]);
    }
}

function clearAllPatterns() {
    bullets = bullets.filter(b => !b.isEnemy); 
    activePatterns = []; 
    boss.freeze = false;
    bossClone = null; 
}

function saveGameState() {
    if (state !== 'play' || isRewinding) return;
    let snapshot = {
        player: { ...player }, boss: { ...boss },
        bullets: bullets.map(b => ({...b})), score: score,
        bossClone: bossClone ? { ...bossClone } : null,
        shieldObj: shieldObj ? { ...shieldObj } : null,
        gravityObj: gravityObj ? { ...gravityObj } : null,
        afterimages: afterimages.map(a => ({...a})), 
        gameScreenFilter: gameScreen.style.filter, 
        bgClass: gameScreen.className,
        loopCount: loopCount
    };
    gameStateHistory.push(snapshot);
    if (gameStateHistory.length > MAX_HISTORY) gameStateHistory.shift();
}

function restoreGameState() {
    if (gameStateHistory.length === 0) return;
    let snapshot = gameStateHistory[0]; 
    player.x = snapshot.player.x; player.y = snapshot.player.y;
    player.hp = snapshot.player.hp; player.invul = 60; 
    boss.x = snapshot.boss.x; boss.y = snapshot.boss.y;
    boss.hp = snapshot.boss.hp; boss.phase = snapshot.boss.phase; boss.r = snapshot.boss.r;
    boss.ultState = snapshot.boss.ultState; boss.ultTimer = snapshot.boss.ultTimer;
    bullets = snapshot.bullets.map(b => ({...b})); score = snapshot.score;
    bossClone = snapshot.bossClone ? { ...snapshot.bossClone } : null;
    shieldObj = snapshot.shieldObj ? { ...snapshot.shieldObj } : null;
    gravityObj = snapshot.gravityObj ? { ...snapshot.gravityObj } : null;
    loopCount = snapshot.loopCount;
    gameStateHistory = []; 
    msgBox.style.display = 'block'; msgBox.innerText = "TIME REWIND!"; msgBox.style.color = '#a0f';
    gameScreen.className = 'rewind-effect';
    setTimeout(() => { msgBox.style.display = 'none'; gameScreen.className = ''; }, 1000);
}

function useSkill(id) {
    if (state !== 'play' || skills[id].timer > 0 || isRewinding) return;
    if (id === 11) {
        if(gameStateHistory.length > 0) {
            skills[id].timer = skills[id].cd; isRewinding = true;
            gameScreen.className = 'rewind-effect';
            msgBox.style.display = 'block'; msgBox.innerText = "REWINDING..."; msgBox.style.color = '#fff';
        }
        return;
    }
    skills[id].active = true;
    skills[id].timer = skills[id].cd;
    skills[id].activeTimer = skills[id].duration;

    if (id === 4) shieldObj = { x: player.x, y: player.y - 40, w: 100, maxW: 300, h: 20 }; 
    if (id === 5) { 
        shoot({ x: player.x, y: player.y - 50, a: -Math.PI/2, s: 0, w: 1000, h: 50, isLaser: true, warnTime: 0, activeTime: 10, c: 'cyan', isEnemy: false, damage: 400 });
        player.y = Math.min(790, player.y + 30);
        spawnParticles(player.x, player.y-20, 'cyan', 20, 8);
        gameScreen.classList.add('shake-effect');
        setTimeout(() => gameScreen.classList.remove('shake-effect'), 200);
    }
    if (id === 9) { 
        let targets = bullets.filter(b => b.isEnemy && !b.isLaser && !b.isSuction);
        targets.sort((a,b) => Math.hypot(player.x-a.x, player.y-a.y) - Math.hypot(player.x-b.x, player.y-b.y));
        if (targets.length > 0) createExplosion(targets[0].x, targets[0].y, 150);
        else skills[id].timer = 30; 
    }
    if (id === 10) gravityObj = { x: player.x, y: player.y, r: 200, absorbed: 0 }; 
}

function createExplosion(x, y, radius) {
    explosions.push({x: x, y: y, r: 0, maxR: radius, life: 20});
    spawnParticles(x, y, 'orange', 15, 3);
    bullets.forEach(b => {
        if(b.isEnemy && !b.dead && !b.isLaser && Math.hypot(b.x-x, b.y-y) < radius) {
            b.dead = true;
            spawnParticles(b.x, b.y, b.color, 3, 2);
            score += 10;
            if(Math.random() < 0.2) setTimeout(() => createExplosion(b.x, b.y, radius*0.8), 100);
        }
    });
}

function updateSkills() {
    for(let i=1; i<=11; i++) {
        let s = skills[i];
        if (s.timer > 0) s.timer--;
        if (s.activeTimer > 0) {
            s.activeTimer--;
            if (s.activeTimer <= 0) {
                s.active = false;
                if (i===4) shieldObj = null;
                if (i===10 && gravityObj) { 
                    // ★ 중력장 데미지 너프
                    let dmg = Math.min(gravityObj.absorbed * 20, 800); 
                    let angleToBoss = Math.atan2(boss.y - gravityObj.y, boss.x - gravityObj.x);
                    shoot({
                        x: gravityObj.x, y: gravityObj.y, 
                        a: angleToBoss, 
                        s: 15, r: 60, c: '#a0f', isEnemy: false, damage: dmg
                    });
                    spawnParticles(gravityObj.x, gravityObj.y, '#a0f', 50, 10);
                    gravityObj = null;
                }
            }
        }
        let skillEl = document.getElementById(`skill-${i}`);
        if(skillEl) {
            if(s.active) skillEl.classList.add('active'); else skillEl.classList.remove('active');
            let cdPer = s.timer > 0 ? (s.timer / s.cd * 100) : 0;
            skillEl.querySelector('.cooldown').style.height = `${cdPer}%`;
        }
    }

    if (skills[2].active) { timeScale = 0.2; gameScreen.classList.add('invert-effect'); } 
    else if (skills[7].active) { timeScale = 0; gameScreen.style.filter = "grayscale(100%)"; }
    else { 
        if(boss.ultState === 'none') {
            gameScreen.classList.remove('invert-effect');
            gameScreen.style.filter = ""; 
        }
        timeScale = 1.0;
    }
}

// 페이즈 전환 전조
function checkPhaseTransition(newPhase) {
    if (boss.transitioning || boss.phase === newPhase) return;
    boss.transitioning = true;
    boss.freeze = true;
    clearAllPatterns();
    gameScreen.classList.add('warning-pulse');
    msgBox.style.display = 'block';
    msgBox.innerText = `PHASE ${newPhase} INCOMING...`;
    msgBox.style.color = 'red';

    setTimeout(() => {
        boss.phase = newPhase;
        if(newPhase === 2) startPhase2();
        else if(newPhase === 3) startPhase3();
        else if(newPhase === 4) startPhase4();
        gameScreen.classList.remove('warning-pulse');
        boss.freeze = false;
    }, 2000);
}

function startPhase2() {
    msgBox.innerText = "PHASE 2: GIGANTIC"; msgBox.style.color = 'red';
    gameScreen.classList.add('shake-effect');
    setTimeout(() => { gameScreen.classList.remove('shake-effect'); msgBox.style.display = 'none'; boss.transitioning = false; }, 1500);
    setTimeout(() => {
        for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/8*i, s:0, c:'#f00', w:1600, h:20, isLaser:true, warnTime:40, activeTime:30});
        for(let i=0; i<20; i++) shoot({x:boss.x, y:boss.y, a:Math.random()*7, s:Math.random()*3+2, c:'#ffaa00', r:12}); 
    }, 500);
}

function startPhase3() {
    msgBox.innerText = "PHASE 3: SPEED"; msgBox.style.color = '#a0f';
    gameScreen.classList.add('shake-effect'); 
    setTimeout(() => { gameScreen.classList.remove('shake-effect'); msgBox.style.display = 'none'; boss.transitioning = false; }, 2000);
    for(let i=0; i<6; i++) { setTimeout(() => { shoot({x: 50 + i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100); }
    setTimeout(() => { for(let i=0; i<7; i++) { setTimeout(() => { shoot({x: i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100); } }, 1000);
}

function startPhase4() {
    msgBox.innerText = "PHASE 4: THE ABSOLUTE"; msgBox.style.color = '#fff';
    gameScreen.classList.add('glitch-effect'); 
    setTimeout(() => { gameScreen.classList.remove('glitch-effect'); msgBox.style.display = 'none'; boss.transitioning = false; }, 2000);
    for(let i=0; i<10; i++) setTimeout(() => spawnParticles(Math.random()*600, Math.random()*800, 'white', 50, 10), i*100);
}

// 궁극기 전조
function startBlackHoleWarning() {
    if (boss.ultState !== 'none') return;
    clearAllPatterns();
    boss.ultState = 'warning'; 
    boss.ultTimer = 0;
    boss.freeze = true;
    msgBox.style.display = 'block'; 
    msgBox.innerText = "WARNING: BLACK HOLE"; 
    msgBox.style.color = '#000';
    msgBox.style.textShadow = '0 0 10px #fff'; 
    gameScreen.classList.add('warning-pulse');
}

function startBlackHoleGathering() {
    boss.ultState = 'gathering'; 
    boss.ultTimer = 0;
    msgBox.innerText = "ULTIMATE: EVENT HORIZON"; 
    gameScreen.classList.remove('warning-pulse');
}

function updateBlackHole() {
    boss.ultTimer += timeScale; 
    boss.x += (300 - boss.x) * 0.1 * timeScale;
    boss.y += (400 - boss.y) * 0.1 * timeScale;

    if (boss.ultState === 'warning') {
        if (boss.ultTimer > 150) startBlackHoleGathering();
        return;
    }

    let dx = boss.x - player.x; let dy = boss.y - player.y;
    let dist = Math.hypot(dx, dy);
    let pullStrength = 4.5; 
    if (dist > 0) {
        player.x += (dx / dist) * pullStrength * timeScale;
        player.y += (dy / dist) * pullStrength * timeScale;
    }

    if (frame % 4 === 0) {
        let angle = Math.random() * Math.PI * 2; let r = 500; 
        shoot({
            x: 300 + Math.cos(angle) * r, y: 400 + Math.sin(angle) * r,
            a: angle + Math.PI, s: 4 + Math.random() * 3, c: '#90f', r: 6, isSuction: true 
        });
    }

    if (boss.ultTimer > 480) triggerExplosion(dist);
}

function triggerExplosion(playerDist) {
    boss.ultState = 'none'; boss.freeze = false; boss.ultTimer = 0;
    msgBox.style.display = 'none'; 
    gameScreen.classList.add('shake-effect');
    setTimeout(() => gameScreen.classList.remove('shake-effect'), 500);
    for(let i=0; i<5; i++) spawnParticles(boss.x, boss.y, '#a0f', 50, 15);

    if (playerDist < 250 && !godMode && player.invul <= 0 && !skills[1].active) {
        let damage = Math.floor((250 - playerDist) / 40); 
        if (damage < 1) damage = 1;
        player.hp -= damage; player.invul = 90; 
        gameScreen.style.backgroundColor = 'white'; 
        setTimeout(()=>gameScreen.style.backgroundColor='', 200);
        if (player.hp <= 0) state = 'over';
    }
    bullets = [];
}

function update() {
    if (isRewinding) {
        for(let k=0; k<3; k++) {
            if(gameStateHistory.length > 0) {
                let snapshot = gameStateHistory.pop();
                player.x = snapshot.player.x; player.y = snapshot.player.y;
                player.hp = snapshot.player.hp;
                boss.x = snapshot.boss.x; boss.y = snapshot.boss.y;
                boss.hp = snapshot.boss.hp; boss.phase = snapshot.boss.phase; boss.r = snapshot.boss.r;
                boss.ultState = snapshot.boss.ultState; boss.ultTimer = snapshot.boss.ultTimer;
                bullets = snapshot.bullets.map(b => ({...b}));
                bossClone = snapshot.bossClone ? { ...snapshot.bossClone } : null;
                shieldObj = snapshot.shieldObj ? { ...snapshot.shieldObj } : null;
                gravityObj = snapshot.gravityObj ? { ...snapshot.gravityObj } : null;
                afterimages = snapshot.afterimages.map(a => ({...a}));
                score = snapshot.score;
            } else {
                isRewinding = false;
                gameScreen.className = '';
                msgBox.style.display = 'none';
                break;
            }
        }
        return;
    }

    if (state !== 'play') return;
    saveGameState();
    frame++; 
    updateSkills();
    
    if (player.invul > 0) player.invul--;
    if (player.slowTimer > 0) player.slowTimer--;
    
    player.regenTimer++;
    if (player.regenTimer > 600) { 
        player.regenTimer = 0;
        if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 0.5);
    }

    stars.forEach(s => {
        let warp = (skills[2].active || boss.phase >= 3) ? 5 : 1;
        s.y += s.speed * warp * timeScale;
        if(s.y > 800) { s.y = 0; s.x = Math.random() * 600; }
    });

    let skillSpeedMod = skills[1].active ? 0.2 : 1.0;
    let baseSpd = (keys['ShiftLeft']||keys['ShiftRight'] ? 2 : 5) * (player.slowTimer > 0 ? 0.5 : 1) * skillSpeedMod;

    if (skills[2].active) {
        if (frame % 3 === 0 && (keys['ArrowLeft']||keys['ArrowRight']||keys['ArrowUp']||keys['ArrowDown'])) {
            afterimages.push({x: player.x, y: player.y, alpha: 0.8});
        }
    } else {
        afterimages.forEach(img => img.alpha -= 0.05);
        afterimages = afterimages.filter(i => i.alpha > 0);
    }

    if(keys['ArrowLeft'] && player.x>5) player.x-=baseSpd;
    if(keys['ArrowRight'] && player.x<595) player.x+=baseSpd;
    if(keys['ArrowUp'] && player.y>5) player.y-=baseSpd;
    if(keys['ArrowDown'] && player.y<795) player.y+=baseSpd;
    
    if (!skills[2].active && frame % 5 === 0) {
        let aimA = -Math.PI/2;
        if (skills[6].active) aimA = Math.atan2(boss.y - player.y, boss.x - player.x);
        shoot({x:player.x-10, y:player.y, a:aimA, s:15, r:3, c:'#afa', isEnemy:false});
        shoot({x:player.x+10, y:player.y, a:aimA, s:15, r:3, c:'#afa', isEnemy:false});
    }

    if (boss.ultState !== 'none') {
        updateBlackHole();
        if(bossClone) bossClone = null;
    } else {
        if (!boss.transitioning && !boss.freeze) {
            boss.moveTimer += timeScale; 
            let moveSpd = boss.phase === 3 ? 1.5 : 1.0;
            boss.x = 300 + Math.cos(boss.moveTimer/120 * moveSpd)*150;
            boss.y = 150 + Math.sin(boss.moveTimer/80 * moveSpd)*50;
        }

        if (bossClone) {
            bossClone.moveTimer += timeScale;
            bossClone.x = 300 - Math.cos(bossClone.moveTimer/120)*150; 
            bossClone.y = 150 + Math.sin(bossClone.moveTimer/80)*50;
        }

        if (!boss.transitioning) {
            patternTimer += timeScale; 
            if (patternTimer > 200) { 
                patternTimer = 0;
                pickPatterns();
            }
            activePatterns.forEach(pat => {
                if (patterns[pat]) {
                    if (!patterns[pat].cooldown) patterns[pat].cooldown = 0;
                    patterns[pat].cooldown -= timeScale;

                    if (patterns[pat].cooldown <= 0) {
                        let freq = 10;
                        if ([8, 10, 12, 14, 15, 16, 17, 18, 19, 20].includes(pat)) freq = 999;
                        patterns[pat](); 
                        patterns[pat].cooldown = freq; 
                    }
                }
            });
            
            if (boss.phase >= 3 && frame % 600 === 0 && Math.random() < 0.4) {
                startBlackHoleWarning();
            }
        }
    }

    if (boss.hp <= 0) {
        loopCount++;
        score += 50000; 
        boss.hp = boss.maxHp; 
        msgBox.style.display = 'block';
        msgBox.innerText = `LOOP ${loopCount} START!`;
        msgBox.style.color = '#fff';
        setTimeout(() => msgBox.style.display='none', 2000);
        spawnParticles(boss.x, boss.y, 'white', 100, 10);
        clearAllPatterns();
        bullets = []; 
    }

    let hpR = boss.hp/boss.maxHp;
    let newPhase = 1;
    if (hpR <= 0.25) newPhase = 4;
    else if (hpR <= 0.50) newPhase = 3;
    else if (hpR <= 0.75) newPhase = 2;

    if(boss.phase !== newPhase && !boss.transitioning) {
        checkPhaseTransition(newPhase);
    }

    if (boss.phase === 2) boss.r = boss.baseR * 1.5; 
    else if (boss.phase === 3) boss.r = boss.baseR * 0.8; 
    else boss.r = boss.baseR;
    
    uiHp.style.width = (hpR*100)+'%';
    uiHp.style.background = getPhaseColor();
    
    scoreBox.innerText = `SCORE: ${score}`;
    let fullHearts = "♥".repeat(Math.floor(player.hp));
    let halfHeart = (player.hp % 1 !== 0) ? "♡" : "";
    hpBox.innerText = fullHearts + halfHeart;

    for (let i=0; i<bullets.length; i++) {
        let b = bullets[i];
        if(b.dead) continue;

        let localTimeScale = b.isEnemy ? timeScale : 1.0;
        if (skills[7].active && !b.isEnemy) localTimeScale = 0;

        b.timer += localTimeScale;
        if (b.lifeTime && b.timer > b.lifeTime) { b.dead = true; continue; }
        if (b.isLaser && b.timer > b.warnTime + b.activeTime) { b.dead = true; continue; }

        if (b.warnTime > 0 && b.timer < b.warnTime) {
            if(b.homing && b.isEnemy) {
                let target = b.isEnemy ? player : boss;
                b.angle = Math.atan2(target.y - b.y, target.x - b.x);
            }
            continue; 
        }

        if(b.accel) b.speed += b.accel * localTimeScale;
        if(b.delay > 0) { b.delay -= localTimeScale; continue; }
        
        if(b.homing && b.isEnemy) {
            let targetA = Math.atan2(player.y - b.y, player.x - b.x);
            let diff = targetA - b.angle;
            while(diff < -Math.PI) diff += Math.PI*2;
            while(diff > Math.PI) diff -= Math.PI*2;
            b.angle += diff * b.homing * localTimeScale;
        }
        if(b.curve) b.angle += b.curve * localTimeScale;

        b.vx = Math.cos(b.angle) * b.speed * localTimeScale;
        b.vy = Math.sin(b.angle) * b.speed * localTimeScale;
        b.x += b.vx; b.y += b.vy;

        if(b.bounce > 0 && (b.x<0 || b.x>600)) { b.vx*=-1; b.angle=Math.PI-b.angle; b.bounce--; b.x+=b.vx; }
        if(b.x<-100 || b.x>700 || b.y<-100 || b.y>900) b.dead = true;

        if (b.isEnemy) {
            if (skills[3].active && !b.isLaser && !b.isSuction) {
                let dist = Math.hypot(player.x - b.x, player.y - b.y);
                if (dist < 400) { 
                    b.isEnemy = false; b.color = 'cyan'; b.angle = angleToP(b) + Math.PI; 
                    continue;
                }
            }
            if (shieldObj && !b.isLaser && !b.isSuction) {
                if (b.x > shieldObj.x - shieldObj.w/2 && b.x < shieldObj.x + shieldObj.w/2 &&
                    b.y > shieldObj.y - shieldObj.h/2 && b.y < shieldObj.y + shieldObj.h/2) {
                    b.vy *= -1; b.angle = Math.atan2(b.vy, b.vx);
                    b.isEnemy = false; b.color = 'yellow';
                    if (shieldObj.w < shieldObj.maxW) shieldObj.w += 5;
                    continue;
                }
            }
            if (gravityObj && !b.isLaser && !b.isSuction) {
                let dist = Math.hypot(gravityObj.x - b.x, gravityObj.y - b.y);
                if (dist < gravityObj.r) {
                    b.x += (gravityObj.x - b.x) * 0.1; b.y += (gravityObj.y - b.y) * 0.1;
                    b.r -= 0.5; if(b.r<=0) b.dead=true;
                    gravityObj.r -= 0.5; gravityObj.absorbed++;
                    if(gravityObj.r <= 0) gravityObj = null;
                    continue;
                }
            }

            let hit = false;
            let dist = 0;
            if (b.isLaser) {
                 if (b.timer >= b.warnTime) {
                     let timeLeft = (b.warnTime + b.activeTime) - b.timer;
                     let currentH = b.h;
                     if(timeLeft < 10) currentH = b.h * (timeLeft/10);
                     let dx = player.x - b.x; let dy = player.y - b.y;
                     let rx = dx * Math.cos(-b.angle) - dy * Math.sin(-b.angle);
                     let ry = dx * Math.sin(-b.angle) + dy * Math.cos(-b.angle);
                     if (rx >= 0 && rx <= b.w && Math.abs(ry) <= currentH/2 + player.hitboxSize) hit = true;
                 }
            } else {
                dist = Math.hypot(b.x-player.x, b.y-player.y);
                if (dist < player.hitboxSize + b.r) hit = true;
            }

            if(hit) {
                if (b.isSuction) {
                    player.slowTimer = 50; b.dead = true; 
                } else {
                    let isInvulSkill = skills[1].active;
                    let bossCol = (boss.ultState !== 'none') && (Math.hypot(player.x-boss.x, player.y-boss.y) < boss.r);
                    if (!bossCol && player.invul <= 0 && !godMode && !isInvulSkill) {
                        player.hp--;
                        player.invul = 90; player.slowTimer = 60;
                        gameScreen.style.backgroundColor = '#300';
                        spawnParticles(player.x, player.y, 'red', 20, 5);
                        setTimeout(()=>gameScreen.style.backgroundColor='', 100);
                        if(player.hp <= 0) state = 'over';
                    }
                }
            } else if (!b.isLaser && !b.isSuction && dist < 20 && !b.grazed) { 
                score += 5; b.grazed = true; 
            }

        } else {
            let hitAny = false;
            let dmg = b.damage || 3;
            if(Math.abs(b.x-boss.x)<30 && Math.abs(b.y-boss.y)<30) {
                if(boss.ultState === 'none') {
                    boss.hp -= dmg; 
                    score += 50; hitAny = true;
                    spawnText(boss.x, boss.y - 30, dmg, '#fff', 15);
                    spawnParticles(b.x, b.y, 'cyan', 2, 2);
                    if (skills[8].active) player.hp = Math.min(player.maxHp, player.hp + 0.05);
                } else {
                    spawnText(boss.x, boss.y - 30, "IMMUNE", '#ccc', 12);
                    hitAny = true;
                }
            }
            if(bossClone) {
                if(Math.hypot(b.x-bossClone.x, b.y-bossClone.y) < bossClone.r) {
                    bossClone.hp -= dmg; score += 20; hitAny = true;
                    spawnParticles(b.x, b.y, 'white', 2, 2);
                    if(bossClone.hp <= 0) { 
                        bossClone = null;
                        spawnParticles(b.x, b.y, 'gray', 30, 5);
                    }
                }
            }
            if(hitAny && !b.isLaser) b.dead = true;
        }
    }
    bullets = bullets.filter(b => !b.dead);
    
    explosions.forEach(e => { e.r += 5; e.life--; });
    explosions = explosions.filter(e => e.life > 0);

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; p.size *= 0.95; });
    particles = particles.filter(p => p.life > 0);

    texts.forEach(t => { t.y += t.vy; t.life--; t.vy *= 0.9; });
    texts = texts.filter(t => t.life > 0);
}

function draw() {
    ctx.clearRect(0,0,600,800);
    
    ctx.fillStyle = '#555';
    stars.forEach(s => {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI*2); ctx.fill();
    });

    afterimages.forEach((img, i) => {
        ctx.save(); ctx.globalAlpha = img.alpha;
        ctx.fillStyle = 'cyan'; ctx.fillRect(img.x-15, img.y-15, 30, 30);
        ctx.restore(); 
        if (!skills[2].active) img.alpha -= 0.05;
    });
    if (!skills[2].active) afterimages = afterimages.filter(i => i.alpha > 0);

    // ★ 레이어 순서: 배경 -> 잔상 -> 설치물 -> 탄환 -> 분신 -> 보스 -> 파티클
    if (shieldObj) {
        ctx.save();
        ctx.translate(shieldObj.x, shieldObj.y);
        ctx.strokeStyle = 'cyan'; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = 'cyan';
        ctx.strokeRect(-shieldObj.w/2, -shieldObj.h/2, shieldObj.w, shieldObj.h);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.fillRect(-shieldObj.w/2, -shieldObj.h/2, shieldObj.w, shieldObj.h);
        ctx.restore();
    }
    
    if (gravityObj) {
        ctx.save(); ctx.translate(gravityObj.x, gravityObj.y);
        ctx.strokeStyle = '#a0f'; ctx.lineWidth = 2; 
        ctx.beginPath(); ctx.arc(0, 0, gravityObj.r, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(100,0,255,0.1)'; ctx.fill();
        ctx.restore();
    }

    bullets.forEach(b => {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
        if (b.warnTime > 0 && b.timer < b.warnTime) {
            ctx.globalAlpha = 0.2; ctx.fillStyle = b.color;
            if(b.isLaser) ctx.fillRect(0, -b.h/2, b.w, b.h); 
            else { 
                ctx.beginPath(); ctx.arc(0,0,2,0,Math.PI*2); ctx.fill();
                ctx.strokeStyle=b.color; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(50,0); ctx.stroke();
            }
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillStyle = b.color;
            if(b.isLaser) {
                let timeLeft = (b.warnTime + b.activeTime) - b.timer;
                let currentH = b.h;
                let appearTime = b.timer - b.warnTime;
                if (appearTime < 5) currentH = b.h * (appearTime/5);
                if (timeLeft < 10) currentH = b.h * (timeLeft/10);
                ctx.shadowBlur = 15; ctx.shadowColor = b.color;
                ctx.fillRect(0, -currentH/2, b.w, currentH);
                ctx.fillStyle = '#fff'; ctx.fillRect(0, -currentH/4, b.w, currentH/2);
            } else {
                ctx.beginPath(); ctx.arc(0,0,b.r,0,Math.PI*2); ctx.fill();
            }
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    });

    if (bossClone) {
        ctx.save();
        ctx.globalAlpha = 0.5; // ★ 분신 반투명
        ctx.translate(bossClone.x, bossClone.y);
        let color = getPhaseColor();
        ctx.shadowBlur = 20; ctx.shadowColor = color;
        ctx.fillStyle = color; 
        ctx.beginPath(); ctx.arc(0, 0, boss.r, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }

    if (boss.ultState === 'gathering') {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        let rotateSpd = frame * 0.1;
        ctx.strokeStyle = '#a0f'; ctx.lineWidth = 2;
        for(let i=0; i<5; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, 50 + i*15 + Math.sin(rotateSpd + i)*5, 0 + rotateSpd, Math.PI + rotateSpd);
            ctx.stroke();
        }
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0,0, 40, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
    }

    // ★ 보스 (맨 위)
    if(boss.ultState === 'none' || boss.ultState === 'warning') {
        let color = getPhaseColor();
        ctx.shadowBlur = 20; ctx.shadowColor = color;
        ctx.fillStyle = color; 
        ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    explosions.forEach(e => {
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.strokeStyle = 'orange'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
    });

    particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = p.life / 50;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    });

    if (player.invul <= 0 || frame % 4 < 2) {
        ctx.fillStyle = player.slowTimer > 0 ? '#555' : 'red'; 
        ctx.fillRect(player.x-15, player.y-15, 30, 30);
        ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(player.x,player.y,player.hitboxSize,0,Math.PI*2); ctx.fill();
        if (skills[3].active) { ctx.strokeStyle = 'lime'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(player.x, player.y, 400, 0, 2*Math.PI); ctx.stroke(); }
        if (skills[1].active) { ctx.strokeStyle = 'gold'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(player.x, player.y, 40, 0, 2*Math.PI); ctx.stroke(); }
        if (isRewinding) { ctx.fillStyle = '#0f0'; ctx.fillRect(player.x-15, player.y-15, 30, 30); }
    }
    
    texts.forEach(t => {
        ctx.fillStyle = t.color; ctx.font = `bold ${t.size}px Arial`;
        ctx.fillText(t.text, t.x, t.y);
    });

    if(state !== 'play') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,600,800);
        ctx.fillStyle = '#fff'; ctx.font = '50px Courier'; ctx.textAlign='center';
        if (state === 'clear') {
            ctx.fillText("VICTORY!", 300, 350);
            if(frame % 20 === 0) spawnParticles(Math.random()*600, Math.random()*600, `hsl(${Math.random()*360},100%,50%)`, 50, 5);
        } else {
            ctx.fillText("GAME OVER", 300, 400);
        }
        ctx.font = '20px Courier'; ctx.fillText("Press [R] to Retry", 300, 450);
    }
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
function angleToP(origin) { return Math.atan2(player.y-origin.y, player.x-origin.x); }
function resetGame() {
    boss.hp = boss.maxHp; boss.phase = 1; score = 0; 
    player.hp = player.maxHp; player.invul = 0; player.slowTimer = 0; player.regenTimer = 0;
    bullets.length=0; bossClone=null; state='play'; patternTimer = 0; boss.transitioning = false; boss.freeze=false; boss.moveTimer=0;
    boss.ultState='none'; timeScale = 1.0;
    shieldObj = null; gravityObj = null; loopCount = 0;
    afterimages = []; explosions = []; particles = []; texts = []; gameStateHistory = [];
    for(let i=1; i<=11; i++) { skills[i].timer = 0; skills[i].active = false; }
    
    msgBox.style.display = 'none';
    gameScreen.className = '';
    gameScreen.style.filter = "";
}

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && state !== 'play') resetGame();
    if (e.code === 'KeyT') { godMode = !godMode; adminMsg.style.display = godMode ? 'block' : 'none'; }
    if (e.code === 'Digit1') useSkill(1); if (e.code === 'Digit2') useSkill(2);
    if (e.code === 'Digit3') useSkill(3); if (e.code === 'Digit4') useSkill(4);
    if (e.code === 'Digit5') useSkill(5); if (e.code === 'Digit6') useSkill(6);
    if (e.code === 'Digit7') useSkill(7); if (e.code === 'Digit8') useSkill(8);
    if (e.code === 'Digit9') useSkill(9); if (e.code === 'Digit0') useSkill(10);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') useSkill(11);
});
window.addEventListener('keyup', e=>keys[e.code]=false);
loop();
