// ================================
// 查看 Excalidraw 文件内容（node tools/inspect-excalidraw.js [文件路径]）
// 输出：元素统计 + 所有文字（按画面位置排序，方便对照布局）
// ================================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const file = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(ROOT, "docs", "网站流程图.excalidraw");

const scene = JSON.parse(fs.readFileSync(file, "utf8"));
const els = scene.elements || [];

console.log("文件：" + path.relative(ROOT, file));
console.log("大小：" + (fs.statSync(file).size / 1024).toFixed(1) + " KB");
console.log("元素总数：" + els.length);

// 类型统计
const byType = {};
for (const e of els) {
    byType[e.type] = (byType[e.type] || 0) + 1;
}
console.log("类型分布：" + Object.entries(byType).map(([k, v]) => k + "=" + v).join("  "));

// 嵌入文件（图片）
const files = Object.keys(scene.files || {});
console.log("嵌入图片：" + files.length + " 个");

// 画面范围
const xs = els.map((e) => e.x);
const ys = els.map((e) => e.y);
const rights = els.map((e) => e.x + (e.width || 0));
const bottoms = els.map((e) => e.y + (e.height || 0));
console.log("画面范围：x " + Math.round(Math.min(...xs)) + " ~ " + Math.round(Math.max(...rights)) +
    "，y " + Math.round(Math.min(...ys)) + " ~ " + Math.round(Math.max(...bottoms)));

// 所有文字（按 y 再按 x 排序）
console.log("\n===== 全部文字（按位置从上到下、从左到右）=====");
const texts = els
    .filter((e) => e.type === "text" && e.text && e.text.trim())
    .map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), t: e.text }))
    .sort((a, b) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x));

let lastY = null;
for (const t of texts) {
    // 每 100 像素算一个"行区"，方便看布局
    const band = Math.floor(t.y / 100);
    if (lastY !== null && band !== lastY) {
        console.log("  ----");
    }
    lastY = band;
    const text = t.t.replace(/\n/g, " ⏎ ");
    console.log("  [x=" + t.x + " y=" + t.y + "] " + (text.length > 110 ? text.slice(0, 110) + "…" : text));
}
console.log("\n共 " + texts.length + " 条文字");
