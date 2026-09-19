// ================================
// 代码检查脚本（node tools/check.js）
// 语法检查 assets/js 下所有脚本 + assets/data 下的数据文件 + 模型 JSON
// 用 Node 内置 vm 编译源码做语法检查（不执行代码、不启动子进程）
// ================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let failed = 0;

function rel(file) {
    return path.relative(ROOT, file).replace(/\\/g, "/");
}

function checkSyntax(file) {
    try {
        // 只编译不执行：语法错误会在这里抛出
        new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
        console.log("✓ " + rel(file));
    } catch (e) {
        failed++;
        console.error("✗ " + rel(file) + " -> " + e.message);
    }
}

function checkJSON(file) {
    try {
        JSON.parse(fs.readFileSync(file, "utf8"));
        console.log("✓ " + rel(file));
    } catch (e) {
        failed++;
        console.error("✗ JSON 解析失败: " + rel(file) + " -> " + e.message);
    }
}

// 1) 所有 JS
for (const name of fs.readdirSync(path.join(ROOT, "assets", "js"))) {
    if (name.endsWith(".js")) {
        checkSyntax(path.join(ROOT, "assets", "js", name));
    }
}

// 2) 数据文件（JS）
for (const name of fs.readdirSync(path.join(ROOT, "assets", "data"))) {
    if (name.endsWith(".js")) {
        checkSyntax(path.join(ROOT, "assets", "data", name));
    }
}

// 3) 模型入口 JSON
const live2dDir = path.join(ROOT, "assets", "live2d");
for (const name of fs.readdirSync(live2dDir)) {
    const dir = path.join(live2dDir, name);
    if (!fs.statSync(dir).isDirectory()) {
        continue;
    }
    for (const file of fs.readdirSync(dir)) {
        if (file.endsWith(".model3.json") || file === "model.json") {
            checkJSON(path.join(dir, file));
        }
    }
}

// 4) 页面里的本地链接 / 资源是否存在（href / src）
function checkLinks(htmlFile) {
    const html = fs.readFileSync(htmlFile, "utf8");
    const attrs = /(?:href|src)="([^"]+)"/g;
    let m;
    const missing = [];
    while ((m = attrs.exec(html)) !== null) {
        const url = m[1];
        if (
            url.startsWith("http") ||
            url.startsWith("mailto:") ||
            url.startsWith("#") ||
            url.startsWith("data:")
        ) {
            continue;
        }
        const target = path.join(ROOT, decodeURIComponent(url.split("#")[0]));
        if (!fs.existsSync(target)) {
            missing.push(url);
        }
    }
    if (missing.length > 0) {
        failed++;
        console.error("✗ " + rel(htmlFile) + " 引用了不存在的文件: " + missing.join(", "));
    } else {
        console.log("✓ " + rel(htmlFile) + "（链接与资源都存在）");
    }
}

for (const name of fs.readdirSync(ROOT)) {
    if (name.endsWith(".html")) {
        checkLinks(path.join(ROOT, name));
    }
}

if (failed > 0) {
    console.error("\n有 " + failed + " 处未通过检查 ❌");
    process.exit(1);
}
console.log("\n全部检查通过 ✅");
