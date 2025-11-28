const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const uiHp = document.getElementById('boss-hp-bar');
const scoreBox = document.getElementById('score-box');
const hpBox = document.getElementById('hp-box');
const msgBox = document.getElementById('msg-box');
const adminMsg = document.getElementById('admin-msg');
const gameScreen = document.getElementById('game-screen');

// --- 게임 상태 ---
let frame = 0;
let score = 0;
let state = 'play'; 
let godMode = false;
// ★ 시간 조작 변수 (산데비스탄용)
let timeScale = 1.0; 

const player = { 
    x: 300, y: 700, r: 3, speed: 5, 
    hp: 5, maxHp: 5, 
    invul: 0, slowTimer: 0,
    hitboxSize: 2,
    regenTimer: 0 // ★ 자동 회복 타이머
};

const boss = { 
    x: 300, y: 150, r: 30, 
    hp: 25000, maxHp: 25000, 
    phase: 1, angle: 0,
    transitioning: false, freeze: false, moveTimer: 0,
    ultState: 'none', ultTimer: 0
};

let bossClone = null;
let bullets = [];
const keys = {};

// ★ 스킬 시스템 정의
const skills = {
    1: { name: '무적', cd: 900, duration: 180, active: false, timer: 0 }, // 15초 쿨, 3초 지속
    2: { name: '산데', cd: 1200, duration: 300, active: false, timer: 0 }, // 20초 쿨, 5초 지속
    3: { name: '반사', cd: 600, duration: 60, active: false, timer: 0 }, // 10초 쿨, 1초 지속
    4: { name: '방패', cd: 900, duration: 300, active: false, timer: 0 }, // 15초 쿨, 5초 지속
    5: { name: '점멸', cd: 180, duration: 0, active: false, timer: 0 }, // 3초 쿨, 즉발
    6: { name: '폭주', cd: 1200, duration: 300, active: false, timer: 0 } // 20초 쿨, 5초 지속
};

// --- 총알 엔진 ---
function shoot(p) {
    let width = p.w || 0;
    if (p.isLaser) width = 1600; 

    bullets.push({
        x: p.x, y: p.y, speed: p.s, angle: p.a,
        r: p.r || 4, color: p.c || '#fff',
        accel: p.accel || 0, curve: p.curve || 0, homing: p.homing || 0,
        isLaser: p.isLaser || false, w: width, h: p.h || 20, 
        warnTime: p.warnTime || 0, activeTime: p.activeTime || 30, 
        lifeTime: p.homing ? 300 : 9999, timer: 0, 
        bounce: p.bounce || 0, delay: p.delay || 0, grazed: false, 
        isEnemy: p.isEnemy !== undefined ? p.isEnemy : true,
        isSuction: p.isSuction || false 
    });
}

function bossShoot(p) {
    let originX = p.x !== undefined ? p.x : boss.x;
    let originY = p.y !== undefined ? p.y : boss.y;
    if (p.x === undefined) shoot({ ...p, x: boss.x, y: boss.y });
    else shoot(p);
    if (bossClone && p.x === undefined && boss.ultState === 'none') {
        shoot({ ...p, x: bossClone.x, y: bossClone.y });
    }
}

// --- 패턴 라이브러리 ---
const patterns = {
    // [Phase 1]
    1: () => { boss.freeze=false; for(let i=0; i<8; i++) bossShoot({a:boss.angle+i*0.8, s:2.5, c:'#aaf'}); boss.angle+=0.1; },
    2: () => { boss.freeze=false; for(let i=0; i<20; i++) bossShoot({a:Math.PI*2/20*i, s:2, c:'#fff'}); },
    3: () => { boss.freeze=true;  let aim=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:aim+i*0.2, s:3.5, c:'#0ff'}); }, 
    4: () => { boss.freeze=false; bossShoot({a:boss.angle, s:2.5, c:'#88f', curve:0.01}); bossShoot({a:boss.angle+Math.PI, s:2.5, c:'#88f', curve:0.01}); boss.angle+=0.15; },
    5: () => { boss.freeze=false; shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:2.5, c:'#44f'}); }, 
    6: () => { boss.freeze=true;  let a=angleToP(boss); bossShoot({a:a, s:2, accel:0.05, c:'#f0f'}); }, 

    // [Phase 2] (너프됨: 탄속 1.5, 탄수 4)
    7: () => { boss.freeze=false; for(let i=0; i<4; i++) bossShoot({a:Math.PI*2/4*i+boss.angle, s:1.5, c:'#0f0', bounce:1}); boss.angle+=0.04; }, 
    8: () => { boss.freeze=true;  bossShoot({a:angleToP(boss), s:5, c:'#f00', r:6, warnTime:50}); }, 
    9: () => { boss.freeze=false; for(let i=0; i<2; i++) bossShoot({a:boss.angle+Math.PI*i, s:2.5, c:'#ff0', curve:0.02}); boss.angle+=0.1; },
    10: () => { boss.freeze=false; shoot({x:Math.random()*600, y:Math.random()*300, a:Math.PI/2, s:0, accel:0.1, c:'#f80', r:4, warnTime:40}); },
    11: () => { boss.freeze=true;  let a=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:a+i*0.3, s:3.5, c:'#f00', bounce:1}); }, 

    // [Phase 3]
    12: () => { 
        boss.freeze=false; 
        let side = Math.floor(Math.random() * 4);
        let lx, ly, la;
        if(side===0) { lx = Math.random()*600; ly = 0; la = Math.PI/2 + (Math.random()-0.5); }
        else if(side===1) { lx = 600; ly = Math.random()*800; la = Math.PI + (Math.random()-0.5); }
        else if(side===2) { lx = Math.random()*600; ly = 800; la = -Math.PI/2 + (Math.random()-0.5); }
        else { lx = 0; ly = Math.random()*800; la = 0 + (Math.random()-0.5); }
        shoot({x:lx, y:ly, a:la, s:0, c:'#f0f', w:1600, h:30, isLaser:true, warnTime:70, activeTime:40}); 
    }, 
    13: () => { boss.freeze=false; bossShoot({a:angleToP(boss), s:2.5, c:'#a0f', homing:0.02}); }, 
    14: () => { 
        boss.freeze=false; 
        shoot({x:0, y:player.y, a:0, s:0, c:'#a0f', w:1600, h:40, isLaser:true, warnTime:80, activeTime:40}); 
        shoot({x:player.x, y:0, a:Math.PI/2, s:0, c:'#a0f', w:1600, h:40, isLaser:true, warnTime:80, activeTime:40});
    }, 
    15: () => { boss.freeze=true;  let r=200; for(let i=0; i<6; i++) shoot({x:player.x+Math.cos(i)*r, y:player.y+Math.sin(i)*r, a:Math.atan2(-Math.sin(i), -Math.cos(i)), s:1.5, accel:0.05, c:'#f0f', homing:0.01, warnTime:50}); }, 
    
    // ★ 16번: 십자 회전 광선 2연격 (방향 반대)
    16: () => { 
        boss.freeze=true;
        let startAngle = boss.angle;
        // 1타: 시계 방향
        for(let i=0; i<4; i++) {
            bossShoot({a:startAngle + (Math.PI/2)*i, s:0, c:'#f0f', w:1600, h:15, isLaser:true, warnTime:50, activeTime:50, curve:0.01}); 
        }
        // 2타: 반시계 방향 (1.5초 뒤)
        setTimeout(() => {
            if(state !== 'play') return;
            for(let i=0; i<4; i++) {
                bossShoot({a:startAngle + (Math.PI/2)*i, s:0, c:'#a0a', w:1600, h:15, isLaser:true, warnTime:50, activeTime:50, curve:-0.01}); 
            }
        }, 1500); // 실제 시간 기준
    }, 
    
    17: () => { boss.freeze=false; shoot({x:Math.random()*500+50, y:0, a:Math.PI/2, s:0, c:'#f0f', w:1600, h:50, isLaser:true, warnTime:70, activeTime:40}); },
    18: () => { 
        if(!bossClone && boss.hp > 0 && boss.ultState === 'none') { 
            boss.freeze = true;
            bossClone = { x: 600 - boss.x, y: boss.y, r: 20, hp: 2000, moveTimer: 0 };
            msgBox.style.display='block'; msgBox.innerText="DOPPELGANGER!"; msgBox.style.color='#aaa';
            setTimeout(()=>msgBox.style.display='none', 1000);
        }
    }
};

// --- 메인 로직 ---
let patternTimer = 0;
let activePatterns = []; 

function pickPatterns() {
    activePatterns = [];
    let p = boss.phase;
    let count = 1;

    if (p === 1 && Math.random() < 0.15) count = 2; 
    if (p === 2 && Math.random() < 0.8) count = 2; 
    if (p === 3) count = Math.random() < 0.8 ? 2 : 3; // ★ 3페: 2개 이상 쓸 확률 높임

    let pool = [];
    if (p === 1) pool = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]; 
    if (p === 2) pool = [7, 7, 8, 9, 9, 10, 11]; 
    if (p === 3) pool = [12, 12, 13, 13, 14, 14, 15, 16, 17, 18]; 

    for(let i=0; i<count; i++) {
        let idx = Math.floor(Math.random() * pool.length);
        activePatterns.push(pool[idx]);
    }
}

// 스킬 사용 함수
function useSkill(id) {
    if (state !== 'play' || skills[id].timer > 0) return;
    
    skills[id].active = true;
    skills[id].timer = skills[id].cd;
    skills[id].activeTimer = skills[id].duration;

    // 즉발 스킬 처리
    if (id === 5) { // 점멸
        let spd = 200;
        if(keys['ArrowLeft']) player.x = Math.max(10, player.x - spd);
        if(keys['ArrowRight']) player.x = Math.min(590, player.x + spd);
        if(keys['ArrowUp']) player.y = Math.max(10, player.y - spd);
        if(keys['ArrowDown']) player.y = Math.min(790, player.y + spd);
        player.invul = 30; // 짧은 무적
    }
}

// 스킬 업데이트 (쿨타임, 효과)
function updateSkills() {
    for(let i=1; i<=6; i++) {
        let s = skills[i];
        if (s.timer > 0) s.timer--;
        if (s.activeTimer > 0) {
            s.activeTimer--;
            if (s.activeTimer <= 0) s.active = false;
        }
        
        // UI 업데이트
        let skillEl = document.getElementById(`skill-${i}`);
        if(skillEl) {
            if(s.active) skillEl.classList.add('active');
            else skillEl.classList.remove('active');
            
            let cdPer = s.timer > 0 ? (s.timer / s.cd * 100) : 0;
            skillEl.querySelector('.cooldown').style.height = `${cdPer}%`;
        }
    }

    // [2] 산데비스탄: 시간 왜곡
    if (skills[2].active) {
        timeScale = 0.1; // 적이 10배 느려짐
        gameScreen.classList.add('invert-effect');
    } else {
        if(boss.ultState === 'none') gameScreen.classList.remove('invert-effect'); // 궁극기 아닐때만 끔
        timeScale = 1.0;
    }
}

function startPhase2() {
    boss.transitioning = true;
    msgBox.style.display = 'block'; msgBox.innerText = "PHASE 2 BREAK!"; msgBox.style.color = 'red';
    boss.x = 300; boss.y = 100;
    gameScreen.classList.add('shake-effect'); gameScreen.classList.add('invert-once');
    setTimeout(() => {
        gameScreen.classList.remove('shake-effect'); gameScreen.classList.remove('invert-once');
        msgBox.style.display = 'none'; boss.transitioning = false;
    }, 1500);
    setTimeout(() => {
        for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/8*i, s:0, c:'#f00', w:1600, h:20, isLaser:true, warnTime:40, activeTime:30});
    }, 500);
}

function startPhase3() {
    boss.transitioning = true;
    msgBox.style.display = 'block'; msgBox.innerText = "PHASE 3: APOCALYPSE"; msgBox.style.color = '#a0f';
    gameScreen.classList.add('shake-effect'); gameScreen.classList.add('phase3-effect');
    gameScreen.classList.add('invert-effect');
    setTimeout(() => { gameScreen.classList.remove('invert-effect'); }, 100);
    setTimeout(() => {
        gameScreen.classList.remove('shake-effect'); 
        msgBox.style.display = 'none'; boss.transitioning = false;
    }, 2000);

    for(let i=0; i<6; i++) {
        setTimeout(() => { shoot({x: 50 + i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100);
    }
    setTimeout(() => {
        for(let i=0; i<7; i++) {
            setTimeout(() => { shoot({x: i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100);
        }
    }, 1000);
}

function startBlackHole() {
    if (boss.ultState !== 'none') return;
    boss.ultState = 'gathering'; boss.ultTimer = 0; boss.freeze = true; bossClone = null; 
    msgBox.style.display = 'block'; msgBox.innerText = "ULTIMATE: BLACK HOLE"; msgBox.style.color = '#000';
    msgBox.style.textShadow = '0 0 10px #fff'; gameScreen.classList.add('invert-effect'); 
    bullets = [];
}

function updateBlackHole() {
    // 산데비스탄 쓰면 블랙홀 타이머도 느리게 감
    boss.ultTimer += timeScale;
    
    boss.x += (300 - boss.x) * 0.1 * timeScale;
    boss.y += (400 - boss.y) * 0.1 * timeScale;

    let dx = boss.x - player.x; let dy = boss.y - player.y;
    let dist = Math.hypot(dx, dy);
    let pullStrength = 5000 / (dist * dist + 100);
    if (pullStrength > 5.5) pullStrength = 5.5;

    // 플레이어는 산데비스탄의 영향(느려짐)을 받으면 안되지만, 물리적으로는 적용됨
    // 블랙홀 끌어당김도 timeScale 적용
    player.x += dx * pullStrength * 0.05 * timeScale;
    player.y += dy * pullStrength * 0.05 * timeScale;

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
    msgBox.style.display = 'none'; gameScreen.classList.remove('invert-effect');
    gameScreen.classList.add('shake-effect');
    setTimeout(() => gameScreen.classList.remove('shake-effect'), 500);

    if (playerDist < 250 && !godMode && player.invul <= 0 && !skills[1].active) {
        let damage = Math.floor((250 - playerDist) / 40); 
        if (damage < 1) damage = 1;
        player.hp -= damage; player.invul = 60;
        gameScreen.style.backgroundColor = 'white'; 
        setTimeout(()=>gameScreen.style.backgroundColor='', 200);
        if (player.hp <= 0) state = 'over';
    }
    bullets = [];
}

function update() {
    if (state !== 'play') return;
    frame++; // 프레임은 절대 시간
    updateSkills();
    
    // 플레이어 (스킬 영향 받음)
    if (player.invul > 0) player.invul--;
    if (player.slowTimer > 0) player.slowTimer--;
    
    // 자동 회복
    player.regenTimer++;
    if (player.regenTimer > 600) { // 10초
        player.regenTimer = 0;
        if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 0.5);
    }

    // 이동 속도 계산
    let skillSpeedMod = 1.0;
    if (skills[1].active) skillSpeedMod = 0.2; // 무적 시 느려짐
    
    let baseSpd = (keys['ShiftLeft']||keys['ShiftRight'] ? 2 : 5) * (player.slowTimer > 0 ? 0.5 : 1) * skillSpeedMod;

    if(keys['ArrowLeft'] && player.x>5) player.x-=baseSpd;
    if(keys['ArrowRight'] && player.x<595) player.x+=baseSpd;
    if(keys['ArrowUp'] && player.y>5) player.y-=baseSpd;
    if(keys['ArrowDown'] && player.y<795) player.y+=baseSpd;
    
    // 플레이어 사격 (폭주 스킬 시 10배 속도)
    let fireRate = skills[6].active ? 10 : 1; 
    // 기본 5프레임마다 발사 -> 폭주 시 매 프레임 발사 가능
    if (frame % Math.max(1, Math.floor(5/fireRate)) === 0) {
        shoot({x:player.x-10, y:player.y, a:-Math.PI/2, s:15, r:3, c:'#afa', isEnemy:false});
        shoot({x:player.x+10, y:player.y, a:-Math.PI/2, s:15, r:3, c:'#afa', isEnemy:false});
    }

    if (boss.ultState === 'gathering') {
        updateBlackHole();
        if(bossClone) bossClone = null;
    } else {
        // ★ timeScale 적용 (보스, 분신 이동)
        if (!boss.transitioning && !boss.freeze) {
            boss.moveTimer += timeScale; 
            boss.x = 300 + Math.cos(boss.moveTimer/120)*150;
            boss.y = 150 + Math.sin(boss.moveTimer/80)*50;
        }

        if (bossClone) {
            bossClone.moveTimer += timeScale;
            bossClone.x = 300 - Math.cos(bossClone.moveTimer/120)*150; 
            bossClone.y = 150 + Math.sin(bossClone.moveTimer/80)*50;
        }

        if (!boss.transitioning) {
            patternTimer += timeScale; // 패턴 타이머도 느리게
            if (patternTimer > 200) { 
                patternTimer = 0;
                pickPatterns();
            }
            activePatterns.forEach(pat => {
                if (patterns[pat]) {
                    let freq = 10;
                    if ([8, 10, 12, 14, 15, 16, 17, 18].includes(pat)) {
                        if (Math.floor(patternTimer) === 1) patterns[pat]();
                    } else {
                        // 빈도 체크도 timeScale 고려하면 복잡하니, frame 기준으로 하되 패턴함수 내부에서 timeScale 쓰게 유도
                        // 여기선 간단히 실행 빈도 자체는 유지하되 탄막 움직임이 느려짐
                        if (frame % freq === 0) patterns[pat]();
                    }
                }
            });
            
            if (boss.phase === 3 && frame % 600 === 0 && Math.random() < 0.4) {
                startBlackHole();
            }
        }
    }

    let hpR = boss.hp/boss.maxHp;
    let oldPhase = boss.phase;
    if (hpR <= 0.33) boss.phase = 3;
    else if (hpR <= 0.66) boss.phase = 2;
    else boss.phase = 1;

    if(oldPhase !== boss.phase) {
        for(let b of bullets) if(b.isEnemy) b.dead = true;
        if(boss.phase === 2) startPhase2();
        if(boss.phase === 3) startPhase3();
    }
    
    uiHp.style.width = (hpR*100)+'%';
    uiHp.style.background = boss.phase===1?'#0cf' : boss.phase===2?'#f33' : '#a0f';
    scoreBox.innerText = `SCORE: ${score}`;
    
    // 체력 소수점 처리 (반 하트)
    let fullHearts = "♥".repeat(Math.floor(player.hp));
    let halfHeart = (player.hp % 1 !== 0) ? "♡" : "";
    hpBox.innerText = fullHearts + halfHeart;

    // --- 총알 업데이트 ---
    for (let i=0; i<bullets.length; i++) {
        let b = bullets[i];
        if(b.dead) continue;

        // ★ 시간 왜곡 적용 (timeScale)
        // 아군 총알은 느려지지 않음! (플레이어 이득)
        let localTimeScale = b.isEnemy ? timeScale : 1.0;

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
            // [3] 반사 스킬: 범위 내 적 탄알을 아군으로
            if (skills[3].active && !b.isLaser && !b.isSuction) {
                let dist = Math.hypot(player.x - b.x, player.y - b.y);
                if (dist < 100) { // 반사 범위 100
                    b.isEnemy = false;
                    b.color = 'cyan';
                    b.angle = angleToP(b) + Math.PI; // 보스 쪽으로 반사
                    continue;
                }
            }

            // [4] 방패 스킬: 전방 탄알 삭제 (레이저 제외)
            if (skills[4].active && !b.isLaser && !b.isSuction) {
                let dist = Math.hypot(player.x - b.x, player.y - b.y);
                if (dist < 60 && b.y < player.y) { // 플레이어 위쪽(전방)만 막음
                    b.dead = true;
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
                    // 무적 스킬[1] 사용 중이면 데미지 X
                    let isInvulSkill = skills[1].active;
                    let bossCol = (boss.ultState !== 'none') && (Math.hypot(player.x-boss.x, player.y-boss.y) < boss.r);
                    
                    if (!bossCol && player.invul <= 0 && !godMode && !isInvulSkill) {
                        player.hp--;
                        player.invul = 60; player.slowTimer = 60;
                        gameScreen.style.backgroundColor = '#300';
                        setTimeout(()=>gameScreen.style.backgroundColor='', 100);
                        if(player.hp <= 0) state = 'over';
                    }
                }
            } else if (!b.isLaser && !b.isSuction && dist < 20 && !b.grazed) { 
                score += 5; b.grazed = true; 
            }

        } else {
            // 아군 탄알 처리
            let hitAny = false;
            if(Math.abs(b.x-boss.x)<30 && Math.abs(b.y-boss.y)<30) {
                boss.hp -= 30; score += 50; hitAny = true;
                if(boss.hp <= 0) state = 'clear';
            }
            if(bossClone) {
                if(Math.hypot(b.x-bossClone.x, b.y-bossClone.y) < bossClone.r) {
                    bossClone.hp -= 30; score += 20; hitAny = true;
                    if(bossClone.hp <= 0) bossClone = null;
                }
            }
            if(hitAny) b.dead = true;
        }
    }
    bullets = bullets.filter(b => !b.dead);
}

function draw() {
    ctx.clearRect(0,0,600,800);
    if (bossClone) {
        ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.arc(bossClone.x, bossClone.y, bossClone.r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
    }

    if (boss.ultState === 'gathering') {
        ctx.save(); ctx.translate(boss.x, boss.y); ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0,0, 100 + Math.random()*20, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#a0f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0,0, 100 + Math.random()*20, 0, Math.PI*2); ctx.stroke();
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

    if (player.invul <= 0 || frame % 4 < 2) {
        ctx.fillStyle = player.slowTimer > 0 ? '#555' : 'red'; 
        ctx.fillRect(player.x-15, player.y-15, 30, 30);
        ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(player.x,player.y,player.hitboxSize,0,Math.PI*2); ctx.fill();
        
        // ★ 스킬 이펙트 (방패)
        if (skills[4].active) {
            ctx.strokeStyle = 'cyan'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(player.x, player.y, 60, Math.PI, 2*Math.PI); ctx.stroke();
        }
        // ★ 스킬 이펙트 (반사 범위)
        if (skills[3].active) {
            ctx.strokeStyle = 'lime'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(player.x, player.y, 100, 0, 2*Math.PI); ctx.stroke();
        }
    }

    ctx.fillStyle = uiHp.style.background; 
    ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI*2); ctx.fill();
    
    if(state !== 'play') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,600,800);
        ctx.fillStyle = '#fff'; ctx.font = '50px Courier'; ctx.textAlign='center';
        ctx.fillText(state==='clear'?"VICTORY!":"GAME OVER", 300, 400);
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
    // 스킬 리셋
    for(let i=1; i<=6; i++) { skills[i].timer = 0; skills[i].active = false; }
    
    msgBox.style.display = 'none';
    gameScreen.classList.remove('shake-effect', 'invert-effect', 'phase3-effect', 'invert-once');
}

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && state !== 'play') resetGame();
    if (e.code === 'KeyT') { godMode = !godMode; adminMsg.style.display = godMode ? 'block' : 'none'; }
    
    // 스킬 키 바인딩
    if (e.code === 'Digit1') useSkill(1);
    if (e.code === 'Digit2') useSkill(2);
    if (e.code === 'Digit3') useSkill(3);
    if (e.code === 'Digit4') useSkill(4);
    if (e.code === 'Digit5') useSkill(5);
    if (e.code === 'Digit6') useSkill(6);
});
window.addEventListener('keyup', e=>keys[e.code]=false);
loop();
