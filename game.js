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

const player = { x: 300, y: 700, r: 3, speed: 5, hp: 5, maxHp: 5, invul: 0, slowTimer: 0 };
const boss = { 
    x: 300, y: 150, r: 30, hp: 40000, maxHp: 40000, 
    phase: 1, angle: 0,
    transitioning: false,
    freeze: false // ★ true면 보스 이동 멈춤
};

let bullets = [];
let clones = []; // ★ 분신 배열
const keys = {};

// --- 총알 엔진 ---
function shoot(p) {
    bullets.push({
        x: p.x, y: p.y, speed: p.s, angle: p.a,
        r: p.r || 4, color: p.c || '#fff',
        accel: p.accel || 0, curve: p.curve || 0, homing: p.homing || 0,
        isLaser: p.isLaser || false, w: p.w || 0, h: p.h || 0,
        warnTime: p.warnTime || 0, timer: 0,
        bounce: p.bounce || 0, delay: p.delay || 0, grazed: false, 
        isEnemy: p.isEnemy !== undefined ? p.isEnemy : true
    });
}

// --- 분신(Clone) 클래스 ---
class Clone {
    constructor(x, y) {
        this.x = x; this.y = y; this.r = 20;
        this.hp = 800; // 분신 체력
        this.frame = 0;
        this.maxHp = 800;
    }
    update() {
        this.frame++;
        // 분신 전용 패턴 (랜덤)
        if (this.frame % 80 === 0) {
            let pat = Math.random();
            if (pat < 0.4) { // 1. 조준탄 (흔함)
                let a = Math.atan2(player.y - this.y, player.x - this.x);
                shoot({x:this.x, y:this.y, a:a, s:4, c:'#aaa'});
            } else if (pat < 0.7) { // 2. 원형탄
                for(let i=0; i<6; i++) shoot({x:this.x, y:this.y, a:i, s:3, c:'#fff'});
            } else { // 3. 약한 레이저 (드뭄)
                shoot({x:this.x, y:this.y, a:Math.PI/2, s:0, w:8, h:600, isLaser:true, warnTime:40, delay:20, c:'#aaa'});
            }
        }
    }
    draw() {
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2); ctx.fill();
        // 체력바 (분신 머리 위)
        let hpPer = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = 'red'; ctx.fillRect(this.x-15, this.y-30, 30*hpPer, 4);
    }
}

// --- 패턴 라이브러리 ---
// freeze: true 설정 시 보스가 이동을 멈춤 (레이저 등)
const patterns = {
    // [Phase 1]
    1: () => { boss.freeze=false; for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+i*0.8, s:3, c:'#aaf'}); boss.angle+=0.1; },
    2: () => { boss.freeze=false; for(let i=0; i<20; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/20*i, s:2.5, c:'#fff'}); },
    3: () => { boss.freeze=true;  let aim=angleToP(); for(let i=-1; i<=1; i++) shoot({x:boss.x, y:boss.y, a:aim+i*0.2, s:4, c:'#0ff'}); }, // 정지
    4: () => { boss.freeze=false; shoot({x:boss.x, y:boss.y, a:boss.angle, s:3, c:'#88f', curve:0.01}); shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI, s:3, c:'#88f', curve:0.01}); boss.angle+=0.15; },
    5: () => { boss.freeze=false; shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:3, c:'#44f'}); }, 
    6: () => { boss.freeze=true;  let a=angleToP(); shoot({x:boss.x, y:boss.y, a:a, s:2, accel:0.05, c:'#f0f'}); }, // 정지

    // [Phase 2]
    7: () => { boss.freeze=false; for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/8*i+boss.angle, s:3, c:'#0f0', bounce:1}); boss.angle+=0.04; }, 
    8: () => { boss.freeze=true;  shoot({x:boss.x, y:boss.y, a:angleToP(), s:6, c:'#f00', r:6, warnTime:40}); }, // 정지(저격)
    9: () => { boss.freeze=false; for(let i=0; i<2; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI*i, s:3, c:'#ff0', curve:0.02}); boss.angle+=0.1; },
    10: () => { boss.freeze=false; shoot({x:Math.random()*600, y:Math.random()*300, a:Math.PI/2, s:0, accel:0.1, c:'#f80', r:4, warnTime:40}); },
    11: () => { boss.freeze=true;  let a=angleToP(); for(let i=-1; i<=1; i++) shoot({x:boss.x, y:boss.y, a:a+i*0.3, s:4, c:'#f00', bounce:1}); }, // 정지

    // [Phase 3]
    12: () => { boss.freeze=false; shoot({x:0, y:player.y, a:0, s:0, c:'#f0f', w:600, h:25, isLaser:true, warnTime:60, delay:20}); }, 
    13: () => { boss.freeze=false; shoot({x:boss.x, y:boss.y, a:angleToP(), s:2.5, c:'#a0f', homing:0.025}); }, 
    14: () => { boss.freeze=false; shoot({x:0, y:Math.random()*600+100, a:0, s:0, c:'#f0f', w:600, h:45, isLaser:true, warnTime:70, delay:10}); }, 
    15: () => { boss.freeze=true;  let r=200; for(let i=0; i<6; i++) shoot({x:player.x+Math.cos(i)*r, y:player.y+Math.sin(i)*r, a:Math.atan2(-Math.sin(i), -Math.cos(i)), s:1.5, accel:0.05, c:'#f0f', homing:0.01, warnTime:40}); }, // 정지(가두기)
    16: () => { boss.freeze=true;  shoot({x:boss.x, y:boss.y, a:boss.angle, s:0, c:'#f0f', w:15, h:800, isLaser:true, warnTime:40, delay:100, curve:0.01}); boss.angle+=0.3; }, // 정지(회전빔)
    17: () => { boss.freeze=false; shoot({x:Math.random()*500+50, y:0, a:Math.PI/2, s:0, c:'#f0f', w:40, h:800, isLaser:true, warnTime:60, delay:10}); },
    // ★ 18번: 분신 소환 패턴 (매우 드묾)
    18: () => { 
        if(clones.length === 0) { // 분신 없을 때만 소환
            boss.freeze = true;
            clones.push(new Clone(150, 150));
            clones.push(new Clone(450, 150));
            msgBox.style.display='block'; msgBox.innerText="CLONES SPAWNED!"; msgBox.style.color='#aaa';
            setTimeout(()=>msgBox.style.display='none', 1000);
        }
    }
};

// --- 메인 로직 ---
let patternTimer = 0;
let activePatterns = []; 

// 패턴 선택기 (가중치 확률 적용)
function pickPatterns() {
    activePatterns = [];
    let p = boss.phase;
    let count = 1;

    // 동시 패턴 개수 확률
    if (p === 1 && Math.random() < 0.2) count = 2; 
    if (p === 2 && Math.random() < 0.6) count = 2; 
    if (p === 3) count = Math.random() < 0.4 ? 3 : 2; 

    // 패턴 풀 설정 (페이즈별)
    let pool = [];
    if (p === 1) pool = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]; // 쉬운거 많이
    if (p === 2) pool = [7, 7, 8, 9, 9, 10, 11]; 
    if (p === 3) {
        // 3페: 분신(18)은 확률 낮게, 레이저(12,14) 중간, 유도(13) 높게
        pool = [12, 12, 13, 13, 13, 14, 14, 15, 16, 17, 18]; 
    }

    for(let i=0; i<count; i++) {
        let idx = Math.floor(Math.random() * pool.length);
        activePatterns.push(pool[idx]);
    }
}

// 2페이즈 연출
function startPhase2() {
    boss.transitioning = true;
    msgBox.style.display = 'block'; msgBox.innerText = "PHASE 2 BREAK!"; msgBox.style.color = 'red';
    boss.x = 300; boss.y = 100;

    gameScreen.classList.add('shake-effect');
    gameScreen.classList.add('invert-once');
    setTimeout(() => {
        gameScreen.classList.remove('shake-effect');
        gameScreen.classList.remove('invert-once');
        msgBox.style.display = 'none';
        boss.transitioning = false;
    }, 1500);

    setTimeout(() => {
        for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/8*i, s:0, c:'#f00', w:20, h:800, isLaser:true, warnTime:40, delay:30});
    }, 500);
}

// ★ 3페이즈 연출 (강화됨: 흔들림 + 반전 + 붉은줌)
function startPhase3() {
    boss.transitioning = true;
    msgBox.style.display = 'block'; msgBox.innerText = "PHASE 3: APOCALYPSE"; msgBox.style.color = '#a0f';
    
    // 이펙트 3종 세트
    gameScreen.classList.add('shake-effect');   // 계속 흔들림
    gameScreen.classList.add('invert-effect');  // 계속 반전 깜빡임
    gameScreen.classList.add('phase3-effect');  // 붉은 줌
    
    setTimeout(() => {
        // 연출 끝나면 클래스 제거 (너무 어지러우니 2초 뒤 끔)
        gameScreen.classList.remove('shake-effect');
        gameScreen.classList.remove('invert-effect');
        gameScreen.classList.remove('phase3-effect');
        msgBox.style.display = 'none';
        boss.transitioning = false;
    }, 2000);

    // 전방위 초거대 레이저
    setTimeout(() => {
        shoot({x:300, y:400, a:0, s:0, c:'#a0f', w:600, h:150, isLaser:true, warnTime:50, delay:50}); 
        shoot({x:300, y:400, a:Math.PI/2, s:0, c:'#a0f', w:150, h:800, isLaser:true, warnTime:50, delay:50}); 
    }, 500);
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
    
    // 사격
    if(frame % 5 === 0) {
        shoot({x:player.x-10, y:player.y, a:-Math.PI/2, s:15, r:3, c:'#afa', isEnemy:false});
        shoot({x:player.x+10, y:player.y, a:-Math.PI/2, s:15, r:3, c:'#afa', isEnemy:false});
    }

    // 보스 이동 (freeze가 아니고 연출중이 아닐 때만)
    if (!boss.transitioning && !boss.freeze) {
        boss.x = 300 + Math.cos(frame/120)*150;
        boss.y = 150 + Math.sin(frame/80)*50;
    }

    // 분신 업데이트
    clones.forEach(c => c.update());
    clones = clones.filter(c => c.hp > 0);

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
                    if (patternTimer === 1) patterns[pat](); // 1회성
                } else {
                    if (frame % freq === 0) patterns[pat](); // 반복
                }
            }
        });
    }

    // 페이즈 전환
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

    // 총알 업데이트
    for (let i=0; i<bullets.length; i++) {
        let b = bullets[i];
        if(b.dead) continue;

        b.timer++;
        if (b.warnTime > 0 && b.timer < b.warnTime) {
            if(b.homing && b.isEnemy) b.angle = Math.atan2(player.y - b.y, player.x - b.x);
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
            if (b.isLaser) {
                 if (Math.abs(b.x-player.x)<b.w/2 && Math.abs(b.y-player.y)<b.h/2) hit=true;
            } else {
                let dist = Math.hypot(b.x-player.x, b.y-player.y);
                if (dist < player.hitboxSize + b.r) hit = true;
                else if (dist < 20 && !b.grazed) { score += 5; b.grazed = true; }
            }

            if(hit && player.invul <= 0 && !godMode) {
                player.hp--;
                player.invul = 60; player.slowTimer = 60;
                gameScreen.style.backgroundColor = '#300';
                setTimeout(()=>gameScreen.style.backgroundColor='', 100);
                if(player.hp <= 0) state = 'over';
            }
        } else {
            // 아군 총알: 보스 또는 분신 타격
            let hitAny = false;
            // 1. 보스 타격
            if(Math.abs(b.x-boss.x)<30 && Math.abs(b.y-boss.y)<30) {
                boss.hp -= 30; score += 50; hitAny = true;
                if(boss.hp <= 0) state = 'clear';
            }
            // 2. 분신 타격
            clones.forEach(c => {
                if(Math.hypot(b.x-c.x, b.y-c.y) < c.r) {
                    c.hp -= 30; score += 20; hitAny = true;
                }
            });
            
            if(hitAny) b.dead = true;
        }
    }
    bullets = bullets.filter(b => !b.dead);
}

function draw() {
    ctx.clearRect(0,0,600,800);
    
    // 분신 그리기
    clones.forEach(c => c.draw());

    // 탄막 그리기
    bullets.forEach(b => {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
        if (b.warnTime > 0 && b.timer < b.warnTime) {
            ctx.globalAlpha = 0.3; ctx.fillStyle = b.color;
            if(b.isLaser) ctx.fillRect(-b.w/2, -1, b.w, 2); 
            else { 
                ctx.beginPath(); ctx.arc(0,0,2,0,Math.PI*2); ctx.fill();
                ctx.strokeStyle=b.color; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(50,0); ctx.stroke();
            }
        } else {
            ctx.fillStyle = b.color;
            if(b.isLaser) {
                ctx.shadowBlur = 10; ctx.shadowColor = b.color;
                ctx.fillRect(-b.w/2, -b.h/2, b.w, b.h);
                ctx.fillStyle = '#fff'; ctx.fillRect(-b.w/2, -b.h/4, b.w, b.h/2);
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
function angleToP() { return Math.atan2(player.y-boss.y, player.x-boss.x); }
function resetGame() {
    boss.hp = boss.maxHp; boss.phase = 1; score = 0; 
    player.hp = player.maxHp; player.invul = 0; player.slowTimer = 0;
    bullets.length=0; clones.length=0; state='play'; patternTimer = 0; boss.transitioning = false; boss.freeze=false;
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
