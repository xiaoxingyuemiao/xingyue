// ================================
// Live2D 模型加密打包脚本
// 用法：node tools/pack-live2d.js
//
// 把 assets/live2d/<模型目录>/ 里的模型文件
// （只打包 model3.json 引用的文件，BFS 收集）
// 加密成单个 .l2d 文件：assets/live2d/<模型名>.l2d
//
// 容器格式（version 1）：
//   magic "XYL2D" (5B) + ver (1B) + iv (12B) + tag (16B) + ciphertext
//   明文：u32 entryLen + entry(UTF-8) + u32 fileCount
//         + 每个文件：u32 pathLen + path(UTF-8) + u32 dataLen + data
//   加密：AES-256-GCM，密钥 = SHA-256(SEED)
// ================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const LIVE2D_DIR = path.join(ROOT, "assets", "live2d");

// 三个官方模型：目录名 -> 入口文件
const MODELS = [
    { name: "default", entry: "ARGNori.model3.json" },
    { name: "xingyao", entry: "Coffee.model3.json" },
    { name: "yueci", entry: "kuma maid.model3.json" },
];

// 密钥种子：前端 JS 用同样的片段拼接 + SHA-256 重建密钥
// （故意写成模型名列表的样子，避免被 Ctrl+F 一眼搜出）
const SEED_PARTS = ["ARGNori", ".Coffee", ".kuma maid", ".xingyue", "2026"];
const SEED = SEED_PARTS.join("");

function deriveKey(seed) {
    return crypto.createHash("sha256").update(seed, "utf8").digest(); // 32B
}

// 规范化相对路径：反斜杠转斜杠、去掉开头的 ./
function normalize(p) {
    return String(p).replace(/\\/g, "/").replace(/^\.\//, "");
}

// 递归扫描 JSON 对象，收集所有字符串值（引用文件路径候选）
function collectStrings(obj, out) {
    if (typeof obj === "string") {
        out.push(obj);
    } else if (Array.isArray(obj)) {
        for (const item of obj) collectStrings(item, out);
    } else if (obj && typeof obj === "object") {
        for (const key of Object.keys(obj)) collectStrings(obj[key], out);
    }
}

// 看起来像文件路径的字符串才当候选（过滤参数名/物理组名等）
function looksLikePath(s) {
    if (!s || typeof s !== "string" || s.length > 300) return false;
    if (s.includes("://") || s.startsWith("data:") || s.startsWith("#") || s.startsWith("{")) return false;
    // 文件路径几乎都带扩展名（.json/.png/.moc/.moc3/...）
    if (!s.includes(".")) return false;
    return true;
}

// BFS 收集模型目录下所有被引用的文件（相对路径）
function collectReferencedFiles(modelDir, entry) {
    const files = new Map(); // 相对路径 -> 磁盘绝对路径
    const queue = [entry];
    const visited = new Set();

    while (queue.length > 0) {
        const rel = normalize(queue.shift());
        if (visited.has(rel)) continue;
        visited.add(rel);

        const abs = path.join(modelDir, ...rel.split("/"));
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            continue; // 引用不存在（可能是参数名等误报），跳过
        }
        files.set(rel, abs);

        // JSON 文件内部可能还有引用（如 model3.json 引用贴图/动作），继续扫描
        if (rel.toLowerCase().endsWith(".json")) {
            try {
                const data = JSON.parse(fs.readFileSync(abs, "utf8"));
                const strings = [];
                collectStrings(data, strings);
                for (const s of strings) {
                    if (looksLikePath(s)) {
                        queue.push(normalize(s));
                    }
                }
            } catch (e) {
                console.warn("  JSON 解析失败（忽略）: " + rel);
            }
        }
    }
    return files;
}

// 打包单个模型 -> 密文 Buffer
function packModel(name, entry) {
    const modelDir = path.join(LIVE2D_DIR, name);
    console.log("\n=== 打包 " + name + " (入口: " + entry + ") ===");

    const files = collectReferencedFiles(modelDir, entry);
    if (files.size === 0) {
        throw new Error(name + ": 没有收集到任何文件");
    }
    console.log("收集到 " + files.size + " 个文件");

    // ---- 拼明文 ----
    const chunks = [];
    const entryBuf = Buffer.from(entry, "utf8");
    const entryLen = Buffer.alloc(4);
    entryLen.writeUInt32LE(entryBuf.length, 0);
    chunks.push(entryLen, entryBuf);

    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt32LE(files.size, 0);
    chunks.push(countBuf);

    let totalBytes = 0;
    for (const [rel, abs] of files) {
        const pBuf = Buffer.from(rel, "utf8");
        const pLen = Buffer.alloc(4);
        pLen.writeUInt32LE(pBuf.length, 0);
        const data = fs.readFileSync(abs);
        const dLen = Buffer.alloc(4);
        dLen.writeUInt32LE(data.length, 0);
        chunks.push(pLen, pBuf, dLen, data);
        totalBytes += data.length;
    }
    const plain = Buffer.concat(chunks);
    console.log("明文大小: " + (plain.length / 1024 / 1024).toFixed(1) + " MB (文件数据 " + (totalBytes / 1024 / 1024).toFixed(1) + " MB)");

    // ---- 加密 ----
    const key = deriveKey(SEED);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();

    const out = Buffer.concat([
        Buffer.from("XYL2D", "ascii"),
        Buffer.from([1]),
        iv,
        tag,
        enc,
    ]);

    const outPath = path.join(LIVE2D_DIR, name + ".l2d");
    fs.writeFileSync(outPath, out);
    console.log("已输出: " + outPath + " (" + (out.length / 1024 / 1024).toFixed(1) + " MB)");
    return outPath;
}

// 解密自检
function verify(outPath) {
    const buf = fs.readFileSync(outPath);
    if (buf.toString("ascii", 0, 5) !== "XYL2D") throw new Error("magic 错误");
    if (buf[5] !== 1) throw new Error("版本不支持");
    const iv = buf.subarray(6, 18);
    const tag = buf.subarray(18, 34);
    const enc = buf.subarray(34);
    const key = deriveKey(SEED);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);

    let off = 0;
    const entryLen = plain.readUInt32LE(off); off += 4;
    const entry = plain.toString("utf8", off, off + entryLen); off += entryLen;
    const count = plain.readUInt32LE(off); off += 4;
    let files = 0;
    for (let i = 0; i < count; i++) {
        const pLen = plain.readUInt32LE(off); off += 4;
        const p = plain.toString("utf8", off, off + pLen); off += pLen;
        const dLen = plain.readUInt32LE(off); off += 4;
        off += dLen;
        files++;
    }
    if (off !== plain.length) throw new Error("自检：尾部数据不匹配");
    console.log("自检通过: 入口=" + entry + ", " + files + " 个文件, 密文完好可解密");
}

// ---- 主流程 ----
for (const m of MODELS) {
    try {
        const out = packModel(m.name, m.entry);
        verify(out);
    } catch (e) {
        console.error("打包失败: " + m.name + " -> " + e.message);
        process.exit(1);
    }
}
console.log("\n全部打包完成 ✅");
