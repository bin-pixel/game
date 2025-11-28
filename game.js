const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('debug');
const hpBar = document.getElementById('bossHp');
const msgBox = document.getElementById('msg');

// --- 엔진 설정 ---
let score = 0;
let frame = 0;
let state = 'play'; 

const player = { x: 300, y: 700, r: 3, speed: 5, invul: 0 };
const boss = { x: 300, y: 150, r: 30, hp: 30000, maxHp: 30000, phase: 1, angle: 0 };
let bullets = [];
const keys = {};

// --- 총알 생성기 ---
function shoot(p) {
    bullets.push({
        x: p.x, y: p.y,
        speed: p.s, angle: p.a,
        // vx, vy는 아래 update에서 계산하므로 초기값 필요 없음
        r: p.r || 4, color: p.c || '#fff',
        
        accel: p.accel || 0,     
        curve: p.curve || 0,      
        homing: p.homing || 0,    
        isLaser: p.isLaser,       
        w: p.w, h: p.h,           
        bounce: p.bounce || 0,    
        delay: p.delay || 0,
        grazed: false, // ★ 스침 점수 중복 방지용 플래그
        isEnemy: p.isEnemy !== undefined ? p.isEnemy : true // 아군/적군 구분
    });
}

// --- 패턴 라이브러리 (33개) ---
const patterns = {
    // [Phase 1]
    1: () => { for(let i=0; i<12; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+i*0.5, s:3, c:'#aaf'}); boss.angle+=0.1; },
    2: () => { for(let i=0; i<36; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/36*i, s:2.5, c:'#fff', r:2}); },
    3: () => { let aim=angleToP(); for(let i=-2; i<=2; i++) shoot({x:boss.x, y:boss.y, a:aim+i*0.1, s:5, c:'#0ff'}); },
    4: () => { shoot({x:boss.x, y:boss.y, a:boss.angle, s:4, c:'#88f', curve:0.02}); shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI, s:4, c:'#88f', curve:0.02}); boss.angle+=0.2; },
    5: () => { for(let i=0; i<6; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+i, s:3+Math.sin(frame/10), c:'#ccf'}); boss.angle+=0.05; },
    6: () => { shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:Math.random()*3+2, c:'#44f'}); },
    7: () => { for(let i=0; i<4; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI/2*i, s:4, c:'#fff', r:5}); boss.angle-=0.03; },
    8: () => { let a=angleToP(); shoot({x:boss.x, y:boss.y, a:a, s:2, accel:0.1, c:'#f0f'}); },
    9: () => { for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+i*0.8, s:3, c:'#aaf', delay:30}); boss.angle+=0.15; },
    10: () => { shoot({x:boss.x, y:boss.y, a:Math.sin(frame/20)*2, s:4, c:'#0ff'}); },
    11: () => { for(let i=0; i<3; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+i*2, s:3, c:'#ddf', r:6}); boss.angle+=0.137; },

    // [Phase 2]
    12: () => { for(let i=0; i<5; i++) shoot({x:boss.x, y:boss.y, a:Math.random()*6, s:Math.random()*5+3, c:'#f55'}); },
    13: () => { for(let i=0; i<16; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/16*i+boss.angle, s:5, c:'#0f0', bounce:2}); boss.angle+=0.05; },
    14: () => { shoot({x:boss.x, y:boss.y, a:angleToP(), s:8, c:'#f00', r:8}); },
    15: () => { for(let i=0; i<2; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI*i, s:4, c:'#ff0', curve:0.04}); shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI*i, s:4, c:'#ff0', curve:-0.04}); boss.angle+=0.2; },
    16: () => { shoot({x:Math.random()*600, y:Math.random()*300, a:Math.PI/2, s:0, accel:0.2, c:'#f80', r:5}); },
    17: () => { for(let i=0; i<10; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+i*0.6, s:2, accel:0.05, c:'#faa'}); boss.angle+=0.3; },
    18: () => { let a=angleToP(); for(let i=-3; i<=3; i++) shoot({x:boss.x, y:boss.y, a:a+i*0.2, s:6, c:'#f00', bounce:1}); },
    19: () => { shoot({x:0, y:player.y, a:0, s:7, c:'#f0f', w:40, h:8, isLaser:true}); },
    20: () => { shoot({x:600, y:player.y, a:Math.PI, s:7, c:'#f0f', w:40, h:8, isLaser:true}); },
    21: () => { for(let i=0; i<20; i++) shoot({x:boss.x, y:boss.y, a:Math.PI*2/20*i, s:2, accel:0.1, c:'#fff'}); },
    22: () => { shoot({x:boss.x, y:boss.y, a:boss.angle, s:4, c:'#f88', curve:Math.sin(frame/30)*0.1}); boss.angle+=0.1; },

    // [Phase 3]
    23: () => { shoot({x:boss.x, y:boss.y, a:angleToP(), s:3, c:'#a0f', homing:0.05}); },
    24: () => { shoot({x:0, y:Math.random()*600+100, a:0, s:15, c:'#f0f', w:600, h:20, isLaser:true}); },
    25: () => { for(let i=0; i<4; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI/2*i, s:3, c:'#90f', curve:0.03}); for(let i=0; i<4; i++) shoot({x:boss.x, y:boss.y, a:boss.angle+Math.PI/2*i, s:3, c:'#90f', curve:-0.03}); boss.angle+=0.1; },
    26: () => { for(let i=0; i<30; i++) shoot({x:boss.x, y:boss.y, a:Math.random()*7, s:Math.random()*2+1, c:'#fff', r:2}); },
    27: () => { let r=200; for(let i=0; i<10; i++) shoot({x:player.x+Math.cos(i)*r, y:player.y+Math.sin(i)*r, a:Math.atan2(-Math.sin(i), -Math.cos(i)), s:2, accel:0.05, c:'#f0f', homing:0.01}); },
    28: () => { shoot({x:boss.x, y:boss.y, a:boss.angle, s:10, c:'#f0f', w:10, h:800, isLaser:true}); boss.angle+=0.15; },
    29: () => { shoot({x:boss.x, y:boss.y, a:angleToP()+Math.random()-0.5, s:4, c:'#505', bounce:3}); },
    30: () => { for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:i, s:2, c:'#fff', curve:0.05}); for(let i=0; i<8; i++) shoot({x:boss.x, y:boss.y, a:i, s:2, c:'#fff', curve:-0.05}); },
    31: () => { shoot({x:boss.x, y:boss.y, a:boss.angle, s:6, c:'#f00', r:10, homing:0.1}); boss.angle+=1; },
    32: () => { if(frame%2===0) shoot({x:boss.x+Math.cos(frame/10)*100, y:boss.y, a:Math.PI/2, s:5, c:'#a0a'}); },
    33: () => { for(let i=0; i<3; i++) shoot({x:Math.random()*600, y:0, a:Math.PI/2, s:12, c:'#f0f', w:10, h:800, isLaser:true}); }
};

// --- 메인 로직 ---
let patternTimer = 0;
let currentPattern = 1;

function update() {
    if (state !== 'play') return;
    frame++;
    
    // 플레이어 이동
    let spd = keys['ShiftLeft']||keys['ShiftRight'] ? 2 : 5;
    if(keys['ArrowLeft'] && player.x>5) player.x-=spd;
    if(keys['ArrowRight'] && player.x<595) player.x+=spd;
    if(keys['ArrowUp'] && player.y>5) player.y-=spd;
    if(keys['ArrowDown'] && player.y<795) player.y+=spd;
    
    // ★ [수정됨] 플레이어 사격 (이제 정상 작동!)
    if(frame % 4 === 0) {
        // 엔진이 이해할 수 있게 'angle'과 'speed'를 줍니다.
        // angle: -Math.PI/2 는 12시 방향(위쪽)입니다.
        shoot({x:player.x-10, y:player.y, a:-Math.PI/2, s:20, r:3, c:'#afa', isEnemy:false});
        shoot({x:player.x+10, y:player.y, a:-Math.PI/2, s:20, r:3, c:'#afa', isEnemy:false});
    }

    // 보스 이동
    boss.x = 300 + Math.cos(frame/100)*150;
    boss.y = 150 + Math.sin(frame/70)*50;

    // 패턴 실행
    patternTimer++;
    if (patternTimer > 180) {
        patternTimer = 0;
        let min = (boss.phase-1)*11 + 1; 
        let max = min + 10;
        currentPattern = Math.floor(Math.random()*(max-min+1)) + min;
    }
    if (patterns[currentPattern]) {
        let freq = 5;
        if ([2, 9, 13, 15, 25, 28, 30].includes(currentPattern)) freq = 20;
        if ([6, 16, 26, 32].includes(currentPattern)) freq = 2;
        if (frame % freq === 0) patterns[currentPattern]();
    }

    // 페이즈 관리
    let hpR = boss.hp/boss.maxHp;
    let oldPhase = boss.phase;
    if (hpR <= 0.33) boss.phase = 3;
    else if (hpR <= 0.66) boss.phase = 2;
    else boss.phase = 1;

    if(oldPhase !== boss.phase) {
        msgBox.style.display = 'block';
        msgBox.innerText = `PHASE ${boss.phase} START!`;
        setTimeout(()=>msgBox.style.display='none', 2000);
        for(let b of bullets) if(b.isEnemy) b.dead = true;
    }
    
    hpBar.style.width = (hpR*100)+'%';
    hpBar.style.background = boss.phase===1?'#0cf' : boss.phase===2?'#f33' : '#a0f';

    // --- 총알 업데이트 ---
    for (let i=0; i<bullets.length; i++) {
        let b = bullets[i];
        if(b.dead) continue;

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

        // ★ 여기서 엔진이 vx, vy를 강제로 덮어씌웁니다.
        // 그래서 플레이어 총알도 vx, vy 대신 angle, speed를 줬어야 했습니다.
        b.vx = Math.cos(b.angle) * b.speed;
        b.vy = Math.sin(b.angle) * b.speed;
        b.x += b.vx;
        b.y += b.vy;

        if(b.bounce > 0) {
            if(b.x<0 || b.x>600) { b.vx*=-1; b.angle=Math.PI-b.angle; b.bounce--; b.x+=b.vx; }
        }

        if(b.x<-100 || b.x>700 || b.y<-100 || b.y>900) b.dead = true;

        // 충돌 체크
        if (b.isEnemy) {
            let hit = false;
            let dist = 0; // 플레이어와 총알 거리

            if (b.isLaser) {
                if (Math.abs(b.x-player.x)<b.w/2+2 && Math.abs(b.y-player.y)<b.h/2+2) hit=true;
            } else {
                dist = Math.hypot(b.x-player.x, b.y-player.y);
                if (dist < player.hitboxSize + b.r) hit = true;
                
                // ★ [수정됨] 스침(Graze) 로직 수정
                // 한번 스친 총알은 다시 점수를 주지 않음 (!b.grazed 체크 추가)
                else if (dist < 20 && !b.grazed) { 
                    score += 5; 
                    b.grazed = true; // "이미 점수 줌" 표시
                }
            }
            if(hit) state='over';
        } else {
            // 보스 피격
            if(Math.abs(b.x-boss.x)<30 && Math.abs(b.y-boss.y)<30) {
                boss.hp -= 20; 
                score += 50; // 보스 때리면 점수 대폭 증가
                b.dead = true;
                if(boss.hp <= 0) state = 'clear';
            }
        }
    }
    bullets = bullets.filter(b => !b.dead);
    ui.innerText = `SCORE: ${score} | PHASE: ${boss.phase} | PATTERN: ${currentPattern}`;
}

function draw() {
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 600, 800);
    
    // 별
    ctx.fillStyle = '#555';
    bullets.forEach(b => {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.fillStyle = b.color;
        if(b.isLaser) ctx.fillRect(-b.w/2, -b.h/2, b.w, b.h);
        else { ctx.beginPath(); ctx.arc(0,0,b.r,0,Math.PI*2); ctx.fill(); }
        ctx.restore();
    });

    // Player
    ctx.fillStyle = 'red'; ctx.fillRect(player.x-15, player.y-15, 30, 30);
    if(keys['ShiftLeft']||keys['ShiftRight']) {
        ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(player.x,player.y,4,0,Math.PI*2); ctx.fill();
    }

    // Boss
    ctx.fillStyle = hpBar.style.background; 
    ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI*2); ctx.fill();
    
    if(state !== 'play') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,600,800);
        ctx.fillStyle = '#fff'; ctx.font = '50px Courier'; ctx.textAlign='center';
        ctx.fillText(state==='clear'?"VICTORY!":"GAME OVER", 300, 400);
        ctx.font = '20px Courier'; ctx.fillText("[R] Retry", 300, 450);
    }
}

function loop() {
    update(); draw(); requestAnimationFrame(loop);
}
function angleToP() { return Math.atan2(player.y-boss.y, player.x-boss.x); }
function resetGame() {
    boss.hp = boss.maxHp; boss.phase = 1; score = 0; bullets.length=0; state='play';
}

window.addEventListener('keydown', e=>keys[e.code]=true);
window.addEventListener('keyup', e=>keys[e.code]=false);
loop();
