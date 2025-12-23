// =========================================================
// [1] 시스템 설정: 닉네임 체크 & Firebase & 스킬 로드
// =========================================================

// 1. 닉네임 체크 (없으면 강제 이동)
const userNickname = localStorage.getItem('bossRush_nickname');
if (!userNickname) {
    alert("게임 시작을 위해 닉네임 설정이 필요합니다.");
    window.location.href = 'start.html';
}

// 2. 선택된 스킬 불러오기 (Z, X 키 배정용)
const savedSkills = localStorage.getItem('bossRush_skills');
const userLoadout = savedSkills ? JSON.parse(savedSkills) : []; // 예: [5, 2]
// userLoadout[0] -> Z키, userLoadout[1] -> X키

// 3. Firebase 초기화 (랭킹용)
// (HTML 헤더에 Firebase SDK가 있어야 작동합니다)
const firebaseConfig = {
    apiKey: "AIzaSyDbrsr6g0X6vKujfqBcFY0h--Rn3y1nCEI",
    authDomain: "bin20703-edda7.firebaseapp.com",
    databaseURL: "https://bin20703-edda7-default-rtdb.firebaseio.com",
    projectId: "bin20703-edda7",
    storageBucket: "bin20703-edda7.firebasestorage.app",
    messagingSenderId: "242056223892",
    appId: "1:242056223892:web:885b9bf54aa60ce7732881",
    measurementId: "G-C2VDTXTVZQ"
};
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// =========================================================
// [2] 게임 기본 변수 및 설정 (원본 코드 기반)
// =========================================================

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false; // 도트 감성 유지

// UI 엘리먼트
const uiHp = document.getElementById('boss-hp-bar');
const uiHpText = document.getElementById('boss-hp-text');
const scoreBox = document.getElementById('score-box');
const hpBox = document.getElementById('hp-box');
const msgBox = document.getElementById('msg-box');
const adminMsg = document.getElementById('admin-msg');
const gameScreen = document.getElementById('game-wrapper') || document.body; // wrapper가 없으면 body 사용
const debugPanel = document.getElementById('debug-panel');
const dFps = document.getElementById('d-fps');
const dHp = document.getElementById('d-hp');
const dPhase = document.getElementById('d-phase');
const dPatterns = document.getElementById('d-patterns');
const pauseOverlay = document.getElementById('pause-overlay'); // HTML에 추가 필요

// 상태 변수
let frame = 0; 
let score = 0;
let state = 'init'; // init, countdown, play, over
let godMode = false;
let hasCheated = false; // [NEW] 치트 사용 여부
let isPaused = false;   // [NEW] 일시정지 여부
let timeScale = 1.0; 
let isRewinding = false;
let loopCount = 0;
let lastTime = Date.now();
let showScoreLines = false; 
let countdownTimer = 0;
let gameStartTime = 0; // 플레이 시간 측정용

// 시간 역행(리콜)용 히스토리
let gameStateHistory = [];
const MAX_HISTORY = 60; 
let historyTimer = 0;   

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
    patternCooldown: 0,
    isChanneling: false
};

let bullets = [];
let afterimages = []; 
let explosions = []; 
let particles = [];
let texts = [];
let shieldObj = null; 
let gravityObj = null;

const patternInternalCd = {};
const keys = {};
let stars = [];
for(let i=0; i<60; i++) stars.push({x:Math.random()*600, y:Math.random()*800, size:Math.random()*2, speed:Math.random()*3+1});

// 스킬 데이터
const skills = {
    1: { name: '무적', cd: 720, duration: 180, active: false, timer: 0 }, 
    2: { name: '가속', cd: 1080, duration: 300, active: false, timer: 0 }, 
    3: { name: '반사', cd: 1620, duration: 6, active: false, timer: 0 }, 
    4: { name: '방패', cd: 1500, duration: 600, active: false, timer: 0 }, 
    5: { name: '레일건', cd: 660, duration: 30, active: false, timer: 0 }, 
    7: { name: '정지', cd: 1800, duration: 240, active: false, timer: 0 }, 
    10: { name: '블랙홀', cd: 1440, duration: 300, active: false, timer: 0 }, 
    11: { name: '리콜', cd: 900, duration: 0, active: false, timer: 0 },
    12: { name: '패링', cd: 180, duration: 15, active: false, timer: 0 } 
};

// 스킬 UI 생성 (사이드 패널에 선택한 스킬 표시)
function initSkillUI() {
    const sidePanel = document.getElementById('side-panel');
    if (!sidePanel) return;
    sidePanel.innerHTML = ''; // 초기화

    // 헬퍼 함수
    const createSlot = (id, keyName) => {
        const s = skills[id];
        if(!s) return;
        const div = document.createElement('div');
        div.id = `skill-${id}`;
        div.className = 'skill-slot'; // CSS 클래스 필요
        div.innerHTML = `
            <div class="skill-key">${keyName}</div>
            <div style="font-size:10px; position:absolute; bottom:25px;">${s.name}</div>
            <div class="cooldown-bar"><div class="cooldown-fill"></div></div>
        `;
        sidePanel.appendChild(div);
    };

    // 1. 기본 패링 (Space)
    createSlot(12, 'Spc');

    // 2. 유저 선택 스킬 (Z, X)
    if (userLoadout.length > 0) createSlot(userLoadout[0], 'Z');
    if (userLoadout.length > 1) createSlot(userLoadout[1], 'X');
}
// 게임 로드 시 UI 생성
window.addEventListener('load', initSkillUI);


const patternNames = {
    1: "Spiral", 2: "Ring", 3: "Aimed", 4: "Windmill", 5: "Rain", 6: "Accel",
    7: "Giant Bounce", 8: "Snipe", 9: "DNA", 10: "Giant Bomb", 11: "Giant Fan",
    12: "Aimed Laser", 13: "Homing", 15: "Trap", 
    16: "Spin Laser", 17: "Aimed Thunder", 18: "Weak Thunder",
    19: "Time Stop", 20: "White Laser", 21: "Satellite Shield"
};

// =========================================================
// [3] 헬퍼 함수들 (색상, 페이즈 설정, 파티클 등)
// =========================================================

function getPhaseColor() {
    if (boss.phase === 1) return '#00ccff';
    if (boss.phase === 2) return '#ff3333';
    if (boss.phase === 3) return '#aa00ff';
    if (boss.phase === 4) return '#ffffff'; 
    return '#ffffff';
}

function getBulletColor() {
    if (boss.phase === 1) return '#ff9999';
    if (boss.phase === 2) return '#66ff66'; 
    if (boss.phase === 3) return '#ffff66'; 
    if (boss.phase === 4) return '#888888';
    return '#ff0000';
}

function getScoreMultiplier() {
    if (player.y <= 420) return 5; 
    if (player.y <= 520) return 4; 
    if (player.y <= 650) return 3; 
    if (player.y <= 740) return 2; 
    return 1;                       
}

// [중요] 관리자 모드에서 페이즈 변경 시 호출되는 함수
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
    boss.isChanneling = false;
    // 화면 효과 초기화
    if(gameScreen) {
        gameScreen.className = ''; 
        gameScreen.style.filter = '';
    }
    
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
    if(frame % 10 === 0 && dFps) dFps.innerText = Math.round(1000/delta);
    if(dHp) dHp.innerText = Math.floor(boss.hp);
    if(dPhase) dPhase.innerText = boss.phase;
    
    if(dPatterns) {
        let listHtml = "";
        activePatterns.forEach(pid => { listHtml += `<li>[${pid}] ${patternNames[pid]}</li>`; });
        dPatterns.innerHTML = listHtml;
    }
}

function spawnParticles(x, y, color, count, speed) {
    for(let i=0; i<count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let spd = Math.random() * speed;
        particles.push({ x: x, y: y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, life: 20+Math.random()*15, color: color, size: Math.random()*2+1 });
    }
}

function spawnText(x, y, text, color, size) {
    if (texts.length > 100) texts.shift(); 
    let rx = x + (Math.random() - 0.5) * 40;
    let ry = y + (Math.random() - 0.5) * 20;
    texts.push({ x: rx, y: ry, text: text, color: color, size: size, life: 40, vy: -1.0 });
}

function shoot(p) {
    let width = p.w || 0;
    if (p.isLaser) {
        width = 4000; 
        if (boss.phase >= 3) p.h = (p.h || 20) * 1.5;
    }
    let color = (p.isLaser) ? getPhaseColor() : (p.c || getBulletColor());
    if (boss.phase === 4 && p.isLaser && p.c) color = p.c; 
    
    let speedVal = Math.abs(p.s);
    let calcLife = 1200 - (speedVal * 80); 
    if (calcLife < 400) calcLife = 400; 
    if (p.lifeTime) calcLife = p.lifeTime;

    let isGiant = (!p.isLaser && (p.r >= 15));
    let bulletHp = 0;
    if (isGiant) {
        bulletHp = (boss.phase >= 3) ? 40 : 20;
    }

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
        isRailgun: p.isRailgun || false,
        isGravityCounter: p.isGravityCounter || false,
        scoreVal: p.scoreVal || 0,
        hasHitBoss: p.hasHitBoss || false, 
        hp: bulletHp, maxHp: bulletHp, isGiant: isGiant
    });
}

function bossShoot(p) {
    if (p.x === undefined) shoot({ ...p, x: boss.x, y: boss.y });
    else shoot(p);
}

// =========================================================
// [4] 보스 패턴 정의 (원본 로직 유지)
// =========================================================
const patterns = {
    1: () => { if(!boss.isChanneling) boss.freeze=false; for(let i=0; i<6; i++) bossShoot({a:boss.angle+i*1.0, s:2.0}); boss.angle+=0.1; },
    2: () => { if(!boss.isChanneling) boss.freeze=false; for(let i=0; i<16; i++) bossShoot({a:Math.PI*2/16*i, s:1.5}); },
    3: () => { if(!boss.isChanneling) boss.freeze=true;  let aim=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:aim+i*0.2, s:3.0}); }, 
    4: () => { if(!boss.isChanneling) boss.freeze=false; bossShoot({a:boss.angle, s:2.0, curve:0.01}); bossShoot({a:boss.angle+Math.PI, s:2.0, curve:0.01}); boss.angle+=0.15; },
    5: () => { if(!boss.isChanneling) boss.freeze=false; shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:2.0}); }, 
    6: () => { if(!boss.isChanneling) boss.freeze=true;  let a=angleToP(boss); bossShoot({a:a, s:1.5, accel:0.03}); }, 
    7: () => { 
        if(!boss.isChanneling) boss.freeze=false;
        for(let i=0; i<3; i++) bossShoot({a:Math.PI*2/3*i+boss.angle, s:3.0, r:20, bounce:1, accel:-0.01}); 
        boss.angle+=0.05; 
    }, 
    8: () => { if(!boss.isChanneling) boss.freeze=true; bossShoot({a:angleToP(boss), s:6, r:30, warnTime:60}); }, 
    9: () => { if(!boss.isChanneling) boss.freeze=false; for(let i=0; i<2; i++) bossShoot({a:boss.angle+Math.PI*i*0.8, s:4.0, r:15, curve:0.02}); boss.angle+=0.1; },
    10: () => { 
        if(!boss.isChanneling) boss.freeze=false;
        let bx = Math.random()*600, by = Math.random()*300;
        let aimA = Math.atan2(player.y - by, player.x - bx);
        shoot({x:bx, y:by, a:aimA, s:0, accel:0.1, r:25, warnTime:50}); 
    },
    11: () => { if(!boss.isChanneling) boss.freeze=true;
        let a=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:a+i*0.5, s:4.5, r:18, bounce:1});
    }, 
    12: () => { 
        if(!boss.isChanneling) boss.freeze=false;
        for(let i=0; i<5; i++) {
            setTimeout(() => {
                let aim = angleToP(boss); 
                shoot({x:boss.x, y:boss.y, a:aim, s:0, w:4000, h:15, isLaser:true, warnTime:30, activeTime:15});
            }, i*120);
        }
    }, 
    13: () => { if(!boss.isChanneling) boss.freeze=false; bossShoot({a:angleToP(boss), s:3.5, homing:0.04}); }, 
    15: () => { if(!boss.isChanneling) boss.freeze=true;  let r=200;
        for(let i=0; i<8; i++) shoot({x:player.x+Math.cos(i)*r, y:player.y+Math.sin(i)*r, a:Math.atan2(-Math.sin(i), -Math.cos(i)), s:2.0, accel:0.05, homing:0.01, warnTime:40});
    }, 
    16: () => { 
        if(patternInternalCd[16] > 0) return; 
        patternInternalCd[16] = 500; 
        boss.freeze = true; 
        boss.isChanneling = true;
        let startAngle = angleToP(boss); 
        let direction = Math.random() < 0.5 ? 1 : -1; 
        for(let i=0; i<4; i++) {
            shoot({x:boss.x, y:boss.y, a:startAngle + (Math.PI/2)*i, s:0, w:4000, h:15, isLaser:true, warnTime:60, activeTime:120, curve: 0.005 * direction});
        }
        setTimeout(() => { boss.isChanneling = false; boss.freeze = false; }, 3500); 
    }, 
    17: () => { 
        if(!boss.isChanneling) boss.freeze=false; 
        for(let i=0; i<3; i++) {
            setTimeout(() => {
                let sx = Math.random()*600; let sy = Math.random()*100 - 400; 
                let angle = Math.atan2(player.y - sy, player.x - sx); 
                shoot({x:sx, y:sy, a:angle, s:0, w:5000, h:40, isLaser:true, warnTime:60, activeTime:30});
            }, i*200);
        }
    },
    18: () => {
        if(!boss.isChanneling) boss.freeze=false;
        for(let i=0; i<8; i++) {
            setTimeout(() => {
                let sx = Math.random()*600; let sy = Math.random()*100 - 400; 
                let angle = Math.atan2(player.y - sy, player.x - sx);
                shoot({x:sx, y:sy, a:angle, s:0, w:5000, h:15, isLaser:true, warnTime:40, activeTime:20, damage: 1});
            }, i * 100); 
        }
    },
    19: () => { boss.freeze=true; let count=24;
        for(let i=0; i<count; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/count*i, s:0, accel:0.15, c: boss.phase===4 ? '#888' : '#fff', delay: 30}); setTimeout(() => boss.freeze=false, 500);
    },
    20: () => { 
        if(patternInternalCd[20] > 0) return;
        patternInternalCd[20] = 400; 
        boss.freeze = true; boss.isChanneling = true;
        let startAngle = angleToP(boss);
        let direction = Math.random() < 0.5 ? 1 : -1;
        let laserColor = '#fff'; 
        shoot({x:boss.x, y:boss.y, a:startAngle, s:0, c:laserColor, w:4000, h:30, isLaser:true, warnTime:30, activeTime:90, curve: 0.01 * direction});
        shoot({x:boss.x, y:boss.y, a:startAngle+Math.PI, s:0, c:laserColor, w:4000, h:30, isLaser:true, warnTime:30, activeTime:90, curve: 0.01 * direction}); 
        boss.angle += 0.2;
        setTimeout(() => { boss.isChanneling = false; boss.freeze = false; }, 3000);
    },
    21: () => {} 
};

let patternTimer = 0;
let activePatterns = [];

function pickPatterns() {
    activePatterns = [];
    let p = boss.phase;
    let count = 1;

    if (p === 1) { if (Math.random() < 0.1) count = 1; } 
    else if (p === 2) { count = Math.random() < 0.7 ? 2 : 1; } 
    else if (p === 3) { count = Math.random() < 0.3 ? 4 : 3; } 
    else if (p === 4) {
        let rnd = Math.random();
        if (rnd < 0.10) count = 5;      
        else if (rnd < 0.50) count = 4; 
        else count = 3;                 
    }
    
    let pool = [];
    if (p === 1) pool = [1,2,3,4,5,6]; 
    if (p === 2) pool = [1,2,3,4,5,6, 7,8,9,10,11]; 
    if (p === 3) pool = [1,2,3,4,5,6, 7,8,9,10,11, 12,15,16,17]; 
    if (p === 4) pool = [1,2,3,4,5,6, 7,8,9,10,11, 12,12, 15,16,17,18, 19,20];

    for(let k in patternInternalCd) {
        if(patternInternalCd[k] > 0) patternInternalCd[k] -= 200; 
    }

    if (pool.length > 0) {
        for(let i=0; i<count; i++) {
            let idx = Math.floor(Math.random() * pool.length);
            activePatterns.push(pool[idx]);
        }
    } else {
        activePatterns.push(1);
    }
}

function clearAllPatterns() {
    bullets = bullets.filter(b => !b.isEnemy); 
    activePatterns = []; 
    boss.freeze = false;
    boss.isChanneling = false;
    for(let k in patternInternalCd) patternInternalCd[k] = 0;
}

function saveGameState() {
    if (state !== 'play' || isRewinding) return;
    historyTimer++;
    if (historyTimer < 5) return; 
    historyTimer = 0;

    let snapshot = {
        player: { x: player.x, y: player.y, hp: player.hp },
        boss: { x: boss.x, y: boss.y, hp: boss.hp, phase: boss.phase, r: boss.r },
        bullets: bullets.map(b => ({...b})), 
        score: score,
        shieldObj: shieldObj ? { ...shieldObj } : null,
        gravityObj: gravityObj ? { ...gravityObj } : null,
        afterimages: [], 
        loopCount: loopCount,
        frame: frame 
    };
    gameStateHistory.push(snapshot);
    if (gameStateHistory.length > MAX_HISTORY) gameStateHistory.shift();
}

// 스킬 사용 함수
function useSkill(id) {
    // 일시정지나 리와인드 중엔 사용 불가
    if (state !== 'play' || isPaused || skills[id] === undefined || skills[id].timer > 0 || isRewinding) return;

    // 리콜(11번) 스킬 로직
    if (id === 11) {
        if(gameStateHistory.length > 0) {
            skills[id].timer = skills[id].cd;
            isRewinding = true;
            if(gameScreen) gameScreen.className = 'rewind-effect';
            msgBox.style.display = 'block'; msgBox.innerText = "REWINDING..."; msgBox.style.color = '#fff';
        }
        return;
    }

    // 스킬 활성화
    skills[id].active = true;
    skills[id].timer = skills[id].cd;
    skills[id].activeTimer = skills[id].duration;

    // 즉발 효과들
    if (id === 4) shieldObj = { x: player.x, y: player.y - 40, w: 100, maxW: 300, h: 20 };
    if (id === 5) { 
        shoot({ 
            x: player.x, y: player.y - 50, a: -Math.PI/2, s: 0, 
            w: 1500, h: 80, isLaser: true, warnTime: 0, activeTime: 10, 
            c: 'cyan', isEnemy: false, 
            damage: 70, isRailgun: true, scoreVal: 80, hasHitBoss: false 
        });
        player.y = Math.min(790, player.y + 30);
        spawnParticles(player.x, player.y-20, 'cyan', 40, 8); 
        if(gameScreen) {
            gameScreen.classList.add('shake-effect');
            setTimeout(() => gameScreen.classList.remove('shake-effect'), 200);
        }
    }
    if (id === 10) gravityObj = { x: player.x, y: player.y, r: 200, absorbed: 0 };
    if (id === 12) spawnParticles(player.x, player.y - 30, '#fff', 30, 6);
}

// =========================================================
// [5] 업데이트 루프 (핵심 로직)
// =========================================================

function updateSkills() {
    // 모든 스킬(가지고 있는 것만 체크)
    Object.keys(skills).forEach(key => {
        let i = parseInt(key);
        let s = skills[i];
        if (s.timer > 0) s.timer--;
        if (s.activeTimer > 0) {
            s.activeTimer--;
            if (s.activeTimer <= 0) {
                s.active = false;
                if (i===4) shieldObj = null;
                if (i===10 && gravityObj) { 
                    // 중력장 종료 폭발
                    let dmg = Math.min(gravityObj.absorbed * 1.4, 100); 
                    let scoreBonus = Math.min(gravityObj.absorbed * 1.4, 200); 
                    let angleToBoss = Math.atan2(boss.y - gravityObj.y, boss.x - gravityObj.x);
                    shoot({
                        x: gravityObj.x, y: gravityObj.y, a: angleToBoss, 
                        s: 15, r: 60, c: '#a0f', isEnemy: false, damage: dmg,
                        isGravityCounter: true, scoreVal: scoreBonus 
                    });
                    spawnParticles(gravityObj.x, gravityObj.y, '#a0f', 50, 10);
                    gravityObj = null;
                }
            }
        }
        // UI 업데이트
        let skillEl = document.getElementById(`skill-${i}`);
        if(skillEl) {
            if(s.active) skillEl.classList.add('active'); else skillEl.classList.remove('active');
            let cdPer = s.timer > 0 ? (s.timer / s.cd * 100) : 0;
            // CSS 구조에 맞춰 cooldown-fill 혹은 cooldown 사용
            let fill = skillEl.querySelector('.cooldown-fill');
            if(fill) fill.style.width = `${cdPer}%`;
            else {
                let oldFill = skillEl.querySelector('.cooldown');
                if(oldFill) oldFill.style.height = `${cdPer}%`;
            }
        }
    });

    if (skills[2].active) { 
        timeScale = 0.2; 
        if(gameScreen) gameScreen.classList.add('invert-effect'); 
    } 
    else if (skills[7].active) { 
        timeScale = 0; 
        if(gameScreen) gameScreen.style.filter = "grayscale(100%)"; 
    }
    else { 
        if(gameScreen) gameScreen.classList.remove('invert-effect');
        if (boss.phase !== 4 && gameScreen) gameScreen.style.filter = ""; 
        timeScale = 1.0;
    }
}

function checkPhaseTransition(newPhase) {
    if (boss.transitioning || boss.phase === newPhase) return;
    
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
    boss.isChanneling = false; 
    clearAllPatterns();
    if(gameScreen) gameScreen.classList.add('warning-pulse');
    msgBox.style.display = 'block';
    msgBox.innerText = `PHASE ${newPhase} INCOMING...`;
    msgBox.style.color = 'red';
    setTimeout(() => { 
        boss.phase = newPhase; 
        if(newPhase === 2) startPhase2(); 
        else if(newPhase === 3) startPhase3(); 
        else if(newPhase === 4) startPhase4(); 
        if(gameScreen) gameScreen.classList.remove('warning-pulse'); 
        boss.freeze = false; 
    }, 2000);
}

function startPhase2() {
    msgBox.innerText = "PHASE 2: GIGANTIC"; msgBox.style.color = 'red';
    if(gameScreen) gameScreen.classList.add('shake-effect');
    setTimeout(() => { 
        if(gameScreen) gameScreen.classList.remove('shake-effect'); 
        msgBox.style.display = 'none'; boss.transitioning = false; 
    }, 1500);
    setTimeout(() => {
        for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/8*i, s:0, c:'#f00', w:4000, h:20, isLaser:true, warnTime:40, activeTime:30});
        for(let i=0; i<20; i++) shoot({x:boss.x, y:boss.y, a:Math.random()*7, s:Math.random()*3+2, c:'#ffaa00', r:12});
    }, 500);
}

function startPhase3() {
    msgBox.innerText = "PHASE 3: SPEED"; msgBox.style.color = '#a0f';
    if(gameScreen) gameScreen.classList.add('shake-effect');
    setTimeout(() => { 
        if(gameScreen) gameScreen.classList.remove('shake-effect'); 
        msgBox.style.display = 'none'; boss.transitioning = false; 
    }, 2000);
    for(let i=0; i<6; i++) {
        setTimeout(() => { shoot({x: 50 + i * 100, y:0, a:Math.PI/2, s:0, w:4000, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100);
    }
    setTimeout(() => {
        for(let i=0; i<7; i++) {
            setTimeout(() => { shoot({x: i * 100, y:0, a:Math.PI/2, s:0, w:4000, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100);
        }
    }, 1000);
}

function startPhase4() {
    msgBox.innerText = ""; 
    msgBox.style.display = 'none';
    
    if(gameScreen) {
        gameScreen.style.filter = "grayscale(100%) contrast(1.2)";
        gameScreen.classList.add('glitch-effect');
    }

    boss.freeze = true;
    boss.isChanneling = true;
    boss.x = 300; boss.y = 100;

    setTimeout(() => {
        boss.r = 40; 
        spawnParticles(boss.x, boss.y, '#fff', 50, 15);
        if(gameScreen) gameScreen.classList.remove('glitch-effect'); 
    }, 500);

    setTimeout(() => {
        shoot({
            x: 300, y: 100, 
            a: Math.PI/2, 
            s: 0, 
            w: 4000, 
            h: 360, 
            isLaser: true, 
            warnTime: 60, 
            activeTime: 90, 
            c: '#fff', 
            damage: 999 
        });
    }, 1000);

    setTimeout(() => { 
        boss.transitioning = false; 
        boss.freeze = false;
        boss.isChanneling = false;
    }, 4500);
}

function startCountdownSequence() {
    state = 'countdown';
    countdownTimer = 300; 
    msgBox.style.display = 'block';
    msgBox.style.color = 'cyan';
    if(gameScreen) gameScreen.style.filter = 'brightness(0.5)';
}

function update() {
    if (state === 'init') {
        startCountdownSequence();
        return;
    }
    
    // 카운트다운
    if (state === 'countdown') {
        countdownTimer--;
        let seconds = Math.ceil(countdownTimer / 60);
        msgBox.innerText = seconds > 0 ? seconds : "START!";
        if (countdownTimer <= 0) {
            state = 'play';
            gameStartTime = Date.now(); // 게임 시작 시간 기록
            msgBox.style.display = 'none';
            if(gameScreen) gameScreen.style.filter = '';
        }
        return;
    }

    // 일시정지 체크 (그리기만 계속하고 업데이트는 중단)
    if (isPaused) return;

    if (boss.phase === 4 && boss.isChanneling && boss.transitioning) {
        boss.x = 300; boss.y = 100;
    }

    // 리와인드(리콜) 로직
    if (isRewinding) {
        if (gameStateHistory.length > 0) {
            let snapshot = gameStateHistory.pop();
            player.x = snapshot.player.x; player.y = snapshot.player.y;
            player.hp = snapshot.player.hp;
            boss.x = snapshot.boss.x; boss.y = snapshot.boss.y;
            boss.hp = snapshot.boss.hp; boss.phase = snapshot.boss.phase; boss.r = snapshot.boss.r;
            bullets = snapshot.bullets.map(b => ({...b}));
            shieldObj = snapshot.shieldObj ? { ...snapshot.shieldObj } : null;
            gravityObj = snapshot.gravityObj ? { ...snapshot.gravityObj } : null;
            score = snapshot.score;
            frame = snapshot.frame;
        } else {
            isRewinding = false;
            if(gameScreen) gameScreen.className = '';
            msgBox.style.display = 'none';
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
    if (player.regenTimer > 300) { 
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
                    if ([7, 8, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21].includes(pat)) freq = 200; 
                    patterns[pat](); 
                    patterns[pat].cooldown = freq; 
                }
            }
        });
    }

    // LOOP 클리어 (보스 처치)
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
        
        spawnParticles(boss.x, boss.y, 'white', 50, 10);
        clearAllPatterns();
        bullets = []; 
        if(gameScreen) gameScreen.style.filter = "";
        
        setTimeout(() => {
            startCountdownSequence();
        }, 1000);
    }

    let hpR = boss.hp/boss.maxHp;
    let newPhase = 1;
    if (hpR <= 0.25) newPhase = 4;
    else if (hpR <= 0.50) newPhase = 3;
    else if (hpR <= 0.75) newPhase = 2;

    if(boss.phase !== newPhase && !boss.transitioning) {
        checkPhaseTransition(newPhase);
    }

    boss.r = boss.baseR;
    
    uiHp.style.width = (hpR*100)+'%';
    uiHpText.innerText = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    let color = getPhaseColor();
    uiHp.style.background = color;
    
    scoreBox.innerText = `SCORE: ${score}`;
    let fullHearts = "♥".repeat(Math.floor(player.hp));
    let halfHeart = (player.hp % 1 !== 0) ? "♡" : "";
    hpBox.innerText = fullHearts + halfHeart;

    // 탄환 업데이트
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
        
        if (b.isGiant) { b.y += 0.3 * localTimeScale; }

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
        if(b.x<-1000 || b.x>1500 || b.y<-1000 || b.y>1500) b.dead = true; 

        if (b.isEnemy) {
            let dx = b.x - player.x;
            let dy = b.y - player.y;
            let distSq = dx*dx + dy*dy;

            if (skills[12].active) {
                if (Math.abs(dx) < 36 && b.y < player.y && b.y > player.y - 60) {
                     if (!b.isLaser) {
                         b.dead = true;
                         score += 50; 
                         spawnParticles(b.x, b.y, 'white', 10, 5);
                         continue;
                     }
                }
            }

            if (skills[5].active) {
                let rx = player.x; let ry = player.y - 50;
                let rw = 100; 
                if(b.x > rx - rw/2 && b.x < rx + rw/2 && b.y < ry) {
                    if(!b.isBossShield && !b.isLaser) { 
                        b.dead = true;
                        spawnParticles(b.x, b.y, b.color, 4, 2);
                        continue; 
                    }
                }
            }
            
            if (skills[7].active) {
                if (distSq < 10000) { 
                      let pushA = Math.atan2(dy, dx);
                      b.x += Math.cos(pushA) * 5; b.y += Math.sin(pushA) * 5;
                      continue; 
                }
            }

            if (skills[3].active && !b.isLaser) {
                if (distSq < 160000 && distSq > 3600) { 
                    b.isEnemy = false; b.color = 'cyan'; 
                    b.angle = Math.atan2(boss.y - b.y, boss.x - b.x);
                    b.homing = 0.2; b.damage = 2; b.scoreVal = 1;
                    spawnText(b.x, b.y, "Reflect", '#0ff', 10);
                    continue;
                }
            }
            if (shieldObj && !b.isLaser) {
                if (b.x > shieldObj.x - shieldObj.w/2 && b.x < shieldObj.x + shieldObj.w/2 &&
                    b.y > shieldObj.y - shieldObj.h/2 && b.y < shieldObj.y + shieldObj.h/2) {
                    b.dead = true; 
                    spawnParticles(b.x, b.y, 'cyan', 4, 2); 
                    if (shieldObj.w < shieldObj.maxW) shieldObj.w += 5;
                    continue;
                }
            }
            if (gravityObj && !b.isLaser) {
                let gDistSq = (gravityObj.x - b.x)**2 + (gravityObj.y - b.y)**2;
                if (gDistSq < gravityObj.r * gravityObj.r) {
                    b.x += (gravityObj.x - b.x) * 0.1; b.y += (gravityObj.y - b.y) * 0.1;
                    b.r -= 0.5; if(b.r<=0) b.dead=true;
                    gravityObj.r -= 0.5; gravityObj.absorbed++;
                    if(gravityObj.r <= 0) gravityObj = null;
                    continue;
                }
            }

            let hit = false;
            if (b.isLaser) {
                 if (b.timer >= b.warnTime) {
                     let timeLeft = (b.warnTime + b.activeTime) - b.timer;
                     let currentH = b.h;
                     if(timeLeft < 10) currentH = b.h * (timeLeft/10);
                     let rx = dx * Math.cos(-b.angle) - dy * Math.sin(-b.angle);
                     let ry = dx * Math.sin(-b.angle) + dy * Math.cos(-b.angle);
                     if (rx >= -1000 && rx <= b.w && Math.abs(ry) <= currentH/2 + player.hitboxSize) hit = true;
                 }
            } else {
                let hitR = player.hitboxSize + b.r;
                if (distSq < hitR * hitR) hit = true;
            }

            if(hit) {
                let isInvulSkill = skills[1].active;
                let bossDistSq = (player.x-boss.x)**2 + (player.y-boss.y)**2;
                let bossCol = (bossDistSq < boss.r * boss.r);
                
                if (!bossCol && player.invul <= 0 && !godMode && !isInvulSkill && !skills[7].active) {
                    player.hp--;
                    player.invul = 90; player.slowTimer = 60;
                    if(gameScreen) {
                        gameScreen.style.backgroundColor = '#300';
                        setTimeout(()=>gameScreen.style.backgroundColor='', 100);
                    }
                    spawnParticles(player.x, player.y, 'red', 20, 5);
                    
                    if(player.hp <= 0) {
                        state = 'over';
                        sendScoreToFirebase(); // [랭킹전송]
                    }
                }
            } else if (!b.isLaser && distSq < 400 && !b.grazed) { 
                let mult = getScoreMultiplier();
                score += 1 * mult; b.grazed = true; 
            }

        } else {
            // (플레이어 총알 충돌 로직)
            let hitGiant = false;
            if (b.y < 600) { 
                for(let j=0; j<bullets.length; j++) {
                    let eb = bullets[j];
                    if (eb.isEnemy && eb.isGiant && !eb.dead) {
                        let edx = b.x - eb.x; let edy = b.y - eb.y; let edistSq = edx*edx + edy*edy;
                        let isLaserHit = false;
                        if (b.isLaser) { if (Math.abs(edx) < eb.r + 10) isLaserHit = true; }

                        if ((!b.isLaser && edistSq < (eb.r+5)**2) || isLaserHit) {
                            eb.hp -= (b.damage || 3);
                            spawnParticles(eb.x, eb.y, 'orange', 2, 1);
                            if (eb.hp <= 0) {
                                eb.dead = true; score += 50; 
                                spawnParticles(eb.x, eb.y, eb.color, 10, 3);
                            }
                            if (!b.isRailgun && !b.isGravityCounter) hitGiant = true; 
                            if (!b.isRailgun && !b.isGravityCounter) break; 
                        }
                    }
                }
            }
            if (hitGiant && !b.isLaser) { b.dead = true; continue; }

            let hitAny = false;
            let isHit = false;
            if (b.isLaser) { if (Math.abs(b.x - boss.x) < (b.h/2 + boss.r)) isHit = true; } 
            else { if(Math.abs(b.x-boss.x)<30 + b.r && Math.abs(b.y-boss.y)<30 + b.r) isHit = true; }

            if(isHit) {
                if (b.isRailgun) {
                    if (b.hasHitBoss) { hitAny = true; } else {
                        boss.hp -= b.damage; score += b.scoreVal; 
                        spawnText(boss.x, boss.y - 30, `BIG HIT +${b.scoreVal}`, 'cyan', 25);
                        b.hasHitBoss = true; hitAny = true;
                        spawnParticles(boss.x, boss.y, 'cyan', 20, 5);
                    }
                } else {
                    boss.hp -= (b.damage || 3); hitAny = true;
                    let gainScore = (b.scoreVal !== undefined && b.scoreVal > 0) ? b.scoreVal : 1 * getScoreMultiplier();
                    score += gainScore;
                    if (gainScore > 0) {
                        if (b.isLaser) { if (frame % 6 === 0) spawnText(boss.x, boss.y - 30, `+${gainScore}`, '#0f0', 15); } 
                        else { spawnText(boss.x, boss.y - 30, `+${gainScore}`, '#0f0', 15); }
                    }
                    if(frame % 3 === 0) spawnParticles(boss.x + (Math.random()-0.5)*20, boss.y + (Math.random()-0.5)*20, 'cyan', 2, 2);
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

// =========================================================
// [6] 그리기 함수
// =========================================================
function draw() {
    ctx.clearRect(0,0,600,800);
    
    // 배경 (별 그리기)
    ctx.fillStyle = '#555';
    stars.forEach(s => {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI*2); ctx.fill();
    });

    // 점수 라인 (V키 디버그용)
    if (showScoreLines) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1; ctx.font = "10px Arial"; ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        const lines = [420, 520, 650, 740]; const scores = [5, 4, 3, 2];
        lines.forEach((y, i) => {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke();
            ctx.fillText(`ZONE ${scores[i]}`, 10, y - 5);
        });
        ctx.fillText(`ZONE 1`, 10, 790);
    }

    if (state === 'play' || state === 'over' || state === 'countdown') {
        
        // 잔상 (스킬 2)
        afterimages.forEach(img => {
            ctx.save(); ctx.globalAlpha = img.alpha;
            ctx.fillStyle = 'cyan'; ctx.fillRect(img.x-15, img.y-15, 30, 30);
            ctx.restore(); 
        });

        // 탄환 그리기
        bullets.forEach(b => {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
            
            // 경고 시간 (투명하게 표시)
            if (b.warnTime > 0 && b.timer < b.warnTime) {
                ctx.globalAlpha = 0.2; ctx.fillStyle = b.color;
                if(b.isLaser) { ctx.fillRect(-1000, -b.h/2, b.w+1000, b.h); } 
                else { 
                    ctx.beginPath(); ctx.arc(0,0,2,0,Math.PI*2); ctx.fill();
                    ctx.strokeStyle=b.color; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(50,0); ctx.stroke();
                }
                ctx.globalAlpha = 1.0;
            } else {
                // 실체화된 탄환
                ctx.fillStyle = b.color;
                if(b.isLaser) {
                    let timeLeft = (b.warnTime + b.activeTime) - b.timer;
                    let currentH = b.h;
                    let appearTime = b.timer - b.warnTime;
                    // 레이저 등장/퇴장 연출
                    if (appearTime < 5) currentH = b.h * (appearTime/5);
                    if (timeLeft < 10) currentH = b.h * (timeLeft/10);
                    
                    if (boss.phase === 4 && b.isEnemy) {
                        ctx.fillStyle = '#888'; 
                        ctx.fillRect(-1000, -currentH/2 - 4, b.w+1000, currentH + 8);
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(-1000, -currentH/2, b.w+1000, currentH);
                    } else {
                        ctx.fillRect(-1000, -currentH/2, b.w+1000, currentH);
                        ctx.fillStyle = '#fff'; ctx.fillRect(-1000, -currentH/4, b.w+1000, currentH/2);
                    }
                } else {
                    ctx.beginPath(); ctx.arc(0,0,b.r,0,Math.PI*2); ctx.fill();
                    if(b.r > 5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0,b.r*0.6,0,Math.PI*2); ctx.fill(); }
                }
            }
            ctx.restore();
        });

        // 보스 그리기
        if (boss.hp > 0) {
            let color = getPhaseColor();
            ctx.fillStyle = color; 
            ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI*2); ctx.fill();
        }

        // 플레이어 그리기
        if (state !== 'over') {
            // 무적 시간 깜빡임 처리
            ctx.fillStyle = (player.invul>0 && Math.floor(frame/4)%2===0) ? 'transparent' : (skills[2].active ? '#0ff' : (player.slowTimer > 0 ? '#555' : 'red'));
            ctx.fillRect(player.x-15, player.y-15, 30, 30);

            // 히트박스 (하얀 점)
            if (!(player.invul>0 && Math.floor(frame/4)%2===0)) {
                ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(player.x,player.y,player.hitboxSize,0,Math.PI*2); ctx.fill();
            }

            // [NEW] 무적 스킬 (1번) 사용 시 황금색 오라 효과
            if (skills[1].active) {
                ctx.save();
                let pulse = 0.5 + Math.sin(frame * 0.2) * 0.3; // 깜빡거리는 효과
                ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`; // 황금색
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = `rgba(255, 215, 0, 0.2)`;
                ctx.fill();
                ctx.restore();
            }

            // 패링 스킬 (12번) 사용 시 범위 표시
            if (skills[12].active) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + Math.sin(frame*0.5)*0.2})`;
                ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 36, -Math.PI, 0); ctx.stroke();
            }
            
            // 리와인드 중일 때 색상 변경
            if (isRewinding) { ctx.fillStyle = '#0f0'; ctx.fillRect(player.x-15, player.y-15, 30, 30); }
        }

        // 오브젝트 그리기 (방패, 중력장 등)
        if (shieldObj) {
            ctx.save(); ctx.translate(shieldObj.x, shieldObj.y);
            ctx.strokeStyle = 'cyan'; ctx.lineWidth = 3; 
            ctx.strokeRect(-shieldObj.w/2, -shieldObj.h/2, shieldObj.w, shieldObj.h);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.2)'; ctx.fillRect(-shieldObj.w/2, -shieldObj.h/2, shieldObj.w, shieldObj.h);
            ctx.restore();
        }
        if (gravityObj) {
            ctx.save(); ctx.translate(gravityObj.x, gravityObj.y);
            ctx.strokeStyle = '#a0f'; ctx.lineWidth = 2; 
            ctx.beginPath(); ctx.arc(0, 0, gravityObj.r, 0, Math.PI*2); ctx.stroke();
            ctx.fillStyle = 'rgba(100,0,255,0.1)'; ctx.fill();
            ctx.restore();
        }
        // 패링 범위 시각화 (한 번 더 강조)
        if (skills[12].active) {
            ctx.save(); ctx.strokeStyle = 'white'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(player.x, player.y - 30, 40, Math.PI, 0); ctx.stroke(); ctx.restore();
        }

        // 이펙트 (폭발, 파티클, 텍스트)
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
        texts.forEach(t => {
            ctx.fillStyle = t.color; ctx.font = `bold ${t.size}px Arial`; ctx.fillText(t.text, t.x, t.y);
        });

        // 일시정지 오버레이
        if (isPaused) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0,0,600,800);
            if(pauseOverlay) pauseOverlay.style.display = 'flex';
        } else {
            if(pauseOverlay) pauseOverlay.style.display = 'none';
        }
    }

    // 게임 오버 / 클리어 화면
    if (state === 'over' || state === 'clear') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,600,800);
        ctx.fillStyle = '#fff'; ctx.font = '50px Courier'; ctx.textAlign='center';
        
        let title = state === 'clear' ? "VICTORY!" : "GAME OVER";
        ctx.fillText(title, 300, 300);
        
        ctx.font = '24px Courier';
        let survivalTime = (frame / 60).toFixed(1); 
        ctx.fillText(`Survival Time: ${survivalTime}s`, 300, 380);
        ctx.fillText(`Final Score: ${score}`, 300, 420);
        
        if (state === 'clear' && frame % 20 === 0) spawnParticles(Math.random()*600, Math.random()*600, `hsl(${Math.random()*360},100%,50%)`, 30, 5);
        
        ctx.fillStyle = '#aaa';
        ctx.font = '20px Courier'; ctx.fillText("Press [R] to Retry", 300, 500);
    }
}

function loop() {
    if (!isPaused) {
        update();
    }
    draw();
    requestAnimationFrame(loop);
}

// 유틸리티 및 이벤트
function angleToP(obj) { return Math.atan2(player.y - obj.y, player.x - obj.x); }
function resetGame() {
    window.location.reload(); // 리셋 시 깔끔하게 새로고침
}

function sendScoreToFirebase() {
    if (typeof firebase !== 'undefined' && firebase.database) {
        let db = firebase.database();
        let endTime = Date.now();
        let playSec = Math.floor((endTime - gameStartTime) / 1000);
        let min = Math.floor(playSec/60);
        let sec = playSec%60;
        let timeStr = `${min}:${sec<10?'0'+sec:sec}`;
        
        // 사용 스킬 이름
        let skillNames = userLoadout.map(id => skills[id].name);

        db.ref('scores').push({
            nickname: userNickname,
            score: score,
            playTime: timeStr,
            loopCount: loopCount,
            isCheater: hasCheated,
            skills: skillNames,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        console.log("Score Sent!");
    }
}

window.addEventListener('keydown', e => {
    // 1. 일시정지 (S)
    if (e.code === 'KeyS' && state === 'play') {
        isPaused = !isPaused;
        return;
    }
    
    // 2. 관리자 모드 (T + 비밀번호)
    if (e.code === 'KeyT') { 
        if (!godMode) {
            let pw = prompt("ADMIN PASSWORD:");
            if (pw === "0515") {
                godMode = true;
                hasCheated = true; // 치트 사용 기록
                alert("GOD MODE ON");
                if(adminMsg) adminMsg.style.display = 'block';
                if(debugPanel) debugPanel.style.display = 'flex';
            }
        } else {
            godMode = false;
            alert("GOD MODE OFF");
            if(adminMsg) adminMsg.style.display = 'none';
            if(debugPanel) debugPanel.style.display = 'none';
        }
    }
    
    // 3. 페이즈 강제 변경 (God Mode일 때만)
    if (godMode) {
        if (e.code === 'F1') setPhase(1);
        if (e.code === 'F2') setPhase(2);
        if (e.code === 'F3') setPhase(3);
        if (e.code === 'F4') setPhase(4);
    }

    if (isPaused) return;

    keys[e.code] = true;
    if (e.code === 'KeyR' && state !== 'play' && state !== 'countdown') resetGame();
    if (e.code === 'KeyV') { showScoreLines = !showScoreLines; }
    
    // 4. 스킬 사용 (Space, Z, X)
    if (e.code === 'Space') useSkill(12); // 기본 패링

    // 선택한 스킬 Z, X
    if (e.code === 'KeyZ') {
        if (userLoadout.length > 0) useSkill(userLoadout[0]);
    }
    if (e.code === 'KeyX') {
        if (userLoadout.length > 1) useSkill(userLoadout[1]);
    }

    // (기존 숫자키도 디버그용으로 작동하게 둘 경우 유지, 아니면 삭제해도 됨)
    if (godMode) { // 관리자일 때만 모든 스킬 사용 가능하게 변경
        if (e.code === 'Digit1') useSkill(1); if (e.code === 'Digit2') useSkill(2);
        if (e.code === 'Digit3') useSkill(3); if (e.code === 'Digit4') useSkill(4);
        if (e.code === 'Digit5') useSkill(5); 
        if (e.code === 'Digit7') useSkill(7); 
        if (e.code === 'Digit0') useSkill(10);
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') useSkill(11);
    }
});
window.addEventListener('keyup', e=>keys[e.code]=false);

// 게임 루프 시작
loop();
