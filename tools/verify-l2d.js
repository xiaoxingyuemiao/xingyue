// ================================
// .l2d 模型文件验证脚本
// 用法：node tools/verify-l2d.js [模型id...]（缺省验证全部）
// 用与浏览器前端完全相同的密钥推导 + AES-GCM 解密流程，
// 确认打包脚本与 live2d-models.js 的格式/密钥一致。
// ================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LIVE2D_DIR = path.join(__dirname, "..", "assets", "live2d");

// 与 assets/js/live2d-models.js 完全一致
const SEED_PARTS = ["ARGNori", ".Coffee", ".kuma maid", ".xingyue", "2026"];
const SEED = SEED_PARTS.join("");

const ids = process.argv.slice(2);
const targets = ids.length > 0 ? ids : ["default", "xingyao", "yueci"];

// 模拟浏览器 Web Crypto 的 importKey + decrypt
async function decryptLikeBrowser(buf) {
    const keyBytes = new Uint8Array(crypto.createHash("sha256").update(SEED, "utf8").digest());
    const iv = buf.subarray(6, 18);
    const cipher = buf.subarray(18); // 密文自带 tag 尾部（与 Web Crypto 一致）
    // 用 Node 的 subtle（和浏览器同接口）走一遍真实路径
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv, tagLength: 128 }, key, cipher);
    return new Uint8Array(plain);
}

function parsePlain(plain) {
    const dv = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
    let off = 0;
    const entryLen = dv.getUint32(off, true); off += 4;
    const entry = new TextDecoder().decode(plain.subarray(off, off + entryLen)); off += entryLen;
    const count = dv.getUint32(off, true); off += 4;
    const files = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
        const pLen = dv.getUint32(off, true); off += 4;
        const p = new TextDecoder().decode(plain.subarray(off, off + pLen)); off += pLen;
        const dLen = dv.getUint32(off, true); off += 4;
        files.push(p);
        total += dLen;
        off += dLen;
    }
    return { entry, files, total, tailOk: off === plain.length };
}

(async () => {
    let failed = 0;
    for (const id of targets) {
        const file = path.join(LIVE2D_DIR, id + ".l2d");
        if (!fs.existsSync(file)) {
            console.error("✗ 不存在: " + file);
            failed++;
            continue;
        }
        const buf = fs.readFileSync(file);
        if (buf.toString("ascii", 0, 5) !== "XYL2D") {
            console.error("✗ " + id + ": magic 错误");
            failed++;
            continue;
        }
        try {
            const plain = await decryptLikeBrowser(buf);
            const r = parsePlain(plain);
            const ok = r.tailOk && r.files.includes(r.entry) && r.total > 0;
            console.log((ok ? "✓" : "✗") + " " + id + ": 入口=" + r.entry +
                ", " + r.files.length + " 个文件, 数据 " + (r.total / 1024 / 1024).toFixed(1) +
                " MB" + (r.tailOk ? "" : " [尾部异常]"));
            if (!ok) failed++;
        } catch (e) {
            console.error("✗ " + id + ": 解密失败 -> " + e.message);
            failed++;
        }
    }
    console.log(failed === 0 ? "\n全部验证通过 ✅" : "\n有 " + failed + " 个文件验证失败 ❌");
    process.exit(failed === 0 ? 0 : 1);
})();
