// ================================
// 自定义 Live2D 模型模块（assets/js/live2d-custom.js）
// 本地导入：选择模型文件夹 → 文件写入 Cache Storage → 注册 Service Worker
// 模型以虚拟路径 assets/live2d-custom/<角色id>/<相对路径> 加载，
// 由 l2d-sw.js 从缓存返回（模型文件不落服务器，仅存本浏览器）。
// ================================

window.L2D_CUSTOM = (function () {

    // ⚠️ 这个名字在 l2d-sw.js 里也写了一份（Service Worker 是独立上下文，读不到本文件的常量）。
    //    两处必须一模一样，改一个就得改另一个 —— tools/check.js 会校验一致性，不一致直接报错。
    const CACHE_NAME = "xingyue-l2d-custom";

    // 站点基准（跟随当前页面路径，GitHub Pages 子路径也适用）
    function siteBase() {
        const pathname = location.pathname;
        const dir = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
        return location.origin + dir;
    }

    // 虚拟路径前缀
    function basePath() {
        return siteBase() + "assets/live2d-custom/";
    }

    // 等「这个注册」自己激活。
    //
    // ⚠️ 不能用 navigator.serviceWorker.ready：它等的是「作用域覆盖当前页面」的 SW，
    // 语义对不上时会一直挂着不 resolve，导入流程就永远停在“正在导入模型文件……”。
    // SW 里有 skipWaiting()，所以激活很快；万一失败也最多等 8 秒，不会把界面卡死。
    function waitActivated(reg) {
        if (reg.active) {
            return Promise.resolve();
        }

        const sw = reg.installing || reg.waiting;
        if (!sw) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const onState = () => {
                if (sw.state === "activated") {
                    sw.removeEventListener("statechange", onState);
                    resolve();
                }
            };

            sw.addEventListener("statechange", onState);
            setTimeout(resolve, 8000);
        });
    }

    // 注册 Service Worker 并等它激活（幂等）
    //
    // ⚠️ l2d-sw.js 必须放在站点根目录（和 index.html / user.html 同级），scope 也就是站点根。
    // 两条浏览器限制叠在一起，只有这一种摆法能用：
    //   1. SW 的作用域不能超出「脚本所在目录」→ 放 assets/js/ 或 assets/ 都盖不到站点根；
    //   2. SW 只能拦截「它控制的页面」发出的请求 → 作用域不含 index.html / user.html 时，
    //      页面加载模型的请求根本不经过 SW，虚拟路径就 404。
    // （写 scope: "/" 同样不行：超出脚本目录会抛 SecurityError，而 GitHub Pages
    //   没法发 Service-Worker-Allowed 响应头。）
    async function registerSW() {
        if (!("serviceWorker" in navigator)) {
            return;
        }

        const base = siteBase();

        try {
            const reg = await navigator.serviceWorker.register(base + "l2d-sw.js", { scope: base });
            await waitActivated(reg);
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
