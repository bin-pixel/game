const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreBoard = document.getElementById('scoreBoard');

// 1. 게임 상태
let score = 0;
const player = { x: 275, y: 700, width: 50, height: 50, color: '#00ffcc', speed: 7 };
let bullets = [];
let enemies = [];
let keys = {};
let frameCount = 0;

// 2. 입력 리스너
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') fireBullet();
});
window.addEventListener('keyup', e => keys[e.code] = false);

function fireBullet() {
    bullets.push({ 
        x: player.x + player.width / 2 - 5, 
        y: player.y, 
        width: 10, height: 20, color: '#ffff00', speed: 10 
    });
}

// 3. 로직 업데이트
function update() {
    frameCount++;

    // 플레이어 이동
    if (keys['ArrowLeft'] && player.x > 0) player.x -= player.speed;
    if (keys['ArrowRight'] && player.x + player.width < canvas.width) player.x += player.speed;

    // 총알 이동
    for (let i = 0; i < bullets.length; i++) {
        bullets[i].y -= bullets[i].speed;
        if (bullets[i].y < 0) {
            bullets.splice(i, 1);
            i--;
        }
    }

    // 적군 생성
    if (frameCount % 60 === 0) {
        enemies.push({
            x: Math.random() * (canvas.width - 50),
            y: -50,
            width: 50, height: 50, color: '#ff4444', speed: 3 + Math.random() * 2
        });
    }

    // 적군 이동 및 충돌 체크
    for (let i = 0; i < enemies.length; i++) {
        enemies[i].y += enemies[i].speed;

        if (enemies[i].y > canvas.height) {
            enemies.splice(i, 1);
            i--;
            continue;
        }

        for (let j = 0; j < bullets.length; j++) {
            if (checkCollision(bullets[j], enemies[i])) {
                bullets.splice(j, 1);
                enemies.splice(i, 1);
                score += 10;
                scoreBoard.innerText = `Score: ${score}`;
                i--;
                break;
            }
        }
    }
}

function checkCollision(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

// 4. 그리기
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);

    bullets.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });

    enemies.forEach(e => {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.width, e.height);
    });
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
gameLoop();
