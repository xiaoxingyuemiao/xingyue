// ================================
// Live2D 模型 Service Worker
// 拦截 assets/live2d/<模型>/... 的请求，从 Cache Storage 返回
// （模型明文不进仓库，页面解密 .l2d 后写入缓存，SDK 用普通相对路径加载）
// ================================

const CACHE_NAME = "xingyue-l2d";

self.addEventListener("install", () => {
    // 立即激活，不等旧 SW 卸载
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    const url = event.request.url;

    // 只处理模型子文件（assets/live2d/<模型id>/xxx）
    // .l2d 加密容器本身是真实文件，放行正常下载
    if (!url.includes("/assets/live2d/") || url.endsWith(".l2d")) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const hit = await cache.match(event.request);
            if (hit) {
                return hit;
            }
            // 缓存没有 → 回源（正常不会走到：文件不在仓库里，会 404）
            return fetch(event.request);
        })
    );
});
