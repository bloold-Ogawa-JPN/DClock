// --- 点灯パターンのテキストデータ（iOS環境での配列カットバグ対策） ---
const patternStrings = {
    0: "1,1,1,1,1,1,0",
    1: "0,1,1,0,0,0,0",
    2: "1,1,0,1,1,0,1",
    3: "1,1,1,1,0,0,1",
    4: "0,1,1,0,0,1,1",
    5: "1,0,1,1,0,1,1",
    6: "1,0,1,1,1,1,1",
    7: "1,1,1,0,0,1,0",
    8: "1,1,1,1,1,1,1",
    9: "1,1,1,1,0,1,1"
};

function getPattern(num) {
    const str = patternStrings[num];
    if (!str) return;
    return str.split(',').map(v => parseInt(v));
}

// 状態管理変数
let timerInterval = null;
let remainingSeconds = 0;
let isTimerActive = false;
let timeFormat = '24h'; 
let lastHour = -1;      
let wakeLock = null; 
let audioCtx = null;

// --- iOS対応 Web Audio API シンセサイザー音源 ---
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

async function playTone(freq, type, duration) {
    initAudio();
    await audioCtx.resume();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
        0.00001,
        audioCtx.currentTime + duration
    );
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// --- 時報音 ---
async function triggerChime(currentSecond) {
    const chimeSelect = document.getElementById('chime-sound-select').value;
    initAudio();

    if (chimeSelect === 'electronic') {
        if ([57,58,59].includes(currentSecond)) await playTone(880, 'sine', 0.12);
        else if (currentSecond === 0) await playTone(1760, 'sine', 0.35);
    } else if (chimeSelect === 'bell') {
        if ([57,58,59].includes(currentSecond)) await playTone(660, 'triangle', 0.20);
        else if (currentSecond === 0) await playTone(880, 'triangle', 0.45);
    } else if (chimeSelect === 'pipipip') {
        if ([57,58,59].includes(currentSecond)) await playTone(1500, 'square', 0.12);
        else if (currentSecond === 0) await playTone(2200, 'square', 0.35);
    }
}

// --- タイマー終了音 ---
function triggerAlarm() {
    initAudio();
    let count = 0;
    const alarmLoop = setInterval(() => {
        playTone(2500, 'square', 0.1);
        setTimeout(() => playTone(2500, 'square', 0.1), 200);
        count++;
        if (count >= 5) clearInterval(alarmLoop);
    }, 600);
}

// --- 7セグメント描画 ---
function drawDigit(element, num) {
    if (!element) return;
    const segs = element.querySelectorAll('.seg');
    const pattern = getPattern(num);
    segs.forEach((seg, index) => {
        if (pattern[index] === 1) seg.classList.add('on');
        else seg.classList.remove('on');
    });
}

// --- 液晶表示更新 ---
function updateDisplay() {
    let hoursStr, minutesStr, secondsStr;
    const periodEl = document.getElementById('period-display');

    if (isTimerActive) {
        if (periodEl) periodEl.style.display = 'none'; 
        if (remainingSeconds <= 0) {
            hoursStr = "00"; minutesStr = "00"; secondsStr = "00";
        } else {
            const h = Math.floor(remainingSeconds / 3600);
            const m = Math.floor((remainingSeconds % 3600) / 60);
            const s = remainingSeconds % 60;
            hoursStr = String(h).padStart(2,'0');
            minutesStr = String(m).padStart(2,'0');
            secondsStr = String(s).padStart(2,'0');
        }
    } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth()+1;
        const date = now.getDate();
        const dayList = ['日','月','火','水','木','金','土'];
        const dayOfWeek = dayList[now.getDay()];
        
        const dateEl = document.getElementById('date-el');
        if (dateEl) dateEl.textContent = `${year}年${month}月${date}日 (${dayOfWeek})`;

        let rawHour = now.get
