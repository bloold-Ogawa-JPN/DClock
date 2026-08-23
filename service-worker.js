// ===============================
// 液晶デジタル時計 PWA Service Worker（完全改善版）
// ===============================

// キャッシュ名（SW更新時に自動で変わる）
const CACHE_NAME = "lcd-clock-" + Date.now();

// キャッシュする静的アセット
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// ------------------------------
// install：新しいキャッシュを作成
// ------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ------------------------------
// activate：古いキャッシュを削除
// ------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const deleteTargets = keys.filter((key) => key !== CACHE_NAME);
      return Promise.all(deleteTargets.map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

// ------------------------------
// fetch：GET + 自サイトのファイルだけキャッシュ
// ------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 1. 非GET（POST/PUT/DELETEなど）はキャッシュ処理しない
  if (req.method !== "GET") {
    return;
  }

  // 2. 外部URLはキャッシュしない（自サイトのみ）
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // 3. 通常のキャッシュ処理（Cache First）
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).catch(() => {
          // オフライン時は index.html を返す（PWAとして安全）
          if (req.mode === "navigate") {
            return caches.match("/");
          }
        })
      );
    })
  );
});
