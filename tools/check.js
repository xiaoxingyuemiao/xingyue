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
    let json;
    try {
        json = JSON.parse(fs.readFileSync(file, "utf8"));
        console.log("✓ " + rel(file));
    } catch (e) {
        failed++;
        console.error("✗ JSON 解析失败: " + rel(file) + " -> " + e.message);
        return;
    }
    // 模型入口文件：再检查它引用的文件（moc / 贴图 / 表情 / 动作 / 物理）是否都在
    if (file.endsWith(".model3.json") || path.basename(file) === "model.json") {
        checkModelRefs(file, json);
    }
}

// 收集入口文件里引用的模型文件（Cubism 3/4 用大写键，Cubism 2 用小写键）
function modelRefs(json, isModel3) {
    const refs = [];
    if (isModel3) {
        const fr = json.FileReferences || {};
        for (const key of ["Moc", "Physics", "Pose", "DisplayInfo", "UserData", "Effect"]) {
            if (fr[key]) {
                refs.push(fr[key]);
            }
        }
        for (const t of fr.Textures || []) {
            refs.push(t);
        }
        for (const e of fr.Expressions || []) {
            if (e && e.File) {
                refs.push(e.File);
            }
        }
        for (const group of Object.values(fr.Motions || {})) {
            for (const m of group || []) {
                if (m && m.File) {
                    refs.push(m.File);
                }
            }
        }
    } else {
        for (const key of ["model", "physics", "pose", "physics3"]) {
            if (json[key]) {
                refs.push(json[key]);
            }
        }
        for (const t of json.textures || []) {
            refs.push(t);
        }
        for (const e of json.expressions || []) {
            if (e && e.file) {
                refs.push(e.file);
            }
        }
        for (const group of Object.values(json.motions || {})) {
            for (const m of group || []) {
                if (m && m.file) {
                    refs.push(m.file);
                }
            }
        }
    }
    return refs;
}

function checkModelRefs(file, json) {
    const dir = path.dirname(file);
    const refs = modelRefs(json, file.endsWith(".model3.json"));
    const missing = refs.filter((r) => !fs.existsSync(path.join(dir, r)));
    if (missing.length > 0) {
        failed++;
        console.error("✗ " + rel(file) + " 引用了不存在的模型文件: " + missing.join(", "));
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

// 3) Live2D 模型：递归校验目录下所有 JSON（入口 / 表情 / 动作 / 物理）
const live2dDir = path.join(ROOT, "assets", "live2d");

function walkFiles(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            walkFiles(full, out);
        } else {
            out.push(full);
        }
    }
    return out;
}

for (const file of walkFiles(live2dDir, [])) {
    if (file.endsWith(".json")) {
        checkJSON(file);
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

// 5) 页面加载的脚本里 querySelector("#id") 必须能在该页面找到对应元素
function checkSelectors(htmlFile) {
    const html = fs.readFileSync(htmlFile, "utf8");
    const ids = new Set();
    for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
        ids.add(m[1]);
    }

    const missing = [];
    for (const s of html.matchAll(/<script src="(assets\/(?:js|data)\/[^"]+)"/g)) {
        const script = path.join(ROOT, s[1]);
        if (!fs.existsSync(script)) {
            continue; // 上面的链接检查已经报过这个缺失
        }
        const code = fs.readFileSync(script, "utf8");
        for (const q of code.matchAll(/querySelector\(\s*["']#([A-Za-z0-9_-]+)["']\s*\)/g)) {
            const item = s[1] + " -> #" + q[1];
            if (!ids.has(q[1]) && !missing.includes(item)) {
                missing.push(item);
            }
        }
    }

    if (missing.length > 0) {
        failed++;
        console.error("✗ " + rel(htmlFile) + " 里这些元素不存在: " + missing.join(", "));
    }
}

// 6) 同一页面里的 id 不能重复（重复会让 querySelector 拿到错的元素）
function checkDuplicateIds(htmlFile) {
    const html = fs.readFileSync(htmlFile, "utf8");
    const seen = new Set();
    const dups = [];

    for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
        if (seen.has(m[1])) {
            dups.push(m[1]);
        }
        seen.add(m[1]);
    }

    if (dups.length > 0) {
        failed++;
        console.error("✗ " + rel(htmlFile) + " 里有重复 id: " + [...new Set(dups)].join(", "));
    }
}

for (const name of fs.readdirSync(ROOT)) {
    if (name.endsWith(".html")) {
        checkLinks(path.join(ROOT, name));
        checkSelectors(path.join(ROOT, name));
        checkDuplicateIds(path.join(ROOT, name));
    }
}

if (failed > 0) {
    console.error("\n有 " + failed + " 处未通过检查 ❌");
    process.exit(1);
}
console.log("\n全部检查通过 ✅");
