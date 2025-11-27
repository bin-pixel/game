const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreBoard = document.getElementById('scoreBoard');

// 1. 게임 설정
let score = 0;
let frameCount = 0;
let isGameOver = false;

// 플레이어 설정 (레이무 스타일)
const player = { 
    x: 300, y: 700, 
    width: 30, height: 40, // 눈에 보이는 캐릭터 크기
    hitboxSize: 4,         // 실제 피격 범위 (아주 작음!)
    color: '#ff0000',      // 옷 색깔 (빨강)
    speed: 5 
};

// 배경 별 효과 (하늘을 나는 느낌)
let stars = [];
for(let i=0; i<50; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 3 + 1
    });
}

// 총알 및 보스 관리
let bullets = []; 
let boss = { 
    x: 300, y: 100, 
    width: 60, height: 60, 
    color: '#8888ff', // 치르노 느낌?
    hp: 2000,
    angle: 0 
};

let keys = {};

// 2. 입력 리스너
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && isGameOver) resetGame();
});
window.addEventListener('keyup', e => keys[e.code] = false);

// 3. 유틸리티 함수
function spawnBullet(x, y, angle, speed, type, isEnemy) {
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    
    bullets.push({
        x: x, y: y,
        vx: vx, vy: vy,
        size: type === 'big' ? 10 : 4, // 탄 크기
        color: isEnemy ? (type === 'big' ? '#ff00ff' : '#00ffff') : '#ffffff', // 적탄은 보라/하늘색
        isEnemy: isEnemy
    });
}

function resetGame() {
    score = 0;
    bullets = [];
    player.x = 300; player.y = 700;
    boss.hp = 2000;
    isGameOver = false;
    scoreBoard.innerText = "Score: 0";
    gameLoop();
}

function update() {
    if (isGameOver) return;
    frameCount++;

    // --- 배경 별 이동 (스크롤 효과) ---
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    });

    // --- 플레이어 이동 (저속 모드 구현) ---
    // Shift키 누르면 속도 절반 + 판정점 표시
    let isFocus = keys['ShiftLeft'] || keys['ShiftRight'];
    let currentSpeed = isFocus ? player.speed / 2.5 : player.speed;

    if (keys['ArrowLeft'] && player.x > 10) player.x -= currentSpeed;
    if (keys['ArrowRight'] && player.x < canvas.width - 10) player.x += currentSpeed;
    if (keys['ArrowUp'] && player.y > 10) player.y -= currentSpeed;
    if (keys['ArrowDown'] && player.y < canvas.height - 10) player.y += currentSpeed;

    // 플레이어 사격 (고속 연사)
    if (frameCount % 4 === 0) {
        // 집중 모드일 때는 총알이 모여서 나감
        let spread = isFocus ? 10 : 20; 
        spawnBullet(player.x - spread, player.y, -Math.PI / 2, 15, 'small', false);
        spawnBullet(player.x + spread, player.y, -Math.PI / 2, 15, 'small', false);
    }

    // --- 보스 탄막 패턴 (동방 스타일 기하학 패턴) ---
    boss.angle += 0.05;

    // 패턴 1: 전방위 쌀알탄 뿌리기
    if (frameCount % 10 === 0) {
        for (let i = 0; i < 6; i++) { // 6방향
            let rad = boss.angle + (Math.PI * 2 / 6) * i;
            spawnBullet(boss.x, boss.y, rad, 4, 'small', true);
            spawnBullet(boss.x, boss.y, rad, 3, 'small', true); // 느린 탄 섞기
        }
    }

    // 패턴 2: 회전하는 큰 구슬 (아름다움 담당)
    if (frameCount % 4 === 0) {
        spawnBullet(boss.x, boss.y, -boss.angle, 6, 'big', true);
        spawnBullet(boss.x, boss.y, -boss.angle + Math.PI, 6, 'big', true);
    }

    // --- 총알 로직 ---
    for (let i = 0; i < bullets.length; i++) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // 화면 밖 제거 (여유 있게)
        if (b.x < -50 || b.x > canvas.width + 50 || b.y < -50 || b.y > canvas.height + 50) {
            bullets.splice(i, 1);
            i--;
            continue;
        }

        if (b.isEnemy) {
            // ★ 동방의 핵심: '그레이즈(Graze)' 판정이 아니라 '피격' 판정
            // 플레이어의 '몸체'가 아니라 '중심점(hitbox)'에 닿아야 죽음
            let dx = b.x - player.x;
            let dy = b.y - player.y;
            let distance = Math.sqrt(dx*dx + dy*dy);

            if (distance < player.hitboxSize + b.size) {
                isGameOver = true;
            }
        } else {
            // 아군 총알 -> 보스 (보스는 몸집이 커서 잘 맞음)
            if (b.x > boss.x - boss.width/2 && b.x < boss.x + boss.width/2 &&
                b.y > boss.y - boss.height/2 && b.y < boss.y + boss.height/2) {
                boss.hp--;
                score += 10;
                bullets.splice(i, 1);
                i--;
            }
        }
    }
    scoreBoard.innerText = `BOSS HP: ${boss.hp} | SCORE: ${score}`;
}

function draw() {
    // 배경 (검은색 + 별)
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });

    if (isGameOver) {
        ctx.fillStyle = 'white';
        ctx.font = '40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("PICHUUN... (Game Over)", canvas.width/2, canvas.height/2);
        ctx.font = '20px sans-serif';
        ctx.fillText("Press 'R' to Restart", canvas.width/2, canvas.height/2 + 50);
        return;
    }

    // --- 보스 그리기 ---
    ctx.fillStyle = boss.color;
    ctx.fillRect(boss.x - boss.width/2, boss.y - boss.height/2, boss.width, boss.height);

    // --- 플레이어 그리기 (동방 스타일) ---
    // 1. 캐릭터 몸체 (큰 사각형 - 피격 판정 없음)
    ctx.fillStyle = player.color; // 빨강 (무녀복)
    ctx.fillRect(player.x - 10, player.y - 15, 20, 30);
    // 머리 리본 느낌
    ctx.fillStyle = 'white';
    ctx.fillRect(player.x - 8, player.y - 20, 16, 5);

    // 2. ★ 판정점 (Shift 눌렀을 때만 보임)
    if (keys['ShiftLeft'] || keys['ShiftRight']) {
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.hitboxSize, 0, Math.PI*2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = 'red';
        ctx.stroke();
    }

    // --- 총알 그리기 ---
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI*2);
        ctx.fillStyle = b.color;
        ctx.fill();
        // 적 총알은 밝게 빛나는 효과 (외곽선)
        if (b.isEnemy) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    });
}

function gameLoop() {
    update();
    draw();
    if (!isGameOver) requestAnimationFrame(gameLoop);
    else requestAnimationFrame(draw);
}

gameLoop();
