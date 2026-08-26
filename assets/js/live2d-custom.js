// ================================
// 自定义 Live2D 模型模块（assets/js/live2d-custom.js）
// 本地导入：选择模型文件夹 → 文件写入 Cache Storage → 注册 Service Worker
// 模型以虚拟路径 assets/live2d-custom/<角色id>/<相对路径> 加载，
// 由 l2d-sw.js 从缓存返回（模型文件不落服务器，仅存本浏览器）。
// ================================

window.L2D_CUSTOM = (function () {

    const CACHE_NAME = "xingyue-l2d-custom";

    // 虚拟路径前缀（跟随当前页面路径，GitHub Pages 子路径也适用）
    function basePath() {
        const pathname = location.pathname;
        const dir = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
        return location.origin + dir + "assets/live2d-custom/";
    }

    // 注册 Service Worker 并等它激活（幂等）
    async function registerSW() {
        if (!("serviceWorker" in navigator)) {
            return;
        }
        try {
            await navigator.serviceWorker.register("assets/js/l2d-sw.js", { scope: "/" });
            await navigator.serviceWorker.ready;
        } catch (e) {
            console.warn("Service Worker 注册失败（本地模型可能无法加载）：", e);
        }
    }

    function mimeOf(rel) {
        const lower = rel.toLowerCase();
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    // 导入模型文件夹（webkitdirectory 选出的 FileList）
    // 返回入口相对路径（model3.json / model.json），找不到返回 null
    async function importFolder(roleId, fileList) {
        const files = Array.from(fileList || []);
        if (files.length === 0) {
            return null;
        }
        const cache = await caches.open(CACHE_NAME);
        const base = basePath() + roleId + "/";
        let entry = null;

        for (const file of files) {
            // 相对路径：去掉顶层文件夹名（webkitRelativePath 形如 "模型名/model3.json"）
            let rel = (file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
            const parts = rel.split("/");
            if (parts.length > 1) {
                parts.shift();
            }
            rel = parts.join("/");
            if (!rel) {
                continue;
            }
            const resp = new Response(file, { headers: { "Content-Type": mimeOf(rel) } });
            await cache.put(base + rel, resp);
            if (!entry && rel.endsWith(".model3.json")) {
                entry = rel; // Cubism 3/4
            } else if (!entry && rel.endsWith("model.json")) {
                entry = rel; // Cubism 2
            }
        }

        if (entry) {
            await registerSW();
        }
        return entry;
    }

    // 清除某个角色的导入缓存（删除角色时调用）
    async function clearRole(roleId) {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        const base = basePath() + roleId + "/";
        for (const req of keys) {
            if (req.url.startsWith(base)) {
                await cache.delete(req);
            }
        }
    }

    return {
        CACHE_NAME: CACHE_NAME,
        basePath: basePath,
        importFolder: importFolder,
        clearRole: clearRole,
    };
})();
