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
let audioCtx = null;

function initAudio() {
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

async function playTone(freq, type, duration) {
    initAudio();
    if (!audioCtx) return;

    try {
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
    } catch (e) {
        // iOS15系などで resume が失敗しても落ちないようにする
        console.warn('AudioContext resume failed:', e);
    }

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

// 時報音（引数で現在の秒数を受け取り、リアルタイムに音を出し分け）
async function triggerChime(currentSecond) {
    const chimeSelect = document.getElementById('chime-sound-select').value;
    initAudio();

    if (chimeSelect === 'electronic') {
        if (currentSecond === 57 || currentSecond === 58 || currentSecond === 59) {
            await playTone(880, 'sine', 0.12);
        } else if (currentSecond === 0) {
            await playTone(1760, 'sine', 0.35);
        }
    } else if (chimeSelect === 'bell') {
        if (currentSecond === 57 || currentSecond === 58 || currentSecond === 59) {
            await playTone(660, 'triangle', 0.20);
        } else if (currentSecond === 0) {
            await playTone(880, 'triangle', 0.45);
        }
    } else if (chimeSelect === 'pipipip') {
        if (currentSecond === 57 || currentSecond === 58 || currentSecond === 59) {
            await playTone(1500, 'square', 0.12);
        } else if (currentSecond === 0) {
            await playTone(2200, 'square', 0.35);
        }
    }
}

// アラーム音（タイマー終了時）
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

// --- iOS Safari：ロック解除後の AudioContext 復帰（iOS16+向け補強） ---
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
});

window.addEventListener('focus', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
});

// --- ロック解除後の最初のタップで AudioContext を再生成（iOS15系向け保険） ---
window.addEventListener('touchstart', () => {
    if (!audioCtx || audioCtx.state === 'suspended' || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}, { once: true });

window.addEventListener('click', () => {
    if (!audioCtx || audioCtx.state === 'suspended' || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}, { once: true });

// --- 7セグメント液晶の描画ロジック（DOM参照をキャッシュ） ---
const digitEls = {};
const colonDots = () => document.querySelectorAll('.colon-dot');

function cacheDigits() {
    digitEls.h1 = document.getElementById('h1');
    digitEls.h2 = document.getElementById('h2');
    digitEls.m1 = document.getElementById('m1');
    digitEls.m2 = document.getElementById('m2');
    digitEls.s1 = document.getElementById('s1');
    digitEls.s2 = document.getElementById('s2');
}

function drawDigit(element, num) {
    if (!element) return;
    const segs = element.querySelectorAll('.seg');
    const pattern = getPattern(num);
    if (!pattern) return;

    segs.forEach((seg, index) => {
        const shouldOn = pattern[index] === 1;
        const isOn = seg.classList.contains('on');
        if (shouldOn && !isOn) {
            seg.classList.add('on');
        } else if (!shouldOn && isOn) {
            seg.classList.remove('on');
        }
    });
}

// 液晶表示の更新処理（57秒からの時報カウントダウン対応版）
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

        const isChimeTime =
            (rawMinute === 59 && [57, 58, 59].includes(rawSecond)) ||
            (rawMinute === 0 && rawSecond === 0);

        if (isChimeTime) {
            const chimeToggle = document.getElementById('chime-toggle');
            if (chimeToggle && chimeToggle.checked) {
                const timeKey = `${rawMinute}-${rawSecond}-${now.getMilliseconds()}`;
                if (typeof window.lastChimeKey === 'undefined' || window.lastChimeKey !== timeKey) {
                    triggerChime(rawSecond);
                    window.lastChimeKey = timeKey;
                }
            }
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

    drawDigit(digitEls.h1, parseInt(hoursStr.charAt(0)));
    drawDigit(digitEls.h2, parseInt(hoursStr.charAt(1)));
    drawDigit(digitEls.m1, parseInt(minutesStr.charAt(0)));
    drawDigit(digitEls.m2, parseInt(minutesStr.charAt(1)));
    drawDigit(digitEls.s1, parseInt(secondsStr.charAt(0)));
    drawDigit(digitEls.s2, parseInt(secondsStr.charAt(1)));

    const blinkTarget = isTimerActive ? remainingSeconds : parseInt(secondsStr);
    const isEven = blinkTarget % 2 === 0;
    colonDots().forEach(dot => {
        const on = dot.classList.contains('on');
        if (isEven && !on) {
            dot.classList.add('on');
        } else if (!isEven && on) {
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
async function activateWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock が解除されました。再取得します。');
            activateWakeLock();
        });
        console.log('Wake Lock 有効化');
    } catch (err) {
        console.error('Wake Lock エラー:', err);
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        activateWakeLock().catch(() => {});
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

        setTimeout(() => {
            document.querySelectorAll('#timer-panel input[type="number"]').forEach(input => {
                const val = input.value;
                input.value = '';
                input.value = val;
            });
        }, 50);
    }
}

function startTimer() {
    initAudio();

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

/* --- 設定変更 ＆ localStorage保存ロジック --- */

// 時間表記切り替え (12H / 24H)
function changeFormat(format) {
    timeFormat = format;
    localStorage.setItem('clockFormat', format);

    const btn12 = document.getElementById('btn-12h');
    const btn24 = document.getElementById('btn-24h');
    if (btn12 && btn24) {
        if (format === '12h') {
            btn12.classList.add('active');
            btn24.classList.remove('active');
        } else {
            btn12.classList.remove('active');
            btn24.classList.add('active');
        }
    }
    updateDisplay();
}

// テーマ切り替え (Light / Dark)
function toggleTheme() {
    const html = document.documentElement;
    const btn = document.getElementById('theme-toggle-btn');
    if (!html || !btn) return;

    let currentMode = html.getAttribute('data-color-mode');
    if (currentMode === 'light') {
        html.setAttribute('data-color-mode', 'dark');
        btn.textContent = 'Light';
        localStorage.setItem('clockTheme', 'dark');
    } else {
        html.setAttribute('data-color-mode', 'light');
        btn.textContent = 'Dark';
        localStorage.setItem('clockTheme', 'light');
    }
}

// 文字色（カラーピッカー）変更
function changeColor(colorValue) {
    document.documentElement.style.setProperty('--neon-color', colorValue);

    const periodEl = document.getElementById('period-display');
    if (periodEl) periodEl.style.color = colorValue;

    const dateEl = document.getElementById('date-el');
    if (dateEl) dateEl.style.color = colorValue;

    const picker = document.getElementById('color-picker');
    if (picker) picker.value = colorValue;

    localStorage.setItem('clockColor', colorValue);
}

// 明るさ変更
function changeBrightness(brightnessValue) {
    const clockContainer = document.querySelector('.clock-container');
    if (clockContainer) {
        clockContainer.style.opacity = brightnessValue;
    }
    const slider = document.getElementById('brightness');
    if (slider) slider.value = brightnessValue;

    localStorage.setItem('clockBrightness', brightnessValue);
}

async function toggleFullscreen() {
    initAudio();

    await userActivated();

    const controls = document.querySelector('.controls-container');
    const isHidden = controls && controls.style.display === 'none';

    if (isHidden) {
        controls.style.display = 'flex';
        document.body.classList.remove('menu-hidden');

        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    } else {
        controls.style.display = 'none';
        document.body.classList.add('menu-hidden');

        await activateWakeLock();
    }

    setTimeout(updateDisplay, 50);
}

async function userActivated() {
    await playTone(1000, 'sine', 0.05);
    window.userAudioActivated = true;
}

/* --- 次回起動時の自動読み込み（初期化） --- */
window.addEventListener('DOMContentLoaded', () => {
    function updateVh() {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    }
    updateVh();
    window.addEventListener('resize', updateVh);

    cacheDigits();

    const savedFormat = localStorage.getItem('clockFormat') || '24h';
    changeFormat(savedFormat);

    const savedChimeToggle = localStorage.getItem('chimeToggle');
    const chimeToggleEl = document.getElementById('chime-toggle');
    if (savedChimeToggle !== null && chimeToggleEl) {
        chimeToggleEl.checked = savedChimeToggle === 'true';
    }
    const savedChimeSound = localStorage.getItem('chimeSound') || 'electronic';
    const chimeSoundEl = document.getElementById('chime-sound-select');
    if (chimeSoundEl) chimeSoundEl.value = savedChimeSound;

    const savedAlarmToggle = localStorage.getItem('alarmToggle');
    const alarmToggleEl = document.getElementById('alarm-toggle');
    if (savedAlarmToggle !== null && alarmToggleEl) {
        alarmToggleEl.checked = savedAlarmToggle === 'true';
    }

    const savedTheme = localStorage.getItem('clockTheme') || 'dark';
    const html = document.documentElement;
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (html && themeBtn) {
        html.setAttribute('data-color-mode', savedTheme);
        themeBtn.textContent = savedTheme === 'light' ? 'Dark' : 'Light';
    }

    const savedColor = localStorage.getItem('clockColor') || '#ff9500';
    changeColor(savedColor);

    const savedBrightness = localStorage.getItem('clockBrightness') || '1';
    changeBrightness(savedBrightness);

    if (chimeToggleEl) {
        chimeToggleEl.addEventListener('change', (e) => {
            localStorage.setItem('chimeToggle', e.target.checked);
        });
    }
    if (chimeSoundEl) {
        chimeSoundEl.addEventListener('change', (e) => {
            localStorage.setItem('chimeSound', e.target.value);
        });
    }
    if (alarmToggleEl) {
        alarmToggleEl.addEventListener('change', (e) => {
            localStorage.setItem('alarmToggle', e.target.checked);
        });
    }

    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('focus', function () {
            const val = this.value;
            this.value = '';
            this.value = val;
        });
    });

    updateDisplay();
    setInterval(updateDisplay, 1000);
});

// PWA 起動時のフェードイン
window.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(() => {
        document.body.classList.add("loaded");
    });
});
