// --- 点灯パターンのテキストデータ（iPhoneシステム制限対応） ---
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

// iOS (Safari) 互換の Web Audio API コンテキスト初期化
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContextClass();

function playTone(freq, type, duration) {
    // iOS Safariでは再生直前にオーディオコンテキストの再開が必要な場合がある
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function triggerChime() {
    const chimeSelect = document.getElementById('chime-sound-select').value;
    if (chimeSelect === 'electronic') {
        playTone(880, 'sine', 0.1);
        setTimeout(() => playTone(880, 'sine', 0.1), 1000);
        setTimeout(() => playTone(880, 'sine', 0.1), 2000);
        setTimeout(() => playTone(1760, 'sine', 0.5), 3000);
    } else if (chimeSelect === 'bell') {
        playTone(440, 'triangle', 1.5);
        setTimeout(() => playTone(554.37, 'triangle', 1.2), 200);
    } else if (chimeSelect === 'pipipip') {
        playTone(2000, 'square', 0.05);
        setTimeout(() => playTone(2000, 'square', 0.05), 150);
        setTimeout(() => playTone(2000, 'square', 0.05), 300);
    }
}

function triggerAlarm() {
    let count = 0;
    const alarmLoop = setInterval(() => {
        playTone(2500, 'square', 0.1);
        setTimeout(() => playTone(2500, 'square', 0.1), 200);
        count++;
        if (count >= 5) clearInterval(alarmLoop);
    }, 600);
}

function drawDigit(element, num) {
    if (!element) return;
    const segs = element.querySelectorAll('.seg');
    const pattern = getPattern(num);
    segs.forEach((seg, index) => {
        if (pattern[index] === 1) {
            seg.classList.add('on');
        } else {
            seg.classList.remove('on');
        }
    });
}

function updateDisplay() {
    let hoursStr, minutesStr, secondsStr;
    const periodEl = document.getElementById('period-display');

    if (isTimerActive) {
        if (periodEl) periodEl.style.display = 'none'; 
        if (remainingSeconds <= 0) {
            hoursStr = "00";
            minutesStr = "00";
            secondsStr = "00";
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
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const dayList = ['日', '月', '火', '水', '木', '金', '土'];
        const dayOfWeek = dayList[now.getDay()];
        
        const dateEl = document.getElementById('date-el');
        if (dateEl) {
            dateEl.textContent = `${year}年${month}月${date}日 (${dayOfWeek})`;
        }

        let rawHour = now.getHours();
        const rawMinute = now.getMinutes();
        const rawSecond = now.getSeconds();

        if (rawMinute === 0 && rawSecond === 0 && rawHour !== lastHour) {
            const chimeToggle = document.getElementById('chime-toggle');
            if (chimeToggle && chimeToggle.checked) {
                triggerChime();
            }
            lastHour = rawHour;
        }

        if (timeFormat === '12h' && periodEl) {
            periodEl.style.display = 'block';
            if (rawHour >= 12) {
                periodEl.textContent = 'PM';
                if (rawHour > 12) rawHour -= 12;
            } else {
                periodEl.textContent = 'AM';
                if (rawHour === 0) rawHour = 12;
            }
        } else if (periodEl) {
            periodEl.style.display = 'none';
        }

        hoursStr = String(rawHour).padStart(2, '0');
        minutesStr = String(rawMinute).padStart(2, '0');
        secondsStr = String(rawSecond).padStart(2, '0');
    }

    drawDigit(document.getElementById('h1'), parseInt(hoursStr.charAt(0)));
    drawDigit(document.getElementById('h2'), parseInt(hoursStr.charAt(1)));
    drawDigit(document.getElementById('m1'), parseInt(minutesStr.charAt(0)));
    drawDigit(document.getElementById('m2'), parseInt(minutesStr.charAt(1)));
    drawDigit(document.getElementById('s1'), parseInt(secondsStr.charAt(0)));
    drawDigit(document.getElementById('s2'), parseInt(secondsStr.charAt(1)));

    const blinkTarget = isTimerActive ? remainingSeconds : parseInt(secondsStr);
    const isEven = blinkTarget % 2 === 0;
    const colons = document.querySelectorAll('.colon-dot');
    colons.forEach(dot => {
        if (isEven) {
            dot.classList.add('on');
        } else {
            dot.classList.remove('on');
        }
    });
}

// iOS Safari対応の画面スリープ防止機能
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock Successful');
        } catch (err) {
            console.error(`Wake Lock Failed: ${err.message}`);
        }
    }
}

// バックグラウンドから復帰した際に再取得
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

/* --- タイマー制御 --- */
function toggleTimerPanel() {
    const panel = document.getElementById('timer-panel');
    const btn = document.getElementById('timer-toggle-btn');
    if (!panel || !btn) return;
    if (panel.style.display === 'flex') {
        panel.style.display = 'none';
        btn.classList.remove('active');
    } else {
        panel.style.display = 'flex';
        btn.classList.add('active');
    }
}

function startTimer() {
    // iOSでのオーディオ再生許可を有効化
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const hInput = parseInt(document.getElementById('timer-hours').value) || 0;
    const mInput = parseInt(document.getElementById('timer-minutes').value) || 0;
    const sInput = parseInt(document.getElementById('timer-seconds').value) || 0;
    remainingSeconds = (hInput * 3600) + (mInput * 60) + sInput;

    if (remainingSeconds <= 0) {
        alert("時間を設定してください。");
        return;
    }

    isTimerActive = true;
    const dateEl = document.getElementById('date-el');
