// ================================
// 自定义 Live2D 模型 Service Worker
// 拦截 assets/live2d-custom/<角色id>/... 请求，从 Cache Storage 返回
// （本地导入的模型文件不落服务器，存浏览器缓存，SDK 用普通相对路径加载）
//
// ⚠️ 本文件必须待在站点根目录（和 index.html / user.html 同级），不能挪进 assets/：
//   · SW 的作用域不能超出脚本所在目录 —— 放 assets/ 里就管不到根目录的页面；
//   · SW 只能拦截「它控制的页面」发出的请求 —— 页面不被控制，模型虚拟路径就会 404。
// 注册代码在 assets/js/live2d-custom.js 的 registerSW()，两处要一起改。
// ================================

const CACHE_NAME = "xingyue-l2d-custom";

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    // 只处理自定义模型虚拟路径；其余请求一律放行
    if (!event.request.url.includes("/assets/live2d-custom/")) {
        return;
    }
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const hit = await cache.match(event.request);
            if (hit) {
                return hit;
            }
            // 缓存没有（被清理/换设备）→ 回源（仓库里没有该文件，会 404）
            return fetch(event.request);
        })
    );
});
