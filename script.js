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

// 時報音（引数で現在の秒数を受け取り、リアルタイムに音を出し分け）
// --- 時報サービス風（ポン、ポン、ポ〜ン！） ---
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
    initAudio(); // ★これを追加（最重要）
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

        // 1. 条件判定（59分57〜59秒、または0分0秒）
        const isChimeTime = (rawMinute === 59 && [57, 58, 59].includes(rawSecond)) || (rawMinute === 0 && rawSecond === 0);

        if (isChimeTime) {
            const chimeToggle = document.getElementById('chime-toggle');
    
        // 2. トグルスイッチのチェック
            if (chimeToggle && chimeToggle.checked) {
        
        // 3. 同じ秒数で2回以上鳴るのを防ぐ（一意なキーとして分+秒を使用するとより安全）
                const timeKey = `${rawMinute}:${rawSecond}`;
        
                if (typeof this.lastChimeKey === 'undefined' || this.lastChimeKey !== timeKey) {
                    triggerChime(rawSecond);
                    this.lastChimeKey = timeKey; // 鳴らしたタイミングを記録
                }
            } 
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
async function activateWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');

        // ★ ここで初めて wakeLock にイベントを付けられる
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock が解除されました。再取得します。');
            activateWakeLock();
        });

        console.log('Wake Lock 有効化');
    } catch (err) {
        console.error('Wake Lock エラー:', err);
    }
}


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

        // ★ パネルを開いた直後にカーソル位置を右端へ移動
        setTimeout(() => {
            document.querySelectorAll('#timer-panel input[type="number"]').forEach(input => {
                const val = input.value;
                input.value = '';   // 一度空にする
                input.value = val;  // 値を戻す → カーソルが末尾へ移動
            });
        }, 50); // iPhone Safari は少し遅延させると安定
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
    
    // ボタンのハイライト切り替え
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
    // CSS変数を書き換え（液晶セグメントやコロンの色を制御）
    document.documentElement.style.setProperty('--neon-color', colorValue);
    
    // AMPM・日付の文字色も明示的に適用
    const periodEl = document.getElementById('period-display');
    if (periodEl) periodEl.style.color = colorValue;

    const dateEl = document.getElementById('date-el');
    if (dateEl) dateEl.style.color = colorValue;
    
    // カラーピッカー自体の表示位置も同期
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

    // ★ 毎回音声権限を再解禁（Safari対策）
    await userActivated();

    const controls = document.querySelector('.controls-container');
    const isHidden = controls && controls.style.display === 'none';

    if (isHidden) {
        // メニューを表示する
        controls.style.display = 'flex';
        document.body.classList.remove('menu-hidden');

        // ★ メニュー表示時は WakeLock を解除
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }

    } else {
        // メニューを非表示にする（全画面）
        controls.style.display = 'none';
        document.body.classList.add('menu-hidden');

        // ★ 全画面時は WakeLock を再取得
        await activateWakeLock();
    }

    // Safari のレイアウト再計算対策
    setTimeout(updateDisplay, 50);
}

async function userActivated() {
    await playTone(1000, 'sine', 0.05); // ★Safariが確実に音声解禁する
    window.userAudioActivated = true;
}

/* --- 次回起動時の自動読み込み（初期化） --- */
window.addEventListener('DOMContentLoaded', () => {
   function updateVh() {
       document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
   }
   updateVh();
   window.addEventListener('resize', updateVh);

    
    // 1. 時間表示形式 (12h / 24h)
    const savedFormat = localStorage.getItem('clockFormat') || '24h';
    changeFormat(savedFormat);

    // 2. 時報トグルボタン・サウンドセレクトの復元
    const savedChimeToggle = localStorage.getItem('chimeToggle');
    const chimeToggleEl = document.getElementById('chime-toggle');
    if (savedChimeToggle !== null && chimeToggleEl) {
        chimeToggleEl.checked = savedChimeToggle === 'true';
    }
    const savedChimeSound = localStorage.getItem('chimeSound') || 'electronic';
    const chimeSoundEl = document.getElementById('chime-sound-select');
    if (chimeSoundEl) chimeSoundEl.value = savedChimeSound;

    // 3. タイマー音トグルボタンの復元
    const savedAlarmToggle = localStorage.getItem('alarmToggle');
    const alarmToggleEl = document.getElementById('alarm-toggle');
    if (savedAlarmToggle !== null && alarmToggleEl) {
        alarmToggleEl.checked = savedAlarmToggle === 'true';
    }

    // 4. テーマの復元
    const savedTheme = localStorage.getItem('clockTheme') || 'dark';
    const html = document.documentElement;
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (html && themeBtn) {
        html.setAttribute('data-color-mode', savedTheme);
        themeBtn.textContent = savedTheme === 'light' ? 'Dark' : 'Light';
    }

    // 5. 文字色の復元
    const savedColor = localStorage.getItem('clockColor') || '#ff9500';
    changeColor(savedColor);

    // 6. 明るさの復元
    const savedBrightness = localStorage.getItem('clockBrightness') || '1';
    changeBrightness(savedBrightness);

    // 変更を監視して即時保存するイベントリスナー
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
    // --- iPhone Safari 対策：入力欄タップ時にカーソルを右端へ移動 ---
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('focus', function() {
            const val = this.value;
            this.value = '';   // 一度空にする
            this.value = val;  // 値を戻す → カーソルが末尾へ移動
        });
    });
    // 時計の1秒定期更新スタート
    updateDisplay();
    setInterval(updateDisplay, 1000);
});
// PWA 起動時のフェードイン
window.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(() => {
        document.body.classList.add("loaded");
    });
});
// --- iOS Safari：ロック解除後の AudioContext 復帰 ---
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
});

window.addEventListener('focus', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
});

// --- ロック解除後の最初のタップで確実に音声権限を復帰 ---
window.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}, { once: true });
