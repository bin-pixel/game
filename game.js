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

const player = { 
    x: 300, y: 700, r: 3, speed: 5, 
    hp: 5, maxHp: 5, 
    invul: 0, slowTimer: 0,
    hitboxSize: 5 // ★ 판정 범위 약간 확대 (버그 수정용)
};

const boss = { 
    x: 300, y: 150, r: 30, 
    hp: 40000, maxHp: 40000, 
    phase: 1, angle: 0,
    transitioning: false,
    freeze: false,
    moveTimer: 0 
};

// ★ 분신 객체 (null이면 없는 상태)
let bossClone = null;

let bullets = [];
const keys = {};

// --- 총알 엔진 ---
function shoot(p) {
    let width = p.w || 0;
    if (p.isLaser) width = 1600; 

    bullets.push({
        x: p.x, y: p.y, speed: p.s, angle: p.a,
        r: p.r || 4, color: p.c || '#fff',
        accel: p.accel || 0, curve: p.curve || 0, homing: p.homing || 0,
        
        isLaser: p.isLaser || false, 
        w: width, h: p.h || 20, 
        
        warnTime: p.warnTime || 0, 
        activeTime: p.activeTime || 30, 
        // ★ 유도탄 수명 제한 (300프레임 = 5초)
        lifeTime: p.homing ? 300 : 9999, 
        timer: 0, 
        
        bounce: p.bounce || 0, delay: p.delay || 0, grazed: false, 
        isEnemy: p.isEnemy !== undefined ? p.isEnemy : true
    });
}

// ★ 보스와 분신이 동시에 쏘는 함수 wrapper
function bossShoot(p) {
    // 1. 보스 발사
    // p.x, p.y가 지정되어 있으면(레이저 등) 그대로 쓰고, 없으면 보스 위치 사용
    let originX = p.x !== undefined ? p.x : boss.x;
    let originY = p.y !== undefined ? p.y : boss.y;
    
    // 특수 패턴(화면 밖에서 나오는 것들)은 좌표 수정 안 함
    if (p.x === undefined) { 
        shoot({ ...p, x: boss.x, y: boss.y });
    } else {
        shoot(p);
    }

    // 2. 분신 발사 (분신이 살아있고, 화면 밖 생성 패턴이 아닐 때)
    if (bossClone && p.x === undefined) {
        shoot({ ...p, x: bossClone.x, y: bossClone.y });
    }
}

// --- 패턴 라이브러리 ---
const patterns = {
    // [Phase 1]
    1: () => { boss.freeze=false; for(let i=0; i<8; i++) bossShoot({a:boss.angle+i*0.8, s:3, c:'#aaf'}); boss.angle+=0.1; },
    2: () => { boss.freeze=false; for(let i=0; i<20; i++) bossShoot({a:Math.PI*2/20*i, s:2.5, c:'#fff'}); },
    3: () => { boss.freeze=true;  let aim=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:aim+i*0.2, s:4, c:'#0ff'}); }, 
    4: () => { boss.freeze=false; bossShoot({a:boss.angle, s:3, c:'#88f', curve:0.01}); bossShoot({a:boss.angle+Math.PI, s:3, c:'#88f', curve:0.01}); boss.angle+=0.15; },
    5: () => { boss.freeze=false; shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:3, c:'#44f'}); }, 
    6: () => { boss.freeze=true;  let a=angleToP(boss); bossShoot({a:a, s:2, accel:0.05, c:'#f0f'}); }, 

    // [Phase 2]
    7: () => { boss.freeze=false; for(let i=0; i<8; i++) bossShoot({a:Math.PI*2/8*i+boss.angle, s:3, c:'#0f0', bounce:1}); boss.angle+=0.04; }, 
    8: () => { boss.freeze=true;  bossShoot({a:angleToP(boss), s:6, c:'#f00', r:6, warnTime:40}); }, 
    9: () => { boss.freeze=false; for(let i=0; i<2; i++) bossShoot({a:boss.angle+Math.PI*i, s:3, c:'#ff0', curve:0.02}); boss.angle+=0.1; },
    10: () => { boss.freeze=false; shoot({x:Math.random()*600, y:Math.random()*300, a:Math.PI/2, s:0, accel:0.1, c:'#f80', r:4, warnTime:40}); },
    11: () => { boss.freeze=true;  let a=angleToP(boss); for(let i=-1; i<=1; i++) bossShoot({a:a+i*0.3, s:4, c:'#f00', bounce:1}); }, 

    // [Phase 3]
    12: () => { 
        boss.freeze=false; 
        let side = Math.floor(Math.random() * 4);
        let lx, ly, la;
        if(side===0) { lx = Math.random()*600; ly = 0; la = Math.PI/2 + (Math.random()-0.5); }
        else if(side===1) { lx = 600; ly = Math.random()*800; la = Math.PI + (Math.random()-0.5); }
        else if(side===2) { lx = Math.random()*600; ly = 800; la = -Math.PI/2 + (Math.random()-0.5); }
        else { lx = 0; ly = Math.random()*800; la = 0 + (Math.random()-0.5); }
        shoot({x:lx, y:ly, a:la, s:0, c:'#f0f', w:1600, h:30, isLaser:true, warnTime:60, activeTime:40}); 
    }, 
    13: () => { boss.freeze=false; bossShoot({a:angleToP(boss), s:2.5, c:'#a0f', homing:0.025}); }, 
    14: () => { 
        boss.freeze=false; 
        shoot({x:0, y:player.y, a:0, s:0, c:'#a0f', w:1600, h:40, isLaser:true, warnTime:70, activeTime:40}); 
        shoot({x:player.x, y:0, a:Math.PI/2, s:0, c:'#a0f', w:1600, h:40, isLaser:true, warnTime:70, activeTime:40});
    }, 
    15: () => { boss.freeze=true;  let r=200; for(let i=0; i<6; i++) shoot({x:player.x+Math.cos(i)*r, y:player.y+Math.sin(i)*r, a:Math.atan2(-Math.sin(i), -Math.cos(i)), s:1.5, accel:0.05, c:'#f0f', homing:0.01, warnTime:40}); }, 
    16: () => { boss.freeze=true;  bossShoot({a:boss.angle, s:0, c:'#f0f', w:1600, h:20, isLaser:true, warnTime:40, activeTime:30, curve:0.01}); boss.angle+=0.3; }, 
    17: () => { boss.freeze=false; shoot({x:Math.random()*500+50, y:0, a:Math.PI/2, s:0, c:'#f0f', w:1600, h:50, isLaser:true, warnTime:60, activeTime:40}); },
    
    // ★ 18번: 분신 소환 패턴 (확률 낮음)
    18: () => { 
        if(!bossClone && boss.hp > 0) { 
            boss.freeze = true;
            // 보스 반대편이나 근처에 소환
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

    // ★ 패턴 중첩 빈도 대폭 증가 (요청사항)
    if (p === 1 && Math.random() < 0.4) count = 2; // 1페: 40% 확률로 2개
    if (p === 2 && Math.random() < 0.8) count = 2; // 2페: 80% 확률로 2개
    if (p === 3) count = Math.random() < 0.6 ? 3 : 2; // 3페: 60% 확률로 3개, 아니면 2개

    let pool = [];
    if (p === 1) pool = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]; 
    if (p === 2) pool = [7, 7, 8, 9, 9, 10, 11]; 
    // 분신(18)은 확률 매우 낮게
    if (p === 3) pool = [12, 12, 13, 13, 14, 14, 15, 16, 17, 18]; 

    for(let i=0; i<count; i++) {
        let idx = Math.floor(Math.random() * pool.length);
        activePatterns.push(pool[idx]);
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

// ★ 3페이즈 연출: 화면 휩쓸기 (Sweep)
function startPhase3() {
    boss.transitioning = true;
    msgBox.style.display = 'block'; msgBox.innerText = "PHASE 3: APOCALYPSE"; msgBox.style.color = '#a0f';
    gameScreen.classList.add('shake-effect'); gameScreen.classList.add('invert-effect'); gameScreen.classList.add('phase3-effect');
    setTimeout(() => {
        gameScreen.classList.remove('shake-effect'); gameScreen.classList.remove('invert-effect'); gameScreen.classList.remove('phase3-effect');
        msgBox.style.display = 'none'; boss.transitioning = false;
    }, 2000);

    // ★ 레이저 폭격 (오른쪽 -> 왼쪽)
    for(let i=0; i<=12; i++) {
        setTimeout(() => {
            shoot({x: 600 - (i*50), y:0, a:Math.PI/2, s:0, w:1600, h:30, isLaser:true, warnTime:30, activeTime:20, c:'#f00'});
        }, i * 100);
    }
    // ★ 레이저 폭격 (왼쪽 -> 오른쪽)
    setTimeout(() => {
        for(let i=0; i<=12; i++) {
            setTimeout(() => {
                shoot({x: i*50, y:0, a:Math.PI/2, s:0, w:1600, h:30, isLaser:true, warnTime:30, activeTime:20, c:'#f00'});
            }, i * 100);
        }
    }, 1500);
}

function update() {
    if (state !== 'play') return;
    frame++;
    
    // 플레이어
    if (player.invul > 0) player.invul--;
    if (player.slowTimer > 0) player.slowTimer--;
    let baseSpd = (keys['ShiftLeft']||keys['ShiftRight'] ? 2 : 5) * (player.slowTimer > 0 ? 0.5 : 1);

    if(keys['ArrowLeft'] && player.x>5) player.x-=baseSpd;
    if(keys['ArrowRight'] && player.x<595) player.x+=baseSpd;
    if(keys['ArrowUp'] && player.y>5) player.y-=baseSpd;
    if(keys['ArrowDown'] && player.y<795) player.y+=baseSpd;
    
    if(frame % 5 === 0) {
        shoot({x:player.x-10, y:player.y, a:-Math.PI/2, s:15, r:3, c:'#afa', isEnemy:false});
        shoot({x:player.x+10, y:player.y, a:-Math.PI/2, s:15, r:3, c:'#afa', isEnemy:false});
    }

    // 보스 이동
    if (!boss.transitioning && !boss.freeze) {
        boss.moveTimer++; 
        boss.x = 300 + Math.cos(boss.moveTimer/120)*150;
        boss.y = 150 + Math.sin(boss.moveTimer/80)*50;
    }

    // 분신 이동 (보스와 대칭 이동)
    if (bossClone) {
        bossClone.moveTimer++;
        bossClone.x = 300 - Math.cos(bossClone.moveTimer/120)*150; // X축 대칭
        bossClone.y = 150 + Math.sin(bossClone.moveTimer/80)*50;   // Y축 동일
    }

    // 패턴 실행
    if (!boss.transitioning) {
        patternTimer++;
        if (patternTimer > 200) { 
            patternTimer = 0;
            pickPatterns();
        }
        activePatterns.forEach(pat => {
            if (patterns[pat]) {
                let freq = 10;
                if ([8, 10, 12, 14, 15, 17, 18].includes(pat)) {
                    if (patternTimer === 1) patterns[pat]();
                } else {
                    if (frame % freq === 0) patterns[pat]();
                }
            }
        });
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
    hpBox.innerText = "♥".repeat(Math.max(0, player.hp));

    // --- 총알 업데이트 (버그 완벽 수정) ---
    for (let i=0; i<bullets.length; i++) {
        let b = bullets[i];
        if(b.dead) continue;

        b.timer++;
        // 유도탄 수명 체크
        if (b.lifeTime && b.timer > b.lifeTime) {
            b.dead = true; continue;
        }
        
        // 레이저 수명 체크
        if (b.isLaser) {
            if (b.timer > b.warnTime + b.activeTime) {
                b.dead = true; continue;
            }
        }

        if (b.warnTime > 0 && b.timer < b.warnTime) {
            if(b.homing && b.isEnemy) {
                // 유도 경고탄은 대상을 계속 바라봄
                let target = b.isEnemy ? player : boss;
                b.angle = Math.atan2(target.y - b.y, target.x - b.x);
            }
            continue; 
        }

        if(b.accel) b.speed += b.accel;
        if(b.delay > 0) { b.delay--; continue; }
        if(b.homing && b.isEnemy) {
            let targetA = Math.atan2(player.y - b.y, player.x - b.x);
            let diff = targetA - b.angle;
            while(diff < -Math.PI) diff += Math.PI*2;
            while(diff > Math.PI) diff -= Math.PI*2;
            b.angle += diff * b.homing;
        }
        if(b.curve) b.angle += b.curve;

        b.vx = Math.cos(b.angle) * b.speed;
        b.vy = Math.sin(b.angle) * b.speed;
        b.x += b.vx; b.y += b.vy;

        if(b.bounce > 0 && (b.x<0 || b.x>600)) { b.vx*=-1; b.angle=Math.PI-b.angle; b.bounce--; b.x+=b.vx; }
        if(b.x<-100 || b.x>700 || b.y<-100 || b.y>900) b.dead = true;

        if (b.isEnemy) {
            let hit = false;
            let dist = 0;
            if (b.isLaser) {
                // 레이저 충돌 판정 (활성 시간 동안만)
                 if (b.timer >= b.warnTime) {
                     let timeLeft = (b.warnTime + b.activeTime) - b.timer;
                     let currentH = b.h;
                     if(timeLeft < 10) currentH = b.h * (timeLeft/10);

                     let dx = player.x - b.x;
                     let dy = player.y - b.y;
                     let rx = dx * Math.cos(-b.angle) - dy * Math.sin(-b.angle);
                     let ry = dx * Math.sin(-b.angle) + dy * Math.cos(-b.angle);
                     
                     if (rx >= 0 && rx <= b.w && Math.abs(ry) <= currentH/2 + player.hitboxSize) {
                         hit = true;
                     }
                 }
            } else {
                dist = Math.hypot(b.x-player.x, b.y-player.y);
                // ★ 판정 범위 수정: 플레이어 hitbox(5) + 탄알 반지름(r)
                if (dist < player.hitboxSize + b.r + 2) hit = true;
            }

            if(hit) {
                if(player.invul <= 0 && !godMode) {
                    player.hp--;
                    player.invul = 30; // ★ 무적 시간 0.5초로 감소
                    player.slowTimer = 60;
                    gameScreen.style.backgroundColor = '#300';
                    setTimeout(()=>gameScreen.style.backgroundColor='', 100);
                    if(player.hp <= 0) state = 'over';
                }
            } else if (!b.isLaser && dist < 20 && !b.grazed) { 
                score += 5; b.grazed = true; 
            }

        } else {
            // 아군 총알 처리
            let hitAny = false;
            // 보스 피격
            if(Math.abs(b.x-boss.x)<30 && Math.abs(b.y-boss.y)<30) {
                boss.hp -= 30; score += 50; hitAny = true;
                if(boss.hp <= 0) state = 'clear';
            }
            // 분신 피격
            if(bossClone) {
                if(Math.hypot(b.x-bossClone.x, b.y-bossClone.y) < bossClone.r) {
                    bossClone.hp -= 30; score += 20; hitAny = true;
                    if(bossClone.hp <= 0) bossClone = null; // 분신 파괴
                }
            }
            if(hitAny) b.dead = true;
        }
    }
    bullets = bullets.filter(b => !b.dead);
}

function draw() {
    ctx.clearRect(0,0,600,800);
    
    // 분신 그리기
    if (bossClone) {
        ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.arc(bossClone.x, bossClone.y, bossClone.r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
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
        if(keys['ShiftLeft']||keys['ShiftRight']) {
            ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(player.x,player.y,4,0,Math.PI*2); ctx.fill();
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
    player.hp = player.maxHp; player.invul = 0; player.slowTimer = 0;
    bullets.length=0; bossClone=null; state='play'; patternTimer = 0; boss.transitioning = false; boss.freeze=false; boss.moveTimer=0;
    msgBox.style.display = 'none';
    gameScreen.classList.remove('shake-effect', 'invert-effect', 'phase3-effect', 'invert-once');
}

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && state !== 'play') resetGame();
    if (e.code === 'KeyT') { godMode = !godMode; adminMsg.style.display = godMode ? 'block' : 'none'; }
});
window.addEventListener('keyup', e=>keys[e.code]=false);
loop();
