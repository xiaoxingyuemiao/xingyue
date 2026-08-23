// ================================
// Live2D Service Worker —— 退役版本
// 项目已改为明文加载模型（不再拦截请求）。
// 这个文件让浏览器里已注册的旧 Service Worker 自行注销：
// 清空旧缓存 + 注销自己，之后不再拦截任何请求。
// ================================

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        // 清掉旧模型缓存（xingyue-l2d 等）
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        // 注销自己
        await self.registration.unregister();
        console.log("Live2D Service Worker 已退役（缓存已清空）");
    })());
});

// 不再拦截任何请求
