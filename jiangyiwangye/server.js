// ================================
// 建议网页 · 启动入口（server.js）
// 运行方式：双击「启动建议网页.bat」，或在本目录执行 node server.js
//
// 做的事：
//   1. 初始化 SQLite 数据库（shujuku-1/app.db）
//   2. 启动 HTTP 服务：/api/* 交给 lib/api.js，其余是 public/ 静态文件
//   3. 托管管理员上传的公开图片（/uploads/public/*）
// ================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const config = require("./lib/config");
const db = require("./lib/db");
const api = require("./lib/api");
const util = require("./lib/util");

const cfg = config.get();
const paths = config.dataPaths();
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- CORS（现在同源用不到；以后主站接入时靠 corsOrigins 放开） ----------

function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) {
        return false;
    }
    const allowed = Array.isArray(cfg.corsOrigins) && (cfg.corsOrigins.indexOf("*") >= 0 || cfg.corsOrigins.indexOf(origin) >= 0);
    if (!allowed) {
        return false;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    return true;
}

// ---------- 静态文件 ----------

function notFoundPage(res) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(
        "<!DOCTYPE html><html lang=\"zh-CN\"><meta charset=\"utf-8\">" +
            "<title>页面不存在</title>" +
            "<body style=\"font-family:system-ui;background:#f4f6ff;color:#2b2f45;padding:60px;text-align:center\">" +
            "<h1>页面不存在</h1><p>是不是地址打错了？</p>" +
            "<p><a href=\"/\" style=\"color:#6b7cff\">返回建议网页首页</a> ｜ " +
            "<a href=\"/admin\" style=\"color:#6b7cff\">管理后台</a></p>" +
            "</body></html>"
    );
}

function serveStatic(req, res, rootDir, relativePath, cacheControl) {
    const filePath = path.join(rootDir, relativePath);
    if (!util.isInside(rootDir, filePath)) {
        util.json(res, 403, { error: { code: "FORBIDDEN", message: "没有权限" } });
        return;
    }

    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (e) {
        notFoundPage(res);
        return;
    }
    if (!stat.isFile()) {
        notFoundPage(res);
        return;
    }

    util.sendFile(res, filePath, {
        headOnly: req.method === "HEAD",
        cache: cacheControl || "no-store",
    });
}

// ---------- 请求分发 ----------

async function handleRequest(req, res) {
    let url;
    try {
        url = new URL(req.url, "http://127.0.0.1");
    } catch (e) {
        util.json(res, 400, { error: { code: "VALIDATION", message: "请求地址不合法" } });
        return;
    }

    // 跨域预检（以后主站接入会用到；现在同源用不到）
    applyCors(req, res);
    if (req.method === "OPTIONS" && url.pathname.indexOf("/api/") === 0) {
        res.writeHead(204);
        res.end();
        return;
    }

    // 1) 接口
    if (url.pathname.indexOf("/api/") === 0) {
        try {
            const handled = await api.handle(req, res, url);
            if (!handled && !res.writableEnded) {
                util.json(res, 404, { error: { code: "NOT_FOUND", message: "接口不存在" } });
            }
        } catch (e) {
            if (!res.writableEnded) {
                util.fail(res, e);
            }
        }
        return;
    }

    // 2) 静态页面只支持 GET / HEAD
    if (req.method !== "GET" && req.method !== "HEAD") {
        util.json(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方式" } });
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch (e) {
        util.json(res, 400, { error: { code: "VALIDATION", message: "请求地址不合法" } });
        return;
    }

    if (pathname === "/" || pathname === "/index.html") {
        serveStatic(req, res, PUBLIC_DIR, "index.html", "no-cache");
        return;
    }
    if (pathname === "/admin" || pathname === "/admin.html" || pathname === "/admin/") {
        serveStatic(req, res, PUBLIC_DIR, "admin.html", "no-cache");
        return;
    }
    if (pathname === "/favicon.ico") {
        const icon = path.join(PUBLIC_DIR, "assets", "favicon.ico");
        if (fs.existsSync(icon)) {
            serveStatic(req, res, PUBLIC_DIR, "assets/favicon.ico", "public, max-age=86400");
        } else {
            res.writeHead(204);
            res.end();
        }
        return;
    }
    if (pathname.indexOf("/assets/") === 0) {
        // 注意：这里要把 "assets/" 一起保留（public/assets/...），不能只取文件名
        serveStatic(req, res, PUBLIC_DIR, pathname.slice(1).replace(/^\/+/, ""), "public, max-age=3600");
        return;
    }
    if (pathname.indexOf("/uploads/public/") === 0) {
        serveStatic(req, res, paths.uploadPublicDir, pathname.slice("/uploads/public/".length).replace(/^\/+/, ""), "public, max-age=86400");
        return;
    }

    // 3) 其它地址
    if (pathname.indexOf("/uploads/private/") === 0) {
        // 私有文件只通过 /api/orders/:id/file 下载，这里直接拒绝
        util.json(res, 403, { error: { code: "FORBIDDEN", message: "私有文件不能直接访问" } });
        return;
    }
    notFoundPage(res);
}

// ---------- 启动 ----------

function findLanIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const info of interfaces[name] || []) {
            if (info.family === "IPv4" && !info.internal) {
                return info.address;
            }
        }
    }
    return "";
}

function openBrowser(url) {
    try {
        if (process.platform === "win32") {
            spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
        } else if (process.platform === "darwin") {
            spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
        } else {
            spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
        }
    } catch (e) {
        /* 自动打开浏览器失败不影响服务 */
    }
}

function banner() {
    const port = cfg.port;
    const localUrl = "http://127.0.0.1:" + port;
    const lanIp = findLanIp();

    console.log("");
    console.log("============================================================");
    console.log("  星月小窝 · 建议网页 已启动");
    console.log("------------------------------------------------------------");
    console.log("  本机访问：  " + localUrl);
    console.log("  管理后台：  " + localUrl + "/admin");
    if (lanIp) {
        console.log("  手机访问：  http://" + lanIp + ":" + port + "   （手机连同一个 Wi-Fi）");
    }
    console.log("------------------------------------------------------------");
    console.log("  数据目录：  " + paths.dataDir);
    console.log("  数据库：    " + paths.dbFile);
    console.log("  开发模式：  " + (cfg.devMode ? "开（验证码显示在本窗口和页面上）" : "关（走真邮件，需配置 SMTP）"));
    console.log("------------------------------------------------------------");
    console.log("  关闭这个窗口 / 按 Ctrl+C 就会停止服务");
    console.log("  想改端口、开发模式：编辑 config.local.json");
    console.log("============================================================");
    console.log("");
}

function start() {
    db.init();

    const server = http.createServer((req, res) => {
        handleRequest(req, res).catch((e) => {
            console.error("请求处理出错：", e);
            if (!res.writableEnded) {
                util.fail(res, e);
            }
        });
    });

    server.on("error", (e) => {
        if (e && e.code === "EADDRINUSE") {
            console.error("");
            console.error("端口 " + cfg.port + " 被占用了！");
            console.error("解决办法：关掉占用这个端口的程序，或编辑 config.local.json 把 port 改成别的数字（比如 8788）。");
            console.error("");
        } else {
            console.error("服务启动失败：", e);
        }
        process.exit(1);
    });

    server.listen(cfg.port, cfg.host, () => {
        banner();
        if (cfg.openBrowser) {
            setTimeout(() => openBrowser("http://127.0.0.1:" + cfg.port), 400);
        }
    });

    const shutdown = () => {
        console.log("\n正在关闭服务……");
        server.close(() => {
            db.close();
            process.exit(0);
        });
        setTimeout(() => {
            db.close();
            process.exit(0);
        }, 2000).unref();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    process.on("uncaughtException", (e) => {
        console.error("未捕获的异常（服务继续运行）：", e);
    });
    process.on("unhandledRejection", (e) => {
        console.error("未处理的 Promise 异常（服务继续运行）：", e);
    });
}

start();
