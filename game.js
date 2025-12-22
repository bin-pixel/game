const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const uiHp = document.getElementById('boss-hp-bar');
const uiHpText = document.getElementById('boss-hp-text');
const scoreBox = document.getElementById('score-box');
const hpBox = document.getElementById('hp-box');
const msgBox = document.getElementById('msg-box');
const adminMsg = document.getElementById('admin-msg');
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
let showScoreLines = false; 

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
    hp: 10000, maxHp: 10000, 
    phase: 1, angle: 0,
    transitioning: false, freeze: false, moveTimer: 0,
    patternCooldown: 0 
};

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

// 스킬 ID 12: 패링 추가
const skills = {
    1: { name: '무적', cd: 900, duration: 180, active: false, timer: 0 }, 
    2: { name: '산데', cd: 1200, duration: 300, active: false, timer: 0 }, 
    3: { name: '반사', cd: 600, duration: 6, active: false, timer: 0 }, 
    4: { name: '방패', cd: 900, duration: 600, active: false, timer: 0 }, 
    5: { name: '레일건', cd: 300, duration: 30, active: false, timer: 0 }, 
    7: { name: '동결', cd: 1800, duration: 240, active: false, timer: 0 }, 
    10: { name: '중력장', cd: 1200, duration: 300, active: false, timer: 0 }, 
    11: { name: '리콜', cd: 3600, duration: 0, active: false, timer: 0 },
    12: { name: '패링', cd: 180, duration: 15, active: false, timer: 0 } // 3초 쿨, 0.25초 지속
};

const patternNames = {
    1: "Spiral", 2: "Ring", 3: "Aimed", 4: "Windmill", 5: "Rain", 6: "Accel",
    7: "Giant Bounce", 8: "Snipe", 9: "DNA", 10: "Giant Bomb", 11: "Giant Fan",
    12: "Aimed Laser", 13: "Homing", 14: "Cross Laser", 15: "Trap", 
    16: "Spin Laser", 17: "Aimed Thunder", 
    19: "Time Stop", 20: "White Laser", 21: "Satellite Shield"
};

function getPhaseColor() {
    if (boss.phase === 1) return '#00ccff';
    if (boss.phase === 2) return '#ff3333';
    if (boss.phase === 3) return '#aa00ff';
    return '#ffffff';
}

function getBulletColor() {
    if (boss.phase === 1) return '#ff9999';
    if (boss.phase === 2) return '#66ff66'; 
    if (boss.phase === 3) return '#ffff66'; 
    return '#ff0000';
}

// 점수 배율: 하단부에 촘촘하게 배치 (Zone 1~2), 상단 150px 이상 Zone 5
function getScoreMultiplier() {
    // 800(바닥) ~ 600: 1점
    if (player.y >= 600) return 1;
    // 600 ~ 450: 2점
    if (player.y >= 450) return 2;
    // 450 ~ 300: 3점
    if (player.y >= 300) return 3;
    // 300 ~ 150: 4점
    if (player.y >= 150) return 4;
    // 0 ~ 150: 5점
    return 5;
}

window.setPhase = function(p) {
    boss.phase = p;
    if (p === 1) boss.hp = boss.maxHp;
    if (p === 2) boss.hp = boss.maxHp * 0.75; 
    if (p === 3) boss.hp = boss.maxHp * 0.50;
    if (p === 4) boss.hp = boss.maxHp * 0.25; 

    clearAllPatterns();
    bullets = [];
    boss.transitioning = false; 
    boss.freeze = false;
    gameScreen.className = ''; 
    
    if(p===2) startPhase2();
    else if(p===3) startPhase3();
    else if(p===4) startPhase4();
    
    msgBox.style.display = 'block';
    msgBox.innerText = `ADMIN: SET PHASE ${p}`;
    setTimeout(() => msgBox.style.display='none', 1000);
}

function updateDebugPanel() {
    if(!godMode) return;
    let now = Date.now();
    let delta = now - lastTime;
    lastTime = now;
    if(frame % 10 === 0) dFps.innerText = Math.round(1000/delta);
    dHp.innerText = Math.floor(boss.hp);
    dPhase.innerText = boss.phase;
    let listHtml = "";
    activePatterns.forEach(pid => { listHtml += `<li>[${pid}] ${patternNames[pid]}</li>`; });
    dPatterns.innerHTML = listHtml;
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
    if (p.isLaser) {
        width = 1600;
        // 3,4페이즈 레이저 두께 강화
        if (boss.phase >= 3) {
            p.h = (p.h || 20) * 1.5;
        }
    }
    let color = (p.isLaser) ? getPhaseColor() : (p.c || getBulletColor());
    
    // 탄환 수명: 속도에 반비례 (2.0속도 -> 긴 수명, 6.0속도 -> 짧은 수명)
    // 수동 지정 lifeTime이 있으면 그걸 최우선
    let speedVal = Math.abs(p.s);
    let calcLife = 1200 - (speedVal * 80); 
    if (calcLife < 400) calcLife = 400; // 최소 6초
    if (p.lifeTime) calcLife = p.lifeTime;

    bullets.push({
        x: p.x, y: p.y, speed: p.s, angle: p.a,
        r: p.r || 4, color: color,
        accel: p.accel || 0, curve: p.curve || 0, homing: p.homing || 0,
        isLaser: p.isLaser || false, w: width, h: p.h || 20, 
        warnTime: p.warnTime || 0, activeTime: p.activeTime || 30, 
        lifeTime: p.homing ? 300 : calcLife, timer: 0, 
        bounce: p.bounce || 0, delay: p.delay || 0, grazed: false, 
        isEnemy: p.isEnemy !== undefined ? p.isEnemy : true,
        damage: p.damage || 3,
        isBossShield: p.isBossShield || false,
        shieldHp: p.shieldHp || 0,
        orbitAngle: p.orbitAngle || 0,
        distFromBoss: p.distFromBoss || 0,
        isRailgun: p.isRailgun || false
    });
}

function bossShoot(p) {
    if (p.x === undefined) shoot({ ...p, x: boss.x, y: boss.y });
    else shoot(p);
}

// Patterns
const patterns = {
    1: () => { boss.freeze=false; for(let i=0; i<6; i++) bossShoot({a:boss.angle+i*1.0, s:2.0}); boss.angle+=0.1; },
    2: () => { boss.freeze=false; for(let i=0; i<16; i++) bossShoot({a:Math.PI*2/16*i, s:1.5}); },
    3: () => { boss.freeze=true;  let aim=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:aim+i*0.2, s:3.0}); }, 
    4: () => { boss.freeze=false; bossShoot({a:boss.angle, s:2.0, curve:0.01}); bossShoot({a:boss.angle+Math.PI, s:2.0, curve:0.01}); boss.angle+=0.15; },
    5: () => { boss.freeze=false; shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:2.0}); }, 
    6: () => { boss.freeze=true;  let a=angleToP(boss); bossShoot({a:a, s:1.5, accel:0.03}); }, 
    
    // 패턴 7: 거대 탄환 (물리감 개선: 무게감 있게)
    7: () => { 
        boss.freeze=false;
        for(let i=0; i<3; i++) bossShoot({a:Math.PI*2/3*i+boss.angle, s:3.0, r:20, bounce:1, accel:-0.01}); // 감속 추가
        boss.angle+=0.05; 
    }, 
    8: () => { boss.freeze=true; bossShoot({a:angleToP(boss), s:6, r:30, warnTime:60}); }, 
    9: () => { boss.freeze=false; for(let i=0; i<2; i++) bossShoot({a:boss.angle+Math.PI*i*0.8, s:4.0, r:15, curve:0.02}); boss.angle+=0.1; },
    10: () => { 
        boss.freeze=false;
        let bx = Math.random()*600, by = Math.random()*300;
        let aimA = Math.atan2(player.y - by, player.x - bx);
        shoot({x:bx, y:by, a:aimA, s:0, accel:0.1, r:25, warnTime:50}); 
    },
    11: () => { boss.freeze=true;
        let a=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:a+i*0.5, s:4.5, r:18, bounce:1});
    }, 
    
    // 패턴 12: 조준 레이저 (순차 발사)
    12: () => { 
        boss.freeze=false;
        for(let i=0; i<5; i++) {
            setTimeout(() => {
                let aim = angleToP(boss); // 그때그때 조준
                shoot({x:boss.x, y:boss.y, a:aim, s:0, w:1600, h:15, isLaser:true, warnTime:40, activeTime:20});
            }, i*150);
        }
    }, 
    13: () => { boss.freeze=false; bossShoot({a:angleToP(boss), s:3.5, homing:0.04}); }, 
    // 패턴 14: 십자 레이저 (조준 & 순차)
    14: () => { 
        boss.freeze=false;
        let aim = angleToP(boss);
        shoot({x:boss.x, y:boss.y, a:aim, s:0, w:1600, h:30, isLaser:true, warnTime:60, activeTime:30}); 
        setTimeout(() => {
            shoot({x:boss.x, y:boss.y, a:aim + Math.PI/2, s:0, w:1600, h:30, isLaser:true, warnTime:60, activeTime:30});
        }, 300);
    }, 
    15: () => { boss.freeze=true;  let r=200;
        for(let i=0; i<8; i++) shoot({x:player.x+Math.cos(i)*r, y:player.y+Math.sin(i)*r, a:Math.atan2(-Math.sin(i), -Math.cos(i)), s:2.0, accel:0.05, homing:0.01, warnTime:40});
    }, 
    // 패턴 16: 회전 레이저 (속도 반감, 보스 고정)
    16: () => { 
        boss.freeze=true; 
        let laserW = 1600; let startAngle = boss.angle;
        // curve 반감 (0.015 -> 0.007)
        for(let i=0; i<4; i++) shoot({x:boss.x, y:boss.y, a:startAngle+(Math.PI/2)*i, s:0, w:laserW, h:15, isLaser:true, warnTime:50, activeTime:90, curve:-0.007});
    }, 
    // 패턴 17: 대각선 레이저 (정밀 조준, 순차)
    17: () => { 
        boss.freeze=false; 
        for(let i=0; i<3; i++) {
            setTimeout(() => {
                let sx = Math.random()*600;
                let sy = Math.random()*100; 
                let angle = Math.atan2(player.y - sy, player.x - sx); // 플레이어 정확 조준
                shoot({x:sx, y:sy, a:angle, s:0, w:1600, h:40, isLaser:true, warnTime:60, activeTime:30});
            }, i*200);
        }
    },
    
    19: () => { boss.freeze=true; let count=24;
        for(let i=0; i<count; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/count*i, s:0, accel:0.15, c:'#fff', delay: 30}); setTimeout(() => boss.freeze=false, 500);
    },
    // 패턴 20: 거대 회전 레이저 (4페이즈, 속도 반감, 보스 고정)
    20: () => { 
        boss.freeze=true; 
        // curve 반감 (0.02 -> 0.01)
        bossShoot({a:boss.angle, s:0, c:'#fff', w:1600, h:30, isLaser:true, warnTime:30, activeTime:90, curve:0.01});
        bossShoot({a:boss.angle+Math.PI, s:0, c:'#fff', w:1600, h:30, isLaser:true, warnTime:30, activeTime:90, curve:0.01}); 
        boss.angle += 0.2;
    },
    // 패턴 21 삭제됨 (주황 탄환 제거)
    21: () => {} 
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
    if (p === 4) count = (Math.random() < 0.1) ? 4 : 3;
    
    let pool = [];
    if (p === 1) pool = [1,2,3,4,5,6]; 
    if (p === 2) pool = [1,2,3,4,5,6, 7,8,9,10,11]; // 21 삭제
    if (p === 3) pool = [1,2,3,4,5,6, 7,8,9,10,11, 12,14,15,16,17]; // 13 삭제
    if (p === 4) {
        // 21 삭제
        pool = [1,2,3,4,5,6, 7,8,9,10,11, 12,14,15,16,17, 19,20];
    }

    // 2페이즈 멍때림 방지: 풀이 비어있지 않다면 무조건 뽑음
    if (pool.length > 0) {
        for(let i=0; i<count; i++) {
            let idx = Math.floor(Math.random() * pool.length);
            activePatterns.push(pool[idx]);
        }
    } else {
        // 혹시라도 비어있으면 기본 1번
        activePatterns.push(1);
    }
}

function clearAllPatterns() {
    bullets = bullets.filter(b => !b.isEnemy); 
    activePatterns = []; 
    boss.freeze = false;
}

function saveGameState() {
    if (state !== 'play' || isRewinding) return;
    let snapshot = {
        player: { ...player }, boss: { ...boss },
        bullets: bullets.map(b => ({...b})), score: score,
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
    bullets = snapshot.bullets.map(b => ({...b})); score = snapshot.score;
    shieldObj = snapshot.shieldObj ? { ...snapshot.shieldObj } : null;
    gravityObj = snapshot.gravityObj ? { ...snapshot.gravityObj } : null;
    loopCount = snapshot.loopCount;
    gameStateHistory = []; 
    msgBox.style.display = 'block'; msgBox.innerText = "TIME REWIND!"; msgBox.style.color = '#a0f';
    gameScreen.className = 'rewind-effect';
    setTimeout(() => { msgBox.style.display = 'none'; gameScreen.className = ''; }, 1000);
}

function useSkill(id) {
    if (state !== 'play' || skills[id] === undefined || skills[id].timer > 0 || isRewinding) return;
    if (id === 11) {
        if(gameStateHistory.length > 0) {
            skills[id].timer = skills[id].cd;
            isRewinding = true;
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
        shoot({ x: player.x, y: player.y - 50, a: -Math.PI/2, s: 0, w: 1500, h: 80, isLaser: true, warnTime: 0, activeTime: 10, c: 'cyan', isEnemy: false, damage: 400, isRailgun: true });
        player.y = Math.min(790, player.y + 30);
        spawnParticles(player.x, player.y-20, 'cyan', 20, 8);
        gameScreen.classList.add('shake-effect');
        setTimeout(() => gameScreen.classList.remove('shake-effect'), 200);
    }
    if (id === 10) gravityObj = { x: player.x, y: player.y, r: 200, absorbed: 0 };
    
    // 패링 스킬 이펙트 (즉발성)
    if (id === 12) {
        spawnParticles(player.x, player.y - 30, '#fff', 15, 6);
    }
}

function createExplosion(x, y, radius) {
    explosions.push({x: x, y: y, r: 0, maxR: radius, life: 20});
    spawnParticles(x, y, 'orange', 15, 3);
    bullets.forEach(b => {
        if(b.isEnemy && !b.dead && !b.isLaser && Math.hypot(b.x-x, b.y-y) < radius) {
            b.dead = true;
            spawnParticles(b.x, b.y, b.color, 3, 2);
        }
    });
}

function updateSkills() {
    [1, 2, 3, 4, 5, 7, 10, 11, 12].forEach(i => {
        let s = skills[i];
        if (s.timer > 0) s.timer--;
        if (s.activeTimer > 0) {
            s.activeTimer--;
            if (s.activeTimer <= 0) {
                s.active = false;
                if (i===4) shieldObj = null;
                if (i===10 && gravityObj) { 
                    let dmg = Math.min(gravityObj.absorbed * 10, 400); 
                    let angleToBoss = Math.atan2(boss.y - gravityObj.y, boss.x - gravityObj.x);
                    shoot({
                        x: gravityObj.x, y: gravityObj.y, a: angleToBoss, 
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
    });

    if (skills[2].active) { timeScale = 0.2; gameScreen.classList.add('invert-effect'); } 
    else if (skills[7].active) { timeScale = 0; gameScreen.style.filter = "grayscale(100%)"; }
    else { 
        gameScreen.classList.remove('invert-effect');
        gameScreen.style.filter = "";
        timeScale = 1.0;
    }
}

function checkPhaseTransition(newPhase) {
    if (boss.transitioning || boss.phase === newPhase) return;
    
    // 페이즈 클리어 보너스
    let bonus = 0;
    if(newPhase === 2) bonus = 800;
    if(newPhase === 3) bonus = 1000;
    if(newPhase === 4) bonus = 1200;
    if(bonus > 0) {
        score += bonus;
        spawnText(player.x, player.y - 40, `BONUS +${bonus}`, '#ffd700', 20);
    }

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
    for(let i=0; i<6; i++) {
        setTimeout(() => { shoot({x: 50 + i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100);
    }
    setTimeout(() => {
        for(let i=0; i<7; i++) {
            setTimeout(() => { shoot({x: i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100);
        }
    }, 1000);
}

function startPhase4() {
    msgBox.innerText = "PHASE 4: THE ABSOLUTE"; msgBox.style.color = '#fff';
    gameScreen.classList.add('glitch-effect');
    setTimeout(() => { gameScreen.classList.remove('glitch-effect'); msgBox.style.display = 'none'; boss.transitioning = false; }, 2000);
    for(let i=0; i<10; i++) setTimeout(() => spawnParticles(Math.random()*600, Math.random()*800, 'white', 50, 10), i*100);
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
                bullets = snapshot.bullets.map(b => ({...b}));
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
    if(godMode) updateDebugPanel();
    
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
    
    // 일반 사격
    if (!skills[2].active && !skills[5].active && frame % 5 === 0) {
        let aimA = -Math.PI/2;
        shoot({x:player.x-10, y:player.y, a:aimA, s:15, r:3, c:'#afa', isEnemy:false});
        shoot({x:player.x+10, y:player.y, a:aimA, s:15, r:3, c:'#afa', isEnemy:false});
    }

    if (!boss.transitioning && !boss.freeze) {
        boss.moveTimer += timeScale; 
        let moveSpd = boss.phase === 3 ? 1.5 : 1.0;
        boss.x = 300 + Math.cos(boss.moveTimer/120 * moveSpd)*150;
        boss.y = 150 + Math.sin(boss.moveTimer/80 * moveSpd)*50;
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
                    if ([7, 8, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21].includes(pat)) freq = 200; 
                    patterns[pat](); 
                    patterns[pat].cooldown = freq; 
                }
            }
        });
    }

    if (boss.hp <= 0 && state === 'play') {
        loopCount++;
        score += 1500;
        spawnText(player.x, player.y - 60, "LOOP CLEAR +1500", '#0ff', 25);
        
        boss.hp = boss.maxHp; 
        boss.phase = 1;
        boss.transitioning = false;
        
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
    uiHpText.innerText = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    let color = getPhaseColor();
    uiHp.style.background = color;
    
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
        
        if(b.homing) {
            let target = b.isEnemy ? player : boss;
            let targetA = Math.atan2(target.y - b.y, target.x - b.x);
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
            // 패링 처리 (ID 12)
            if (skills[12].active) {
                // 플레이어 전방 50x50 범위
                let parryRange = 60;
                if (Math.abs(b.x - player.x) < parryRange && b.y < player.y && b.y > player.y - 100) {
                     if (!b.isLaser) {
                         b.dead = true;
                         score += 50; // 패링 성공 보너스
                         spawnParticles(b.x, b.y, 'white', 5, 5);
                         continue;
                     }
                }
            }

            // 레일건 충돌
            if (skills[5].active) {
                let rx = player.x; let ry = player.y - 50;
                let rw = 100; // 히트박스 축소
                if(b.x > rx - rw/2 && b.x < rx + rw/2 && b.y < ry) {
                    if(!b.isBossShield && !b.isLaser) { 
                        b.dead = true;
                        spawnParticles(b.x, b.y, b.color, 3, 2);
                        continue; 
                    }
                }
            }
            
            // 동결
            if (skills[7].active) {
                let dist = Math.hypot(player.x - b.x, player.y - b.y);
                if (dist < 100) {
                     let pushA = Math.atan2(b.y - player.y, b.x - player.x);
                     b.x += Math.cos(pushA) * 5;
                     b.y += Math.sin(pushA) * 5;
                     continue; 
                }
            }

            if (skills[3].active && !b.isLaser) {
                let dist = Math.hypot(player.x - b.x, player.y - b.y);
                if (dist < 400 && dist > 60) { 
                    b.isEnemy = false; b.color = 'cyan'; 
                    b.angle = Math.atan2(boss.y - b.y, boss.x - b.x);
                    b.homing = 0.2; 
                    continue;
                }
            }
            if (shieldObj && !b.isLaser) {
                if (b.x > shieldObj.x - shieldObj.w/2 && b.x < shieldObj.x + shieldObj.w/2 &&
                    b.y > shieldObj.y - shieldObj.h/2 && b.y < shieldObj.y + shieldObj.h/2) {
                    b.vy *= -1; b.angle = Math.atan2(b.vy, b.vx);
                    b.isEnemy = false; b.color = 'yellow';
                    if (shieldObj.w < shieldObj.maxW) shieldObj.w += 5;
                    continue;
                }
            }
            if (gravityObj && !b.isLaser) {
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
                let isInvulSkill = skills[1].active;
                let bossCol = (Math.hypot(player.x-boss.x, player.y-boss.y) < boss.r);
                if (!bossCol && player.invul <= 0 && !godMode && !isInvulSkill && !skills[7].active) {
                    player.hp--;
                    player.invul = 90; player.slowTimer = 60;
                    gameScreen.style.backgroundColor = '#300';
                    spawnParticles(player.x, player.y, 'red', 20, 5);
                    setTimeout(()=>gameScreen.style.backgroundColor='', 100);
                    if(player.hp <= 0) state = 'over';
                }
            } else if (!b.isLaser && dist < 20 && !b.grazed) { 
                let mult = getScoreMultiplier();
                score += 1 * mult; 
                b.grazed = true; 
            }

        } else {
            let hitAny = false;
            let dmg = b.damage || 3;
            if(Math.abs(b.x-boss.x)<30 && Math.abs(b.y-boss.y)<30) {
                boss.hp -= dmg; 
                hitAny = true;
                
                let mult = getScoreMultiplier();
                let gainScore = 5 * mult;
                score += gainScore;
                spawnText(boss.x, boss.y - 30, `+${gainScore}`, '#0f0', 15);
                spawnParticles(b.x, b.y, 'cyan', 2, 2);
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

    if (showScoreLines) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.font = "10px Arial";
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        // 하단부터 촘촘하게 (Zone 1~5)
        const lines = [150, 300, 450, 600];
        const scores = [5, 4, 3, 2];
        lines.forEach((y, i) => {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke();
            ctx.fillText(`ZONE ${scores[i]}`, 10, y - 5);
        });
        ctx.fillText(`ZONE 1`, 10, 790);
    }

    afterimages.forEach((img, i) => {
        ctx.save(); ctx.globalAlpha = img.alpha;
        ctx.fillStyle = 'cyan'; ctx.fillRect(img.x-15, img.y-15, 30, 30);
        ctx.restore(); 
        if (!skills[2].active) img.alpha -= 0.05;
    });
    if (!skills[2].active) afterimages = afterimages.filter(i => i.alpha > 0);

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

    // 패링 검격 그리기
    if (skills[12].active) {
        ctx.save();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 4;
        ctx.shadowColor = 'white'; ctx.shadowBlur = 15;
        ctx.beginPath();
        // 플레이어 위쪽으로 반원 모양 검격
        ctx.arc(player.x, player.y - 30, 40, Math.PI, 0); 
        ctx.stroke();
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
            ctx.shadowBlur = b.r > 5 ? 10 : 0; 
            ctx.shadowColor = b.color;
            ctx.fillStyle = b.color;
            if(b.isLaser) {
                let timeLeft = (b.warnTime + b.activeTime) - b.timer;
                let currentH = b.h;
                let appearTime = b.timer - b.warnTime;
                if (appearTime < 5) currentH = b.h * (appearTime/5);
                if (timeLeft < 10) currentH = b.h * (timeLeft/10);
                ctx.fillRect(0, -currentH/2, b.w, currentH);
                ctx.fillStyle = '#fff'; ctx.fillRect(0, -currentH/4, b.w, currentH/2);
            } else {
                ctx.beginPath(); ctx.arc(0,0,b.r,0,Math.PI*2); ctx.fill();
                if(b.r > 5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0,b.r*0.6,0,Math.PI*2); ctx.fill(); }
            }
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    });

    let color = getPhaseColor();
    ctx.shadowBlur = 20; ctx.shadowColor = color;
    ctx.fillStyle = color; 
    ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    
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
    bullets.length=0; state='play'; patternTimer = 0; boss.transitioning = false; boss.freeze=false; boss.moveTimer=0;
    timeScale = 1.0;
    shieldObj = null; gravityObj = null; loopCount = 0;
    afterimages = []; explosions = []; particles = []; texts = []; gameStateHistory = [];
    for(let i=1; i<=12; i++) { if(skills[i]) { skills[i].timer = 0; skills[i].active = false; } }
    
    msgBox.style.display = 'none';
    gameScreen.className = '';
    gameScreen.style.filter = "";
}

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && state !== 'play') resetGame();
    if (e.code === 'KeyT') { 
        godMode = !godMode; 
        adminMsg.style.display = godMode ? 'block' : 'none'; 
        debugPanel.style.display = godMode ? 'flex' : 'none';
    }
    // V키: 점수 라인 토글
    if (e.code === 'KeyV') { showScoreLines = !showScoreLines; }

    // 패링: 스페이스바
    if (e.code === 'Space') useSkill(12);

    if (e.code === 'Digit1') useSkill(1); if (e.code === 'Digit2') useSkill(2);
    if (e.code === 'Digit3') useSkill(3); if (e.code === 'Digit4') useSkill(4);
    if (e.code === 'Digit5') useSkill(5); 
    if (e.code === 'Digit7') useSkill(7); 
    if (e.code === 'Digit0') useSkill(10);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') useSkill(11);

    if (godMode) {
        if (e.code === 'F1') setPhase(1);
        if (e.code === 'F2') setPhase(2);
        if (e.code === 'F3') setPhase(3);
        if (e.code === 'F4') setPhase(4);
    }
});
window.addEventListener('keyup', e=>keys[e.code]=false);
loop();
