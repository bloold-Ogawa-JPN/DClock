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
let wakeLock = null;

// --- iOS対応 Web Audio API シンセサイザー音源 ---
let audioCtx = null;

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
    await audioCtx.resume(); // ★Safari対策：確実に復帰させる
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

// --- 時報サービス風（ポン、ポン、ポ〜ン！） ---
async function triggerChime(currentSecond) {
    const chimeSelect = document.getElementById('chime-sound-select').value;
    initAudio();

    if (chimeSelect === 'electronic') {
        if ([57, 58, 59].includes(currentSecond)) {
            await playTone(880, 'sine', 0.12);
        } else if (currentSecond === 0) {
            await playTone(1760, 'sine', 0.35);
        }
    } else if (chimeSelect === 'bell') {
        if ([57, 58, 59].includes(currentSecond)) {
            await playTone(660, 'triangle', 0.20);
        } else if (currentSecond === 0) {
            await playTone(880, 'triangle', 0.45);
        }
    } else if (chimeSelect === 'pipipip') {
        if ([57, 58, 59].includes(currentSecond)) {
            await playTone(1500, 'square', 0.12);
        } else if (currentSecond === 0) {
            await playTone(2200, 'square', 0.35);
        }
    }
}

// --- タイマー終了時のアラーム ---
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

// --- 液晶表示更新（時報判定含む） ---
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
            hoursStr = String(h).padStart(2, '0');
            minutesStr = String(m).padStart(2, '0');
            secondsStr = String(s).padStart(2, '0');
        }
    } else {
        const now = new Date();
        const rawHour = now.getHours();
        const rawMinute = now.getMinutes();
        const rawSecond = now.getSeconds();

        // --- 時報判定 ---
        const isChimeTime =
            (rawMinute === 59 && [57, 58, 59].includes(rawSecond)) ||
            (rawMinute === 0 && rawSecond === 0);

        if (isChimeTime) {
            const chimeToggle = document.getElementById('chime-toggle');
            if (chimeToggle && chimeToggle.checked) {
                const timeKey = `${rawMinute}:${rawSecond}`;
                if (typeof window.lastChimeKey === 'undefined' ||
                    window.lastChimeKey !== timeKey) {
                    triggerChime(rawSecond);
                    window.lastChimeKey = timeKey;
                }
            }
        }

        // --- 12h / 24h 表記 ---
        let displayHour = rawHour;
        if (timeFormat === '12h' && periodEl) {
            periodEl.style.display = 'block';
            if (rawHour >= 12) {
                periodEl.textContent = 'PM';
                if (rawHour > 12) displayHour -= 12;
            } else {
                periodEl.textContent = 'AM';
                if (rawHour === 0) displayHour = 12;
            }
        } else if (periodEl) {
            periodEl.style.display = 'none';
        }

        hoursStr = String(displayHour).padStart(2, '0');
        minutesStr = String(rawMinute).padStart(2, '0');
        secondsStr = String(rawSecond).padStart(2, '0');
    }

    // --- 7セグへ反映 ---
    drawDigit(document.getElementById('h1'), parseInt(hoursStr[0]));
    drawDigit(document.getElementById('h2'), parseInt(hoursStr[1]));
    drawDigit(document.getElementById('m1'), parseInt(minutesStr[0]));
    drawDigit(document.getElementById('m2'), parseInt(minutesStr[1]));
    drawDigit(document.getElementById('s1'), parseInt(secondsStr[0]));
    drawDigit(document.getElementById('s2'), parseInt(secondsStr[1]));

    // --- コロン点滅 ---
    const blinkTarget = isTimerActive ? remainingSeconds : parseInt(secondsStr);
    const isEven = blinkTarget % 2 === 0;
    document.querySelectorAll('.colon-dot').forEach(dot => {
        dot.classList.toggle('on', isEven);
    });
}

// --- Wake Lock ---
async function activateWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => activateWakeLock());
    } catch (err) {
        console.error('Wake Lock エラー:', err);
    }
}

// --- タイマー ---
function startTimer() {
    initAudio();
    const h = parseInt(document.getElementById('timer-hours').value) || 0;
    const m = parseInt(document.getElementById('timer-minutes').value) || 0;
    const s = parseInt(document.getElementById('timer-seconds').value) || 0;

    remainingSeconds = h * 3600 + m * 60 + s;
    if (remainingSeconds <= 0) {
        alert("時間を設定してください。");
        return;
    }

    isTimerActive = true;
    document.getElementById('timer-setup').style.display = 'none';
    document.getElementById('countdown-display').style.display = 'flex';
    document.getElementById('timer-status').textContent = "COUNT DOWN...";

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateDisplay();
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            document.getElementById('timer-status').textContent = "TIME UP !";
            const alarmToggle = document.getElementById('alarm-toggle');
            if (alarmToggle && alarmToggle.checked) triggerAlarm();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    isTimerActive = false;
    document.getElementById('timer-setup').style.display = 'flex';
    document.getElementById('countdown-display').style.display = 'none';
    updateDisplay();
}

// --- 初回音声解禁（Safari対策） ---
async function userActivated() {
    await playTone(1000, 'sine', 0.05);
    window.userAudioActivated = true;
}

// --- フルスクリーン切り替え（初回タップで音声解禁） ---
async function toggleFullscreen() {
    initAudio();
    activateWakeLock();

    if (!window.userAudioActivated) {
        await userActivated(); // ★ここが最重要
    }

    const controls = document.querySelector('.controls-container');
    if (controls) {
        const hidden = controls.style.display === 'none';
        controls.style.display = hidden ? 'flex' : 'none';
        document.body.classList.toggle('menu-hidden', !hidden);
    }
}

// --- 初期化 ---
window.addEventListener('DOMContentLoaded', () => {
    function updateVh() {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    }
    updateVh();
    window.addEventListener('resize', updateVh);

    // 設定復元
    changeFormat(localStorage.getItem('clockFormat') || '24h');
    const chimeToggleEl = document.getElementById('chime-toggle');
    if (chimeToggleEl) chimeToggleEl.checked = localStorage.getItem('chimeToggle') === 'true';
    const chimeSoundEl = document.getElementById('chime-sound-select');
    if (chimeSoundEl) chimeSoundEl.value = localStorage.getItem('chimeSound') || 'electronic';
    const alarmToggleEl = document.getElementById('alarm-toggle');
    if (alarmToggleEl) alarmToggleEl.checked = localStorage.getItem('alarmToggle') === 'true';

    changeColor(localStorage.getItem('clockColor') || '#ff9500');
    changeBrightness(localStorage.getItem('clockBrightness') || '1');

    // 入力欄カーソル位置調整
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('focus', function () {
            const val = this.value;
            this.value = '';
            this.value = val;
        });
    });

    // 時計更新開始
    updateDisplay();
    setInterval(updateDisplay, 1000);
});
