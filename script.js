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

// --- iOS対応 Web Audio API シンセサイザー音源 ---
// iOSではユーザー操作（タップなど）の直後でないとオーディオ再生が許可されないため、初期状態はnullにします
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, type, duration) {
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    // iOSアプリで爆音にならないよう音量を0.2に最適化
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// 時報音
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

// アラーム音（タイマー終了時）
function triggerAlarm() {
    let count = 0;
    const alarmLoop = setInterval(() => {
        playTone(2500, 'square', 0.1);
        setTimeout(() => playTone(2500, 'square', 0.1), 200);
        count++;
        if (count >= 5) clearInterval(alarmLoop);
    }, 600);
}

// 7セグメント液晶の描画ロジック
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

// 液晶表示の更新処理
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

        // 毎時0分0秒の時報判定
        if (rawMinute === 0 && rawSecond === 0 && rawHour !== lastHour) {
            const chimeToggle = document.getElementById('chime-toggle');
            if (chimeToggle && chimeToggle.checked) {
                triggerChime();
            }
            lastHour = rawHour;
        }

        // 12時間表記 / 24時間表記の出し分け
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

    // 各桁へデータを分配して液晶点灯
    drawDigit(document.getElementById('h1'), parseInt(hoursStr.charAt(0)));
    drawDigit(document.getElementById('h2'), parseInt(hoursStr.charAt(1)));
    drawDigit(document.getElementById('m1'), parseInt(minutesStr.charAt(0)));
    drawDigit(document.getElementById('m2'), parseInt(minutesStr.charAt(1)));
    drawDigit(document.getElementById('s1'), parseInt(secondsStr.charAt(0)));
    drawDigit(document.getElementById('s2'), parseInt(secondsStr.charAt(1)));

    // コロンの点滅同期
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

// --- iOS対応：常時点灯（スリープ防止）処理 ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('常時点灯モードが有効になりました');
        } catch (err) {
            console.error(`常時点灯エラー: ${err.message}`);
        }
    }
}

// バックグラウンド（別アプリ）から復帰した際に常時点灯を再取得
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

/* --- タイマー制御パネル --- */
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
    initAudio(); // タイマー開始のタップで音源をアクティブ化

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
    if (dateEl) dateEl.textContent = "⏱️ TIMER MODE";
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
            if (alarmToggle && alarmToggle.checked) {
                triggerAlarm();
            }
            setTimeout(() => {
                stopTimer();
            }, 4000); 
        }
    }, 1000);
    updateDisplay();
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    isTimerActive = false;
    document.getElementById('timer-setup').style.display = 'flex';
    document.getElementById('countdown-display').style.display = 'none';
    clearInterval(timerInterval);
    timerInterval = setInterval(updateDisplay, 200);
    updateDisplay();
}

/* --- 各種UI切り替え --- */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    if (currentTheme === 'light') {
        document.documentElement.removeAttribute('data-theme');
        btn.textContent = 'Light';
        btn.classList.remove('active');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        btn.textContent = 'Dark';
        btn.classList.add('active');
    }
}

function changeFormat(format) {
    timeFormat = format;
    const btn12 = document.getElementById('btn-12h');
    const btn24 = document.getElementById('btn-24h');
    if (btn12) btn12.classList.toggle('active', format === '12h');
    if (btn24) btn24.classList.toggle('active', format === '24h');
    updateDisplay();
}

function changeColor(hexColor) {
    document.documentElement.style.setProperty('--clock-color', hexColor);
}

function changeBrightness(val) {
    document.documentElement.style.setProperty('--clock-opacity', val);
}

function toggleFullscreen() {
    document.body.classList.toggle('fullscreen-mode');
}

// --- iOSセキュリティ制限解除（ファーストタッチ連動） ---
// アプリ起動後に画面を1回でもタップすると、オーディオシステムと常時点灯が同時にロックオンされます
document.addEventListener('click', () => {
   initAudio();           // 音源制限を解除
   if (!wakeLock) {
      requestWakeLock();  // スリープ防止を有効化
   }
}, { once: true });

// ループ処理開始
timerInterval = setInterval(updateDisplay, 200);
updateDisplay();
