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

const player = { 
    x: 300, y: 700, r: 3, speed: 5, 
    hp: 5, maxHp: 5, 
    invul: 0, slowTimer: 0,
    hitboxSize: 2, regenTimer: 0 
};

const boss = { 
    x: 300, y: 150, r: 30, 
    hp: 25000, maxHp: 25000, 
    phase: 1, angle: 0,
    transitioning: false, freeze: false, moveTimer: 0,
    ultState: 'none', ultTimer: 0,
    patternCooldown: 0 
};

let bossClone = null;
let bullets = [];
let afterimages = []; // ★ 잔상 배열
let explosions = []; // ★ 유폭 이펙트
let shieldObj = null; 
const keys = {};

// ★ 스킬 시스템 (10종)
const skills = {
    1: { name: '무적', cd: 900, duration: 180, active: false, timer: 0 }, 
    2: { name: '산데', cd: 1200, duration: 300, active: false, timer: 0 }, 
    3: { name: '반사', cd: 600, duration: 60, active: false, timer: 0 }, 
    4: { name: '방패', cd: 900, duration: 400, active: false, timer: 0 }, 
    5: { name: '레일건', cd: 300, duration: 0, active: false, timer: 0 }, 
    6: { name: '오토', cd: 1200, duration: 300, active: false, timer: 0 },
    7: { name: '동결', cd: 1800, duration: 240, active: false, timer: 0 }, // 4초 시간정지
    8: { name: '흡혈', cd: 1200, duration: 300, active: false, timer: 0 }, // 5초간 피흡
    9: { name: '유폭', cd: 600, duration: 0, active: false, timer: 0 },    // 즉발 폭발
    10: { name: '중력장', cd: 1500, duration: 300, active: false, timer: 0 } // 5초간 삭제
};

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
        isSuction: p.isSuction || false,
        damage: p.damage || 1
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

const patterns = {
    // [Phase 1]
    1: () => { boss.freeze=false; for(let i=0; i<8; i++) bossShoot({a:boss.angle+i*0.8, s:2.5, c:'#aaf'}); boss.angle+=0.1; },
    2: () => { boss.freeze=false; for(let i=0; i<20; i++) bossShoot({a:Math.PI*2/20*i, s:2, c:'#fff'}); },
    3: () => { boss.freeze=true;  let aim=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:aim+i*0.2, s:3.5, c:'#0ff'}); }, 
    4: () => { boss.freeze=false; bossShoot({a:boss.angle, s:2.5, c:'#88f', curve:0.01}); bossShoot({a:boss.angle+Math.PI, s:2.5, c:'#88f', curve:0.01}); boss.angle+=0.15; },
    5: () => { boss.freeze=false; shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:2.5, c:'#44f'}); }, 
    6: () => { boss.freeze=true;  let a=angleToP(boss); bossShoot({a:a, s:2, accel:0.05, c:'#f0f'}); }, 

    // [Phase 2]
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
    16: () => { 
        boss.freeze=true;
        let startAngle = boss.angle;
        for(let i=0; i<4; i++) bossShoot({a:startAngle + (Math.PI/2)*i, s:0, c:'#f0f', w:1600, h:15, isLaser:true, warnTime:50, activeTime:50, curve:0.01}); 
        setTimeout(() => { if(state !== 'play') return; for(let i=0; i<4; i++) bossShoot({a:startAngle + (Math.PI/2)*i, s:0, c:'#a0a', w:1600, h:15, isLaser:true, warnTime:50, activeTime:50, curve:-0.01}); }, 1500); 
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

let patternTimer = 0;
let activePatterns = []; 

function pickPatterns() {
    activePatterns = [];
    let p = boss.phase;
    let count = 1;
    if (p === 1 && Math.random() < 0.15) count = 2; 
    if (p === 2 && Math.random() < 0.8) count = 2; 
    if (p === 3) count = Math.random() < 0.8 ? 2 : 3;

    let pool = [];
    if (p === 1) pool = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]; 
    if (p === 2) pool = [7, 7, 8, 9, 9, 10, 11]; 
    if (p === 3) pool = [12, 12, 13, 13, 14, 14, 15, 16, 17, 18]; 

    for(let i=0; i<count; i++) {
        let idx = Math.floor(Math.random() * pool.length);
        activePatterns.push(pool[idx]);
    }
}

function useSkill(id) {
    if (state !== 'play' || skills[id].timer > 0) return;
    
    skills[id].active = true;
    skills[id].timer = skills[id].cd;
    skills[id].activeTimer = skills[id].duration;

    if (id === 4) shieldObj = { x: player.x, y: player.y, r: 70 }; // 방패
    if (id === 5) { // 레일건
        shoot({ x: player.x, y: player.y - 50, a: -Math.PI/2, s: 0, w: 1000, h: 50, isLaser: true, warnTime: 0, activeTime: 10, c: 'cyan', isEnemy: false, damage: 200 });
        player.y = Math.min(790, player.y + 30);
    }
    // [9] 유폭: 가장 가까운 적탄 찾아서 폭발
    if (id === 9) {
        let targets = bullets.filter(b => b.isEnemy && !b.isLaser && !b.isSuction);
        targets.sort((a,b) => Math.hypot(player.x-a.x, player.y-a.y) - Math.hypot(player.x-b.x, player.y-b.y));
        if (targets.length > 0) createExplosion(targets[0].x, targets[0].y, 150);
        else skills[id].timer = 30; // 실패시 쿨타임 짧게 반환
    }
}

// 연쇄 폭발 생성 함수
function createExplosion(x, y, radius) {
    explosions.push({x: x, y: y, r: 0, maxR: radius, life: 20});
    // 범위 내 적탄 제거
    bullets.forEach(b => {
        if(b.isEnemy && !b.dead && !b.isLaser && Math.hypot(b.x-x, b.y-y) < radius) {
            b.dead = true;
            score += 10;
            // 20% 확률로 연쇄 폭발
            if(Math.random() < 0.2) setTimeout(() => createExplosion(b.x, b.y, radius*0.8), 100);
        }
    });
}

function updateSkills() {
    for(let i=1; i<=10; i++) {
        let s = skills[i];
        if (s.timer > 0) s.timer--;
        if (s.activeTimer > 0) {
            s.activeTimer--;
            if (s.activeTimer <= 0) {
                s.active = false;
                if (i===4) shieldObj = null;
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
    // [7] 동결: 시간 완전 정지
    else if (skills[7].active) { timeScale = 0; gameScreen.style.filter = "grayscale(100%)"; }
    else { 
        if(boss.ultState === 'none') {
            gameScreen.classList.remove('invert-effect');
            gameScreen.style.filter = ""; 
        }
        timeScale = 1.0;
    }
}

// ★ 부드러운 전환 효과를 위한 보스 이동 보간 함수
function smoothMoveBoss(targetX, targetY, speed) {
    boss.x += (targetX - boss.x) * speed;
    boss.y += (targetY - boss.y) * speed;
}

function startPhase2() {
    boss.transitioning = true;
    msgBox.style.display = 'block'; msgBox.innerText = "PHASE 2 BREAK!"; msgBox.style.color = 'red';
    
    // 부드러운 이동 (update에서 처리하도록 플래그 사용하거나 여기서 타이머로)
    // 여기선 간단히 연출 중 보스 위치 강제 이동 대신 부드럽게
    let t = 0;
    let startX = boss.x, startY = boss.y;
    let anim = setInterval(() => {
        t += 0.05;
        boss.x = startX + (300 - startX) * t;
        boss.y = startY + (100 - startY) * t;
        if(t >= 1) clearInterval(anim);
    }, 16);

    gameScreen.classList.add('shake-effect'); gameScreen.classList.add('invert-once');
    setTimeout(() => {
        gameScreen.classList.remove('shake-effect'); gameScreen.classList.remove('invert-once');
        msgBox.style.display = 'none'; boss.transitioning = false;
    }, 1500);
    
    // ★ 2페이즈 개막 패턴 강화 (블레스터 + 탄막 폭발)
    setTimeout(() => {
        for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/8*i, s:0, c:'#f00', w:1600, h:20, isLaser:true, warnTime:40, activeTime:30});
        for(let i=0; i<40; i++) shoot({x:boss.x, y:boss.y, a:Math.random()*7, s:Math.random()*5+2, c:'#ffaa00'});
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

    for(let i=0; i<6; i++) { setTimeout(() => { shoot({x: 50 + i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100); }
    setTimeout(() => { for(let i=0; i<7; i++) { setTimeout(() => { shoot({x: i * 100, y:0, a:Math.PI/2, s:0, w:1600, h:40, isLaser:true, warnTime:50, activeTime:30, c:'#f00'}); }, i * 100); } }, 1000);
}

function startBlackHole() {
    if (boss.ultState !== 'none') return;
    boss.ultState = 'gathering'; boss.ultTimer = 0; boss.freeze = true; bossClone = null; 
    msgBox.style.display = 'block'; msgBox.innerText = "ULTIMATE: BLACK HOLE"; msgBox.style.color = '#000';
    msgBox.style.textShadow = '0 0 10px #fff'; gameScreen.classList.add('invert-effect'); 
    bullets = [];
}

function updateBlackHole() {
    boss.ultTimer += timeScale; 
    // 부드러운 이동
    smoothMoveBoss(300, 400, 0.1 * timeScale);

    let dx = boss.x - player.x; let dy = boss.y - player.y;
    let dist = Math.hypot(dx, dy);
    // ★ 블랙홀 힘: 거리 무관 일정함 (반대키 누르면 아주 느리게 탈출)
    // 플레이어 속도가 5, 슬로우면 2.5. 힘을 4.5 정도로 설정하면 반대키 누를 시 0.5 속도로 탈출
    let pullStrength = 4.5; 
    
    // 벡터 정규화 후 힘 적용
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
    frame++; 
    updateSkills();
    
    if (player.invul > 0) player.invul--;
    if (player.slowTimer > 0) player.slowTimer--;
    
    player.regenTimer++;
    if (player.regenTimer > 600) { 
        player.regenTimer = 0;
        if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 0.5);
    }

    let skillSpeedMod = skills[1].active ? 0.2 : 1.0;
    let baseSpd = (keys['ShiftLeft']||keys['ShiftRight'] ? 2 : 5) * (player.slowTimer > 0 ? 0.5 : 1) * skillSpeedMod;

    // ★ 산데비스탄 잔상 효과
    if (skills[2].active && frame % 3 === 0 && (keys['ArrowLeft']||keys['ArrowRight']||keys['ArrowUp']||keys['ArrowDown'])) {
        afterimages.push({x: player.x, y: player.y, alpha: 0.8});
    }

    if(keys['ArrowLeft'] && player.x>5) player.x-=baseSpd;
    if(keys['ArrowRight'] && player.x<595) player.x+=baseSpd;
    if(keys['ArrowUp'] && player.y>5) player.y-=baseSpd;
    if(keys['ArrowDown'] && player.y<795) player.y+=baseSpd;
    
    if (!skills[2].active && frame % 5 === 0) {
        let aimA = -Math.PI/2;
        if (skills[6].active) aimA = Math.atan2(boss.y - player.y, boss.x - player.x);
        
        // 동결 시 총알은 생성되지만 움직이지 않음 (timeScale=0 때문에)
        shoot({x:player.x-10, y:player.y, a:aimA, s:15, r:3, c:'#afa', isEnemy:false});
        shoot({x:player.x+10, y:player.y, a:aimA, s:15, r:3, c:'#afa', isEnemy:false});
    }

    if (boss.ultState === 'gathering') {
        updateBlackHole();
        if(bossClone) bossClone = null;
    } else {
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
                        if ([8, 10, 12, 14, 15, 16, 17, 18].includes(pat)) freq = 999;
                        patterns[pat](); 
                        patterns[pat].cooldown = freq; 
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
    let fullHearts = "♥".repeat(Math.floor(player.hp));
    let halfHeart = (player.hp % 1 !== 0) ? "♡" : "";
    hpBox.innerText = fullHearts + halfHeart;

    for (let i=0; i<bullets.length; i++) {
        let b = bullets[i];
        if(b.dead) continue;

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
            // [3] 반사 (대폭 상향: 범위 250)
            if (skills[3].active && !b.isLaser && !b.isSuction) {
                let dist = Math.hypot(player.x - b.x, player.y - b.y);
                if (dist < 250) { 
                    b.isEnemy = false; b.color = 'cyan';
                    b.angle = angleToP(b) + Math.PI; 
                    continue;
                }
            }
            // [4] 방패 (튕겨내기 & 성장)
            if (shieldObj && !b.isLaser && !b.isSuction) {
                let dist = Math.hypot(shieldObj.x - b.x, shieldObj.y - b.y);
                if (dist < shieldObj.r) {
                    let nx = (b.x - shieldObj.x) / dist; let ny = (b.y - shieldObj.y) / dist;
                    let dot = b.vx * nx + b.vy * ny;
                    b.vx = b.vx - 2 * dot * nx; b.vy = b.vy - 2 * dot * ny;
                    b.angle = Math.atan2(b.vy, b.vx);
                    // 튕겨낼 때마다 방패 커짐
                    shieldObj.r += 2;
                    continue;
                }
            }
            // [10] 중력장 (흡수)
            if (skills[10].active && !b.isLaser && !b.isSuction) {
                let dist = Math.hypot(player.x - b.x, player.y - b.y);
                if (dist < 150) {
                    b.x += (player.x - b.x) * 0.1; b.y += (player.y - b.y) * 0.1;
                    b.r -= 0.5; if(b.r<=0) b.dead=true;
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
            let hitAny = false;
            if(Math.abs(b.x-boss.x)<30 && Math.abs(b.y-boss.y)<30) {
                let dmg = b.damage || 30;
                boss.hp -= dmg; 
                // [8] 흡혈
                if (skills[8].active) player.hp = Math.min(player.maxHp, player.hp + 0.02);
                
                score += 50; hitAny = true;
                if(boss.hp <= 0) state = 'clear';
            }
            if(bossClone) {
                if(Math.hypot(b.x-bossClone.x, b.y-bossClone.y) < bossClone.r) {
                    bossClone.hp -= 30; score += 20; hitAny = true;
                    if(bossClone.hp <= 0) bossClone = null;
                }
            }
            if(hitAny && !b.isLaser) b.dead = true;
        }
    }
    bullets = bullets.filter(b => !b.dead);
    
    // 폭발 이펙트 업데이트
    explosions.forEach(e => {
        e.r += 5; e.life--;
    });
    explosions = explosions.filter(e => e.life > 0);
}

function draw() {
    ctx.clearRect(0,0,600,800);
    
    // 잔상 그리기
    afterimages.forEach((img, i) => {
        ctx.save();
        ctx.globalAlpha = img.alpha;
        ctx.fillStyle = 'cyan'; // 반전 색깔 느낌
        ctx.fillRect(img.x-15, img.y-15, 30, 30);
        ctx.restore();
        img.alpha -= 0.05;
    });
    afterimages = afterimages.filter(i => i.alpha > 0);

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

    if (shieldObj) {
        ctx.save(); ctx.translate(shieldObj.x, shieldObj.y);
        ctx.strokeStyle = 'cyan'; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = 'cyan';
        ctx.beginPath(); ctx.arc(0, 0, shieldObj.r, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)'; ctx.fill();
        ctx.restore();
    }
    
    // 중력장 이펙트
    if (skills[10].active) {
        ctx.save(); ctx.translate(player.x, player.y);
        ctx.strokeStyle = '#a0f'; ctx.lineWidth = 2; 
        ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI*2); ctx.stroke();
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
    
    // 폭발 이펙트
    explosions.forEach(e => {
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.strokeStyle = 'orange'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
    });

    if (player.invul <= 0 || frame % 4 < 2) {
        ctx.fillStyle = player.slowTimer > 0 ? '#555' : 'red'; 
        ctx.fillRect(player.x-15, player.y-15, 30, 30);
        ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(player.x,player.y,player.hitboxSize,0,Math.PI*2); ctx.fill();
        if (skills[3].active) { ctx.strokeStyle = 'lime'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(player.x, player.y, 250, 0, 2*Math.PI); ctx.stroke(); }
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
    shieldObj = null; afterimages = []; explosions = [];
    for(let i=1; i<=10; i++) { skills[i].timer = 0; skills[i].active = false; }
    
    msgBox.style.display = 'none';
    gameScreen.classList.remove('shake-effect', 'invert-effect', 'phase3-effect', 'invert-once');
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
});
window.addEventListener('keyup', e=>keys[e.code]=false);
loop();
