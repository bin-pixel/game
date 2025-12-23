const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const uiHp = document.getElementById('boss-hp-bar');
const uiHpText = document.getElementById('boss-hp-text');
const scoreBox = document.getElementById('score-box');
const hpBox = document.getElementById('hp-box');
const msgBox = document.getElementById('msg-box');
const gameScreen = document.getElementById('game-screen');
const adminMsg = document.getElementById('admin-msg');
const debugPanel = document.getElementById('debug-panel');
const dFps = document.getElementById('d-fps');
const dHp = document.getElementById('d-hp');
const dPhase = document.getElementById('d-phase');
const dPatterns = document.getElementById('d-patterns');

// [전역 변수]
let state = 'init'; // init, countdown, play, over, clear
let frame = 0;
let score = 0;
let countdownTimer = 0;
let timeScale = 1.0;
let loopCount = 0;
let godMode = false;
let showScoreLines = false;
let isRewinding = false;
let gameStateHistory = []; // 산데비스탄 되감기용

// [키 입력]
const keys = {};

// [오브젝트]
let player = { 
    x: 300, y: 700, 
    hp: 5, maxHp: 5, 
    hitboxSize: 4, 
    invul: 0, 
    slowTimer: 0,
    regenTimer: 0 
};

let boss = { 
    x: 300, y: 150, 
    r: 30, baseR: 30,
    hp: 10000, maxHp: 10000, 
    phase: 1, 
    transitioning: false,
    freeze: false,
    isChanneling: false,
    moveTimer: 0 
};

let bullets = [];
let particles = [];
let explosions = [];
let texts = [];
let stars = [];
let afterimages = [];

// [스킬]
let skills = {
    1: { id:1, name:'무적', cd: 600, timer: 0, active: false, activeTimer: 0 },
    2: { id:2, name:'가속', cd: 400, timer: 0, active: false, activeTimer: 0 }, // 산데비스탄
    3: { id:3, name:'반사', cd: 600, timer: 0, active: false, activeTimer: 0 },
    4: { id:4, name:'방패', cd: 900, timer: 0, active: false, activeTimer: 0 },
    5: { id:5, name:'광선', cd: 700, timer: 0, active: false, activeTimer: 0 },
    7: { id:7, name:'정지', cd: 1200, timer: 0, active: false, activeTimer: 0 }, // 더 월드
    10: { id:10, name:'중력장', cd: 1000, timer: 0, active: false, activeTimer: 0 }, // 블랙홀
    11: { id:11, name:'되돌리기', cd: 1800, timer: 0, active: false, activeTimer: 0 }, // 바이츠 더 더스트
    12: { id:12, name:'패링', cd: 60, timer: 0, active: false, activeTimer: 0 } // 패링 (Space)
};

let shieldObj = null;
let gravityObj = null;

// [패턴]
let patterns = {};
let activePatterns = [];
let patternTimer = 0;

// 초기화 - 별 생성
for(let i=0; i<50; i++) {
    stars.push({x: Math.random()*600, y: Math.random()*800, size: Math.random()*2, speed: Math.random()*0.5 + 0.2});
}

// 유틸
function spawnParticles(x, y, color, count, speedVar) {
    for(let i=0; i<count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random()-0.5) * speedVar,
            vy: (Math.random()-0.5) * speedVar,
            life: 30 + Math.random()*20,
            color: color,
            size: Math.random()*3 + 1
        });
    }
}
function spawnText(x, y, text, color, size) {
    texts.push({x, y, text, color, size, life: 60, vy: -1});
}

function shoot(opts) {
    // x, y, a(angle), s(speed), r(radius), c(color), damage, isEnemy
    // delay, accel, curve, homing, bounce
    // w, h (for laser)
    let b = {
        x: opts.x, y: opts.y,
        angle: opts.a || 0,
        speed: opts.s || 0,
        r: opts.r || 5,
        color: opts.c || '#fff',
        damage: opts.damage || 1,
        isEnemy: opts.isEnemy !== undefined ? opts.isEnemy : true,
        timer: 0,
        dead: false,
        // 특성
        delay: opts.delay || 0,
        accel: opts.accel || 0,
        curve: opts.curve || 0,
        homing: opts.homing || 0,
        bounce: opts.bounce || 0,
        // 레이저 전용
        isLaser: opts.isLaser || false,
        w: opts.w || 0, h: opts.h || 0,
        warnTime: opts.warnTime || 0,
        activeTime: opts.activeTime || 0,
        // 기타
        isGiant: opts.isGiant || false,
        isRailgun: opts.isRailgun || false,
        isGravityCounter: opts.isGravityCounter || false,
        scoreVal: opts.scoreVal || 0,
        hasHitBoss: false,
        hp: opts.hp || 1, // 파괴 가능한 탄환 HP
        grazed: false
    };
    bullets.push(b);
}

// [스킬 로직]
function useSkill(id) {
    let s = skills[id];
    if (!s || s.timer > 0 || state !== 'play') return;
    
    s.active = true;
    s.timer = s.cd;
    
    // 스킬 효과
    if (id === 1) { // 무적
        s.activeTimer = 180; // 3초
        player.invul = 180;
        spawnText(player.x, player.y - 30, "INVINCIBLE", '#fff', 20);
    }
    else if (id === 2) { // 가속 (산데비스탄)
        s.activeTimer = 300; // 5초
        gameScreen.classList.add('invert-effect');
    }
    else if (id === 3) { // 반사
        s.activeTimer = 240; // 4초
        spawnText(player.x, player.y - 30, "REFLECT", '#0ff', 20);
    }
    else if (id === 4) { // 방패
        s.activeTimer = 600; // 10초
        shieldObj = { x: player.x, y: player.y - 60, w: 100, h: 20, maxW: 100 };
        spawnText(player.x, player.y - 30, "SHIELD", '#00f', 20);
    }
    else if (id === 5) { // 광선
        s.activeTimer = 10;
        shoot({ x: player.x, y: player.y - 50, a: -Math.PI/2, s: 0, w: 100, h: 800, isLaser: true, warnTime: 5, activeTime: 30, c: '#0ff', isEnemy: false, damage: 10 });
    }
    else if (id === 7) { // 정지 (더 월드)
        s.activeTimer = 180; // 3초
        gameScreen.style.filter = "grayscale(100%)";
        spawnText(300, 400, "TIME STOP", '#fff', 40);
    }
    else if (id === 10) { // 흡수 (중력장)
        s.activeTimer = 300; // 5초
        gravityObj = { x: player.x, y: player.y - 100, r: 10, absorbed: 0 };
    }
    else if (id === 11) { // 되돌리기
        s.activeTimer = 60;
        startRewind();
    }
    else if (id === 12) { // 패링
        s.activeTimer = 15; // 0.25초 (매우 짧음)
        spawnText(player.x, player.y-40, "PARRY", "#fff", 15);
    }
}

function startRewind() {
    isRewinding = true;
    gameScreen.classList.add('rewind-effect');
    // 실제 되감기 로직은 update()에서 처리
}

function saveGameState() {
    // 산데비스탄 등 역행을 위해 매 프레임 저장 (최대 180프레임 = 3초)
    // 너무 많이 저장하면 메모리 문제 생기므로 제한
    if (skills[11].active) return; // 되감기 중엔 저장 안 함
    
    // 깊은 복사가 필요함 (간단히 JSON 방식 사용, 성능상 이슈 있으면 최적화 필요)
    let snapshot = {
        player: { ...player },
        boss: { ...boss },
        score: score,
        frame: frame,
        bullets: bullets.map(b => ({...b})), // 탄환 복사
        shieldObj: shieldObj ? {...shieldObj} : null,
        gravityObj: gravityObj ? {...gravityObj} : null
    };
    
    gameStateHistory.push(snapshot);
    if (gameStateHistory.length > 300) gameStateHistory.shift(); // 5초 분량 유지
}

// [보스 패턴 정의]
patterns = {
    1: () => { // 기본 원형 확산
        let count = 12;
        for(let i=0; i<count; i++) {
            shoot({x:boss.x, y:boss.y, a: (Math.PI*2/count)*i + frame/20, s: 4, c:'#f00', r:6});
        }
    },
    2: () => { // 조준탄 연사
        shoot({x:boss.x, y:boss.y, s: 6, c:'#ff0', r:8, homing: 0.05, delay: 0});
    },
    3: () => { // 회오리
            let a = frame / 10;
            shoot({x:boss.x, y:boss.y, a: a, s: 5, c:'#f0f', r:5, curve: 0.02});
            shoot({x:boss.x, y:boss.y, a: a + Math.PI, s: 5, c:'#f0f', r:5, curve: 0.02});
    },
    4: () => { // 샷건
        for(let i=0; i<5; i++) {
            let targetA = Math.atan2(player.y - boss.y, player.x - boss.x);
            shoot({x:boss.x, y:boss.y, a: targetA + (Math.random()-0.5)*0.5, s: Math.random()*3+3, c:'#faa', r:4});
        }
    },
    // [PHASE 2]
    5: () => { // 거대 탄환
        shoot({x:boss.x, y:boss.y, a: Math.random()*Math.PI*2, s: 2, c:'#f50', r:30, isGiant: true, hp: 50});
    },
    6: () => { // 벽 튕기기
        for(let i=0; i<3; i++) shoot({x:boss.x, y:boss.y, a: Math.random()*Math.PI*2, s: 4, c:'#0f0', r:6, bounce: 3});
    },
    // [PHASE 3]
    7: () => { // 레이저 빗자루
        shoot({x:0, y:0, a: Math.PI/2, s:0, w: 4000, h: 20, isLaser:true, warnTime: 60, activeTime: 20, c:'#f00'});
    },
    8: () => { // 전방위 레이저 난사
        let count = 6;
        for(let i=0; i<count; i++) {
            shoot({x:boss.x, y:boss.y, a: (Math.PI*2/count)*i + frame/50, s:0, w: 800, h: 10, isLaser:true, warnTime: 40, activeTime: 20, c:'#f0f'});
        }
    }
};

function clearAllPatterns() {
    activePatterns = [];
    bullets.forEach(b => {
            if (b.isEnemy) {
                b.dead = true;
                spawnParticles(b.x, b.y, b.color, 3, 2);
            }
    });
}

function pickPatterns() {
    activePatterns = [];
    let p = boss.phase;
    
    if (p === 1) {
        if (Math.random() < 0.5) activePatterns.push(1);
        if (Math.random() < 0.5) activePatterns.push(2);
        activePatterns.push(4);
    } else if (p === 2) {
        activePatterns.push(1);
        activePatterns.push(5);
        activePatterns.push(6);
    } else if (p === 3) {
        activePatterns.push(3);
        activePatterns.push(7);
        activePatterns.push(8);
    } else if (p === 4) {
        // 페이즈 4는 update에서 별도 처리 (전체 화면 공격 등)
    }
    
    updateDebugPanel();
}

// 디버그
function setPhase(n) {
    boss.hp = boss.maxHp * [1, 1, 0.75, 0.5, 0.25][n];
    boss.phase = n;
    checkPhaseTransition(n);
    updateDebugPanel();
}

function updateDebugPanel() {
    dFps.innerText = "60"; // 고정값 (실제 계산 생략)
    dHp.innerText = Math.floor(boss.hp);
    dPhase.innerText = boss.phase;
    dPatterns.innerHTML = activePatterns.map(id => `<li>Pattern ${id}</li>`).join('');
}

function getPhaseColor() {
    if (boss.phase === 1) return '#00ccff';
    if (boss.phase === 2) return '#ffaa00';
    if (boss.phase === 3) return '#ff00ff';
    if (boss.phase === 4) return '#ff0000';
    return '#fff';
}

function getScoreMultiplier() {
    let y = player.y;
    if (y < 420) return 5;
    if (y < 520) return 4;
    if (y < 650) return 3;
    if (y < 740) return 2;
    return 1;
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
                    // [유지] 중력장 밸런스
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
        if (boss.phase !== 4) gameScreen.style.filter = ""; 
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
        for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/8*i, s:0, c:'#f00', w:4000, h:20, isLaser:true, warnTime:40, activeTime:30});
        for(let i=0; i<20; i++) shoot({x:boss.x, y:boss.y, a:Math.random()*7, s:Math.random()*3+2, c:'#ffaa00', r:12});
    }, 500);
}

function startPhase3() {
    msgBox.innerText = "PHASE 3: SPEED"; msgBox.style.color = '#a0f';
    gameScreen.classList.add('shake-effect');
    setTimeout(() => { gameScreen.classList.remove('shake-effect'); msgBox.style.display = 'none'; boss.transitioning = false; }, 2000);
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
    
    gameScreen.style.filter = "grayscale(100%) contrast(1.2)";
    gameScreen.classList.add('glitch-effect');

    boss.freeze = true;
    boss.isChanneling = true;
    boss.x = 300; boss.y = 100;

    setTimeout(() => {
        boss.r = 40; 
        spawnParticles(boss.x, boss.y, '#fff', 50, 15);
        gameScreen.classList.remove('glitch-effect'); 
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
    gameScreen.style.filter = 'brightness(0.5)';
}

function update() {
    if (state === 'init') {
        startCountdownSequence();
        return;
    }
    
    if (state === 'countdown') {
        countdownTimer--;
        let seconds = Math.ceil(countdownTimer / 60);
        msgBox.innerText = seconds > 0 ? seconds : "START!";
        
        if (countdownTimer <= 0) {
            state = 'play';
            msgBox.style.display = 'none';
            gameScreen.style.filter = '';
        }
        return;
    }

    if (boss.phase === 4 && boss.isChanneling && boss.transitioning) {
        boss.x = 300; boss.y = 100;
    }

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
            gameScreen.className = '';
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
    if (player.regenTimer > 430) { 
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
        gameScreen.style.filter = "";
        
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

    // [복구] 보스 크기 고정 (고무줄 제거)
    boss.r = boss.baseR;
    
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
        
        if (b.isGiant) {
            b.y += 0.3 * localTimeScale;
        }

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
                        b.x += Math.cos(pushA) * 5;
                        b.y += Math.sin(pushA) * 5;
                        continue; 
                }
            }

            if (skills[3].active && !b.isLaser) {
                if (distSq < 160000 && distSq > 3600) { 
                    b.isEnemy = false; b.color = 'cyan'; 
                    b.angle = Math.atan2(boss.y - b.y, boss.x - b.x);
                    b.homing = 0.2; 
                    // [유지] 반사 대미지 2
                    b.damage = 2; 
                    b.scoreVal = 1;
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
                    gameScreen.style.backgroundColor = '#300';
                    spawnParticles(player.x, player.y, 'red', 20, 5);
                    setTimeout(()=>gameScreen.style.backgroundColor='', 100);
                    if(player.hp <= 0) state = 'over';
                }
            } else if (!b.isLaser && distSq < 400 && !b.grazed) { 
                let mult = getScoreMultiplier();
                score += 1 * mult; 
                b.grazed = true; 
            }

        } else {
            let hitGiant = false;
            if (b.y < 600) { 
                for(let j=0; j<bullets.length; j++) {
                    let eb = bullets[j];
                    if (eb.isEnemy && eb.isGiant && !eb.dead) {
                        let edx = b.x - eb.x;
                        let edy = b.y - eb.y;
                        let edistSq = edx*edx + edy*edy;
                        let isLaserHit = false;
                        if (b.isLaser) {
                                if (Math.abs(edx) < eb.r + 10) isLaserHit = true;
                        }

                        if ((!b.isLaser && edistSq < (eb.r+5)**2) || isLaserHit) {
                            eb.hp -= (b.damage || 3);
                            spawnParticles(eb.x, eb.y, 'orange', 2, 1);
                            if (eb.hp <= 0) {
                                eb.dead = true;
                                score += 50; 
                                spawnParticles(eb.x, eb.y, eb.color, 10, 3);
                            }
                            if (!b.isRailgun && !b.isGravityCounter) hitGiant = true; 
                            if (!b.isRailgun && !b.isGravityCounter) break; 
                        }
                    }
                }
            }
            if (hitGiant && !b.isLaser) {
                b.dead = true;
                continue;
            }

            let hitAny = false;
            let isHit = false;

            if (b.isLaser) {
                if (Math.abs(b.x - boss.x) < (b.h/2 + boss.r)) { 
                    isHit = true;
                }
            } else {
                if(Math.abs(b.x-boss.x)<30 + b.r && Math.abs(b.y-boss.y)<30 + b.r) {
                    isHit = true;
                }
            }

            if(isHit) {
                if (b.isRailgun) {
                    if (b.hasHitBoss) {
                        hitAny = true; 
                    } else {
                        boss.hp -= b.damage; 
                        score += b.scoreVal; 
                        spawnText(boss.x, boss.y - 30, `BIG HIT +${b.scoreVal}`, 'cyan', 25);
                        b.hasHitBoss = true;
                        hitAny = true;
                        spawnParticles(boss.x, boss.y, 'cyan', 20, 5);
                    }
                } 
                else {
                    boss.hp -= (b.damage || 3);
                    hitAny = true;
                    
                    let gainScore = 0;
                    if (b.scoreVal !== undefined && b.scoreVal > 0) {
                        gainScore = b.scoreVal;
                    } else {
                        gainScore = 1 * getScoreMultiplier();
                    }

                    score += gainScore;
                    
                    if (gainScore > 0) {
                        if (b.isLaser) {
                            if (frame % 6 === 0) spawnText(boss.x, boss.y - 30, `+${gainScore}`, '#0f0', 15);
                        } else {
                            spawnText(boss.x, boss.y - 30, `+${gainScore}`, '#0f0', 15);
                        }
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

function draw() {
    ctx.clearRect(0,0,600,800);
    
    // 1. 배경
    ctx.fillStyle = '#555';
    stars.forEach(s => {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI*2); ctx.fill();
    });

    if (showScoreLines) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.font = "10px Arial";
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        const lines = [420, 520, 650, 740];
        const scores = [5, 4, 3, 2];
        lines.forEach((y, i) => {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke();
            ctx.fillText(`ZONE ${scores[i]}`, 10, y - 5);
        });
        ctx.fillText(`ZONE 1`, 10, 790);
    }

    if (state === 'play' || state === 'over' || state === 'countdown') {
        
        // [잔상]
        afterimages.forEach(img => {
            ctx.save(); ctx.globalAlpha = img.alpha;
            ctx.fillStyle = 'cyan'; ctx.fillRect(img.x-15, img.y-15, 30, 30);
            ctx.restore(); 
        });

        // [탄환] (레이어 순서: 배경 -> 탄환 -> 보스 -> 플레이어)
        bullets.forEach(b => {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
            if (b.warnTime > 0 && b.timer < b.warnTime) {
                ctx.globalAlpha = 0.2; ctx.fillStyle = b.color;
                if(b.isLaser) {
                    ctx.fillRect(-1000, -b.h/2, b.w+1000, b.h);
                } else { 
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
                    
                    if (boss.phase === 4 && b.isEnemy) {
                        ctx.fillStyle = '#888'; 
                        ctx.fillRect(-1000, -currentH/2 - 4, b.w+1000, currentH + 8);
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(-1000, -currentH/2, b.w+1000, currentH);
                    } else {
                        // [복구] 깔끔한 2중 직사각형 레이저
                        ctx.fillRect(-1000, -currentH/2, b.w+1000, currentH);
                        ctx.fillStyle = '#fff'; ctx.fillRect(-1000, -currentH/4, b.w+1000, currentH/2);
                    }
                } else {
                    ctx.beginPath(); ctx.arc(0,0,b.r,0,Math.PI*2); ctx.fill();
                    // [복구] 대형탄 내부 코어
                    if(b.r > 5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0,b.r*0.6,0,Math.PI*2); ctx.fill(); }
                }
            }
            ctx.restore();
        });

        // [보스]
        if (boss.hp > 0) {
            let color = getPhaseColor();
            ctx.fillStyle = color; 
            ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI*2); ctx.fill();
        }

        // [플레이어]
        if (state !== 'over') {
            // [복구] 빨간색 사각형 몸체
            ctx.fillStyle = (player.invul>0 && Math.floor(frame/4)%2===0) ? 'transparent' : (skills[2].active ? '#0ff' : (player.slowTimer > 0 ? '#555' : 'red'));
            ctx.fillRect(player.x-15, player.y-15, 30, 30);

            // [복구] 흰색 히트박스 점
            if (!(player.invul>0 && Math.floor(frame/4)%2===0)) {
                ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(player.x,player.y,player.hitboxSize,0,Math.PI*2); ctx.fill();
            }

            // 패링 범위
            if (skills[12].active) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + Math.sin(frame*0.5)*0.2})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(player.x, player.y, 36, -Math.PI, 0); 
                ctx.stroke();
            }
            // 산데비스탄 잔상 사각형
            if (isRewinding) { ctx.fillStyle = '#0f0'; ctx.fillRect(player.x-15, player.y-15, 30, 30); }
        }

        // [오브젝트]
        if (shieldObj) {
            ctx.save();
            ctx.translate(shieldObj.x, shieldObj.y);
            ctx.strokeStyle = 'cyan'; ctx.lineWidth = 3; 
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
        if (skills[12].active) {
            ctx.save();
            ctx.strokeStyle = 'white'; ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(player.x, player.y - 30, 40, Math.PI, 0); 
            ctx.stroke();
            ctx.restore();
        }

        // [이펙트]
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
            ctx.fillStyle = t.color; ctx.font = `bold ${t.size}px Arial`;
            ctx.fillText(t.text, t.x, t.y);
        });
    }

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
    update();
    draw();
    requestAnimationFrame(loop);
}

// 유틸리티
function angleToP(obj) { return Math.atan2(player.y - obj.y, player.x - obj.x); }
function resetGame() {
    boss.hp = boss.maxHp; boss.phase = 1; score = 0; frame = 0;
    player.hp = player.maxHp; player.invul = 0; player.slowTimer = 0; player.regenTimer = 0;
    bullets.length=0; state='init'; patternTimer = 0; boss.transitioning = false; boss.freeze=false; boss.moveTimer=0;
    boss.isChanneling = false;
    timeScale = 1.0;
    shieldObj = null; gravityObj = null; loopCount = 0;
    afterimages = []; explosions = []; particles = []; texts = []; gameStateHistory = [];
    for(let i=1; i<=12; i++) { if(skills[i]) { skills[i].timer = 0; skills[i].active = false; } }
    
    msgBox.style.display = 'none';
    gameScreen.className = '';
    gameScreen.style.filter = "";
    clearAllPatterns(); 
}

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && state !== 'play' && state !== 'countdown') resetGame();
    if (e.code === 'KeyT') { 
        godMode = !godMode; 
        adminMsg.style.display = godMode ? 'block' : 'none'; 
        debugPanel.style.display = godMode ? 'flex' : 'none';
    }
    if (e.code === 'KeyV') { showScoreLines = !showScoreLines; }
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
