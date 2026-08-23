// ===============================
// 液晶デジタル時計 PWA Service Worker（完全統合版）
// ・キャッシュ名はインストールごとに自動で一意な値を採用
// ・SWファイルを更新すると新しいキャッシュが作られ、古いキャッシュは自動削除
// ===============================

const CACHE_PREFIX = "lcd-clock-";

// オフラインで使うアセット一覧
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// この SW インスタンスで使うキャッシュ名（インストール時に決定）
let CURRENT_CACHE_NAME = null;

// インストール（初回起動 & SW更新時）
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // SW が更新されるたびに一意なキャッシュ名を自動生成
      CURRENT_CACHE_NAME = CACHE_PREFIX + Date.now();

      const cache = await caches.open(CURRENT_CACHE_NAME);
      await cache.addAll(ASSETS);

      // すぐ新しい SW を有効化
      self.skipWaiting();
    })()
  );
});

// 有効化（古いキャッシュの削除）
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 念のため、インストール時に決めたキャッシュ名がなければ最新のものを推測
      if (!CURRENT_CACHE_NAME) {
        const keys = await caches.keys();
        const latest = keys
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .sort()
          .pop();
        CURRENT_CACHE_NAME = latest || CACHE_PREFIX + "default";
      }

      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CURRENT_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );

      self.clients.claim();
    })()
  );
});

// オフライン対応（キャッシュ優先＋ネットフォールバック）
self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        return response;
      } catch (err) {
        // ネットもダメなときは、トップページだけでも返す
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
        throw err;
      }
    })()
  );
});
