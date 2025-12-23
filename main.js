import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, query, orderByChild, limitToLast, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase 설정 (제공해주신 정보 그대로 사용)
const firebaseConfig = {
    apiKey: "AIzaSyDbrsr6g0X6vKujfqBcFY0h--Rn3y1nCEI",
    authDomain: "bin20703-edda7.firebaseapp.com",
    databaseURL: "https://bin20703-edda7-default-rtdb.firebaseio.com",
    projectId: "bin20703-edda7",
    storageBucket: "bin20703-edda7.firebasestorage.app",
    messagingSenderId: "242056223892",
    appId: "1:242056223892:web:885b9bf54aa60ce7732881",
    measurementId: "G-C2VDTXTVZQ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 랭킹 목록 가져오기
const rankListDiv = document.getElementById('rank-list');
const scoreQuery = query(ref(db, 'scores'), orderByChild('score'), limitToLast(10));

onValue(scoreQuery, (snapshot) => {
    const data = [];
    snapshot.forEach(child => {
        data.push(child.val());
    });
    data.reverse(); // 내림차순 정렬

    rankListDiv.innerHTML = data.map((record, index) => `
        <div class="rank-item">
            <span>${index + 1}. ${record.nickname} <small style="color:#555; font-size:10px;">[${record.skills || 'No Skills'}]</small></span>
            <span style="color:#f0f; font-weight:bold;">${record.score.toLocaleString()}</span>
        </div>
    `).join('');
});

// 게임 시작 버튼 이벤트
document.getElementById('start-btn').onclick = () => {
    const nicknameInput = document.getElementById('nickname-input');
    const nickname = nicknameInput.value.trim();

    if (!nickname) {
        alert("Enter your codename!");
        return;
    }

    // 닉네임을 세션에 저장하여 game.html로 전달
    sessionStorage.setItem('playerNickname', nickname);
    location.href = 'game.html';
};
