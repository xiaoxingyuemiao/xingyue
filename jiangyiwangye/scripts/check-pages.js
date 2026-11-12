// ================================
// 建议网页 · 前端静态自查（scripts/check-pages.js）
// 检查：HTML 重复 id / JS 引用的 id 是否存在 / 本地资源是否存在 / 外链资源 / 脚本加载顺序
// 用法：node scripts/check-pages.js
// ================================

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
let failed = 0;

function fail(message) {
    failed++;
    console.error("✗ " + message);
}

function pass(message) {
    console.log("✓ " + message);
}

function checkPage(name, jsFile) {
    const htmlPath = path.join(PUBLIC, name + ".html");
    const jsPath = path.join(PUBLIC, "assets", "js", jsFile);
    const html = fs.readFileSync(htmlPath, "utf8");
    const js = fs.readFileSync(jsPath, "utf8");

    console.log("\n—— " + name + ".html ——");

    // 1. 重复 id
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
    if (dup.length > 0) {
        fail(name + " 有重复 id：" + dup.join(", "));
    } else {
        pass("id 无重复（共 " + ids.length + " 个）");
    }

    // 2. JS 里引用的 id 是否存在（支持 getElementById / querySelector("#id") / $("id")）
    const refs = new Set();
    for (const m of js.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
        refs.add(m[1]);
    }
    for (const m of js.matchAll(/querySelector\(\s*["']#([A-Za-z0-9_-]+)["']\s*\)/g)) {
        refs.add(m[1]);
    }
    for (const m of js.matchAll(/\$\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)) {
        refs.add(m[1]);
    }
    for (const m of js.matchAll(/\bel\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)) {
        refs.add(m[1]);
    }
    const missing = [...refs].filter((id) => ids.indexOf(id) < 0);
    if (missing.length > 0) {
        fail(name + ".html 缺少 JS 引用的 id：" + missing.join(", "));
    } else {
        pass("JS 引用的 id 都存在（共 " + refs.size + " 个）");
    }

    // 3. 本地资源是否存在 + 外链资源
    const sources = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    const missingFiles = [];
    const external = [];
    for (const url of sources) {
        if (url.startsWith("http")) {
            external.push(url);
            continue;
        }
        if (url.startsWith("#") || url.startsWith("data:") || url.startsWith("mailto:")) {
            continue;
        }
        const file = path.join(PUBLIC, url.split("#")[0].split("?")[0]);
        if (!fs.existsSync(file)) {
            missingFiles.push(url);
        }
    }
    if (missingFiles.length > 0) {
        fail(name + ".html 引用了不存在的本地文件：" + missingFiles.join(", "));
    } else {
        pass("本地 css/js/图片都存在");
    }
    if (external.length > 0) {
        console.log("  · 外链：" + external.join(", ") + "（确认是业务需要：网易云 / 站长链接）");
    }

    // 4. 脚本顺序：api.js 必须在页面脚本之前
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    const apiIndex = scripts.indexOf("assets/js/api.js");
    const pageIndex = scripts.indexOf("assets/js/" + jsFile);
    if (apiIndex < 0) {
        fail(name + ".html 没有引入 assets/js/api.js");
    } else if (pageIndex >= 0 && apiIndex > pageIndex) {
        fail(name + ".html 的 api.js 必须在 " + jsFile + " 之前");
    } else {
        pass("脚本顺序正确：" + scripts.join(" → "));
    }
}

checkPage("index", "app.js");
checkPage("admin", "admin.js");

// 公共文件存在性
for (const file of [
    "public/assets/css/base.css",
    "public/assets/js/api.js",
    "public/index.html",
    "public/admin.html",
]) {
    if (!fs.existsSync(path.join(ROOT, file))) {
        fail("缺少文件：" + file);
    }
}

console.log("");
if (failed > 0) {
    console.error("有 " + failed + " 处未通过 ❌");
    process.exit(1);
}
console.log("前端静态自查全部通过 ✅");
