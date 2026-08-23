// ================================
// Live2D 模型加载器
// 解密 .l2d 加密容器 → 写入 Cache Storage → 返回普通相对路径给 SDK
// SDK 加载时由 Service Worker（l2d-sw.js）从缓存返回文件
// 与 tools/pack-live2d.js 配套（格式 / 密钥算法必须一致）
// ================================

window.L2DModels = (function () {

    // ---- 密钥种子：片段拼接，避免明文（与打包脚本 SEED_PARTS 一致）----
    const SEED_PARTS = ["ARGNori", ".Coffee", ".kuma maid", ".xingyue", "2026"];
    const SEED = SEED_PARTS.join("");

    // ---- 官方模型清单：id -> .l2d 文件 + 入口 + 默认显示配置 ----
    // scale / anchor 会在后续"每模型独立配置"步骤里按模型微调
    const OFFICIAL = {
        default: {
            url: "assets/live2d/default.l2d",
            entry: "ARGNori.model3.json",
            scale: 0.1,
            anchor: [0, 0],
        },
        xingyao: {
            url: "assets/live2d/xingyao.l2d",
            entry: "Coffee.model3.json",
            scale: 0.1,
            anchor: [0, 0],
        },
        yueci: {
            url: "assets/live2d/yueci.l2d",
            entry: "kuma maid.model3.json",
            scale: 0.1,
            anchor: [0, 0],
        },
    };

    const CACHE_NAME = "xingyue-l2d";

    // 已加载（已写入缓存）的模型 id
    const loaded = {};

    // SHA-256(seed) 推导 32 字节 AES-256 密钥
    async function deriveKey() {
        const data = new TextEncoder().encode(SEED);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return new Uint8Array(digest);
    }

    // 解密 .l2d，返回 { entry, files: { 相对路径: Uint8Array } }
    async function decrypt(url) {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error("模型文件下载失败（HTTP " + res.status + "）");
        }
        const buf = new Uint8Array(await res.arrayBuffer());

        // 文件头：magic "XYL2D" (5) + ver (1) + iv (12) + 密文（ciphertext + tag 16B）
        if (buf.length < 34 || String.fromCharCode(buf[0], buf[1], buf[2], buf[3], buf[4]) !== "XYL2D") {
            throw new Error("不是有效的 .l2d 模型文件");
        }
        const ver = buf[5];
        if (ver !== 1) {
            throw new Error("不支持的模型文件版本: " + ver);
        }
        const iv = buf.subarray(6, 18);
        const cipher = buf.subarray(18); // 密文自带 tag 尾部

        const keyBytes = await deriveKey();
        const key = await crypto.subtle.importKey(
            "raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]
        );
        let plain;
        try {
            plain = new Uint8Array(await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv, tagLength: 128 },
                key,
                cipher
            ));
        } catch (e) {
            throw new Error("模型解密失败（文件可能损坏）");
        }

        // 明文：u32 entryLen + entry + u32 count + (u32 pathLen + path + u32 dataLen + data)...
        const dv = new DataView(plain.buffer);
        let off = 0;
        const entryLen = dv.getUint32(off, true);
        off += 4;
        const entry = new TextDecoder().decode(plain.subarray(off, off + entryLen));
        off += entryLen;
        const count = dv.getUint32(off, true);
        off += 4;
        const files = {};
        for (let i = 0; i < count; i++) {
            const pLen = dv.getUint32(off, true);
            off += 4;
            const p = new TextDecoder().decode(plain.subarray(off, off + pLen));
            off += pLen;
            const dLen = dv.getUint32(off, true);
            off += 4;
            files[p] = plain.subarray(off, off + dLen);
            off += dLen;
        }
        return { entry: entry, files: files };
    }

    // 模型虚拟路径前缀：https://origin/xingyue/assets/live2d/<模型id>/
    function modelBase() {
        const pathname = location.pathname;
        const dir = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
        return location.origin + dir + "assets/live2d/";
    }

    function mimeOf(rel) {
        const lower = rel.toLowerCase();
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    // 注册 Service Worker（幂等），等它激活后再继续
    async function ensureServiceWorker() {
        if (!("serviceWorker" in navigator)) {
            return;
        }
        try {
            await navigator.serviceWorker.register("assets/js/l2d-sw.js", { scope: "/" });
            await navigator.serviceWorker.ready;
        } catch (e) {
            console.warn("Service Worker 注册失败（模型可能无法加载）：", e);
        }
    }

    // 加载并缓存一个官方模型，返回 { path, scale, anchor }
    // path 是普通相对路径，SDK 正常解析，实际文件由 Service Worker 从缓存提供
    async function ensure(modelId) {
        const info = OFFICIAL[modelId];
        if (!info) {
            throw new Error("未知的模型 id: " + modelId);
        }

        const base = modelBase();
        const path = base + modelId + "/" + info.entry;

        if (loaded[modelId]) {
            return { path: path, scale: info.scale, anchor: info.anchor };
        }

        const cache = await caches.open(CACHE_NAME);

        // 缓存里已有该模型 → 跳过解密（刷新页面不用重新下载 50MB）
        if (await cache.match(path)) {
            loaded[modelId] = true;
            return { path: path, scale: info.scale, anchor: info.anchor };
        }

        // 解密 .l2d → 全部文件写入缓存
        console.log("解密模型: " + modelId + "（" + info.url + "）……");
        const data = await decrypt(info.url);
        for (const rel of Object.keys(data.files)) {
            const url = base + modelId + "/" + rel;
            const resp = new Response(new Blob([data.files[rel]]), {
                headers: { "Content-Type": mimeOf(rel) },
            });
            await cache.put(url, resp);
        }
        loaded[modelId] = true;
        console.log("模型解密完成: " + modelId + "，文件已写入缓存");

        // 等 Service Worker 就绪（否则 SDK 请求会打到 404 页面）
        await ensureServiceWorker();

        return { path: path, scale: info.scale, anchor: info.anchor };
    }

    return {
        OFFICIAL: OFFICIAL,
        ensure: ensure,
        modelBase: modelBase,
    };
})();
