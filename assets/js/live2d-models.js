// ================================
// Live2D 模型加载器
// 解密 .l2d 加密容器 → blob URL 化 → 供 SDK 加载
// 与 tools/pack-live2d.js 配套（格式 / 密钥算法必须一致）
// ================================

window.L2DModels = (function () {

    // ---- 密钥种子：片段拼接，避免明文（与打包脚本 SEED_PARTS 一致）----
    const SEED_PARTS = ["ARGNori", ".Coffee", ".kuma maid", ".xingyue", "2026"];
    const SEED = SEED_PARTS.join("");

    // ---- 官方模型清单：id -> .l2d 文件 + 默认显示配置 ----
    // scale 会在后续"每模型独立配置"步骤里按模型微调
    const OFFICIAL = {
        default: { url: "assets/live2d/default.l2d", scale: 0.1, anchor: [0, 0] },
        xingyao: { url: "assets/live2d/xingyao.l2d", scale: 0.1, anchor: [0, 0] },
        yueci: { url: "assets/live2d/yueci.l2d", scale: 0.1, anchor: [0, 0] },
    };

    // 模型缓存：id -> { entryUrl, scale, anchor }
    const cache = {};

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

    // 文件表 → Blob 表
    function toBlobs(files) {
        const blobs = {};
        for (const p of Object.keys(files)) {
            blobs[p] = new Blob([files[p]]);
        }
        return blobs;
    }

    // 递归遍历 JSON，把能匹配到文件表里的相对路径替换成 blob URL
    function rewriteRefs(node, blobs) {
        if (typeof node === "string") {
            const rel = node.replace(/^\.\//, "").replace(/\\/g, "/");
            if (blobs[rel]) {
                return URL.createObjectURL(blobs[rel]);
            }
            return node;
        }
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = rewriteRefs(node[i], blobs);
            }
            return node;
        }
        if (node && typeof node === "object") {
            for (const k of Object.keys(node)) {
                node[k] = rewriteRefs(node[k], blobs);
            }
            return node;
        }
        return node;
    }

    // 加载并缓存一个官方模型，返回 { entryUrl, scale, anchor }
    async function ensure(modelId) {
        if (cache[modelId]) {
            return cache[modelId];
        }
        const info = OFFICIAL[modelId];
        if (!info) {
            throw new Error("未知的模型 id: " + modelId);
        }
        console.log("解密模型: " + modelId + "（" + info.url + "）……");
        const data = await decrypt(info.url);
        const blobs = toBlobs(data.files);

        // 重写入口 JSON（model3.json / model.json）里的相对引用 → blob URL
        const entryBlob = blobs[data.entry];
        const text = new TextDecoder().decode(await entryBlob.arrayBuffer());
        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            throw new Error("模型入口文件不是有效 JSON: " + data.entry);
        }
        rewriteRefs(json, blobs);
        const newEntryBlob = new Blob([JSON.stringify(json)], { type: "application/json" });

        cache[modelId] = {
            entryUrl: URL.createObjectURL(newEntryBlob),
            scale: info.scale,
            anchor: info.anchor,
        };
        console.log("模型解密完成: " + modelId + "，入口已就绪");
        return cache[modelId];
    }

    // 已缓存的模型入口（同步读取，未加载返回 null）
    function get(modelId) {
        return cache[modelId] || null;
    }

    return {
        OFFICIAL: OFFICIAL,
        ensure: ensure,
        get: get,
    };
})();
