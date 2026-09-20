// ================================
// 防密钥泄露扫描（tools/hooks/scan-secrets.js）
// 从标准输入读取文件路径（每行一个），逐个扫描内容；
// 命中密钥 / 凭证特征，或出现不该提交的文件名，就打印原因并以 1 退出。
//
// 用法（钩子里或手动跑）：
//   git diff --cached --name-only --diff-filter=ACM | node tools/hooks/scan-secrets.js   # 扫暂存区
//   git ls-files | node tools/hooks/scan-secrets.js                                      # 扫全仓库
//
// 零依赖：只读工作区文件内容，不解析 git 对象、不启动子进程
// ================================

const fs = require("fs");
const path = require("path");

// 不该提交的文件名（.gitignore 之外的兜底，防 git add -f 硬加进来）
const BLOCKED_NAMES = [
    /(^|\/)\.env$/,
    /(^|\/)\.env\.(?!example$|sample$)[^/]+$/, // .env.local 等；.env.example / .env.sample 是模板，放行
    /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
    /\.(pem|p8|ppk|p12|pfx|jks|keystore|secret|token)$/i,
    /(^|\/)\.netrc$/,
    /(^|\/)\.npmrc$/,
    /(^|\/)\.pgpass$/,
    /(^|\/)credentials$/,
];

// 内容规则：命中即拦截
const RULES = [
    ["Supabase Secret key（管理员钥匙，绝不能进前端）", /sb_secret_[A-Za-z0-9_-]{10,}/],
    ["私钥内容", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["OpenAI / DeepSeek 风格 API key", /\bsk-[A-Za-z0-9_-]{20,}/],
    ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
    ["AWS Access Key ID", /\bAKIA[0-9A-Z]{16}\b/],
    ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
    ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
    ["疑似硬编码的密钥 / 密码", /(secret|token|passwd|password|api[_-]?key)\s*[:=]\s*["'][^"'\s]{16,}["']/i],
];

// 允许公开的内容：Supabase publishable / anon key（设计上就是给前端的，见 supabase-config.js）
const ALLOW = [
    /sb_publishable_[A-Za-z0-9_-]+/g,
];

// JWT 单独判断：只有 payload 里 role 是 service_role 才拦（anon 的 JWT 本来就可以公开）
function jwtProblems(text) {
    const found = [];
    const re = /\beyJ[A-Za-z0-9_-]{5,}\.([A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]{5,}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        try {
            const payload = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
            if (payload && payload.role === "service_role") {
                found.push("JWT 里带 service_role（管理员权限）");
            }
        } catch (e) {
            // 解不出来就不管：可能只是长得像 JWT 的普通字符串
        }
    }
    return found;
}

// 只扫文本类文件（二进制跳过）
const TEXT_EXT = [
    "", ".js", ".json", ".html", ".css", ".md", ".txt",
    ".yml", ".yaml", ".sh", ".ps1", ".xml", ".svg",
];
const MAX_SIZE = 2 * 1024 * 1024; // 超过 2MB 的文本不扫（本项目里是模型数据，不可能是密钥）

function isTextFile(file) {
    const ext = path.extname(file).toLowerCase();
    return TEXT_EXT.includes(ext) || path.basename(file).startsWith(".env");
}

function readStdin() {
    try {
        return fs.readFileSync(0, "utf8"); // 0 = 标准输入
    } catch (e) {
        return "";
    }
}

const files = readStdin().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
let problems = 0;

for (const file of files) {
    // 1) 文件名本身就不该出现
    const normalized = file.replace(/\\/g, "/");
    let nameBlocked = false;
    for (const re of BLOCKED_NAMES) {
        if (re.test(normalized)) {
            problems++;
            nameBlocked = true;
            console.error("✗ " + file + "：这类文件不应该提交（密钥 / 凭证）");
            break;
        }
    }

    // 2) 文件内容
    if (nameBlocked || !isTextFile(file) || !fs.existsSync(file)) {
        continue;
    }
    let text;
    try {
        if (fs.statSync(file).size > MAX_SIZE) {
            continue;
        }
        text = fs.readFileSync(file, "utf8");
    } catch (e) {
        continue;
    }

    // 先抹掉允许公开的内容，避免误报
    let cleaned = text;
    for (const re of ALLOW) {
        cleaned = cleaned.replace(re, "「publishable-key」");
    }

    for (const rule of RULES) {
        const hit = cleaned.match(rule[1]);
        if (hit) {
            problems++;
            console.error("✗ " + file + "：" + rule[0] + " → " + hit[0].slice(0, 32) + "…");
        }
    }

    for (const p of jwtProblems(cleaned)) {
        problems++;
        console.error("✗ " + file + "：" + p);
    }
}

if (problems > 0) {
    console.error("\n发现 " + problems + " 处疑似密钥 / 凭证，已阻止本次操作 ❌");
    console.error("确认没问题非要提交，可以临时用 git commit --no-verify / git push --no-verify（谨慎）");
    process.exit(1);
}

console.log("✓ 密钥扫描通过（检查了 " + files.length + " 个文件）");
