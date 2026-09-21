// ================================
// 本地预览服务器（node tools/serve.js）
//
// 为什么需要它：直接双击 index.html 打开时地址栏是 file://，
// 浏览器会拦掉 Live2D SDK 发出的 fetch（读 model3.json / moc3 / 贴图），
// 模型必然显示不出来 —— 这是浏览器的安全策略，改站点代码绕不过去。
// 换成本机 http 服务打开就一切正常（和线上 GitHub Pages 行为一致）。
//
// 用法：
//   node tools/serve.js              → 起服务并自动打开浏览器
//   node tools/serve.js --no-open    → 只起服务，不开浏览器（设 NO_OPEN=1 同效）
//   node tools/serve.js --port 8080  → 指定端口（默认 5173，被占用会自动往后试）
//   想固定端口也可以设环境变量 PORT=8080
//
// 零依赖：只用 Node 自带的 http / fs / path。
// ================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const noOpen = args.includes("--no-open") || !!process.env.NO_OPEN;
const portArgIdx = args.indexOf("--port");
const START_PORT = Number(
    (portArgIdx >= 0 ? args[portArgIdx + 1] : "") || process.env.PORT || 5173
);

// 常见后缀 → Content-Type（缺的后缀一律 application/octet-stream）
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".excalidraw": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".moc3": "application/octet-stream",
    ".wasm": "application/wasm",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
};

function fail(res, code, text) {
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(text);
}

const server = http.createServer((req, res) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
    } catch (e) {
        return fail(res, 400, "请求路径无法解析");
    }

    if (urlPath === "/" || urlPath === "") {
        urlPath = "/index.html";
    }

    // 拼绝对路径后校验没跑出仓库根目录（防 ../ 穿越）
    const target = path.resolve(ROOT, "." + urlPath);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
        return fail(res, 403, "不许访问仓库以外的文件");
    }

    fs.stat(target, (err, stat) => {
        if (err) {
            return fail(res, 404, "找不到：" + urlPath);
        }

        // 目录 → 找里面的 index.html
        let file = target;
        if (stat.isDirectory()) {
            file = path.join(target, "index.html");
            if (!fs.existsSync(file)) {
                return fail(res, 404, "这个目录里没有 index.html：" + urlPath);
            }
        }

        const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
        res.writeHead(200, {
            "Content-Type": type,
            // 本地预览关掉缓存：改完文件刷新就能看到，不用清缓存
            "Cache-Control": "no-store",
        });
        fs.createReadStream(file)
            .on("error", () => fail(res, 500, "读取失败：" + urlPath))
            .pipe(res);
    });
});

// 端口被占用就往后试（最多 20 个）
let port = START_PORT;
let tries = 0;

server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && tries < 20) {
        tries++;
        port++;
        server.listen(port, "127.0.0.1");
        return;
    }
    console.error("✗ 服务器起不来：" + err.message);
    process.exit(1);
});

// 打开默认浏览器。
// ⚠️ 用 spawn + stdio:"ignore"，**不要用 exec**：exec 走的是管道（piped stdio），
// 在受限令牌 / 某些杀软环境下会抛 `spawn EPERM`；而且它是**同步抛出**的，
// 没接住会把整个服务进程带崩（窗口一闪就没，服务也停了）。
// 这里失败也只是打印一句提示，服务照常跑。
function openBrowser(url) {
    const win = process.platform === "win32";
    const cmd = win ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    // Windows 的 start 是 cmd 内建命令，必须借 cmd /c 调；第一个空参数是窗口标题位
    const cmdArgs = win ? ["/c", "start", "", url] : [url];

    try {
        const child = spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" });
        child.on("error", () => {
            console.log("（没能自动打开浏览器，请手动把上面的地址复制到浏览器）");
        });
        child.unref();
    } catch (e) {
        console.log("（没能自动打开浏览器，请手动把上面的地址复制到浏览器）");
    }
}

server.on("listening", () => {
    const url = "http://127.0.0.1:" + port + "/";
    console.log("");
    console.log("  🌙 星月小窝 · 本地预览已启动");
    console.log("     地址：" + url);
    console.log("     （这个窗口别关，关掉服务就停了；按 Ctrl + C 停止）");
    console.log("");

    if (!noOpen) {
        openBrowser(url);
    }
});

server.listen(port, "127.0.0.1");
