// ================================
// 建议网页 · 真实浏览器截图/自检（scripts/ui-screenshot.js）
// 用本机 Edge/Chrome 的 headless 模式 + CDP 打开页面，截图并收集页面报错
//
// 用法（需要先启动 server.js）：
//   node scripts/ui-screenshot.js
// 可选环境变量：
//   ADMIN_EMAIL / ADMIN_PASSWORD   管理员账号（用于进入后台截图）
//   FAN_EMAIL / FAN_PASSWORD       普通用户账号（用于登录态截图）
//   BASE_URL                       默认 http://127.0.0.1:8787
//
// 截图输出到：shujuku-1/shots/（数据目录，不进 git）
// ================================

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const OUT_DIR = path.join(ROOT, "shujuku-1", "shots");
const PORT = 9333;

const BROWSER_CANDIDATES = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findBrowser() {
    for (const file of BROWSER_CANDIDATES) {
        if (fs.existsSync(file)) {
            return file;
        }
    }
    throw new Error("找不到 Edge/Chrome，请手动改 BROWSER_CANDIDATES");
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJSON(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error("HTTP " + res.status + " " + url);
    }
    return res.json();
}

async function waitForDevtools(deadlineMs) {
    const start = Date.now();
    while (Date.now() - start < deadlineMs) {
        try {
            return await getJSON("http://127.0.0.1:" + PORT + "/json/version");
        } catch (e) {
            await delay(250);
        }
    }
    throw new Error("浏览器调试端口没有起来（" + PORT + "）");
}

// ---------- 极简 CDP 客户端 ----------

class CDP {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.ready = new Promise((resolve, reject) => {
            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error("WebSocket 连接失败"));
        });
        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) {
                    reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                } else {
                    resolve(msg.result);
                }
            } else if (msg.method) {
                this.events.push(msg);
            }
        };
    }

    async send(method, params) {
        await this.ready;
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params: params || {} }));
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error("CDP 超时：" + method));
                }
            }, 20000);
        });
    }

    reset() {
        this.events = [];
    }

    close() {
        try {
            this.ws.close();
        } catch (e) {
            /* 忽略 */
        }
    }
}

async function connectPage(url) {
    const target = await getJSON("http://127.0.0.1:" + PORT + "/json/new?" + encodeURIComponent(url), {
        method: "PUT",
    });
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    return { cdp, targetId: target.id };
}

async function waitPageReady(cdp, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const result = await cdp.send("Runtime.evaluate", {
                expression: "document.readyState",
                returnByValue: true,
            });
            if (result && result.result && result.result.value === "complete") {
                return;
            }
        } catch (e) {
            /* 页面还在切换 */
        }
        await delay(200);
    }
}

async function screenshot(cdp, name, width, height, mobile) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: width,
        height: height,
        deviceScaleFactor: 1,
        mobile: !!mobile,
    });
    await delay(400);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(OUT_DIR, name);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log("  截图：" + name);
    return file;
}

// 整页长截图：先量出内容高度，再把视口拉高后截整页
async function fullPageScreenshot(cdp, name, width) {
    const metrics = await cdp.send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize || metrics.contentSize || { width: width || 1440, height: 900 };
    const height = Math.min(Math.ceil(size.height) + 20, 6000);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: width || 1440,
        height: height,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await delay(500);
    const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: width || 1440, height: height, scale: 1 },
    });
    const file = path.join(OUT_DIR, name);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log("  整页截图：" + name);
    return file;
}

function collectErrors(cdp) {
    const errors = [];
    for (const event of cdp.events) {
        if (event.method === "Runtime.exceptionThrown") {
            const detail = event.params.exceptionDetails || {};
            errors.push(
                "JS 异常：" + (detail.exception && detail.exception.description ? detail.exception.description : detail.text)
            );
        }
        if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") {
            errors.push("console.error：" + event.params.args.map((a) => a.value || a.description || "").join(" "));
        }
        if (event.method === "Network.loadingFailed") {
            // Page.reload 会中止上一页未完成的请求，这是正常现象
            if (event.params.errorText === "net::ERR_ABORTED") {
                continue;
            }
            errors.push("网络失败：" + event.params.errorText + " " + (event.params.blockedReason || ""));
        }
    }
    return errors;
}

async function evaluate(cdp, expression) {
    const result = await cdp.send("Runtime.evaluate", {
        expression: expression,
        awaitPromise: true,
        returnByValue: true,
    });
    return result && result.result ? result.result.value : undefined;
}

async function snapshotState(cdp, label) {
    const state = await evaluate(
        cdp,
        "JSON.stringify({" +
            "title: document.title," +
            "h1: (document.querySelector('h1')||{}).textContent||''," +
            "modals: document.querySelectorAll('.modal-mask.open').length," +
            "visibleViews: Array.from(document.querySelectorAll('.admin-view')).filter(function(v){return !v.classList.contains('hidden');}).map(function(v){return v.id;})," +
            "cards: document.querySelectorAll('.card').length" +
            "})"
    );
    console.log("  · " + label + "：" + state);
}

async function apiLogin(account, password) {
    const res = await fetch(BASE + "/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: account, password: password }),
    });
    const data = await res.json();
    if (!res.ok || !data.token) {
        throw new Error("登录失败：" + JSON.stringify(data));
    }
    return data.token;
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const browser = findBrowser();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jywy-edge-"));
    console.log("浏览器：" + browser);

    const child = spawn(
        browser,
        [
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--remote-debugging-port=" + PORT,
            "--user-data-dir=" + userDataDir,
            "--window-size=1440,900",
            "about:blank",
        ],
        { stdio: "ignore" }
    );

    try {
        await waitForDevtools(20000);
        console.log("浏览器已就绪\n");

        // ---------- 1. 前台（未登录） ----------
        console.log("1) 前台未登录");
        const publicPage = await connectPage(BASE + "/");
        await waitPageReady(publicPage.cdp, 10000);
        await evaluate(publicPage.cdp, "localStorage.clear()");
        await publicPage.cdp.send("Page.reload");
        await waitPageReady(publicPage.cdp, 10000);
        await delay(1500);
        publicPage.cdp.reset();
        await screenshot(publicPage.cdp, "public-guest-desktop.png", 1440, 1000, false);
        await screenshot(publicPage.cdp, "public-guest-mobile.png", 390, 844, true);
        await fullPageScreenshot(publicPage.cdp, "public-guest-full.png", 1440);
        await snapshotState(publicPage.cdp, "前台状态");
        let errors = collectErrors(publicPage.cdp);
        console.log(errors.length ? "  ✗ 页面报错：" + errors.join(" | ") : "  ✓ 未发现页面报错");

        // 登录弹窗截图
        publicPage.cdp.reset();
        await evaluate(publicPage.cdp, "document.getElementById('btn-open-login').click()");
        await delay(600);
        await screenshot(publicPage.cdp, "public-login-modal.png", 1440, 1000, false);
        errors = collectErrors(publicPage.cdp);
        console.log(errors.length ? "  ✗ 弹窗报错：" + errors.join(" | ") : "  ✓ 登录弹窗正常");
        await evaluate(publicPage.cdp, "document.getElementById('btn-login-close').click()");

        // ---------- 2. 前台（普通用户登录态） ----------
        if (process.env.FAN_EMAIL && process.env.FAN_PASSWORD) {
            console.log("\n2) 前台登录态");
            try {
                const fanToken = await apiLogin(process.env.FAN_EMAIL, process.env.FAN_PASSWORD);
                publicPage.cdp.reset();
                await evaluate(
                    publicPage.cdp,
                    "localStorage.setItem('xingyue_jiangyi_token', " + JSON.stringify(fanToken) + ")"
                );
                await publicPage.cdp.send("Page.reload");
                await waitPageReady(publicPage.cdp, 10000);
                await delay(2200);
                await evaluate(publicPage.cdp, "document.getElementById('menu-my').click()");
                await delay(700);
                await fullPageScreenshot(publicPage.cdp, "public-user-full.png", 1440);
                await screenshot(publicPage.cdp, "public-user-mobile.png", 390, 844, true);
                errors = collectErrors(publicPage.cdp);
                console.log(errors.length ? "  ✗ 页面报错：" + errors.join(" | ") : "  ✓ 未发现页面报错");
            } catch (e) {
                console.log("  - 跳过普通用户登录态截图：" + e.message);
            }
        }
        publicPage.cdp.close();

        // ---------- 3. 管理后台 ----------
        if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
            console.log("\n3) 管理后台");
            const adminToken = await apiLogin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
            const adminPage = await connectPage(BASE + "/admin");
            await waitPageReady(adminPage.cdp, 10000);
            await evaluate(adminPage.cdp, "localStorage.clear()");
            await adminPage.cdp.send("Page.reload");
            await waitPageReady(adminPage.cdp, 10000);
            await delay(1200);
            adminPage.cdp.reset();
            await screenshot(adminPage.cdp, "admin-login.png", 1440, 900, false);
            await evaluate(
                adminPage.cdp,
                "localStorage.setItem('xingyue_jiangyi_token', " + JSON.stringify(adminToken) + ")"
            );
            await adminPage.cdp.send("Page.reload");
            await waitPageReady(adminPage.cdp, 10000);
            await delay(2500);
            adminPage.cdp.reset();
            await fullPageScreenshot(adminPage.cdp, "admin-overview-full.png", 1440);
            await screenshot(adminPage.cdp, "admin-desktop.png", 1440, 1000, false);
            await screenshot(adminPage.cdp, "admin-mobile.png", 390, 844, true);
            await snapshotState(adminPage.cdp, "后台状态");

            for (const view of ["submissions", "prizes", "orders", "users", "settings"]) {
                adminPage.cdp.reset();
                await evaluate(adminPage.cdp, "document.getElementById('nav-" + view + "').click()");
                await delay(1400);
                await fullPageScreenshot(adminPage.cdp, "admin-" + view + ".png", 1440);
                errors = collectErrors(adminPage.cdp);
                console.log(errors.length ? "  ✗ " + view + " 报错：" + errors.join(" | ") : "  ✓ " + view + " 分区正常");
            }
            await snapshotState(adminPage.cdp, "后台最终状态");
            adminPage.cdp.close();
        } else {
            console.log("\n3) 管理后台：没有传 ADMIN_EMAIL / ADMIN_PASSWORD，跳过");
        }

        console.log("\n完成。截图目录：" + OUT_DIR);
    } finally {
        try {
            child.kill();
        } catch (e) {
            /* 忽略 */
        }
        await delay(500);
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch (e) {
            /* 忽略 */
        }
    }
}

main().catch((e) => {
    console.error("截图自检失败：", e);
    process.exit(1);
});
