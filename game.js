const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreBoard = document.getElementById('scoreBoard');

// --- 1. 게임 설정 및 상태 ---
let score = 0;
let frameCount = 0;
let isGameOver = false;
let isVictory = false;

// 플레이어
const player = { 
    x: 300, y: 700, 
    width: 30, height: 40, 
    hitboxSize: 4, 
    color: '#ff0000', 
    speed: 5 
};

// 배경 별
let stars = [];
for(let i=0; i<80; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 4 + 1
    });
}

// 오브젝트 관리
let bullets = []; 
const MAX_BOSS_HP = 6000; // 체력 상향
let boss = { 
    x: 300, y: 150, 
    width: 60, height: 60, 
    color: '#00ccff', 
    hp: MAX_BOSS_HP,
    angle: 0,
    phase: 1
};

// 키 입력
let keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && (isGameOver || isVictory)) resetGame();
});
window.addEventListener('keyup', e => keys[e.code] = false);


// --- 2. 패턴 관리 시스템 (핵심!) ---
// 각 패턴별 쿨타임(프레임 단위) 관리
const patterns = {
    // 2페이즈 패턴
    chaosBurst: { cooldown: 180, lastUsed: -999 },  // 3초마다
    wallBounce: { cooldown: 240, lastUsed: -999 },  // 4초마다
    // 3페이즈 패턴
    horizLaser: { cooldown: 100, lastUsed: -999 },  // 1.5초마다
    aimedShot:  { cooldown: 120, lastUsed: -999 }   // 2초마다
};

// 현재 실행 중인 패턴 개수 체크 (간이 로직)
// 실제로는 지속시간이 필요하지만, 여기선 발동 빈도로 조절
function canUsePattern(patternName) {
    if (frameCount - patterns[patternName].lastUsed > patterns[patternName].cooldown) {
        // 랜덤성을 줘서 칼같이 쿨타임마다 쏘지 않게 함 (10% 확률로 지연)
        if (Math.random() < 0.95) return true;
    }
    return false;
}


// --- 3. 총알 생성 및 패턴 함수 ---

// 기본 총알 생성기
function spawnBullet(props) {
    bullets.push({
        x: props.x, 
        y: props.y,
        vx: Math.cos(props.angle) * props.speed,
        vy: Math.sin(props.angle) * props.speed,
        size: props.size || 4,
        color: props.color || '#fff',
        isEnemy: props.isEnemy,
        
        // 특수 속성들
        bouncesLeft: props.bouncesLeft || 0, // 벽 튕기기 횟수
        isLaser: props.isLaser || false,     // 레이저(관통/긴 형태)
        width: props.width || props.size,    // 레이저용 가로세로
        height: props.height || props.size
    });
}

// [패턴 1] 마구잡이 광탄 (Chaos Burst)
function fireChaosBurst() {
    patterns.chaosBurst.lastUsed = frameCount;
    // 한 번에 30발을 랜덤한 방향/속도로 뿌림
    for (let i = 0; i < 30; i++) {
        spawnBullet({
            x: boss.x, y: boss.y,
            angle: Math.random() * Math.PI * 2, // 전방위
            speed: Math.random() * 5 + 2,       // 속도도 랜덤
            size: 5,
            color: '#ffaa00', // 주황색
            isEnemy: true
        });
    }
}

// [패턴 2] 벽 튕기기 탄 (Bouncing Shot)
function fireWallBounce() {
    patterns.wallBounce.lastUsed = frameCount;
    // 부채꼴로 발사
    for (let i = 0; i < 12; i++) {
        let angle = (Math.PI / 12) * i + Math.PI / 4; // 아래쪽 부채꼴
        spawnBullet({
            x: boss.x, y: boss.y,
            angle: angle,
            speed: 6,
            size: 6,
            color: '#00ff00', // 초록색
            isEnemy: true,
            bouncesLeft: 2 // ★ 벽에 2번 튕김!
        });
    }
}

// [패턴 3] 가로 레이저 (Horizontal Laser)
function fireHorizontalLaser() {
    patterns.horizLaser.lastUsed = frameCount;
    // 왼쪽이나 오른쪽 벽에서 생성되어 가로지름
    let fromLeft = Math.random() > 0.5;
    let yPos = Math.random() * (canvas.height - 200) + 50; // 플레이어 활동 영역
    
    spawnBullet({
        x: fromLeft ? 0 : canvas.width,
        y: yPos,
        angle: fromLeft ? 0 : Math.PI, // 0도(우) or 180도(좌)
        speed: 10, // 매우 빠름
        size: 5,
        width: 60, height: 10, // 길쭉한 레이저 형태
        color: '#ff00ff', // 보라색
        isEnemy: true,
        isLaser: true
    });
}

// [패턴 4] 조준탄 (Aimed Shot)
function fireAimedShot() {
    patterns.aimedShot.lastUsed = frameCount;
    let dx = player.x - boss.x;
    let dy = player.y - boss.y;
    let aimAngle = Math.atan2(dy, dx);
    
    // 3발 발사
    for(let i=-1; i<=1; i++){
        spawnBullet({
            x: boss.x, y: boss.y,
            angle: aimAngle + (i * 0.1),
            speed: 8,
            size: 8,
            color: 'red',
            isEnemy: true
        });
    }
}


// --- 4. 게임 루프 및 업데이트 ---

function resetGame() {
    score = 0;
    bullets = [];
    player.x = 300; player.y = 700;
    boss.hp = MAX_BOSS_HP;
    boss.phase = 1;
    isGameOver = false;
    isVictory = false;
    
    // 쿨타임 초기화
    Object.keys(patterns).forEach(k => patterns[k].lastUsed = -999);
    
    gameLoop();
}

function update() {
    if (isGameOver || isVictory) return;
    frameCount++;

    // 배경 별
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = 0; star.x = Math.random() * canvas.width;
        }
    });

    // 플레이어 이동
    let isFocus = keys['ShiftLeft'] || keys['ShiftRight'];
    let moveSpeed = isFocus ? player.speed / 2.5 : player.speed;
    if (keys['ArrowLeft'] && player.x > 10) player.x -= moveSpeed;
    if (keys['ArrowRight'] && player.x < canvas.width - 10) player.x += moveSpeed;
    if (keys['ArrowUp'] && player.y > 10) player.y -= moveSpeed;
    if (keys['ArrowDown'] && player.y < canvas.height - 10) player.y += moveSpeed;

    // 플레이어 사격
    if (frameCount % 4 === 0) {
        spawnBullet({
            x: player.x - 10, y: player.y, angle: -Math.PI/2, speed: 20, 
            size: 3, width: 4, height: 15, color: '#aaf', isEnemy: false
        });
        spawnBullet({
            x: player.x + 10, y: player.y, angle: -Math.PI/2, speed: 20, 
            size: 3, width: 4, height: 15, color: '#aaf', isEnemy: false
        });
    }

    // --- ★ 보스 페이즈 및 패턴 로직 ---
    let hpRatio = boss.hp / MAX_BOSS_HP;
    
    // 페이즈 결정
    if (hpRatio <= 0.3) { boss.phase = 3; boss.color = '#aa00ff'; }
    else if (hpRatio <= 0.6) { boss.phase = 2; boss.color = '#ff3333'; }
    else { boss.phase = 1; boss.color = '#00ccff'; }

    // 보스 움직임 (8자)
    boss.x = 300 + Math.cos(frameCount / 60) * 120;
    boss.y = 150 + Math.sin(frameCount / 45) * 40;

    // 패턴 발동 로직 (최대 2개까지만 동시 실행되도록 확률 조절)
    let activePatternCount = 0; 
    // (여기서는 간단히 프레임 체크로 흉내만 냄. 쿨타임이 겹치면 동시 발사됨)

    if (boss.phase === 1) {
        // [1페이즈] 통상: 조준탄만 쏨
        if (canUsePattern('aimedShot')) fireAimedShot();
    }
    else if (boss.phase === 2) {
        // [2페이즈] 광란: 튕기는 탄 + 마구잡이 탄
        // 두 패턴의 쿨타임이 다르게 돌아가므로 가끔 겹침
        if (canUsePattern('chaosBurst')) fireChaosBurst();
        if (canUsePattern('wallBounce')) fireWallBounce();
    }
    else if (boss.phase === 3) {
        // [3페이즈] 지옥: 가로 레이저 + 2페이즈 패턴 일부
        if (canUsePattern('horizLaser')) fireHorizontalLaser();
        if (canUsePattern('chaosBurst')) fireChaosBurst(); 
        // 3페이즈는 더 어렵게: 튕기는 탄도 가끔 섞음
        if (Math.random() < 0.01 && canUsePattern('wallBounce')) fireWallBounce();
    }

    // --- 총알 업데이트 ---
    for (let i = 0; i < bullets.length; i++) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // ★ 벽 튕기기 로직
        if (b.isEnemy && b.bouncesLeft > 0) {
            if (b.x < 0 || b.x > canvas.width) {
                b.vx *= -1; // X축 반전
                b.bouncesLeft--;
            }
            // (옵션: 바닥/천장은 안 튕기게 함. 필요하면 || b.y < 0 등 추가)
        }

        // 화면 밖 제거
        if (b.x < -100 || b.x > canvas.width + 100 || b.y < -100 || b.y > canvas.height + 100) {
            bullets.splice(i, 1);
            i--;
            continue;
        }

        // 충돌 체크
        if (b.isEnemy) {
            let hit = false;
            // 레이저(직사각형) vs 플레이어(원) 충돌은 약식으로 사각형vs점 체크
            if (b.isLaser) {
                // 레이저 히트박스 계산 (중심 기준)
                if (Math.abs(b.x - player.x) < b.width/2 + player.hitboxSize &&
                    Math.abs(b.y - player.y) < b.height/2 + player.hitboxSize) {
                    hit = true;
                }
            } else {
                // 일반 탄 (원형)
                let dx = b.x - player.x;
                let dy = b.y - player.y;
                if (Math.sqrt(dx*dx + dy*dy) < player.hitboxSize + b.size) {
                    hit = true;
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
    
    // UI 업데이트
    scoreBoard.innerText = `SCORE: ${score} | PHASE: ${boss.phase}`;
}

function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 별
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    stars.forEach(s => { ctx.fillRect(s.x, s.y, s.size, s.size); });

    // 보스
    ctx.shadowBlur = 15;
    ctx.shadowColor = boss.color;
    ctx.fillStyle = boss.color;
    ctx.fillRect(boss.x - boss.width/2, boss.y - boss.height/2, boss.width, boss.height);
    ctx.shadowBlur = 0;

    // 플레이어
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x - 10, player.y - 15, 20, 30);
    if (keys['ShiftLeft'] || keys['ShiftRight']) {
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.hitboxSize, 0, Math.PI*2);
        ctx.fillStyle = 'white'; ctx.fill(); ctx.strokeStyle = 'red'; ctx.stroke();
    }

    // 총알
    bullets.forEach(b => {
        ctx.fillStyle = b.color;
        if (b.isLaser) {
            // 레이저는 직사각형
            ctx.fillRect(b.x - b.width/2, b.y - b.height/2, b.width, b.height);
        } else {
            // 일반탄은 원
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
            ctx.fill();
        }
    });

    // 보스 체력바
    if (!isVictory) {
        let hpPer = Math.max(0, boss.hp / MAX_BOSS_HP);
        ctx.fillStyle = '#333'; ctx.fillRect(20, 20, canvas.width-40, 10);
        ctx.fillStyle = boss.color; ctx.fillRect(20, 20, (canvas.width-40)*hpPer, 10);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(20, 20, canvas.width-40, 10);
    }

    // 게임 오버/승리 텍스트
    if (isGameOver || isVictory) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = isVictory ? '#ffff00' : '#ff0000';
        ctx.font = '40px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isVictory ? "VICTORY!" : "GAME OVER", canvas.width/2, canvas.height/2);
        ctx.fillStyle = 'white';
        ctx.font = '20px monospace';
        ctx.fillText("Press 'R' to Restart", canvas.width/2, canvas.height/2 + 50);
    }
}

gameLoop();
