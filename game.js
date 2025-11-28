const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreBoard = document.getElementById('scoreBoard');

// --- 1. 게임 전역 변수 ---
let score = 0;
let frameCount = 0;
let isGameOver = false;
let isVictory = false;

// 플레이어 설정
const player = { 
    x: 300, y: 700, 
    width: 30, height: 40, 
    hitboxSize: 4, 
    color: '#ff0000', 
    speed: 5 
};

// 배경 별 (Starfield)
let stars = [];
for(let i=0; i<100; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 4 + 1
    });
}

// 오브젝트
let bullets = []; 
const MAX_BOSS_HP = 8000; // 체력 설정
let boss = { 
    x: 300, y: 150, 
    width: 60, height: 60, 
    color: '#00ccff', 
    hp: MAX_BOSS_HP,
    angle: 0,
    phase: 1
};

// 키 입력 상태
let keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && (isGameOver || isVictory)) resetGame();
});
window.addEventListener('keyup', e => keys[e.code] = false);


// --- 2. 패턴 관리 시스템 (Pattern Manager) ---
// 각 패턴의 쿨타임(프레임)과 마지막 사용 시점 저장
const patterns = {
    aimedShot:  { cooldown: 90,  lastUsed: -999 }, // 1.5초
    chaosBurst: { cooldown: 200, lastUsed: -999 }, // 약 3초
    wallBounce: { cooldown: 300, lastUsed: -999 }, // 5초
    horizLaser: { cooldown: 150, lastUsed: -999 }  // 2.5초
};

// 패턴 사용 가능 여부 체크
function canUsePattern(name) {
    if (frameCount - patterns[name].lastUsed > patterns[name].cooldown) {
        return true;
    }
    return false;
}

// --- 3. 총알 생성 및 패턴 함수들 ---

// 통합 총알 생성기
function spawnBullet(props) {
    bullets.push({
        x: props.x, 
        y: props.y,
        vx: Math.cos(props.angle) * props.speed,
        vy: Math.sin(props.angle) * props.speed,
        size: props.size || 4,
        color: props.color || '#fff',
        isEnemy: props.isEnemy,
        
        // 특수 기능
        bouncesLeft: props.bouncesLeft || 0, // 튕김 횟수
        isLaser: props.isLaser || false,     // 레이저 여부
        width: props.width || props.size,    // 레이저용 크기
        height: props.height || props.size
    });
}

// 패턴 1: 조준탄 (플레이어 위치로 발사)
function fireAimedShot() {
    patterns.aimedShot.lastUsed = frameCount;
    let dx = player.x - boss.x;
    let dy = player.y - boss.y;
    let aimAngle = Math.atan2(dy, dx);
    
    // 3발 부채꼴
    for(let i=-1; i<=1; i++){
        spawnBullet({
            x: boss.x, y: boss.y, angle: aimAngle + (i * 0.15),
            speed: 7, size: 6, color: '#ff5555', isEnemy: true
        });
    }
}

// 패턴 2: 카오스 버스트 (전방위 난사)
function fireChaosBurst() {
    patterns.chaosBurst.lastUsed = frameCount;
    for (let i = 0; i < 30; i++) {
        spawnBullet({
            x: boss.x, y: boss.y,
            angle: Math.random() * Math.PI * 2,
            speed: Math.random() * 4 + 3,
            size: 5, color: '#ffaa00', isEnemy: true
        });
    }
}

// 패턴 3: 벽 튕기기 (초록색 탄)
function fireWallBounce() {
    patterns.wallBounce.lastUsed = frameCount;
    for (let i = 0; i < 16; i++) {
        spawnBullet({
            x: boss.x, y: boss.y,
            angle: (Math.PI * 2 / 16) * i + frameCount/100, // 회전하며 발사
            speed: 5, size: 7, color: '#00ff00', isEnemy: true,
            bouncesLeft: 2 // 벽에 2번 튕김
        });
    }
}

// 패턴 4: 가로 레이저 (측면 기습)
function fireHorizontalLaser() {
    patterns.horizLaser.lastUsed = frameCount;
    let fromLeft = Math.random() > 0.5;
    // 플레이어가 있는 Y축 근처를 노림
    let yTarget = Math.random() * 400 + 300; 
    
    spawnBullet({
        x: fromLeft ? 0 : canvas.width,
        y: yTarget,
        angle: fromLeft ? 0 : Math.PI,
        speed: 12, size: 10, width: 80, height: 10,
        color: '#d0f', isEnemy: true, isLaser: true
    });
}


// --- 4. 메인 업데이트 루프 ---

function resetGame() {
    score = 0;
    bullets = [];
    player.x = 300; player.y = 700;
    boss.hp = MAX_BOSS_HP;
    boss.phase = 1;
    isGameOver = false;
    isVictory = false;
    
    // 패턴 쿨타임 초기화
    Object.keys(patterns).forEach(k => patterns[k].lastUsed = -999);
    
    gameLoop();
}

function update() {
    if (isGameOver || isVictory) return;
    frameCount++;

    // 배경 별 흐르기
    stars.forEach(s => {
        s.y += s.speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
    });

    // 플레이어 이동 (Shift: 저속)
    let isFocus = keys['ShiftLeft'] || keys['ShiftRight'];
    let moveSpeed = isFocus ? player.speed / 2.5 : player.speed;
    
    if (keys['ArrowLeft'] && player.x > 10) player.x -= moveSpeed;
    if (keys['ArrowRight'] && player.x < canvas.width - 10) player.x += moveSpeed;
    if (keys['ArrowUp'] && player.y > 10) player.y -= moveSpeed;
    if (keys['ArrowDown'] && player.y < canvas.height - 10) player.y += moveSpeed;

    // 플레이어 사격 (고속 연사)
    if (frameCount % 4 === 0) {
        spawnBullet({ x: player.x-10, y: player.y, angle: -Math.PI/2, speed: 20, size: 3, width:4, height:15, color: '#aaf', isEnemy: false });
        spawnBullet({ x: player.x+10, y: player.y, angle: -Math.PI/2, speed: 20, size: 3, width:4, height:15, color: '#aaf', isEnemy: false });
    }

    // --- ★ 보스 페이즈 관리 ---
    let hpRatio = boss.hp / MAX_BOSS_HP;
    
    if (hpRatio <= 0.3) { 
        boss.phase = 3; boss.color = '#9900ff'; // 3페이즈: 보라 (발악)
    } else if (hpRatio <= 0.6) { 
        boss.phase = 2; boss.color = '#ff3333'; // 2페이즈: 빨강 (광폭)
    } else { 
        boss.phase = 1; boss.color = '#00ccff'; // 1페이즈: 파랑 (통상)
    }

    // 보스 움직임 (8자)
    boss.x = 300 + Math.cos(frameCount / 70) * 120;
    boss.y = 150 + Math.sin(frameCount / 50) * 40;

    // --- ★ 페이즈별 패턴 실행 ---
    // (동시에 너무 많은 패턴이 나오지 않게 제어)
    
    if (boss.phase === 1) {
        // [1페이즈] 조준탄 위주
        if (canUsePattern('aimedShot')) fireAimedShot();
    }
    else if (boss.phase === 2) {
        // [2페이즈] 튕기는 탄 + 광탄 (최대 2개 패턴 혼합)
        if (canUsePattern('wallBounce')) fireWallBounce();
        
        // 튕기는 탄 쿨타임 중일 때 광탄 발사
        if (frameCount - patterns.wallBounce.lastUsed > 60) {
             if (canUsePattern('chaosBurst')) fireChaosBurst();
        }
    }
    else if (boss.phase === 3) {
        // [3페이즈] 가로 레이저 + 모든 패턴 혼합
        if (canUsePattern('horizLaser')) fireHorizontalLaser();
        
        // 레이저 쏘는 중이 아닐 때 다른 패턴 섞기
        if (canUsePattern('chaosBurst') && Math.random() < 0.7) fireChaosBurst();
        if (canUsePattern('aimedShot') && Math.random() < 0.5) fireAimedShot();
    }

    // --- 총알 업데이트 ---
    for (let i = 0; i < bullets.length; i++) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // 벽 튕기기 로직
        if (b.isEnemy && b.bouncesLeft > 0) {
            if (b.x < 0 || b.x > canvas.width) {
                b.vx *= -1; // 방향 반전
                b.bouncesLeft--;
            }
        }

        // 화면 밖 제거
        if (b.x < -100 || b.x > canvas.width + 100 || b.y < -100 || b.y > canvas.height + 100) {
            bullets.splice(i, 1);
            i--; continue;
        }

        // 충돌 체크
        if (b.isEnemy) {
            let hit = false;
            // 레이저(직사각형) vs 점
            if (b.isLaser) {
                if (Math.abs(b.x - player.x) < b.width/2 + player.hitboxSize &&
                    Math.abs(b.y - player.y) < b.height/2 + player.hitboxSize) hit = true;
            } 
            // 일반탄(원) vs 점
            else {
                let dist = Math.sqrt((b.x-player.x)**2 + (b.y-player.y)**2);
                if (dist < player.hitboxSize + b.size) hit = true;
                
                // 그레이즈(스침)
                else if (dist < player.width && !b.grazed) {
                    score += 5; b.grazed = true;
                }
            }

            if (hit) isGameOver = true;

        } else {
            // 보스 피격
            if (Math.abs(b.x - boss.x) < boss.width/2 && Math.abs(b.y - boss.y) < boss.height/2) {
                boss.hp -= 15;
                score += 10;
                bullets.splice(i, 1);
                i--;
                if (boss.hp <= 0) isVictory = true;
            }
        }
    }
    scoreBoard.innerText = `SCORE: ${score} | PHASE: ${boss.phase}`;
}


// --- 5. 그리기 ---
function draw() {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 별
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI*2); ctx.fill(); });

    // 보스 (빛나는 효과)
    ctx.shadowBlur = 20; ctx.shadowColor = boss.color;
    ctx.fillStyle = boss.color;
    ctx.fillRect(boss.x - boss.width/2, boss.y - boss.height/2, boss.width, boss.height);
    ctx.shadowBlur = 0;

    // 플레이어
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x - 10, player.y - 15, 20, 30);
    // 판정점 (Shift시 표시)
    if (keys['ShiftLeft'] || keys['ShiftRight']) {
        ctx.beginPath(); ctx.arc(player.x, player.y, player.hitboxSize, 0, Math.PI*2);
        ctx.fillStyle = 'white'; ctx.fill(); ctx.strokeStyle = 'red'; ctx.stroke();
    }

    // 총알
    bullets.forEach(b => {
        ctx.fillStyle = b.color;
        if (b.isLaser) {
            // 레이저: 빛나는 막대
            ctx.shadowBlur = 10; ctx.shadowColor = b.color;
            ctx.fillRect(b.x - b.width/2, b.y - b.height/2, b.width, b.height);
            ctx.shadowBlur = 0;
        } else {
            // 일반탄: 원
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI*2); ctx.fill();
        }
    });

    // UI: 보스 체력바
    if (!isVictory) {
        let hpPer = Math.max(0, boss.hp / MAX_BOSS_HP);
        ctx.fillStyle = '#333'; ctx.fillRect(20, 20, canvas.width-40, 10);
        ctx.fillStyle = boss.color; ctx.fillRect(20, 20, (canvas.width-40)*hpPer, 10);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(20, 20, canvas.width-40, 10);
    }

    // 결과 화면
    if (isGameOver || isVictory) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        
        ctx.textAlign = 'center';
        if (isVictory) {
            ctx.fillStyle = '#ffff00'; ctx.font = 'bold 50px Courier New';
            ctx.fillText("STAGE CLEAR!", canvas.width/2, canvas.height/2 - 20);
        } else {
            ctx.fillStyle = '#ff0000'; ctx.font = 'bold 50px Courier New';
            ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2 - 20);
        }
        
        ctx.fillStyle = '#fff'; ctx.font = '20px Courier New';
        ctx.fillText(`Final Score: ${score}`, canvas.width/2, canvas.height/2 + 40);
        ctx.fillText("Press [R] to Restart", canvas.width/2, canvas.height/2 + 80);
    }
}

function gameLoop() {
    update();
    draw();
    if (!isGameOver && !isVictory) requestAnimationFrame(gameLoop);
    else requestAnimationFrame(draw);
}

gameLoop();
