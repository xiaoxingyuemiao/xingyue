// ================================
// 建议网页 · 本机配置（lib/config.js）
// 读取 / 自动生成本地 config.local.json（不会进 git）
// ================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "shujuku-1");
const DB_FILE = path.join(DATA_DIR, "app.db");
const UPLOAD_PUBLIC_DIR = path.join(DATA_DIR, "uploads", "public");
const UPLOAD_PRIVATE_DIR = path.join(DATA_DIR, "uploads", "private");
const DEV_CODE_LOG = path.join(DATA_DIR, "dev-codes.log");
const CONFIG_FILE = path.join(ROOT, "config.local.json");

const DEFAULTS = {
    port: 8787,
    host: "0.0.0.0",
    devMode: true,
    openBrowser: true,
    // 默认只允许在本机（127.0.0.1）创建管理员，防止局域网/公网上被别人抢先注册管理员
    allowRemoteSetup: false,
    sessionSecret: "",
    corsOrigins: [],
    // 邮件发送（现在用不到；以后把 devMode 关掉、填好这里就能真发验证码）
    smtp: {
        host: "",
        port: 465,
        secure: true,
        user: "",
        pass: "",
        from: "",
    },
};

function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
}

function readJsonFile(file) {
    try {
        if (!fs.existsSync(file)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
        console.warn("配置文件读取失败，改用默认配置：" + e.message);
        return null;
    }
}

function writeConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4) + "\n", "utf8");
}

let cached = null;

function get() {
    if (cached) {
        return cached;
    }

    const saved = readJsonFile(CONFIG_FILE) || {};
    const config = Object.assign(cloneDefaults(), saved);
    config.smtp = Object.assign({}, DEFAULTS.smtp, saved.smtp || {});

    // 端口 / 主机名的安全兜底
    config.port = Number(config.port) || DEFAULTS.port;
    config.host = String(config.host || DEFAULTS.host);
    config.devMode = config.devMode !== false;
    config.openBrowser = config.openBrowser !== false;

    if (!Array.isArray(config.corsOrigins)) {
        config.corsOrigins = [];
    }

    // 第一次启动：生成并保存会话密钥，以后一直用它（换掉会让所有登录失效）
    let needWrite = !fs.existsSync(CONFIG_FILE);
    if (!config.sessionSecret || String(config.sessionSecret).length < 32) {
        config.sessionSecret = crypto.randomBytes(32).toString("hex");
        needWrite = true;
    }

    if (needWrite) {
        try {
            writeConfig(config);
            console.log("已生成配置文件：" + CONFIG_FILE);
        } catch (e) {
            console.warn("配置文件写入失败（不影响本次运行）：" + e.message);
        }
    }

    cached = config;
    return config;
}

function dataPaths() {
    return {
        root: ROOT,
        dataDir: DATA_DIR,
        dbFile: DB_FILE,
        uploadPublicDir: UPLOAD_PUBLIC_DIR,
        uploadPrivateDir: UPLOAD_PRIVATE_DIR,
        devCodeLog: DEV_CODE_LOG,
        configFile: CONFIG_FILE,
    };
}

module.exports = {
    get,
    dataPaths,
    CONFIG_FILE,
    ROOT,
    DATA_DIR,
    DB_FILE,
    UPLOAD_PUBLIC_DIR,
    UPLOAD_PRIVATE_DIR,
    DEV_CODE_LOG,
};
